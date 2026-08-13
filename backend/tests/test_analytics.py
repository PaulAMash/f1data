"""V86/V91: private product analytics.

The tests are ordered by what would hurt most if it broke:

  1. ANALYTICS MUST NEVER BREAK PITWALL IQ. A dead store, a full queue and a
     raising database all have to leave every endpoint answering normally.
  2. The admin API must refuse everyone who is not holding the token, and must
     refuse everyone when no token is configured at all.
  3. Ask must be classified correctly from the pipeline's own signals, because
     the whole point of this feature is trusting those buckets.
  4. Storage, date filtering and the dashboard aggregations have to be right,
     or the numbers are decoration.
  5. V91: the numbers must MEAN what the page says they mean — a favicon 404 is
     not a product error, a session failure is counted once, and no percentage
     may exceed 100.
  6. V91: the destructive operations must delete exactly what they promised and
     nothing else.

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
from app.analytics import classify, queries, report, store
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


def test_a_failed_session_load_is_counted_once_not_twice(analytics_db, monkeypatch):
    """V91 REGRESSION. The 503 handler records `session_load_failed`; the
    middleware used to ALSO record `api_error` for the same request, so one dead
    end appeared as two problems and the dashboard's error count was double the
    truth for the most common failure the product has."""
    from app.adapters import data_source_manager as dsm

    class _RealOnly:
        mock_mode = False
        enable_live_fetch = False
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnly())
    client.get("/api/session", params={"year": 2024, "gp": "Bahrain", "session": "Race"})
    _settled()
    assert store.query(
        "SELECT COUNT(*) FROM analytics_event WHERE name = 'session_load_failed'")[0][0] == 1
    assert store.query(
        "SELECT COUNT(*) FROM analytics_event WHERE name = 'api_error' "
        "AND path = '/api/session'")[0][0] == 0, "the 503 was recorded twice"


# =========================================================================== #
# 2. The admin API is private.
# =========================================================================== #
ADMIN_ROUTES = ["/api/admin/analytics", "/api/admin/analytics/ask",
                "/api/admin/analytics/inventory", "/api/admin/analytics/report",
                "/api/admin/cache/inventory", "/api/admin/status"]
ADMIN_POSTS = ["/api/admin/analytics/reset", "/api/admin/cache/clear"]


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_reject_anonymous_callers(analytics_db, route):
    assert client.get(route).status_code == 401


@pytest.mark.parametrize("route", ADMIN_POSTS)
def test_destructive_routes_reject_anonymous_callers(analytics_db, route):
    """Refused on AUTH, before the confirmation phrase is even looked at."""
    r = client.post(route, json={"confirm": "DELETE ANALYTICS"})
    assert r.status_code == 401


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
    ("missing", "low", ["lap times"], True, classify.NO_DATA),
    # a real F1 question no handler covers — a feature request, not an error
    ("overview", "medium", [], False, classify.UNSUPPORTED),
    ("empty", "low", [], True, classify.UNSUPPORTED),
    # the relevance gate declined; working exactly as intended
    ("off_topic", "high", [], True, classify.OFF_TOPIC),
])
def test_outcome_classification(kind, confidence, missing, matched, expected):
    assert classify.classify_outcome(kind=kind, confidence=confidence,
                                     missing=missing, matched=matched) == expected


def test_a_failed_request_is_a_system_error():
    assert classify.classify_outcome(kind=None, confidence=None, missing=None,
                                     matched=None, failed=True) == classify.FAILED


def test_every_outcome_carries_a_label_a_definition_and_an_action():
    """A number whose meaning lives only in a SQL string is a number nobody can
    act on. Each outcome must arrive at the page already explained."""
    for outcome in classify.OUTCOMES:
        assert classify.OUTCOME_LABEL[outcome]
        assert classify.OUTCOME_HELP[outcome].endswith(".")
        assert classify.OUTCOME_ACTION[outcome] in ("none", "improve", "build", "fix")
        assert classify.OUTCOME_TONE[outcome]


def test_unresolved_excludes_off_topic_and_bugs():
    """"Ask did not deliver" must not include questions it declined on purpose,
    nor exceptions — those have entirely different fixes."""
    assert classify.OFF_TOPIC not in classify.UNRESOLVED
    assert classify.FAILED not in classify.UNRESOLVED
    assert set(classify.UNRESOLVED) == {classify.UNSUPPORTED, classify.NO_DATA,
                                        classify.PARTIAL}


def test_an_overview_is_only_unsupported_when_nothing_matched():
    """The distinction the `matched_handler` flag exists to make."""
    asked_for = classify.classify_outcome(kind="overview", confidence="medium",
                                          missing=[], matched=True)
    fell_through = classify.classify_outcome(kind="overview", confidence="medium",
                                             missing=[], matched=False)
    assert asked_for == classify.ANSWERED
    assert fell_through == classify.UNSUPPORTED


@pytest.mark.parametrize("kind,expected", [
    ("tyre_strategy", "tyres"),
    ("undercut", "strategy"),
    ("best_pace", "pace"),
    ("overtake", "overtakes"),
    ("pole", "qualifying"),
    ("compare_drivers", "comparison"),
    ("retirement", "retirements"),
])
def test_a_matched_handler_names_its_own_topic(kind, expected):
    """The handler is the TIE-BREAKER, not the authority: it decides only when
    the question text scores nothing on its own."""
    assert classify.classify_topic("anything at all", kind, True) == expected


def test_the_topic_comes_from_the_question_not_the_handler(analytics_db):
    """A subject Ask has NO handler for still has to be counted under its real
    name — otherwise the one list that tells you what to build next is filed
    under whichever handler happened to catch the fall-through."""
    topic = classify.classify_topic("How many pit stops did Piastri have?",
                                    "overview", False)
    assert topic == "pit_stops"


def test_feedback_normalizes_legacy_outcome_spellings():
    assert classify.normalize_outcome("unanswered") == classify.UNSUPPORTED
    assert classify.normalize_outcome("data_unavailable") == classify.NO_DATA
    assert classify.normalize_outcome("error") == classify.FAILED
    assert classify.normalize_outcome(classify.ANSWERED) == classify.ANSWERED


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
    assert nonsense.answer, "the reader still gets something — nothing dead-ends"


def test_ask_endpoint_records_a_classified_interaction(analytics_db):
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "session": "Race", "question": "Who won and how?",
                                      "mock": True, "visitor": "v-1", "visit": "s-1"})
    assert r.status_code == 200
    ref = r.json()["ask_ref"]
    assert ref
    _settled()
    rows = store.query("SELECT question, outcome, topic, visitor, visit, gp, ms, "
                       "question_norm FROM analytics_ask")
    assert len(rows) == 1
    question, outcome, topic, visitor, visit, gp, ms, norm = rows[0]
    assert question == "Who won and how?"
    assert outcome in classify.OUTCOMES
    assert topic == "results"
    assert visitor == "v-1"
    assert visit == "s-1", "the visit id is what puts Ask in the funnel"
    assert gp == "Austrian Grand Prix"
    assert ms is not None and ms >= 0
    assert norm == "who won and how"


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


def test_every_answer_gets_its_own_feedback_ref(analytics_db):
    """V91 REGRESSION, backend half. The thumbs bug was a frontend keying fault,
    but it can only be fixed if the server hands out a DISTINCT ref per answer —
    two answers sharing one ref would make the leak unfixable in any client."""
    refs = set()
    for q in ("Who won?", "Who won?", "What was the fastest lap?"):
        r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                          "session": "Race", "question": q, "mock": True})
        refs.add(r.json()["ask_ref"])
    assert len(refs) == 3, "the same question asked twice must not share a ref"


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


def test_dwell_is_accepted_and_bounded(analytics_db):
    """V91: a new event name, with the same closed-vocabulary discipline. An
    implausible duration is DISCARDED rather than stored, because a tab left open
    overnight is not "nine hours of engagement" and one such row would dominate
    every average it landed in. The event still records — only the number goes."""
    client.post("/api/signal", json={"visitor": "v", "visit": "s", "events": [
        {"name": "feature_dwell", "feature": "charts", "ms": 4200},
        {"name": "feature_dwell", "feature": "charts", "ms": 99_999_999},
        {"name": "feature_dwell", "feature": "charts", "ms": -5},
        {"name": "session_unavailable", "year": 2024, "gp": "Bahrain"},
    ]})
    _settled()
    values = [r[0] for r in store.query(
        "SELECT ms FROM analytics_event WHERE name = 'feature_dwell' ORDER BY id")]
    assert values == [4200, None, None], values
    assert store.query(
        "SELECT COUNT(*) FROM analytics_event WHERE name = 'session_unavailable'")[0][0] == 1


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
    # `at=now`, NOT `now - 5 minutes`: five minutes before midnight UTC is
    # yesterday, and a test that fails once a night is a test nobody trusts.
    analytics.record("page_view", visitor="today", path="/c", at=now)
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
    top_race = usage["races"][0]
    assert (top_race["year"], top_race["gp"], top_race["n"]) == (2026, "Miami Grand Prix", 3)
    assert usage["sessions"][0]["session_type"] == "Race"
    assert usage["features"][0]["feature"] == "charts"
    assert usage["features"][0]["n"] == 5
    assert usage["features"][0]["label"], "the page shows a name, not an internal key"
    assert {m["mode"] for m in usage["modes"]} == {"advanced", "simple"}
    assert usage["seasons"][0]["year"] == 2026


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
    assert exits == {"Ask": 2}, exits


def test_engagement_depth_separates_a_bounce_from_a_session(analytics_db):
    analytics.record("page_view", visitor="v1", visit="one-and-done", path="/")
    for i in range(6):
        analytics.record("feature_use", visitor="v2", visit="deep", feature="charts")
    _settled()
    depth = queries.dashboard("7d")["usage"]["depth"]
    assert depth["visits"] == 2
    assert depth["bounce_pct"] == 50.0
    buckets = {b["bucket"]: b["visits"] for b in depth["buckets"]}
    assert buckets["1"] == 1 and buckets["4-9"] == 1


def test_no_funnel_step_can_exceed_one_hundred_percent(analytics_db):
    """V91 REGRESSION, found in live verification. Ask is recorded server-side
    and cannot be blocked; page views are a beacon and can be. A visit that only
    ever asked a question therefore appeared in the Ask numerator and in no
    denominator, and the funnel read "Asked Ask — 200% of visits"."""
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED,
                         topic="results", visit="ask-only", visitor="v1")
    _settled()
    funnel = queries.dashboard("7d")["usage"]["funnel"]
    assert funnel[0]["visits"] >= 1, "an Ask-only visit still counts as a visit"
    for step in funnel:
        assert 0 <= step["pct"] <= 100, step


def test_performance_section_reports_timings_and_failures(analytics_db):
    for ms in (100, 200, 300, 400, 5000):
        analytics.record("api_request", path="/api/session", ok=True, ms=ms)
    analytics.record("api_error", path="/api/session", ok=False, detail="HTTP 503",
                     status=503)
    _settled()
    perf = queries.dashboard("7d")["performance"]
    assert perf["requests"] == 5
    assert perf["median_ms"] == 300
    assert perf["p95_ms"] == 5000
    assert perf["failed"][0]["path"] == "/api/session"


def test_a_favicon_404_is_not_a_product_error(analytics_db):
    """V91 REGRESSION. Every `api_error` row used to count equally, so browsers
    asking for a favicon and crawlers asking for robots.txt produced a headline
    error count on days when nothing had gone wrong."""
    analytics.record("api_error", path="/favicon.ico", ok=False, status=404,
                     detail="HTTP 404")
    analytics.record("api_error", path="/robots.txt", ok=False, status=404,
                     detail="HTTP 404")
    analytics.record("api_error", path="/api/session", ok=False, status=500,
                     detail="HTTP 500")
    _settled()
    overview = queries.dashboard("7d")["overview"]
    assert overview["server_errors"] == 1
    assert overview["noise_errors"] == 2
    assert overview["errors"] == 1, "the headline counts only what a reader felt"


def test_an_upstream_endpoint_is_judged_against_its_own_budget(analytics_db):
    """A nine-second cold FastF1 fetch and a nine-second /api/meta are not the
    same event, and ranking them on one scale made the archive look like the
    worst thing happening on the site."""
    # Two of each: one sample is an anecdote, and the query says so with a
    # HAVING clause rather than ranking endpoints on a single measurement.
    for _ in range(2):
        analytics.record("api_request", path="/api/session", ok=True, ms=5000)
        analytics.record("api_request", path="/api/meta", ok=True, ms=1500)
    _settled()
    endpoints = {e["path"]: e for e in queries.dashboard("7d")["performance"]["endpoints"]}
    assert endpoints["/api/session"]["upstream"] is True
    assert endpoints["/api/session"]["budget_ms"] > endpoints["/api/meta"]["budget_ms"]
    assert endpoints["/api/session"]["tone"] == "good", "5s is inside an upstream budget"
    assert endpoints["/api/meta"]["tone"] in ("warn", "bad"), "1.5s on a local route is not"


def test_ask_section_counts_outcomes_topics_and_feedback(analytics_db):
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED, topic="results")
    analytics.record_ask(question="Tyre strategy?", outcome=classify.PARTIAL,
                         topic="tyres", missing=["stint data"])
    bad = analytics.record_ask(question="Best race pace?", outcome=classify.UNSUPPORTED,
                               topic="pace")
    _settled()
    analytics.feedback(bad, False)
    _settled()

    ask = queries.dashboard("7d")["ask"]
    assert ask["total"] == 3
    assert ask["f1_questions"] == 3
    assert ask["outcomes"][classify.ANSWERED] == 1
    assert ask["outcomes"][classify.PARTIAL] == 1
    assert ask["outcomes"][classify.UNSUPPORTED] == 1
    assert ask["unhelpful"] == 1
    assert ask["unresolved"] == 2, "partial and unsupported; answered is not unresolved"
    topics = {t["topic"]: t for t in ask["topics"]}
    assert topics["tyres"]["unresolved"] == 1
    assert topics["results"]["unresolved"] == 0
    assert topics["pace"]["unhelpful"] == 1
    assert topics["results"]["label"] == "Results"


def test_off_topic_questions_do_not_count_against_ask(analytics_db):
    """A cake recipe is not a capability gap. Counting it as one would make the
    'what to build next' list wrong in exactly the place it must be right."""
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED, topic="results")
    analytics.record_ask(question="write me a poem", outcome=classify.OFF_TOPIC,
                         topic=classify.OTHER)
    _settled()
    ask = queries.dashboard("7d")["ask"]
    assert ask["total"] == 2
    assert ask["f1_questions"] == 1
    assert ask["answered_pct"] == 100.0, "scored against F1 questions, not all traffic"
    assert all(t["topic"] != classify.OTHER for t in ask["topics"]), \
        "off-topic rows are excluded from the topic scoreboard"


def test_capability_gaps_group_and_rank_the_feature_requests(analytics_db):
    """The single most valuable list on the page: real F1 questions, understood
    as F1, that no handler covers — grouped, and ranked by how many people."""
    for visitor in ("v1", "v2", "v3"):
        analytics.record_ask(question="How many pit stops did Piastri have?",
                             outcome=classify.UNSUPPORTED, topic="pit_stops",
                             visitor=visitor,
                             question_norm=classify.normalize_question(
                                 "How many pit stops did Piastri have?"))
    analytics.record_ask(question="Were any laps deleted?", outcome=classify.UNSUPPORTED,
                         topic="track_limits", visitor="v1",
                         question_norm=classify.normalize_question("Were any laps deleted?"))
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED, topic="results",
                         visitor="v1", question_norm="who won")
    _settled()
    gaps = queries.dashboard("7d")["ask"]["gaps"]
    assert gaps, "the backlog is empty when it should not be"
    assert gaps[0]["n"] == 3 and gaps[0]["people"] == 3
    assert "pit stops" in gaps[0]["question"].lower()
    assert gaps[0]["topic_label"] == "Pit stops"
    assert all("Who won?" != g["question"] for g in gaps), \
        "an answered question is not a capability gap"


def test_a_disliked_complete_answer_is_reported_apart_from_a_missing_one(analytics_db):
    """A confident WRONG answer and a missing answer need different fixes, and
    the pipeline can only detect one of them."""
    ref = analytics.record_ask(question="Who had the best strategy?",
                               outcome=classify.ANSWERED, topic="strategy")
    _settled()
    analytics.feedback(ref, False)
    _settled()
    ask = queries.dashboard("7d")["ask"]
    assert ask["disliked_answers"] == 1
    assert ask["disliked"][0]["question"] == "Who had the best strategy?"
    assert ask["disliked"][0]["outcome_label"] == classify.OUTCOME_LABEL[classify.ANSWERED]


def test_repeat_questions_are_grouped_by_a_normalized_key(analytics_db):
    for text in ("Who won?", "who won", "WHO WON!!"):
        analytics.record_ask(question=text, outcome=classify.ANSWERED, topic="results",
                             question_norm=classify.normalize_question(text))
    _settled()
    repeats = queries.dashboard("7d")["ask"]["repeats"]
    assert repeats and repeats[0]["n"] == 3


def test_a_recurring_unknown_subject_surfaces_as_an_emerging_topic(analytics_db):
    """How the taxonomy grows from real traffic instead of from guesses."""
    for _ in range(3):
        q = "How was the brake temperature on the McLarens?"
        topic, hint = classify.classify_topic_full(q, "overview", False)
        analytics.record_ask(question=q, outcome=classify.UNSUPPORTED, topic=topic,
                             topic_hint=hint,
                             question_norm=classify.normalize_question(q))
    _settled()
    ask = queries.dashboard("7d")["ask"]
    labels = [t["label"].lower() for t in ask["topics"]] + \
             [e["label"].lower() for e in ask["emerging"]]
    assert any("brake" in label for label in labels), labels


def test_ask_log_filters_by_outcome_and_topic(analytics_db):
    analytics.record_ask(question="a", outcome=classify.ANSWERED, topic="results")
    analytics.record_ask(question="b", outcome=classify.UNSUPPORTED, topic="pace")
    _settled()
    rows = queries.ask_log("7d", outcome=classify.UNSUPPORTED)["rows"]
    assert [r["question"] for r in rows] == ["b"]
    rows = queries.ask_log("7d", topic="results")["rows"]
    assert [r["question"] for r in rows] == ["a"]


def test_dashboard_endpoint_answers_the_shape_the_page_expects(analytics_db):
    analytics.record("page_view", visitor="v", visit="s", path="/explorer")
    _settled()
    body = client.get("/api/admin/analytics", headers=_auth(), params={"range": "7d"}).json()
    assert body["available"] is True
    for key in ("range", "overview", "verdicts", "priorities", "traffic", "usage",
                "performance", "ask", "recent", "health", "previous"):
        assert key in body, key
    for key in ("races", "seasons", "sessions", "features", "dwell", "pages",
                "modes", "exits", "eras", "funnel", "depth", "repeat_visitors"):
        assert key in body["usage"], key
    for key in ("topics", "gaps", "disliked", "emerging", "repeats", "recent",
                "outcome_labels", "outcome_help", "outcome_actions"):
        assert key in body["ask"], key
    assert set(body["verdicts"]) == {"product", "ask", "backend"}
    for verdict in body["verdicts"].values():
        assert verdict["state"] in ("good", "warn", "bad", "unknown")
        assert verdict["note"], "a verdict without its reason is an opinion"


def test_verdicts_read_the_numbers_they_summarize(analytics_db):
    analytics.record("api_error", path="/api/session", ok=False, status=500,
                     detail="HTTP 500")
    for _ in range(3):
        analytics.record("api_request", path="/api/session", ok=True, ms=50)
    _settled()
    verdicts = queries.dashboard("7d")["verdicts"]
    assert verdicts["backend"]["state"] in ("warn", "bad")
    assert "server error" in verdicts["backend"]["note"]


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


# =========================================================================== #
# 5. Migration — an existing production database must survive the upgrade.
# =========================================================================== #
def test_new_columns_are_added_to_an_existing_table(tmp_path, monkeypatch):
    """CREATE TABLE IF NOT EXISTS does NOTHING to a table that already exists.
    Without an explicit ALTER, every V91 column would be missing in production
    and present in every test — the worst possible split."""
    import sqlite3
    db = tmp_path / "legacy.db"
    conn = sqlite3.connect(db)
    conn.executescript("""
        CREATE TABLE analytics_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, name TEXT, visitor TEXT,
          visit TEXT, path TEXT, feature TEXT, mode TEXT, year INTEGER, gp TEXT,
          session_type TEXT, ok INTEGER, ms INTEGER, detail TEXT, meta TEXT);
        CREATE TABLE analytics_ask (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ref TEXT, visitor TEXT,
          question TEXT, answer TEXT, outcome TEXT, topic TEXT, kind TEXT,
          confidence TEXT, missing TEXT, year INTEGER, gp TEXT, session_type TEXT,
          ms INTEGER, helpful INTEGER);
        CREATE TABLE analytics_daily (day TEXT, name TEXT, n INTEGER);
        INSERT INTO analytics_ask (ts, question, outcome, topic)
          VALUES ('2026-01-01T00:00:00+00:00', 'old row', 'unanswered', 'pace');
    """)
    conn.commit()
    conn.close()

    monkeypatch.setattr(get_settings(), "admin_token", ADMIN_TOKEN)
    assert analytics.setup(f"sqlite://{db}") is True
    try:
        columns = {r[1] for r in store.query("PRAGMA table_info(analytics_ask)")}
        assert {"visit", "topic_hint", "question_norm"} <= columns
        event_columns = {r[1] for r in store.query("PRAGMA table_info(analytics_event)")}
        assert "status" in event_columns
        # and the legacy outcome spelling was rewritten in place
        assert store.query("SELECT outcome FROM analytics_ask")[0][0] == classify.UNSUPPORTED
    finally:
        analytics.shutdown()


def test_the_migration_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_token", ADMIN_TOKEN)
    db = tmp_path / "twice.db"
    for _ in range(3):
        assert analytics.setup(f"sqlite://{db}") is True
        analytics.record("page_view", visitor="v")
        _settled()
        analytics.shutdown()
    assert analytics.setup(f"sqlite://{db}") is True
    try:
        assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 3
    finally:
        analytics.shutdown()


# =========================================================================== #
# 6. Destructive operations delete exactly what they promised.
# =========================================================================== #
def test_inventory_reports_what_would_be_lost_before_anything_is(analytics_db):
    analytics.record("page_view", visitor="v")
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED, topic="results")
    _settled()
    body = client.get("/api/admin/analytics/inventory", headers=_auth()).json()
    assert body["confirm_phrase"] == "DELETE ANALYTICS"
    counts = {t["table"]: t["rows"] for t in body["analytics"]["tables"]}
    assert counts["analytics_event"] == 1
    assert counts["analytics_ask"] == 1
    assert all(t["purpose"] for t in body["analytics"]["tables"]), \
        "every table says what it is before you are asked to delete it"


def test_a_reset_without_the_exact_phrase_deletes_nothing(analytics_db):
    analytics.record("page_view", visitor="v")
    _settled()
    for confirm in ("", "delete analytics", "DELETE  ANALYTICS", "yes", "CLEAR CACHE"):
        r = client.post("/api/admin/analytics/reset", headers=_auth(),
                        json={"confirm": confirm, "scope": "all"})
        assert r.status_code == 400, confirm
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 1


def test_a_confirmed_reset_clears_the_scope_and_only_that_scope(analytics_db):
    analytics.record("page_view", visitor="v")
    analytics.record_ask(question="Who won?", outcome=classify.ANSWERED, topic="results")
    _settled()

    r = client.post("/api/admin/analytics/reset", headers=_auth(),
                    json={"confirm": "DELETE ANALYTICS", "scope": "ask"})
    assert r.status_code == 200
    assert store.query("SELECT COUNT(*) FROM analytics_ask")[0][0] == 0
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 1, \
        "'ask' scope must not touch events"

    r = client.post("/api/admin/analytics/reset", headers=_auth(),
                    json={"confirm": "DELETE ANALYTICS", "scope": "all"})
    assert r.status_code == 200
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 0


def test_a_reset_can_keep_recent_history_and_drop_a_testing_session(analytics_db):
    """The actual use: spam-test Ask, then start a clean measurement period
    WITHOUT losing the real week in front of it."""
    now = datetime.now(timezone.utc)
    analytics.record("page_view", visitor="old", at=now - timedelta(days=10))
    analytics.record("page_view", visitor="new", at=now - timedelta(days=1))
    _settled()
    cutoff = (now - timedelta(days=5)).date().isoformat()
    r = client.post("/api/admin/analytics/reset", headers=_auth(),
                    json={"confirm": "DELETE ANALYTICS", "scope": "all", "before": cutoff})
    assert r.status_code == 200
    remaining = [row[0] for row in store.query("SELECT visitor FROM analytics_event")]
    assert remaining == ["new"]


def test_a_reset_still_records_the_next_event(analytics_db):
    """DELETE, not DROP — there must be no window in which analytics is broken
    because a table went missing."""
    analytics.record("page_view", visitor="v")
    _settled()
    client.post("/api/admin/analytics/reset", headers=_auth(),
                json={"confirm": "DELETE ANALYTICS", "scope": "all"})
    analytics.record("page_view", visitor="after")
    _settled()
    assert store.query("SELECT visitor FROM analytics_event")[0][0] == "after"


def test_the_purge_can_only_ever_name_an_analytics_table(analytics_db):
    r = client.post("/api/admin/analytics/reset", headers=_auth(),
                    json={"confirm": "DELETE ANALYTICS", "scope": "users; DROP TABLE"})
    assert r.status_code == 400
    with pytest.raises(ValueError):
        store.purge("anything_else")


def test_clearing_the_cache_is_a_separate_operation_with_its_own_phrase(analytics_db):
    """Two operations that sound alike and are nothing alike. Muscle memory from
    one must not fire the other."""
    analytics.record("page_view", visitor="v")
    _settled()
    r = client.post("/api/admin/cache/clear", headers=_auth(),
                    json={"confirm": "DELETE ANALYTICS"})
    assert r.status_code == 400, "the analytics phrase must not clear the cache"
    r = client.post("/api/admin/cache/clear", headers=_auth(),
                    json={"confirm": "CLEAR CACHE"})
    assert r.status_code == 200
    assert r.json()["analytics_affected"] is False
    assert store.query("SELECT COUNT(*) FROM analytics_event")[0][0] == 1, \
        "clearing the cache must not lose a single measurement"


# =========================================================================== #
# 7. The report — the analysis, as something you can keep.
# =========================================================================== #
def test_the_report_renders_in_every_format(analytics_db):
    analytics.record("page_view", visitor="v", visit="s", path="/explorer")
    analytics.record_ask(question="How many pit stops did Piastri have?",
                         outcome=classify.UNSUPPORTED, topic="pit_stops", visitor="v",
                         question_norm="how many pit stops did piastri have")
    _settled()

    html_body = client.get("/api/admin/analytics/report", headers=_auth(),
                           params={"range": "7d", "format": "html"})
    assert html_body.status_code == 200
    assert "text/html" in html_body.headers["content-type"]
    text = html_body.text
    assert text.lstrip().lower().startswith("<!doctype html")
    assert "@media print" in text, "a report you cannot print is not a report"
    assert "<script" not in text.lower(), "self-contained means no scripts either"
    assert "http://" not in text and "https://" not in text, \
        "no external reference — it must still open years from now"

    md = client.get("/api/admin/analytics/report", headers=_auth(),
                    params={"range": "7d", "format": "md"})
    assert md.status_code == 200 and md.text.startswith("#")

    data = client.get("/api/admin/analytics/report", headers=_auth(),
                      params={"range": "7d", "format": "json"}).json()
    assert data["available"] is True
    assert data["generated_at"]
    assert isinstance(data["priorities"], list)


def test_the_report_escapes_what_a_reader_typed(analytics_db):
    """Questions are reader input and they land in an HTML document."""
    analytics.record_ask(question="<script>alert('xss')</script> who won?",
                         outcome=classify.UNSUPPORTED, topic="results", visitor="v",
                         question_norm="script alert xss script who won")
    _settled()
    text = client.get("/api/admin/analytics/report", headers=_auth(),
                      params={"range": "7d", "format": "html"}).text
    assert "<script>alert" not in text
    assert "&lt;script&gt;" in text


def test_priorities_rank_broken_things_above_missing_ones(analytics_db):
    analytics.record("api_error", path="/api/session", ok=False, status=500,
                     detail="HTTP 500")
    for visitor in ("v1", "v2"):
        analytics.record_ask(question="How many pit stops did Piastri have?",
                             outcome=classify.UNSUPPORTED, topic="pit_stops",
                             visitor=visitor,
                             question_norm="how many pit stops did piastri have")
    _settled()
    items = queries.dashboard("7d")["priorities"]
    assert items, "nothing was prioritised on a window that has both kinds of problem"
    assert items[0]["kind"] == "reliability"
    assert items[0]["severity"] == "high"
    assert any(p["kind"] == "ask capability" for p in items)
    for item in items:
        assert item["title"] and item["why"], "a priority without a reason is a guess"


def test_priorities_say_something_useful_when_nothing_is_wrong(analytics_db):
    analytics.record("page_view", visitor="v", path="/")
    _settled()
    items = queries.dashboard("7d")["priorities"]
    assert items and items[0]["kind"] == "growth"


def test_the_report_and_the_dashboard_agree(analytics_db):
    """Two rankings of the same numbers would be two sources of truth."""
    analytics.record("api_error", path="/api/session", ok=False, status=500,
                     detail="HTTP 500")
    _settled()
    built = report.build("7d")
    assert built["priorities"] == queries.dashboard("7d")["priorities"]


# --------------------------------------------------------------------------- #
# V92: the feedback box.
#
# Ordered the same way as everything above it — the guarantees that matter most
# come first. A reader pressing Send must always be told it worked; only after
# that does it matter that the row is classified well.
# --------------------------------------------------------------------------- #
def _report(message: str, kind: str = "bug", **extra) -> dict:
    body = {"kind": kind, "message": message, **extra}
    res = client.post("/api/feedback", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_feedback_is_acknowledged_even_with_no_analytics_configured(monkeypatch):
    """The store being off is not the reader's problem and must not look like
    a failure to them."""
    analytics.shutdown()
    monkeypatch.setattr(store, "_ENABLED", False)
    body = _report("The position chart is blank on every race")
    assert body["received"] is True
    assert body["stored"] is False


def test_feedback_is_acknowledged_when_the_store_raises(analytics_db, monkeypatch):
    monkeypatch.setattr(store, "_submit",
                        lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("down")))
    assert _report("Session never loads on Monaco")["received"] is True


def test_an_empty_report_is_refused(analytics_db):
    for message in ("", "   ", "\n\t "):
        assert client.post("/api/feedback",
                           json={"kind": "bug", "message": message}).status_code == 400


def test_a_report_stores_its_context_without_being_asked(analytics_db):
    """The whole point of collecting context: nobody should have to say where
    they were, and the row must be findable by race afterwards."""
    _report("The position chart is completely blank and nothing renders",
            path="/explorer", feature="charts", year=2026, gp="Miami Grand Prix",
            session="Race", mode="advanced", visitor="v1", visit="s1")
    _settled()
    rows = queries.feedback_log("30d")["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert row["kind"] == "bug"
    assert row["area"] == "charts"
    assert row["path"] == "/explorer" and row["page"] == "Explore"
    assert (row["year"], row["gp"], row["session_type"]) == (2026, "Miami Grand Prix", "Race")
    assert row["context"] == "2026 Miami Grand Prix · Race"


def test_a_report_with_no_session_open_still_records(analytics_db):
    _report("Would be nice to have a driver of the day vote", kind="suggestion",
            path="/")
    _settled()
    row = queries.feedback_log("30d")["rows"][0]
    assert row["kind"] == "suggestion"
    assert row["context"] is None, "an absent session must not invent one"


def test_bugs_and_suggestions_are_counted_apart(analytics_db):
    _report("The tyre strategy chart will not render at all", kind="bug")
    _report("Please add a lap time distribution view", kind="suggestion")
    _report("Add support for the 1960s seasons", kind="suggestion")
    _settled()
    fb = queries.dashboard("30d")["feedback"]
    assert fb["bugs"] == 1
    assert fb["suggestions"] == 2
    assert fb["total"] == 3


def test_an_unknown_kind_is_read_as_a_bug_rather_than_lost(analytics_db):
    _report("Something is broken on the standings page", kind="complaint")
    _settled()
    assert queries.feedback_log("30d")["rows"][0]["kind"] == "bug"


def test_junk_is_separated_rather_than_filed_under_a_real_area(analytics_db):
    """The requirement, asserted: nonsense must not inflate a product area."""
    _report("The position chart is blank on the Miami race")
    for nonsense in ("asdfasdfasdf", "test", "aaaaaaaaaaaaaaaaa", "....."):
        _report(nonsense)
    _settled()
    fb = queries.dashboard("30d")["feedback"]
    assert fb["junk"] == 4
    assert fb["real"] == 1
    areas = {a["area"]: a["n"] for a in fb["areas"]}
    assert areas == {"charts": 1}, f"junk leaked into a product area: {areas}"

    # …and it is excluded from the log by default, but still auditable.
    assert len(queries.feedback_log("30d")["rows"]) == 1
    assert len(queries.feedback_log("30d", include_junk=True)["rows"]) == 5


def test_severity_is_only_set_for_bugs(analytics_db):
    _report("The page is completely broken and nothing loads", kind="bug")
    _report("It would be nice if the charts were bigger", kind="suggestion")
    _settled()
    by_kind = {r["kind"]: r for r in queries.feedback_log("30d")["rows"]}
    assert by_kind["bug"]["severity"] == "high"
    assert by_kind["suggestion"]["severity"] is None


def test_the_feedback_log_filters_by_kind_area_and_severity(analytics_db):
    _report("The position chart is completely blank", kind="bug")
    _report("Session never loads, it is stuck on the spinner", kind="bug")
    _report("Please add a tyre degradation chart", kind="suggestion")
    _settled()
    assert len(queries.feedback_log("30d", kind="bug")["rows"]) == 2
    assert len(queries.feedback_log("30d", kind="suggestion")["rows"]) == 1
    # Two of the three are about charts — the blank one and the request for a
    # new one. An area is the SUBJECT, so a bug and a suggestion about the same
    # surface belong to the same area and are told apart by `kind`.
    assert len(queries.feedback_log("30d", area="charts")["rows"]) == 2
    assert len(queries.feedback_log("30d", area="loading")["rows"]) == 1
    assert len(queries.feedback_log("30d", severity="high")["rows"]) == 1
    # an unrecognised filter is dropped, never interpolated
    assert len(queries.feedback_log("30d", kind="nonsense")["rows"]) == 3


def test_feedback_survives_the_admin_endpoint(analytics_db):
    _report("The compare tab shows nothing for two drivers", path="/explorer")
    _settled()
    res = client.get("/api/admin/feedback?range=30d", headers=_auth())
    assert res.status_code == 200
    rows = res.json()["rows"]
    assert len(rows) == 1 and rows[0]["area_label"] == "Compare"


@pytest.mark.parametrize("route", ["/api/admin/feedback"])
def test_the_feedback_log_needs_the_token(analytics_db, route):
    assert client.get(route).status_code == 401


def test_bugs_and_suggestions_can_be_cleared_separately(analytics_db):
    """The reusability requirement: the same guarded purge, new scopes."""
    _report("The charts do not render on Monza", kind="bug")
    _report("Please add sprint race support", kind="suggestion")
    analytics.record("page_view", visitor="v", path="/")
    _settled()

    out = client.post("/api/admin/analytics/reset", headers=_auth(),
                      json={"confirm": "DELETE ANALYTICS", "scope": "bugs"})
    assert out.status_code == 200, out.text
    rows = queries.feedback_log("30d", include_junk=True)["rows"]
    assert [r["kind"] for r in rows] == ["suggestion"], "the wrong kind was deleted"
    # and the unrelated event survived
    assert queries.dashboard("30d")["overview"]["page_views"] == 1

    client.post("/api/admin/analytics/reset", headers=_auth(),
                json={"confirm": "DELETE ANALYTICS", "scope": "suggestions"})
    assert queries.feedback_log("30d", include_junk=True)["rows"] == []
    assert queries.dashboard("30d")["overview"]["page_views"] == 1


def test_clearing_all_feedback_leaves_ask_and_events_alone(analytics_db):
    _report("Charts are blank", kind="bug")
    analytics.record_ask(question="Why did Norris lose second?", outcome=classify.ANSWERED,
                         topic="positions")
    analytics.record("page_view", visitor="v", path="/")
    _settled()
    client.post("/api/admin/analytics/reset", headers=_auth(),
                json={"confirm": "DELETE ANALYTICS", "scope": "feedback"})
    _settled()
    data = queries.dashboard("30d")
    assert data["feedback"]["total"] == 0
    assert data["ask"]["total"] == 1, "clearing feedback deleted Ask rows"
    assert data["overview"]["page_views"] == 1, "clearing feedback deleted events"


def test_the_purge_refuses_a_scope_it_does_not_know(analytics_db):
    res = client.post("/api/admin/analytics/reset", headers=_auth(),
                      json={"confirm": "DELETE ANALYTICS", "scope": "everything_else"})
    assert res.status_code == 400


def test_an_emerging_subject_becomes_its_own_area(analytics_db):
    """The taxonomy is supposed to grow from real reports, not from guesses."""
    for _ in range(3):
        _report("brake temperature readings would help me a lot", kind="suggestion")
    _settled()
    fb = queries.dashboard("30d")["feedback"]
    assert any(e["phrase"] == "brake temperature" for e in fb["emerging"])
    assert any(a["label"] == "Brake Temperature" for a in fb["areas"])


def test_the_report_carries_the_feedback_in_every_format(analytics_db):
    _report("The position chart is completely blank on Miami", kind="bug",
            year=2026, gp="Miami Grand Prix", session="Race", path="/explorer")
    _report("Please add a tyre degradation view", kind="suggestion")
    _report("asdfasdf", kind="bug")
    analytics.record_ask(question="Why did Norris lose second place?",
                         outcome=classify.ANSWERED, topic="positions",
                         year=2026, gp="Miami Grand Prix", session_type="Race")
    _settled()

    built = report.build("30d")
    assert built["feedback"]["bugs"] == 2 and built["feedback"]["suggestions"] == 1

    html_doc = report.to_html(built)
    md_doc = report.to_markdown(built)
    for doc in (html_doc, md_doc):
        assert "position chart is completely blank" in doc
        assert "tyre degradation view" in doc
        # the Ask GP/session context reaches the report too
        assert "2026 Miami Grand Prix · Race" in doc
        # junk is kept out of a planning document
        assert "asdfasdf" not in doc


def test_ask_rows_carry_the_grand_prix_and_session(analytics_db):
    analytics.record_ask(question="Why did Lando lose second place?",
                         outcome=classify.ANSWERED, topic="positions",
                         year=2026, gp="Miami Grand Prix", session_type="Race")
    analytics.record_ask(question="Who was fastest?", outcome=classify.ANSWERED,
                         topic="pace")
    _settled()
    rows = {r["question"]: r for r in queries.ask_log("30d")["rows"]}
    assert rows["Why did Lando lose second place?"]["context"] == \
        "2026 Miami Grand Prix · Race"
    assert rows["Who was fastest?"]["context"] is None
