"""
Where analytics events go, and how they get there without ever costing a reader.

TWO DIALECTS, ONE SET OF QUERIES.

Production is Render PostgreSQL (`DATABASE_URL`). Localhost and the test suite
get SQLite, in a file beside the existing cache. That is not indecision — it is
the difference between a feature that works everywhere and a feature that is
dead on a laptop and untestable in CI, and the alternative (Postgres-only) would
have meant shipping the aggregation queries with no test coverage at all,
because there is no Postgres server in the build environment.

The cost of that choice is kept deliberately small and auditable. Every query in
queries.py is ordinary ANSI — counts, group-bys, a `ts >= ?` bound — and the
only things that actually differ between the two engines live in `_DIALECT`
below: the placeholder character, three DDL type names, and the expression that
truncates a timestamp to a day. Nothing else is allowed to diverge.

HOW A WRITE HAPPENS.

    record(...) → queue.put_nowait → [returns immediately]
                                      ↓
                        writer thread → batched INSERT

The queue is bounded. When it is full, events are dropped and counted, because
the alternative — blocking the request thread until analytics catches up — makes
a reporting system into an availability risk. A dropped analytics event costs a
row in a dashboard. A blocked request costs a reader.

The writer holds ONE connection. Render's free Postgres tier has a small
connection ceiling and this process is also serving the site; a pool sized for
throughput we do not have would be a way to run out of connections for no
benefit. Dashboard reads are rare and open their own short-lived connection.
"""
from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from ..config import get_settings

log = logging.getLogger("pitwall_iq.analytics")

# --------------------------------------------------------------------------- #
# Bounds. Everything written here is truncated, because an analytics table is a
# place user-supplied text lands and unbounded columns are how a table becomes a
# problem. A question longer than this is not a question.
# --------------------------------------------------------------------------- #
MAX_QUESTION = 500
MAX_ANSWER = 2000
MAX_SHORT = 200
MAX_DETAIL = 300

#: How many events may wait in memory before we start dropping them.
QUEUE_MAX = 5_000
#: Rows per INSERT batch, and how long the writer waits to fill one.
BATCH_MAX = 200
BATCH_WAIT_S = 2.0

#: Raw rows are pruned to keep the table small; the daily rollup keeps the shape
#: of history forever at a few rows per day.
EVENT_RETENTION_DAYS = 90
#: Ask rows are the valuable ones and there are far fewer of them.
ASK_RETENTION_DAYS = 400
PRUNE_EVERY_S = 6 * 3600


# --------------------------------------------------------------------------- #
# Dialect
# --------------------------------------------------------------------------- #
class _Dialect:
    def __init__(self, name: str) -> None:
        self.name = name
        pg = name == "postgres"
        self.param = "%s" if pg else "?"
        self.serial = "BIGSERIAL PRIMARY KEY" if pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
        self.ts_type = "TIMESTAMPTZ" if pg else "TEXT"
        self.bool_type = "BOOLEAN" if pg else "INTEGER"
        # truncate a timestamp to its day, as a string, in both engines
        self.day_expr = "to_char(ts, 'YYYY-MM-DD')" if pg else "substr(ts, 1, 10)"

    def sql(self, statement: str) -> str:
        """Queries are written with `?`; Postgres wants `%s`."""
        return statement.replace("?", "%s") if self.param == "%s" else statement

    def ts(self, moment: datetime) -> Any:
        """A timestamp as this engine wants to receive it."""
        return moment if self.name == "postgres" else moment.isoformat(sep=" ")


_state = threading.local()
_DIALECT: _Dialect | None = None
_URL: str | None = None
_ENABLED = False

_Q: "queue.Queue[tuple[str, tuple]]" = queue.Queue(maxsize=QUEUE_MAX)
_writer: threading.Thread | None = None
_stop = threading.Event()
_lock = threading.Lock()

_stats = {"queued": 0, "written": 0, "dropped": 0, "errors": 0, "last_error": None}


