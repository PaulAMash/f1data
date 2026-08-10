"""
Everything the dashboard shows, in one payload.

ONE ENDPOINT, NOT TWELVE. The dashboard's job is "open it and immediately
understand what is happening", and a page that has to orchestrate a dozen
requests before it can say anything is working against that. The volumes here
are small — a beta with a handful of readers — so the whole board is assembled
server-side in a single call and rendered in one pass.

The SQL is deliberately ordinary: counts, group-bys and a `ts >= ?` bound, so it
runs unchanged on Postgres in production and SQLite on a laptop. The two
exceptions are isolated in store._Dialect (`day_expr`, placeholder style).

Percentiles are done with COUNT-then-OFFSET rather than a percentile function,
because neither engine agrees on how to spell one and reading a whole window of
durations into Python to sort it would be worse than two cheap queries.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import classify, store

# --------------------------------------------------------------------------- #
# Ranges
# --------------------------------------------------------------------------- #
RANGES = {
    "today": 1, "7d": 7, "30d": 30, "90d": 90, "all": None,
}


def resolve_range(key: str = "7d", start: str | None = None,
                  end: str | None = None) -> dict:
    """A window, from a preset key or an explicit pair of ISO dates."""
    now = datetime.now(timezone.utc)
    if start or end:
        try:
            frm = datetime.fromisoformat(start).replace(tzinfo=timezone.utc) if start else None
            to = (datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
                  if end else now)
            return {"key": "custom", "from": frm, "to": to,
                    "days": (to - frm).days + 1 if frm else None}
        except (TypeError, ValueError):
            pass   # a malformed date falls back to the default rather than 500s
    key = key if key in RANGES else "7d"
    days = RANGES[key]
    if days is None:
        return {"key": "all", "from": None, "to": now, "days": None}
    if key == "today":
        frm = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        frm = now - timedelta(days=days)
    return {"key": key, "from": frm, "to": now, "days": days}


def _bounds(window: dict) -> tuple[str, tuple]:
    """A WHERE fragment and its parameters for the window."""
    d = store.dialect()
    assert d
    if window["from"] is None:
        return "ts <= ?", (d.ts(window["to"]),)
    return "ts >= ? AND ts <= ?", (d.ts(window["from"]), d.ts(window["to"]))


def _previous(window: dict) -> dict | None:
    """The window immediately before this one, for a comparison figure."""
    if window["from"] is None:
        return None
    span = window["to"] - window["from"]
    return {"key": "previous", "from": window["from"] - span, "to": window["from"],
            "days": window["days"]}


def _scalar(sql: str, params: tuple, default=0):
    rows = store.query(sql, params)
    if not rows or rows[0][0] is None:
        return default
    return rows[0][0]


def _percentile(table: str, column: str, where: str, params: tuple,
                fraction: float) -> int | None:
    """COUNT, then jump to the row at that position. Portable and cheap."""
    total = _scalar(f"SELECT COUNT(*) FROM {table} WHERE {where} AND {column} IS NOT NULL",
                    params)
    if not total:
        return None
    offset = max(0, min(total - 1, int(total * fraction)))
    rows = store.query(
        f"SELECT {column} FROM {table} WHERE {where} AND {column} IS NOT NULL "
        f"ORDER BY {column} LIMIT 1 OFFSET {offset}", params)
    return int(rows[0][0]) if rows else None


# --------------------------------------------------------------------------- #
# Sections
# --------------------------------------------------------------------------- #
def _overview(window: dict) -> dict:
    where, params = _bounds(window)
    visitors = _scalar(
        f"SELECT COUNT(DISTINCT visitor) FROM analytics_event "
        f"WHERE {where} AND visitor IS NOT NULL", params)
    visits = _scalar(
        f"SELECT COUNT(DISTINCT visit) FROM analytics_event "
        f"WHERE {where} AND visit IS NOT NULL", params)
    views = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'page_view'",
        params)
    asks = _scalar(f"SELECT COUNT(*) FROM analytics_ask WHERE {where}", params)
    errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name IN "
        f"('client_error', 'api_error', 'session_load_failed')", params)

    # A returning visitor is one we had already seen before this window opened.
    returning = 0
    if window["from"] is not None:
        d = store.dialect()
        assert d
        returning = _scalar(
            f"SELECT COUNT(DISTINCT e.visitor) FROM analytics_event e "
            f"WHERE {where} AND e.visitor IS NOT NULL AND EXISTS ("
            f"  SELECT 1 FROM analytics_event p WHERE p.visitor = e.visitor AND p.ts < ?)",
            params + (d.ts(window["from"]),))
    return {
        "visitors": visitors, "visits": visits, "page_views": views,
        "ask_questions": asks, "errors": errors,
        "returning_visitors": returning,
        "returning_pct": round(100.0 * returning / visitors, 1) if visitors else 0.0,
    }


def _traffic(window: dict) -> list[dict]:
    d = store.dialect()
    assert d
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT {d.day_expr} AS day, COUNT(DISTINCT visitor), "
        f"       SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) "
        f"FROM analytics_event WHERE {where} GROUP BY {d.day_expr} ORDER BY day", params)
    asks = dict(store.query(
        f"SELECT {d.day_expr} AS day, COUNT(*) FROM analytics_ask WHERE {where} "
        f"GROUP BY {d.day_expr}", params))
    return [{"day": r[0], "visitors": r[1] or 0, "views": r[2] or 0,
             "asks": asks.get(r[0], 0)} for r in rows]


def _top(window: dict, sql: str, keys: tuple[str, ...], limit: int = 10) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(sql.format(where=where, limit=limit), params)
    return [dict(zip(keys, row)) for row in rows]


def _usage(window: dict) -> dict:
    return {
        "pages": _top(window,
                      "SELECT path, COUNT(*) n FROM analytics_event "
                      "WHERE {where} AND name = 'page_view' AND path IS NOT NULL "
                      "GROUP BY path ORDER BY n DESC LIMIT {limit}", ("path", "n")),
        "races": _top(window,
                      "SELECT year, gp, COUNT(*) n FROM analytics_event "
                      "WHERE {where} AND name = 'session_open' AND gp IS NOT NULL "
                      "GROUP BY year, gp ORDER BY n DESC LIMIT {limit}",
                      ("year", "gp", "n")),
        "sessions": _top(window,
                         "SELECT session_type, COUNT(*) n FROM analytics_event "
                         "WHERE {where} AND name = 'session_open' AND session_type IS NOT NULL "
                         "GROUP BY session_type ORDER BY n DESC LIMIT {limit}",
                         ("session_type", "n")),
        "features": _top(window,
                         "SELECT feature, COUNT(*) n FROM analytics_event "
                         "WHERE {where} AND name = 'feature_use' AND feature IS NOT NULL "
                         "GROUP BY feature ORDER BY n DESC LIMIT {limit}",
                         ("feature", "n"), limit=20),
        "modes": _top(window,
                      "SELECT mode, COUNT(*) n FROM analytics_event "
                      "WHERE {where} AND mode IS NOT NULL "
                      "GROUP BY mode ORDER BY n DESC LIMIT {limit}", ("mode", "n"), limit=4),
        # current season vs archive, which is a different question from "which race"
        #
        # `%%` HERE IS NOT A TYPO. psycopg scans every query string for its own
        # placeholders (%s, %b, %t) whenever parameters are also being passed,
        # and it treats ANY other bare `%` in the text — including this LIKE
        # wildcard — as a malformed placeholder rather than a literal character.
        # sqlite3's `?`-style driver never does this scanning, which is exactly
        # why this reached production before it was caught: every local and CI
        # test runs against SQLite (see store.py for why), and this line is
        # invisible there. `%%` collapses to one literal `%` for psycopg's
        # parser and is a harmless redundant wildcard for SQLite's LIKE engine,
        # so it is correct on both. See test_analytics_sql.py, which parses
        # every query here with psycopg's own (connection-free) query
        # preparation so this class of bug fails fast, in CI, forever.
        "eras": _top(window,
                     "SELECT CASE WHEN path LIKE '/history%%' THEN 'historical' "
                     "            ELSE 'current' END era, COUNT(*) n "
                     "FROM analytics_event WHERE {where} AND name = 'page_view' "
                     "GROUP BY era ORDER BY n DESC LIMIT {limit}", ("era", "n"), limit=4),
        # THE LAST THING SOMEBODY DID BEFORE THEY LEFT. One row per visit, its
        # final event — which is the only way to answer "where do people stop".
        "exits": _top(window,
                      "SELECT COALESCE(feature, path, name) what, COUNT(*) n FROM ("
                      "  SELECT feature, path, name, ROW_NUMBER() OVER "
                      "    (PARTITION BY visit ORDER BY ts DESC) rn "
                      "  FROM analytics_event WHERE {where} AND visit IS NOT NULL"
                      ") last WHERE rn = 1 GROUP BY what ORDER BY n DESC LIMIT {limit}",
                      ("what", "n")),
    }


def _performance(window: dict) -> dict:
    where, params = _bounds(window)
    api_where = f"{where} AND name = 'api_request'"
    slowest = _top(window,
                   "SELECT path, COUNT(*) n, AVG(ms) avg_ms, MAX(ms) max_ms "
                   "FROM analytics_event WHERE {where} AND name = 'api_request' "
                   "AND ms IS NOT NULL GROUP BY path "
                   "HAVING COUNT(*) >= 3 ORDER BY avg_ms DESC LIMIT {limit}",
                   ("path", "n", "avg_ms", "max_ms"))
    for row in slowest:
        row["avg_ms"] = int(row["avg_ms"]) if row["avg_ms"] is not None else None
    return {
        "requests": _scalar(f"SELECT COUNT(*) FROM analytics_event WHERE {api_where}", params),
        "avg_ms": int(_scalar(
            f"SELECT AVG(ms) FROM analytics_event WHERE {api_where} AND ms IS NOT NULL",
            params, 0) or 0),
        "median_ms": _percentile("analytics_event", "ms", api_where, params, 0.5),
        "p95_ms": _percentile("analytics_event", "ms", api_where, params, 0.95),
        "slow_requests": _scalar(
            f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_slow'",
            params),
        "slowest": slowest,
        "failed": _top(window,
                       "SELECT path, detail, COUNT(*) n FROM analytics_event "
                       "WHERE {where} AND name = 'api_error' "
                       "GROUP BY path, detail ORDER BY n DESC LIMIT {limit}",
                       ("path", "detail", "n")),
        "session_failures": _top(window,
                                 "SELECT year, gp, session_type, detail, COUNT(*) n "
                                 "FROM analytics_event WHERE {where} "
                                 "AND name = 'session_load_failed' "
                                 "GROUP BY year, gp, session_type, detail "
                                 "ORDER BY n DESC LIMIT {limit}",
                                 ("year", "gp", "session_type", "detail", "n")),
        "client_errors": _top(window,
                              "SELECT detail, COUNT(*) n FROM analytics_event "
                              "WHERE {where} AND name = 'client_error' "
                              "GROUP BY detail ORDER BY n DESC LIMIT {limit}",
                              ("detail", "n")),
    }


def _ask(window: dict) -> dict:
    where, params = _bounds(window)
    total = _scalar(f"SELECT COUNT(*) FROM analytics_ask WHERE {where}", params)
    outcomes = {o: 0 for o in classify.OUTCOMES}
    for outcome, n in store.query(
            f"SELECT outcome, COUNT(*) FROM analytics_ask WHERE {where} GROUP BY outcome",
            params):
        outcomes[outcome] = n

    helpful = _scalar(
        f"SELECT COUNT(*) FROM analytics_ask WHERE {where} AND helpful = ?",
        params + (store._as_bool(True),))          # noqa: SLF001
    unhelpful = _scalar(
        f"SELECT COUNT(*) FROM analytics_ask WHERE {where} AND helpful = ?",
        params + (store._as_bool(False),))         # noqa: SLF001
    rated = helpful + unhelpful

    # Topics, split by whether Ask actually managed to answer them. The second
    # number is the interesting one: "people keep asking about X and we are bad
    # at X" is the whole reason this dashboard exists.
    topics = []
    for topic, n, bad in store.query(
            f"SELECT topic, COUNT(*), SUM(CASE WHEN outcome IN "
            f"('unanswered','partial','data_unavailable') THEN 1 ELSE 0 END) "
            f"FROM analytics_ask WHERE {where} GROUP BY topic ORDER BY COUNT(*) DESC",
            params):
        topics.append({
            "topic": topic, "label": classify.TOPIC_LABEL.get(topic, topic.title()),
            "n": n, "unresolved": bad or 0,
            "unresolved_pct": round(100.0 * (bad or 0) / n, 1) if n else 0.0,
        })

    problems = []
    for row in store.query(
            f"SELECT ts, question, outcome, topic, missing, year, gp, session_type, helpful "
            f"FROM analytics_ask WHERE {where} AND (outcome IN "
            f"('unanswered','partial','data_unavailable','error') OR helpful = ?) "
            f"ORDER BY ts DESC LIMIT 40",
            params + (store._as_bool(False),)):    # noqa: SLF001
        problems.append(_ask_row(row))

    return {
        "total": total,
        "outcomes": outcomes,
        "outcome_labels": classify.OUTCOME_LABEL,
        "answered_pct": round(100.0 * outcomes[classify.ANSWERED] / total, 1) if total else 0.0,
        "helpful": helpful, "unhelpful": unhelpful, "rated": rated,
        "helpful_pct": round(100.0 * helpful / rated, 1) if rated else None,
        "avg_ms": int(_scalar(
            f"SELECT AVG(ms) FROM analytics_ask WHERE {where} AND ms IS NOT NULL",
            params, 0) or 0),
        "p95_ms": _percentile("analytics_ask", "ms", where, params, 0.95),
        "topics": topics,
        "problems": problems,
    }


def _ask_row(row) -> dict:
    import json
    ts, question, outcome, topic, missing, year, gp, session_type, helpful = row
    try:
        missing_list = json.loads(missing) if missing else []
    except (TypeError, ValueError):
        missing_list = []
    return {
        "ts": str(ts), "question": question, "outcome": outcome,
        "outcome_label": classify.OUTCOME_LABEL.get(outcome, outcome),
        "topic": topic, "topic_label": classify.TOPIC_LABEL.get(topic, topic),
        "missing": missing_list,
        "missing_summary": classify.summarize_missing(missing_list),
        "year": year, "gp": gp, "session_type": session_type,
        "helpful": None if helpful is None else bool(helpful),
    }


def _recent(window: dict, limit: int = 40) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT ts, name, path, feature, year, gp, session_type, ok, ms, detail "
        f"FROM analytics_event WHERE {where} AND name <> 'api_request' "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    keys = ("ts", "name", "path", "feature", "year", "gp", "session_type",
            "ok", "ms", "detail")
    out = []
    for row in rows:
        item = dict(zip(keys, row))
        item["ts"] = str(item["ts"])
        item["ok"] = None if item["ok"] is None else bool(item["ok"])
        out.append(item)
    return out


# --------------------------------------------------------------------------- #
# The whole board
# --------------------------------------------------------------------------- #
def dashboard(range_key: str = "7d", start: str | None = None,
              end: str | None = None) -> dict:
    window = resolve_range(range_key, start, end)
    if not store.enabled():
        return {
            "available": False,
            "reason": ("No analytics database is configured on this deployment. "
                       "Set DATABASE_URL (Render Postgres) and redeploy."),
            "health": store.health(),
            "range": _range_out(window),
        }
    payload = {
        "available": True,
        "range": _range_out(window),
        "health": store.health(),
        "overview": _overview(window),
        "traffic": _traffic(window),
        "usage": _usage(window),
        "performance": _performance(window),
        "ask": _ask(window),
        "recent": _recent(window),
    }
    prev = _previous(window)
    payload["previous"] = _overview(prev) if prev else None
    return payload


def ask_log(range_key: str = "7d", outcome: str | None = None,
            topic: str | None = None, limit: int = 100,
            start: str | None = None, end: str | None = None) -> dict:
    """Browse Ask interactions — the drill-down behind the problems list."""
    window = resolve_range(range_key, start, end)
    if not store.enabled():
        return {"available": False, "rows": [], "range": _range_out(window)}
    where, params = _bounds(window)
    if outcome in classify.OUTCOMES:
        where += " AND outcome = ?"
        params = params + (outcome,)
    if topic:
        where += " AND topic = ?"
        params = params + (topic,)
    limit = max(1, min(500, int(limit)))
    rows = store.query(
        f"SELECT ts, question, outcome, topic, missing, year, gp, session_type, helpful "
        f"FROM analytics_ask WHERE {where} ORDER BY ts DESC LIMIT {limit}", params)
    return {"available": True, "range": _range_out(window),
            "rows": [_ask_row(r) for r in rows]}


def _range_out(window: dict) -> dict:
    return {
        "key": window["key"], "days": window["days"],
        "from": window["from"].isoformat() if window["from"] else None,
        "to": window["to"].isoformat(),
    }
