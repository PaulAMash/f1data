"""V86: private product analytics.

The tests are ordered by what would hurt most if it broke:

  1. ANALYTICS MUST NEVER BREAK PITWALL IQ. A dead store, a full queue and a
     raising database all have to leave every endpoint answering normally.
  2. The admin API must refuse everyone who is not holding the token, and must
     refuse everyone when no token is configured at all.
  3. Ask must be classified correctly from the pipeline's own signals, because
     the whole point of this feature is trusting those five buckets.
  4. Storage, date filtering and the dashboard aggregations have to be right,
     or the numbers are decoration.

SQLite stands in for Render's Postgres here — see app/analytics/store.py for why
the store speaks both, and note that every query under test is the same string
production runs.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import analytics
from app.analytics import classify, queries, store
from app.config import get_settings
from app.main import app

client = TestClient(app)

ADMIN_TOKEN = "test-token-that-is-long-enough-to-be-real"


@pytest.fixture()
def analytics_db(tmp_path, monkeypatch):
    """A fresh analytics store per test, and a configured admin token."""
    settings = get_settings()
    saved_token = settings.admin_token
    monkeypatch.setattr(settings, "admin_token", ADMIN_TOKEN)
    analytics.setup(f"sqlite://{tmp_path}/analytics.db")
    store._stats.update(queued=0, written=0, dropped=0, errors=0, last_error=None)  # noqa: SLF001
    yield store
    analytics.shutdown()
    settings.admin_token = saved_token


def _auth(token: str = ADMIN_TOKEN) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _settled(timeout: float = 6.0) -> None:
    assert store.flush(timeout), "analytics writer never drained"


# =========================================================================== #
# 1. Analytics may never break the product.
# =========================================================================== #
def test_the_site_works_with_no_analytics_configured(monkeypatch):
    """The normal, un-migrated state: no DATABASE_URL at all."""
    analytics.shutdown()
    assert analytics.setup("") is False
    assert analytics.enabled() is False
    # every recording call is a silent no-op, not an error
    analytics.record("page_view", visitor="v")
    assert analytics.record_ask(question="q", outcome="answered", topic="results") is None
    analytics.feedback("nope", True)
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "session": "Race", "question": "who won?",
                                      "mock": True})
    assert r.status_code == 200 and r.json()["answer"]
    assert r.json()["ask_ref"] is None


def test_ask_still_answers_when_the_store_raises(analytics_db, monkeypatch):
    """A database having a bad day must not cost a reader their answer."""
    def explode(*_a, **_k):
        raise RuntimeError("analytics database is on fire")
    monkeypatch.setattr(store, "_submit", explode)

    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "session": "Race", "question": "who won?",
                                      "mock": True})
    assert r.status_code == 200
    assert r.json()["answer"], "the answer survived an analytics failure"


def test_a_full_queue_drops_events_rather_than_blocking(analytics_db, monkeypatch):
    """Back-pressure is resolved by losing analytics, never by making a reader wait."""
    import queue as _queue

    def full(*_a, **_k):
        raise _queue.Full()
    monkeypatch.setattr(store._Q, "put_nowait", full)   # noqa: SLF001

    started = time.perf_counter()
    for _ in range(50):
        analytics.record("page_view", visitor="v")
    assert time.perf_counter() - started < 1.0, "recording blocked"
    assert store._stats["dropped"] >= 50                # noqa: SLF001


def test_a_broken_signal_body_is_still_a_204(analytics_db):
    for body in (b"", b"not json", b"{}", b'{"events": "nope"}',
                 b'{"events": [{"name": "made_up"}]}'):
        r = client.post("/api/signal", content=body,
                        headers={"Content-Type": "text/plain"})
        assert r.status_code == 204, body


def test_session_failures_are_recorded_without_changing_the_response(analytics_db, monkeypatch):
    from app.adapters import data_source_manager as dsm

    class _RealOnly:
        mock_mode = False
        enable_live_fetch = False
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnly())
    r = client.get("/api/session", params={"year": 2024, "gp": "Bahrain", "session": "Race"})
    assert r.status_code == 503
    assert r.json()["error"] == "data_unavailable"
    _settled()
    rows = store.query("SELECT gp, detail FROM analytics_event WHERE name = 'session_load_failed'")
    assert rows and rows[0][0] == "Bahrain"


# =========================================================================== #
# 2. The admin API is private.
# =========================================================================== #
ADMIN_ROUTES = ["/api/admin/analytics", "/api/admin/analytics/ask", "/api/admin/status"]


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_reject_anonymous_callers(analytics_db, route):
    assert client.get(route).status_code == 401


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_reject_a_wrong_token(analytics_db, route):
    assert client.get(route, headers=_auth("wrong-but-also-quite-long-token")).status_code == 401
    assert client.get(route, headers={"X-Admin-Token": "nope"}).status_code == 401


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_accept_the_token(analytics_db, route):
    assert client.get(route, headers=_auth()).status_code == 200
    assert client.get(route, headers={"X-Admin-Token": ADMIN_TOKEN}).status_code == 200


def test_admin_is_unavailable_when_no_token_is_configured(analytics_db, monkeypatch):
    """The default must expose nothing, not everything."""
    monkeypatch.setattr(get_settings(), "admin_token", "")
    for route in ADMIN_ROUTES:
        r = client.get(route)
        assert r.status_code == 503, route
        assert "not configured" in r.json()["detail"]


def test_a_short_token_is_refused_as_configuration(analytics_db, monkeypatch):
    """A four-character admin token is worse than none: it looks like security."""
    monkeypatch.setattr(get_settings(), "admin_token", "abc123")
    assert client.get("/api/admin/analytics", headers=_auth("abc123")).status_code == 503


def test_no_analytics_leaks_through_a_public_endpoint(analytics_db):
    """Nothing a normal visitor can reach may answer with analytics data."""
    analytics.record("page_view", visitor="secret-visitor", path="/explorer")
    _settled()
    for route, params in (("/api/meta", {}), ("/api/current", {}),
                          ("/api/health", {}), ("/api/archive/scale", {})):
        body = client.get(route, params=params).text
        assert "secret-visitor" not in body
        assert "analytics" not in body.lower()


# =========================================================================== #
# 3. Ask classification, from signals the pipeline already produced.
# =========================================================================== #
@pytest.mark.parametrize("kind,confidence,missing,matched,expected", [
    ("winner", "high", [], True, classify.ANSWERED),
    ("tyre_strategy", "medium", [], True, classify.ANSWERED),
    # answered, but it had to leave something out
    ("tyre_strategy", "high", ["stint data"], True, classify.PARTIAL),
    ("best_pace", "low", [], True, classify.PARTIAL),
    # the handler said outright that it cannot
    ("missing", "low", ["lap times"], True, classify.DATA_UNAVAILABLE),
    # nothing recognised the question — the fallback answered
    ("overview", "medium", [], False, classify.UNANSWERED),
    ("empty", "low", [], True, classify.UNANSWERED),
])
def test_outcome_classification(kind, confidence, missing, matched, expected):
    assert classify.classify_outcome(kind=kind, confidence=confidence,
                                     missing=missing, matched=matched) == expected


def test_a_failed_request_is_a_system_error():
    assert classify.classify_outcome(kind=None, confidence=None, missing=None,
                                     matched=None, failed=True) == classify.ERROR


def test_an_overview_is_only_unanswered_when_nothing_matched():
    """The distinction the `matched_handler` flag exists to make."""
    asked_for = classify.classify_outcome(kind="overview", confidence="medium",
                                          missing=[], matched=True)
    fell_through = classify.classify_outcome(kind="overview", confidence="medium",
                                             missing=[], matched=False)
    assert asked_for == classify.ANSWERED
    assert fell_through == classify.UNANSWERED


@pytest.mark.parametrize("kind,expected", [
    ("tyre_strategy", classify.TYRES),
    ("undercut", classify.STRATEGY),
    ("best_pace", classify.PACE),
    ("overtake", classify.OVERTAKES),
    ("pole", classify.QUALIFYING),
    ("compare_drivers", classify.COMPARISON),
    ("retirement", classify.RETIREMENTS),
])
def test_a_matched_handler_names_its_own_topic(kind, expected):
    assert classify.classify_topic("anything at all", kind, True) == expected


@pytest.mark.parametrize("question,expected", [
    ("What was Ferrari's tyre strategy in Monaco?", classify.TYRES),
    ("Should they have pitted earlier for a two stop?", classify.STRATEGY),
    ("Who took pole and by how much?", classify.QUALIFYING),
    ("How did Verstappen overtake him into turn 1?", classify.OVERTAKES),
    ("Why did Leclerc retire?", classify.RETIREMENTS),
    ("Did the rain change anything?", classify.WEATHER),
    ("Which driver had the best race pace?", classify.PACE),
    ("Compare Norris versus Piastri", classify.COMPARISON),
    ("Has anyone ever won the championship from there?", classify.HISTORY),
    ("what is the airspeed velocity of an unladen swallow", classify.OTHER),
])
def test_an_unrecognised_question_is_categorised_from_its_text(question, expected):
    """The set that matters most: these are the questions telling you what to build."""
    assert classify.classify_topic(question, "overview", False) == expected


def test_a_handler_this_map_has_never_heard_of_falls_back_to_the_text():
    """A new Ask handler must not silently become 'Other'."""
    assert classify.classify_topic("what tyres did they start on?",
                                   "some_new_handler_v99", True) == classify.TYRES


def test_the_pipeline_reports_whether_a_handler_matched():
    """The flag is real, set by qa.answer_question, and travels to the client."""
    from app.analysis.engine import analyze
    from app.analysis.qa import QAContext, answer_question
    from app.adapters.mock_adapter import get_mock_session

    session = get_mock_session()
    strategy, pace = analyze(session)
    ctx = QAContext(session=session, strategy=strategy, pace=pace)

    known = answer_question("who won?", ctx)
    assert known.matched_handler is True

    nonsense = answer_question("qwertyuiop zxcvbnm", ctx)
    assert nonsense.matched_handler is False
    assert nonsense.answer, "the reader still gets something — nothing dead-ends"


def test_ask_endpoint_records_a_classified_interaction(analytics_db):
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "session": "Race", "question": "Who won and how?",
                                      "mock": True, "visitor": "v-1"})
    assert r.status_code == 200
    ref = r.json()["ask_ref"]
    assert ref
    _settled()
    rows = store.query("SELECT question, outcome, topic, visitor, gp, ms FROM analytics_ask")
    assert len(rows) == 1
    question, outcome, topic, visitor, gp, ms = rows[0]
    assert question == "Who won and how?"
    assert outcome in classify.OUTCOMES
    assert topic == classify.RESULTS
    assert visitor == "v-1"
    assert gp == "Austrian Grand Prix"
    assert ms is not None and ms >= 0


def test_feedback_attaches_to_the_interaction(analytics_db):
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "session": "Race", "question": "Who won?",
                                      "mock": True})
    ref = r.json()["ask_ref"]
    _settled()
    assert client.post("/api/ask/feedback", json={"ref": ref, "helpful": False}).status_code == 204
    _settled()
    assert store.query("SELECT helpful FROM analytics_ask WHERE ref = ?", (ref,))[0][0] in (0, False)
    # an unknown ref is harmless
    assert client.post("/api/ask/feedback",
                       json={"ref": "does-not-exist", "helpful": True}).status_code == 204


# =========================================================================== #
# 4. Storage, ingest, filtering and aggregation.
# =========================================================================== #
def test_the_signal_endpoint_stores_a_batch(analytics_db):
    r = client.post("/api/signal", json={
        "visitor": "v-1", "visit": "s-1",
        "events": [
            {"name": "page_view", "path": "/explorer"},
            {"name": "session_open", "year": 2026, "gp": "Miami Grand Prix",
             "session": "Race"},
            {"name": "feature_use", "feature": "charts", "mode": "advanced"},
        ]})
    assert r.status_code == 204
    _settled()
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 3
    assert store.query(
        "SELECT gp FROM analytics_event WHERE name = 'session_open'")[0][0] == "Miami Grand Prix"


def test_the_ingest_vocabulary_is_closed(analytics_db):
    """An open ingest is a table strangers can fill with anything."""
    client.post("/api/signal", json={"visitor": "v", "visit": "s", "events": [
        {"name": "page_view", "path": "/explorer"},
        {"name": "drop_tables", "path": "/evil"},
        {"name": "feature_use", "feature": "not-a-real-feature"},
        {"name": "feature_use", "feature": "charts", "mode": "hacker"},
    ]})
    _settled()
    names = [r[0] for r in store.query("SELECT name FROM analytics_event ORDER BY id")]
    assert "drop_tables" not in names
    features = [r[0] for r in store.query(
        "SELECT feature FROM analytics_event WHERE name = 'feature_use' ORDER BY id")]
    assert features == ["other", "charts"], "an unknown feature is bucketed, not stored raw"
    modes = [r[0] for r in store.query(
        "SELECT mode FROM analytics_event WHERE feature = 'charts'")]
    assert modes == [None], "an invented mode is discarded"


def test_oversized_text_is_truncated(analytics_db):
    analytics.record_ask(question="x" * 5000, answer="y" * 50_000,
                         outcome=classify.ANSWERED, topic=classify.OTHER)
    _settled()
    question, answer = store.query("SELECT question, answer FROM analytics_ask")[0]
    assert len(question) == store.MAX_QUESTION
    assert len(answer) == store.MAX_ANSWER


def test_date_filtering_selects_the_right_window(analytics_db):
    now = datetime.now(timezone.utc)
    analytics.record("page_view", visitor="old", path="/a", at=now - timedelta(days=45))
    analytics.record("page_view", visitor="recent", path="/b", at=now - timedelta(days=3))
    analytics.record("page_view", visitor="today", path="/c", at=now - timedelta(minutes=5))
    _settled()

    assert queries.dashboard("today")["overview"]["page_views"] == 1
    assert queries.dashboard("7d")["overview"]["page_views"] == 2
    assert queries.dashboard("90d")["overview"]["page_views"] == 3
    assert queries.dashboard("all")["overview"]["page_views"] == 3


def test_custom_dates_are_honoured_and_bad_ones_do_not_500(analytics_db):
    now = datetime.now(timezone.utc)
    analytics.record("page_view", visitor="a", at=now - timedelta(days=10))
    _settled()
    window = queries.resolve_range("custom", (now - timedelta(days=20)).date().isoformat(),
                                   (now - timedelta(days=5)).date().isoformat())
    assert window["key"] == "custom"
    r = client.get("/api/admin/analytics", headers=_auth(),
                   params={"range": "not-a-range", "start": "banana"})
    assert r.status_code == 200
    assert r.json()["range"]["key"] == "7d", "a malformed range falls back, it does not fail"


def test_returning_visitors_are_counted_from_earlier_activity(analytics_db):
    now = datetime.now(timezone.utc)
    analytics.record("page_view", visitor="loyal", at=now - timedelta(days=20))
    analytics.record("page_view", visitor="loyal", at=now - timedelta(days=1))
    analytics.record("page_view", visitor="brand-new", at=now - timedelta(days=1))
    _settled()
    overview = queries.dashboard("7d")["overview"]
    assert overview["visitors"] == 2
    assert overview["returning_visitors"] == 1
    assert overview["returning_pct"] == 50.0


def test_dashboard_aggregates_usage(analytics_db):
    for _ in range(3):
        analytics.record("session_open", visitor="v1", visit="s1", year=2026,
                         gp="Miami Grand Prix", session_type="Race")
    analytics.record("session_open", visitor="v2", visit="s2", year=2025,
                     gp="Monaco Grand Prix", session_type="Qualifying")
    for _ in range(5):
        analytics.record("feature_use", visitor="v1", visit="s1", feature="charts",
                         mode="advanced")
    analytics.record("feature_use", visitor="v2", visit="s2", feature="ask", mode="simple")
    _settled()

    usage = queries.dashboard("7d")["usage"]
    assert usage["races"][0] == {"year": 2026, "gp": "Miami Grand Prix", "n": 3}
    assert usage["sessions"][0]["session_type"] == "Race"
    assert usage["features"][0] == {"feature": "charts", "n": 5}
    assert {m["mode"] for m in usage["modes"]} == {"advanced", "simple"}


def test_the_exit_list_is_the_last_event_of_each_visit(analytics_db):
    """'What are people doing before they leave' — one row per visit, its last."""
    now = datetime.now(timezone.utc)
    analytics.record("feature_use", visitor="v1", visit="s1", feature="story",
                     at=now - timedelta(minutes=9))
    analytics.record("feature_use", visitor="v1", visit="s1", feature="ask",
                     at=now - timedelta(minutes=8))
    analytics.record("feature_use", visitor="v2", visit="s2", feature="ask",
                     at=now - timedelta(minutes=7))
    _settled()
    exits = {e["what"]: e["n"] for e in queries.dashboard("7d")["usage"]["exits"]}
    assert exits == {"ask": 2}, exits


def test_performance_section_reports_timings_and_failures(analytics_db):
    for ms in (100, 200, 300, 400, 5000):
        analytics.record("api_request", path="/api/session", ok=True, ms=ms)
    analytics.record("api_error", path="/api/session", ok=False, detail="HTTP 503")
    _settled()
    perf = queries.dashboard("7d")["performance"]
    assert perf["requests"] == 5
    assert perf["median_ms"] == 300
    assert perf["p95_ms"] == 5000
    assert perf["failed"][0]["detail"] == "HTTP 503"


def test_ask_section_counts_outcomes_topics_and_feedback(analytics_db):
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED,
                         topic=classify.RESULTS)
    analytics.record_ask(question="Tyre strategy?", outcome=classify.PARTIAL,
                         topic=classify.TYRES, missing=["stint data"])
    bad = analytics.record_ask(question="Best race pace?", outcome=classify.UNANSWERED,
                               topic=classify.PACE)
    _settled()
    analytics.feedback(bad, False)
    _settled()

    ask = queries.dashboard("7d")["ask"]
    assert ask["total"] == 3
    assert ask["outcomes"][classify.ANSWERED] == 1
    assert ask["outcomes"][classify.PARTIAL] == 1
    assert ask["outcomes"][classify.UNANSWERED] == 1
    assert ask["unhelpful"] == 1
    topics = {t["topic"]: t for t in ask["topics"]}
    assert topics[classify.TYRES]["unresolved"] == 1
    assert topics[classify.RESULTS]["unresolved"] == 0
    # The problems list is the to-do, so it carries what was missing — and it
    # carries ONLY the questions that went badly. A successfully answered
    # question in a list headed "where Ask fell short" is noise in the one
    # place that has to be signal.
    problems = {p["question"]: p for p in ask["problems"]}
    assert problems["Tyre strategy?"]["missing_summary"] == "stint data"
    assert set(problems) == {"Tyre strategy?", "Best race pace?"}
    assert "Who won?" not in problems


def test_ask_log_filters_by_outcome_and_topic(analytics_db):
    analytics.record_ask(question="a", outcome=classify.ANSWERED, topic=classify.RESULTS)
    analytics.record_ask(question="b", outcome=classify.UNANSWERED, topic=classify.PACE)
    _settled()
    rows = queries.ask_log("7d", outcome=classify.UNANSWERED)["rows"]
    assert [r["question"] for r in rows] == ["b"]
    rows = queries.ask_log("7d", topic=classify.RESULTS)["rows"]
    assert [r["question"] for r in rows] == ["a"]


def test_dashboard_endpoint_answers_the_shape_the_page_expects(analytics_db):
    analytics.record("page_view", visitor="v", visit="s", path="/explorer")
    _settled()
    body = client.get("/api/admin/analytics", headers=_auth(), params={"range": "7d"}).json()
    assert body["available"] is True
    for key in ("range", "overview", "traffic", "usage", "performance", "ask",
                "recent", "health", "previous"):
        assert key in body, key
    for key in ("races", "sessions", "features", "pages", "modes", "exits", "eras"):
        assert key in body["usage"], key


def test_the_dashboard_says_so_when_nothing_is_configured(monkeypatch):
    analytics.shutdown()
    analytics.setup("")
    monkeypatch.setattr(get_settings(), "admin_token", ADMIN_TOKEN)
    body = client.get("/api/admin/analytics", headers=_auth()).json()
    assert body["available"] is False
    assert "DATABASE_URL" in body["reason"]


def test_pruning_rolls_old_events_up_and_deletes_them(analytics_db):
    old = datetime.now(timezone.utc) - timedelta(days=store.EVENT_RETENTION_DAYS + 5)
    for _ in range(4):
        analytics.record("page_view", visitor="v", path="/explorer", at=old)
    analytics.record("page_view", visitor="v", path="/explorer")
    _settled()
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 5

    conn = store._connect()                    # noqa: SLF001
    try:
        store._prune(conn)                     # noqa: SLF001
    finally:
        conn.close()

    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 1, "old rows deleted"
    rolled = store.query("SELECT day, name, n FROM analytics_daily")
    assert rolled and rolled[0][1] == "page_view" and rolled[0][2] == 4, \
        "the shape of history survives the prune"


def test_health_reports_whether_analytics_is_actually_recording(analytics_db):
    analytics.record("page_view", visitor="v")
    _settled()
    body = client.get("/api/admin/status", headers=_auth()).json()
    assert body["admin_token_configured"] is True
    assert body["analytics"]["enabled"] is True
    assert body["analytics"]["written"] >= 1
    assert body["analytics"]["engine"] == "sqlite"