def _connect():
    """A new connection to whichever engine is configured."""
    assert _DIALECT and _URL
    if _DIALECT.name == "postgres":
        import psycopg
        return psycopg.connect(_URL, autocommit=True)
    import sqlite3
    conn = sqlite3.connect(_URL, timeout=10, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
def _schema() -> list[str]:
    d = _DIALECT
    assert d
    return [
        # ---- meaningful product events ---------------------------------- #
        f"""CREATE TABLE IF NOT EXISTS analytics_event (
            id        {d.serial},
            ts        {d.ts_type} NOT NULL,
            name      TEXT NOT NULL,
            visitor   TEXT,
            visit     TEXT,
            path      TEXT,
            year      INTEGER,
            gp        TEXT,
            session_type TEXT,
            feature   TEXT,
            mode      TEXT,
            ok        {d.bool_type},
            ms        INTEGER,
            detail    TEXT
        )""",
        "CREATE INDEX IF NOT EXISTS analytics_event_ts ON analytics_event (ts)",
        "CREATE INDEX IF NOT EXISTS analytics_event_name_ts ON analytics_event (name, ts)",
        "CREATE INDEX IF NOT EXISTS analytics_event_visitor ON analytics_event (visitor)",

        # ---- one row per Ask interaction, the point of the exercise ------ #
        f"""CREATE TABLE IF NOT EXISTS analytics_ask (
            id        {d.serial},
            ref       TEXT NOT NULL UNIQUE,
            ts        {d.ts_type} NOT NULL,
            visitor   TEXT,
            year      INTEGER,
            gp        TEXT,
            session_type TEXT,
            question  TEXT NOT NULL,
            answer    TEXT,
            outcome   TEXT NOT NULL,
            topic     TEXT NOT NULL,
            kind      TEXT,
            confidence TEXT,
            missing   TEXT,
            matched   {d.bool_type},
            used_llm  {d.bool_type},
            ms        INTEGER,
            error     TEXT,
            helpful   {d.bool_type}
        )""",
        "CREATE INDEX IF NOT EXISTS analytics_ask_ts ON analytics_ask (ts)",
        "CREATE INDEX IF NOT EXISTS analytics_ask_outcome_ts ON analytics_ask (outcome, ts)",

        # ---- the shape of history, kept after the raw rows are pruned ---- #
        f"""CREATE TABLE IF NOT EXISTS analytics_daily (
            day    TEXT NOT NULL,
            name   TEXT NOT NULL,
            feature TEXT,
            n      INTEGER NOT NULL,
            PRIMARY KEY (day, name, feature)
        )""",
    ]


# --------------------------------------------------------------------------- #
# Setup / teardown
# --------------------------------------------------------------------------- #
def setup(url: str | None = None) -> bool:
    """Configure analytics. Returns whether it ended up enabled.

    Called once at startup and again by tests. Absent configuration is a normal,
    supported state — the site runs exactly as it did before, and every record()
    becomes a no-op. That is what makes this safe to deploy before the database
    exists.
    """
    global _DIALECT, _URL, _ENABLED, _writer
    with _lock:
        settings = get_settings()
        raw = url if url is not None else (
            os.getenv("DATABASE_URL") or settings.analytics_db_url or "")
        raw = (raw or "").strip()
        if not raw:
            _ENABLED = False
            _DIALECT = None
            _URL = None
            log.info("analytics: no DATABASE_URL — disabled (the site is unaffected)")
            return False

        if raw.startswith(("postgres://", "postgresql://")):
            # psycopg wants the modern scheme; Render hands out the old one.
            _URL = raw.replace("postgres://", "postgresql://", 1)
            _DIALECT = _Dialect("postgres")
        elif raw.startswith("sqlite://"):
            path = raw[len("sqlite://"):]
            _URL = path or ":memory:"
            _DIALECT = _Dialect("sqlite")
        else:
            _URL = raw
            _DIALECT = _Dialect("sqlite")

        try:
            conn = _connect()
            try:
                for statement in _schema():
                    conn.execute(_DIALECT.sql(statement))
                if _DIALECT.name == "sqlite":
                    conn.commit()
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            # A database that will not answer is not a reason to fail a boot.
            _ENABLED = False
            _stats["errors"] += 1
            _stats["last_error"] = f"{type(exc).__name__}: {exc}"[:200]
            log.warning("analytics: setup failed, staying disabled: %s", exc)
            return False

        _ENABLED = True
        _stop.clear()
        if _writer is None or not _writer.is_alive():
            _writer = threading.Thread(target=_run_writer, name="analytics-writer",
                                       daemon=True)
            _writer.start()
        log.info("analytics: enabled (%s)", _DIALECT.name)
        return True


def shutdown(timeout: float = 3.0) -> None:
    """Stop the writer, draining what is already queued. Used by tests."""
    global _ENABLED
    _stop.set()
    if _writer and _writer.is_alive():
        _writer.join(timeout=timeout)
    _ENABLED = False


def enabled() -> bool:
    return _ENABLED


def health() -> dict:
    """Whether analytics itself is working — surfaced on the admin dashboard,
    because a dashboard that has quietly recorded nothing for a week looks
    exactly like a product nobody is using."""
    return {
        "enabled": _ENABLED,
        "engine": _DIALECT.name if _DIALECT else None,
        "queue_depth": _Q.qsize(),
        "queue_max": QUEUE_MAX,
        **{k: v for k, v in _stats.items()},
    }


# --------------------------------------------------------------------------- #
# The writer
# --------------------------------------------------------------------------- #
def _run_writer() -> None:
    conn = None
    last_prune = 0.0
    while not _stop.is_set():
        batch: list[tuple[str, tuple]] = []
        deadline = time.monotonic() + BATCH_WAIT_S
        while len(batch) < BATCH_MAX and time.monotonic() < deadline:
            try:
                batch.append(_Q.get(timeout=0.25))
            except queue.Empty:
                # Nothing more is coming right now, so write what we have rather
                # than sitting on it until the batch window expires. Batching is
                # for bursts; holding a single event for two seconds only makes
                # the data staler and `flush()` unable to tell when it has
                # actually landed.
                if batch:
                    break
                if _stop.is_set():
                    break
                continue

        if batch:
            try:
                if conn is None:
                    conn = _connect()
                _write_batch(conn, batch)
                _stats["written"] += len(batch)
            except Exception as exc:  # noqa: BLE001
                _stats["errors"] += 1
                _stats["last_error"] = f"{type(exc).__name__}: {exc}"[:200]
                log.warning("analytics: write failed, dropping %d event(s): %s",
                            len(batch), exc)
                try:
                    if conn is not None:
                        conn.close()
                except Exception:  # noqa: BLE001
                    pass
                conn = None
                time.sleep(1.0)   # do not spin against a dead database

        now = time.monotonic()
        if now - last_prune > PRUNE_EVERY_S:
            last_prune = now
            try:
                if conn is None:
                    conn = _connect()
                _prune(conn)
            except Exception as exc:  # noqa: BLE001
                _stats["errors"] += 1
                _stats["last_error"] = f"prune: {exc}"[:200]

    try:
        if conn is not None:
            conn.close()
    except Exception:  # noqa: BLE001
        pass


def _write_batch(conn, batch: Iterable[tuple[str, tuple]]) -> None:
    assert _DIALECT
    grouped: dict[str, list[tuple]] = {}
    for sql, params in batch:
        grouped.setdefault(sql, []).append(params)
    cur = conn.cursor()
    for sql, rows in grouped.items():
        cur.executemany(_DIALECT.sql(sql), rows)
    if _DIALECT.name == "sqlite":
        conn.commit()


def _prune(conn) -> None:
    """Roll finished days up, then delete what has been rolled up.

    Without this the event table grows forever and the answer to "is this
    manageable" becomes "ask again in a year". The rollup is what makes the raw
    retention window safe to be short: the daily shape of usage survives it.
    """
    assert _DIALECT
    d = _DIALECT
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_RETENTION_DAYS)
    cur = conn.cursor()
    cur.execute(d.sql(
        f"""INSERT INTO analytics_daily (day, name, feature, n)
            SELECT {d.day_expr} AS day, name, COALESCE(feature, '') AS feature, COUNT(*)
            FROM analytics_event WHERE ts < ?
            GROUP BY {d.day_expr}, name, COALESCE(feature, '')
            ON CONFLICT (day, name, feature) DO UPDATE SET n = EXCLUDED.n"""),
        (d.ts(cutoff),))
    cur.execute(d.sql("DELETE FROM analytics_event WHERE ts < ?"), (d.ts(cutoff),))
    ask_cutoff = datetime.now(timezone.utc) - timedelta(days=ASK_RETENTION_DAYS)
    cur.execute(d.sql("DELETE FROM analytics_ask WHERE ts < ?"), (d.ts(ask_cutoff),))
    if d.name == "sqlite":
        conn.commit()


