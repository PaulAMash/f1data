"""V86.3: every analytics query must survive psycopg's own placeholder parser.

WHAT SHIPPED BROKEN. `_usage()`'s "eras" query contained `LIKE '/history%'` — a
literal wildcard, not a parameter placeholder. sqlite3 (`?`-style) never
inspects the query text for `%`, so this was invisible to every local run and
every CI run, all of which use SQLite (see store.py for why). psycopg, when ANY
parameters are passed alongside the query, scans the text for its own
placeholders (`%s`, `%b`, `%t`) and treats every other bare `%` — including a
LIKE wildcard — as a malformed one. First real Postgres request: 500, with a
response that (being an unhandled exception past the CORS middleware) carried
no CORS headers either, which is what made this look like a CORS bug in
production for several rounds of diagnosis before the real traceback surfaced.

THE FIX BELONGS IN CI, NOT IN A HUMAN REMEMBERING IT. psycopg's placeholder
scan is pure text parsing — no network, no live database — so it can run in
every test environment, including this one, which has no Postgres server at
all. `_query2pg` is the exact function `psycopg.Cursor.execute` calls before
ever opening a connection; calling it directly is not a simulation of the real
check, it *is* the real check.

These tests exercise the QUERY-BUILDING FUNCTIONS THEMSELVES (by intercepting
`store.query`) rather than hand-copied SQL strings, and force the Postgres
dialect while running everything else against the real (SQLite-backed) store —
so a query built by `.format()` from `{where}`/`{limit}` fragments, or a new
query added next month, is checked exactly as it would actually be sent.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from psycopg._queries import _query2pg

from app import analytics
from app.analytics import queries, store


def _validate_for_postgres(sql: str, params: tuple) -> None:
    """Raise exactly what psycopg would raise, with zero network I/O."""
    _query2pg(sql.encode(), "utf-8")


@pytest.fixture()
def captured(tmp_path, monkeypatch):
    """Run the real store (SQLite-backed, so it actually executes and returns
    rows) while validating every query text as Postgres would see it — the
    combination that makes this both a correctness test and a dialect test."""
    analytics.setup(f"sqlite://{tmp_path}/sql_check.db")
    seen: list[tuple[str, tuple]] = []

    real_query = store.query

    def spy(sql: str, params: tuple = ()):
        # Postgres param style: SQLite's `?` swapped for `%s`, exactly what
        # jolpica/queries.py's own `_Dialect.sql()` does for the real engine —
        # reproduced here rather than imported so the test does not trust the
        # thing it is checking.
        pg_sql = sql.replace("?", "%s")
        seen.append((pg_sql, params))
        _validate_for_postgres(pg_sql, params)
        return real_query(sql, params)

    monkeypatch.setattr(store, "query", spy)
    yield seen
    analytics.shutdown()


def _seed_traffic() -> None:
    now = datetime.now(timezone.utc)
    analytics.record("page_view", visitor="v1", visit="s1", path="/explorer", at=now)
    analytics.record("page_view", visitor="v1", visit="s1", path="/history", at=now)
    analytics.record("session_open", visitor="v1", visit="s1", year=2026,
                     gp="Miami Grand Prix", session_type="Race", at=now)
    analytics.record("feature_use", visitor="v1", visit="s1", feature="charts",
                     mode="advanced", at=now)
    analytics.record("api_request", path="/api/session", ok=True, ms=120, at=now)
    analytics.record("api_error", path="/api/session", ok=False, detail="HTTP 503", at=now)
    analytics.record("session_load_failed", year=2024, gp="Bahrain",
                     session_type="Race", detail="unreachable", at=now)
    analytics.record("client_error", detail="TypeError: x is not a function", at=now)
    analytics.record_ask(question="Which strategy worked best?",
                         outcome="unanswered", topic="strategy", ms=40)
    store.flush(5)


def test_every_query_the_dashboard_issues_is_postgres_safe(captured):
    """The exact bug: this failed in production and never here — until now."""
    _seed_traffic()
    result = queries.dashboard("7d")
    assert result["available"] is True
    assert len(captured) > 5, "expected the dashboard to have issued several queries"


def test_the_eras_query_specifically_is_the_regression_this_guards(captured):
    _seed_traffic()
    queries.dashboard("7d")
    eras_sql = [sql for sql, _ in captured if "era" in sql.lower()]
    assert eras_sql, "the eras query did not run — test setup is stale"
    for sql in eras_sql:
        assert "/history%%" in sql or "/history%" not in sql.replace("%%", ""), (
            "the LIKE wildcard must be escaped as %% for psycopg")
        _validate_for_postgres(sql, ())  # raises if this regresses


def test_ask_log_queries_are_also_postgres_safe(captured):
    _seed_traffic()
    result = queries.ask_log("7d")
    assert result["available"] is True


def test_a_reintroduced_unescaped_wildcard_is_caught_by_this_harness():
    """Proves the harness actually catches the bug class, not just this instance."""
    with pytest.raises(Exception) as exc_info:
        _validate_for_postgres(
            "SELECT * FROM analytics_event WHERE path LIKE '/history%' AND ts >= %s",
            (1,))
    assert "placeholder" in str(exc_info.value).lower()


def test_custom_date_ranges_also_produce_postgres_safe_queries(captured):
    _seed_traffic()
    now = datetime.now(timezone.utc).date().isoformat()
    result = queries.dashboard("custom", start="2020-01-01", end=now)
    assert result["available"] is True


# =========================================================================== #
# V89 verification pass — two holes the V86.1 coverage left open.
#
# The tests above prove the READ queries are placeholder-safe. Two things they
# cannot see, both of which are the same trap that took the dashboard down:
#
#   1. They check the eras query's TEXT, never its RESULT. Changing the pattern
#      to something wrong (or dropping the CASE) keeps every assertion above
#      green while the dashboard silently misreports historical vs current use.
#   2. They only spy `store.query`, which the WRITE path and the DDL never go
#      through — so a literal `%` added to an INSERT, an UPDATE or the prune
#      rollup would be exactly as invisible as `LIKE '/history%'` was.
# =========================================================================== #
def _capture_postgres_sql(monkeypatch, emit) -> list[str]:
    """The exact SQL a callable emits with the Postgres dialect forced.

    Records rather than executes, so the real Postgres strings can be captured
    on a machine with no Postgres — which is every machine this suite runs on.
    """
    sink: list[str] = []

    class _CaptureOnly:
        def cursor(self):
            return self

        def execute(self, sql, *_a):
            sink.append(sql)

        def executemany(self, sql, *_a):
            sink.append(sql)

        def commit(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr(store, "_DIALECT", store._Dialect("postgres"))
    monkeypatch.setattr(store, "_ENABLED", True)
    emit(_CaptureOnly())
    return sink


def test_the_write_path_and_ddl_are_postgres_safe(monkeypatch):
    """Every statement that is not a dashboard read, checked the same way."""
    statements = _capture_postgres_sql(monkeypatch, lambda conn: None)

    pg = store._Dialect("postgres")
    # DDL: executed without params, so psycopg does not scan it — but a stray
    # placeholder there would still be a hard failure at first boot.
    statements += [pg.sql(s) for s in store._schema()]
    # The insert/update statements the app actually submits, referenced rather
    # than copied so this cannot drift away from the code it guards.
    statements.append(pg.sql(store._EVENT_SQL))
    statements.append(pg.sql(store._ASK_SQL))

    # The queued write statements, captured from the real call sites.
    queued: list[str] = []
    monkeypatch.setattr(store, "_submit", lambda sql, params: queued.append(pg.sql(sql)))
    analytics.record("page_view", visitor="v", visit="s", path="/explorer")
    analytics.record_ask(question="q", outcome="answered", topic="results")
    analytics.feedback("some-ref", True)
    assert len(queued) == 3, "expected an event insert, an ask insert and a feedback update"
    statements += queued

    assert len(statements) >= 10, "the capture is stale — statements went missing"
    for sql in statements:
        _validate_for_postgres(sql, (1,))


def test_the_prune_statements_are_postgres_safe(monkeypatch):
    """The rollup is the most intricate SQL in the package and runs unattended
    in a background thread, where a failure is a log line nobody reads."""
    statements = _capture_postgres_sql(monkeypatch, store._prune)
    # rollup + one DELETE per retained table (event, ask, feedback)
    assert len(statements) == 4, f"expected rollup + three deletes, got {len(statements)}"
    assert any("ON CONFLICT" in s for s in statements), "the rollup upsert went missing"
    # Every table with its own retention window must actually be pruned; a table
    # added to the schema and forgotten here grows without bound.
    for table in ("analytics_event", "analytics_ask", "analytics_feedback"):
        assert any(f"DELETE FROM {table} WHERE ts <" in s for s in statements), \
            f"{table} is never pruned"
    for sql in statements:
        _validate_for_postgres(sql, (1,))


def test_history_pages_are_still_counted_as_historical(captured):
    """The behaviour the `%%` edit had to preserve, asserted rather than assumed.

    `%%` is one literal `%` to psycopg and a redundant second wildcard to
    SQLite's LIKE, so both engines match the same paths. Nothing in the suite
    checked that, which meant the fix for a 500 could have quietly become a
    wrong number on the dashboard instead.
    """
    now = datetime.now(timezone.utc)
    for path in ("/history", "/history/1998", "/explorer", "/explorer", "/"):
        analytics.record("page_view", visitor="v1", visit="s1", path=path, at=now)
    store.flush(5)

    eras = {row["era"]: row["n"] for row in queries.dashboard("7d")["usage"]["eras"]}
    assert eras.get("historical") == 2, f"/history pages miscounted: {eras}"
    # V91: `current` means the current-season surface, so it is `/explorer` and
    # nothing else. The old catch-all ELSE counted the home page as "current
    # season", which made a landing-page visit indistinguishable from somebody
    # actually looking at this year's racing.
    assert eras.get("current") == 2, f"/explorer miscounted: {eras}"
    assert eras.get("other pages") == 1, f"the home page is neither: {eras}"
