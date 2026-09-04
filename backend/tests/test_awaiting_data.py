"""
"Finished" and "readable" are different sentences, and so are the reasons.

THE EXPERIENCE THESE TESTS EXIST FOR. During the Italian Grand Prix a reader
watched Practice 2 finish, and for twenty minutes Pitwall IQ said it was still
running. Then the settle window elapsed, the data still had not arrived, and
the same session went straight to a bare failure screen. Two wrong answers in
a row about a session that was simply *over and not published yet* — a state
the product had no name for, so it borrowed the names of the two either side.

The lifecycle now comes from the schedule alone (test_live_session.py). What is
pinned here is the other half: what the API does when a session that has
demonstrably finished cannot be loaded, and how it tells the four situations
apart rather than collapsing them into one "unavailable".
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import schedule as app_schedule
from app.adapters import data_source_manager as dsm
from app.adapters.data_source_manager import DataUnavailableError
from app.main import app
from app.models import DataSource, GrandPrix


UTC = timezone.utc
client = TestClient(app)

#: A Friday afternoon at Monza. Practice 1 is long finished, Practice 2 ended
#: eight minutes ago — inside the settle window — and Practice 3 is tomorrow.
NOW = datetime(2026, 9, 4, 16, 8, tzinfo=UTC)


def monza() -> GrandPrix:
    return GrandPrix(
        round=15, name="Italian Grand Prix", location="Monza", country="Italy",
        date="2026-09-04T09:30:00+00:00",
        sessions=["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"],
        session_times={
            "Practice 1": "2026-09-04T11:30:00Z",   # 11:30-12:30, settled 12:50
            "Practice 2": "2026-09-04T15:00:00Z",   # 15:00-16:00, settles 16:20
            "Practice 3": "2026-09-05T10:30:00Z",
            "Qualifying": "2026-09-05T14:00:00Z",
            "Race": "2026-09-06T13:00:00Z",
        })


@pytest.fixture()
def weekend(monkeypatch):
    """The calendar above, on a frozen clock, with live fetching on so the
    guard is exercised rather than skipped."""
    cal = [monza()]
    monkeypatch.setattr(app_schedule, "now_utc", lambda: NOW)
    monkeypatch.setattr(dsm, "get_grands_prix", lambda year: (cal, DataSource.LIVE))
    monkeypatch.setattr(dsm, "get_grands_prix_detailed",
                        lambda year: (cal, DataSource.LIVE,
                                      {"mode": "live", "sources": {}, "retained": 0,
                                       "rounds": 1}))
    return cal


def fails_with(monkeypatch, attempts):
    """Make every session load fail the way the sources just did, and record
    whether the load was attempted at all."""
    calls: list[tuple] = []

    def load(year, gp, session_type, force_mock=False, refresh=False):
        calls.append((year, gp, session_type))
        raise DataUnavailableError(year, gp, session_type, attempts=attempts)

    monkeypatch.setattr(dsm, "load_session", load)
    return calls


#: What each situation looks like coming back from the source chain.
NOTHING_YET = [{"source": s, "category": "not_available"}
               for s in ("openf1", "f1-archive", "jolpica")]
UNREACHABLE = [{"source": s, "category": "unreachable", "retryable": True}
               for s in ("openf1", "f1-archive", "jolpica")]


def ask(session: str):
    return client.get("/api/session", params={
        "year": 2026, "gp": "Italian Grand Prix", "session": session})


# --------------------------------------------------------------------------- #
# 1. The guard refuses the impossible, and only the impossible
# --------------------------------------------------------------------------- #
def test_a_session_that_has_finished_is_actually_asked_for(weekend, monkeypatch):
    """THE CHANGE THAT MAKES "TRY AGAIN" MEAN SOMETHING. The guard used to
    refuse anything not yet settled, which swept up the twenty minutes after
    the flag — the window in which the data often HAS landed and in which the
    reader is at their most interested. It also made the retry button one that
    could not possibly work."""
    calls = fails_with(monkeypatch, NOTHING_YET)
    ask("Practice 2")
    assert calls == [(2026, "Italian Grand Prix", "Practice 2")], \
        "a finished session must reach the sources"


def test_a_running_session_is_still_refused_without_asking(weekend, monkeypatch):
    """A session whose cars are on track has no completed record by
    definition. Asking three providers to confirm that is three timeouts the
    reader waits on for nothing."""
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2026, 9, 4, 15, 30, tzinfo=UTC))
    calls = fails_with(monkeypatch, NOTHING_YET)
    r = ask("Practice 2")
    assert r.status_code == 503 and r.json()["reason"] == "live_session"
    assert calls == [], "nothing should have been fetched"


def test_a_session_still_to_come_is_still_refused_without_asking(weekend, monkeypatch):
    calls = fails_with(monkeypatch, NOTHING_YET)
    r = ask("Qualifying")
    assert r.status_code == 503 and r.json()["reason"] == "future_session"
    assert calls == []


# --------------------------------------------------------------------------- #
# 2. The four outcomes, kept apart
# --------------------------------------------------------------------------- #
def test_finished_but_not_published_yet_says_so(weekend, monkeypatch):
    """The Italian Practice 2 case. The sources answered — with nothing — and
    the session finished minutes ago, so the true sentence is that the record
    has not landed, not that anything is broken."""
    fails_with(monkeypatch, NOTHING_YET)
    body = ask("Practice 2").json()
    assert body["reason"] == "awaiting_data"
    assert body["retryable"] is True, "it resolves by itself; the retry is real"
    assert "has finished" in body["message"]


def test_the_waiting_message_promises_nothing(weekend, monkeypatch):
    """NO INVENTED DELAY. We do not know when the archive will publish, and
    saying a number would be the first fabricated thing on the page."""
    fails_with(monkeypatch, NOTHING_YET)
    message = ask("Practice 2").json()["message"].lower()
    for promise in ("minute", "shortly", "soon", "within", "should be ready"):
        assert promise not in message, message


def test_a_provider_outage_keeps_its_own_answer(weekend, monkeypatch):
    """PROVIDERS THAT ERRORED ARE NOT PROVIDERS THAT ANSWERED WITH NOTHING.
    Calling a real outage "not published yet" would be a guess, and a
    reassuring one — exactly the kind this product does not make."""
    fails_with(monkeypatch, UNREACHABLE)
    body = ask("Practice 2").json()
    assert body["reason"] in ("source_error", "timeout")
    assert body["reason"] != "awaiting_data"


def test_a_long_settled_session_with_no_data_is_not_called_awaiting(weekend, monkeypatch):
    """Practice 1 settled hours ago. If the sources still have nothing, the
    honest answer is that there is no data — not that we are waiting for it."""
    fails_with(monkeypatch, NOTHING_YET)
    body = ask("Practice 1").json()
    assert body["reason"] == "no_source_coverage"


# --------------------------------------------------------------------------- #
# 3. The transition: awaiting today, readable tomorrow
# --------------------------------------------------------------------------- #
def test_the_same_session_stops_awaiting_once_the_window_passes(weekend, monkeypatch):
    """LIVE -> COMPLETED+AWAITING -> AVAILABLE, walked in one test, because a
    state machine is only correct if its transitions are."""
    gp = monza()
    walk = [
        (datetime(2026, 9, 4, 15, 30, tzinfo=UTC), "live", "awaiting"),
        (datetime(2026, 9, 4, 16, 8, tzinfo=UTC), "completed", "awaiting"),
        (datetime(2026, 9, 4, 16, 25, tzinfo=UTC), "completed", "available"),
    ]
    for when, lifecycle, analysis in walk:
        assert app_schedule.session_state(gp, "Practice 2", when) == lifecycle, when
        assert app_schedule.session_analysis(gp, "Practice 2", when) == analysis, when

    # And once it is available the guard has no opinion at all: the session is
    # fetched, and whatever the sources say is the answer.
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2026, 9, 4, 16, 25, tzinfo=UTC))
    calls = fails_with(monkeypatch, NOTHING_YET)
    ask("Practice 2")
    assert calls, "a settled session is fetched like any other"


# --------------------------------------------------------------------------- #
# 4. What the Schedule page reads
# --------------------------------------------------------------------------- #
def test_the_schedule_reports_a_finished_session_as_finished(weekend):
    """THE HEADLINE REGRESSION. Eight minutes after the flag, the schedule must
    not still be calling Practice 2 live."""
    body = client.get("/api/schedule", params={"year": 2026}).json()
    sessions = {s["name"]: s for s in body["events"][0]["sessions"]}

    assert sessions["Practice 2"]["state"] == "completed"
    assert sessions["Practice 2"]["analysis"] == "awaiting"
    assert sessions["Practice 2"]["available"] is False
    assert body["events"][0]["live_session"] is None
    assert body["live"] is None, "nothing is on track eight minutes after the flag"


def test_the_schedule_still_reports_a_running_session_as_live(monkeypatch, weekend):
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2026, 9, 4, 15, 30, tzinfo=UTC))
    body = client.get("/api/schedule", params={"year": 2026}).json()
    sessions = {s["name"]: s for s in body["events"][0]["sessions"]}
    assert sessions["Practice 2"]["state"] == "live"
    assert body["live"]["session"] == "Practice 2"


def test_the_next_session_moves_on_when_one_finishes(weekend):
    """FP3 becomes what is next the moment FP2 ends — not twenty minutes
    later, and not only once FP2's data arrives."""
    body = client.get("/api/schedule", params={"year": 2026}).json()
    assert body["events"][0]["next_session"]["name"] == "Practice 3"


def test_sessions_available_separates_run_from_readable(weekend):
    body = client.get("/api/sessions/available",
                      params={"year": 2026, "gp": "Italian Grand Prix"}).json()
    assert "Practice 2" in body["completed_sessions"], "it has been run"
    assert "Practice 2" not in body["sessions"], "and it is not readable yet"
    assert body["analysis"]["Practice 2"] == "awaiting"
    assert body["states"]["Practice 2"] == "completed"
    assert body["live"] == []