def _submit(sql: str, params: tuple) -> None:
    """Hand work to the writer, or drop it. Never block, never raise."""
    try:
        _Q.put_nowait((sql, params))
        _stats["queued"] += 1
    except queue.Full:
        _stats["dropped"] += 1


# --------------------------------------------------------------------------- #
# Public recording API — every one of these is total.
# --------------------------------------------------------------------------- #
def _clip(value: Any, limit: int) -> Any:
    if value is None:
        return None
    text = str(value)
    return text[:limit] if len(text) > limit else text


_EVENT_SQL = (
    "INSERT INTO analytics_event "
    "(ts, name, visitor, visit, path, year, gp, session_type, feature, mode, ok, ms, detail) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def record(name: str, *, visitor: str | None = None, visit: str | None = None,
           path: str | None = None, year: int | None = None, gp: str | None = None,
           session_type: str | None = None, feature: str | None = None,
           mode: str | None = None, ok: bool | None = None, ms: int | None = None,
           detail: str | None = None, at: datetime | None = None) -> None:
    """Record one product event. Fire-and-forget; failures are invisible."""
    if not _ENABLED or not name:
        return
    try:
        assert _DIALECT
        _submit(_EVENT_SQL, (
            _DIALECT.ts(at or datetime.now(timezone.utc)),
            _clip(name, 64), _clip(visitor, 64), _clip(visit, 64), _clip(path, MAX_SHORT),
            int(year) if year is not None else None, _clip(gp, 100),
            _clip(session_type, 40), _clip(feature, 64), _clip(mode, 16),
            _as_bool(ok), int(ms) if ms is not None else None, _clip(detail, MAX_DETAIL),
        ))
    except Exception:  # noqa: BLE001 — analytics may never raise into a request
        _stats["errors"] += 1


