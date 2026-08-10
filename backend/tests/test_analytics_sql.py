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