_ASK_SQL = (
    "INSERT INTO analytics_ask "
    "(ref, ts, visitor, year, gp, session_type, question, answer, outcome, topic, "
    " kind, confidence, missing, matched, used_llm, ms, error, helpful) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def record_ask(*, question: str, outcome: str, topic: str,
               visitor: str | None = None, year: int | None = None,
               gp: str | None = None, session_type: str | None = None,
               answer: str | None = None, kind: str | None = None,
               confidence: str | None = None, missing: list[str] | None = None,
               matched: bool | None = None, used_llm: bool | None = None,
               ms: int | None = None, error: str | None = None) -> str | None:
    """Record one Ask interaction. Returns the opaque `ref` the thumbs use.

    The ref is a random UUID rather than the row id: it travels to the browser,
    and a guessable sequential handle would let anyone rate — or enumerate —
    somebody else's question.
    """
    if not _ENABLED:
        return None
    try:
        assert _DIALECT
        ref = uuid.uuid4().hex
        _submit(_ASK_SQL, (
            ref, _DIALECT.ts(datetime.now(timezone.utc)), _clip(visitor, 64),
            int(year) if year is not None else None, _clip(gp, 100),
            _clip(session_type, 40), _clip(question, MAX_QUESTION),
            _clip(answer, MAX_ANSWER), _clip(outcome, 32), _clip(topic, 32),
            _clip(kind, 40), _clip(confidence, 16),
            json.dumps(missing or [])[:MAX_DETAIL],
            _as_bool(matched), _as_bool(used_llm),
            int(ms) if ms is not None else None, _clip(error, MAX_DETAIL), None,
        ))
        return ref
    except Exception:  # noqa: BLE001
        _stats["errors"] += 1
        return None


def feedback(ref: str, helpful: bool) -> None:
    """Attach a thumbs up/down to an Ask interaction."""
    if not _ENABLED or not ref:
        return
    try:
        assert _DIALECT
        _submit("UPDATE analytics_ask SET helpful = ? WHERE ref = ?",
                (_as_bool(helpful), _clip(ref, 64)))
    except Exception:  # noqa: BLE001
        _stats["errors"] += 1


def _as_bool(value: bool | None):
    if value is None:
        return None
    assert _DIALECT
    return bool(value) if _DIALECT.name == "postgres" else int(bool(value))


# --------------------------------------------------------------------------- #
# Read side (dashboard only)
# --------------------------------------------------------------------------- #
def flush(timeout: float = 5.0) -> bool:
    """Block until everything queued has been written (or dropped).

    TESTS AND SHUTDOWN ONLY — never call this from a request path; the entire
    design is that nobody waits for us.

    An empty queue is not the condition to wait on: the writer takes a batch
    off the queue before it writes it, so the queue goes empty while the rows
    are still in flight. Accounting is: everything submitted has been either
    written or dropped.
    """
    if not _ENABLED:
        return True
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _stats["written"] + _stats["dropped"] >= _stats["queued"] and _Q.empty():
            return True
        time.sleep(0.05)
    return False


def query(sql: str, params: tuple = ()) -> list[tuple]:
    """Run a read query for the dashboard. Short-lived connection on purpose."""
    if not _ENABLED:
        return []
    assert _DIALECT
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(_DIALECT.sql(sql), params)
        return list(cur.fetchall())
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def dialect() -> _Dialect | None:
    return _DIALECT
