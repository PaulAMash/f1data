"""
A session that is running is not a session that has not happened.

THE GAP THESE TESTS EXIST FOR. The lifecycle had one boolean — available —
and a boolean has nowhere to put the ninety minutes when the cars are actually
on track. Between the lights going out and the timing being published, the
product answered "this session has not been run", which a reader with the
television on knew to be false. A product caught being wrong about the thing
it is named after does not get the benefit of the doubt on its numbers either.

So there are three states, and every boundary between them is pinned here
against a frozen clock — including the two that only exist for minutes, which
are exactly the ones a wall-clock test would never see.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app import schedule
from app.models import GrandPrix


UTC = timezone.utc


def monza() -> GrandPrix:
    """The 2026 Italian Grand Prix, Sep 4-6 — the weekend the original bug
    was reported on, reused so both files describe the same world."""
    return GrandPrix(
        round=16, name="Italian Grand Prix", location="Monza", country="Italy",
        date="2026-09-04T09:30:00+00:00",
        sessions=["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"],
        session_times={
            "Practice 1": "2026-09-04T11:30:00Z",
            "Practice 2": "2026-09-04T15:00:00Z",
            "Practice 3": "2026-09-05T10:30:00Z",
            "Qualifying": "2026-09-05T14:00:00Z",
            "Race": "2026-09-06T13:00:00Z",
        })


def at(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


# --------------------------------------------------------------------------- #
# 1. The three states, at every boundary
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("when, expected", [
    ("2026-09-04T11:29:59", schedule.UPCOMING),   # a second before the green
    ("2026-09-04T11:30:00", schedule.LIVE),       # the instant it starts
    ("2026-09-04T12:00:00", schedule.LIVE),       # half an hour in
    ("2026-09-04T12:29:59", schedule.LIVE),       # a second before the flag
    ("2026-09-04T12:30:00", schedule.LIVE),       # the flag — still settling
    ("2026-09-04T12:49:59", schedule.LIVE),       # a second before it settles
    ("2026-09-04T12:50:00", schedule.AVAILABLE),  # 60 min + 20 min settle
    ("2026-09-05T00:00:00", schedule.AVAILABLE),  # and it stays that way
])
def test_practice_one_moves_through_its_states_on_the_second(when, expected):
    assert schedule.session_state(monza(), "Practice 1", at(when)) == expected


def test_a_session_is_live_for_exactly_as_long_as_it_runs_plus_the_settle():
    """The race is the long one: 150 scheduled minutes and the same 20-minute
    settle, so a reader is not told to come back before the podium."""
    gp = monza()
    assert schedule.session_state(gp, "Race", at("2026-09-06T15:29:00")) == schedule.LIVE
    assert schedule.session_state(gp, "Race", at("2026-09-06T15:50:00")) == schedule.AVAILABLE


# --------------------------------------------------------------------------- #
# 2. Only one thing is on track, and it is the right one
# --------------------------------------------------------------------------- #
def test_only_the_session_being_run_is_live():
    gp = monza()
    now = at("2026-09-04T12:00:00")
    assert schedule.live_sessions(gp, now) == ["Practice 1"]
    assert schedule.available_sessions(gp, now) == []
    assert schedule.session_state(gp, "Practice 2", now) == schedule.UPCOMING


def test_the_weekend_walks_forward_session_by_session():
    """Each session takes its turn: the one before it readable, the one after
    it still to come. Nothing latched, nothing skipped."""
    gp = monza()
    walk = [
        ("2026-09-04T12:00:00", "Practice 1", []),
        ("2026-09-04T15:30:00", "Practice 2", ["Practice 1"]),
        ("2026-09-05T11:00:00", "Practice 3", ["Practice 1", "Practice 2"]),
        ("2026-09-05T14:30:00", "Qualifying",
         ["Practice 1", "Practice 2", "Practice 3"]),
        ("2026-09-06T14:00:00", "Race",
         ["Practice 1", "Practice 2", "Practice 3", "Qualifying"]),
    ]
    for when, running, readable in walk:
        now = at(when)
        assert schedule.live_sessions(gp, now) == [running], when
        assert schedule.available_sessions(gp, now) == readable, when


def test_between_two_sessions_nothing_is_live():
    """The gap between Practice 1 settling and Practice 2 starting is a real
    state of the world, and it is neither of the other two."""
    gp = monza()
    now = at("2026-09-04T13:30:00")
    assert schedule.live_sessions(gp, now) == []
    assert schedule.available_sessions(gp, now) == ["Practice 1"]
    assert schedule.next_session(gp, now)[0] == "Practice 2"


def test_after_the_weekend_nothing_is_live_and_everything_is_readable():
    gp = monza()
    now = at("2026-09-07T09:00:00")
    assert schedule.live_sessions(gp, now) == []
    assert schedule.available_sessions(gp, now) == gp.sessions
    assert schedule.race_done(gp, now) is True


# --------------------------------------------------------------------------- #
# 3. The invariants, swept across the whole weekend
# --------------------------------------------------------------------------- #
def test_no_session_is_ever_two_things_at_once():
    gp = monza()
    for minutes in range(0, 96 * 60, 7):
        now = at("2026-09-04T00:00:00") + timedelta(minutes=minutes)
        for name in gp.sessions:
            state = schedule.session_state(gp, name, now)
            assert state in (schedule.UPCOMING, schedule.LIVE, schedule.AVAILABLE)
            assert (state == schedule.AVAILABLE) is schedule.session_available(gp, name, now)
            if state == schedule.LIVE:
                assert name not in schedule.available_sessions(gp, now)
                nxt = schedule.next_session(gp, now)
                assert nxt is None or nxt[0] != name, \
                    "a live session must never also be counted down to"


def test_at_most_one_session_of_a_weekend_runs_at_a_time():
    gp = monza()
    for minutes in range(0, 96 * 60, 5):
        now = at("2026-09-04T00:00:00") + timedelta(minutes=minutes)
        assert len(schedule.live_sessions(gp, now)) <= 1


# --------------------------------------------------------------------------- #
# 4. Honesty: we do not claim a session is live when we do not know
# --------------------------------------------------------------------------- #
def test_an_event_with_only_a_calendar_date_is_never_called_live():
    """A bare date parses to midnight UTC — thirteen hours before a race that
    starts at one in the afternoon. Claiming it is underway on the strength of
    that would put a red dot on the page for most of a day, for nothing."""
    gp = GrandPrix(name="Old Grand Prix", date="1994-05-01", sessions=["Race"])
    for hour in range(0, 48, 3):
        now = at("1994-05-01T00:00:00") + timedelta(hours=hour)
        assert schedule.live_sessions(gp, now) == [], now
        assert schedule.session_state(gp, "Race", now) in (
            schedule.UPCOMING, schedule.AVAILABLE)


def test_a_session_with_no_published_time_is_never_called_live():
    gp = GrandPrix(name="Unscheduled Grand Prix",
                   sessions=["Practice 1", "Race"],
                   date="2026-09-06T13:00:00Z",
                   session_times={"Race": "2026-09-06T13:00:00Z"})
    now = at("2026-09-06T13:30:00")
    assert schedule.live_sessions(gp, now) == ["Race"]
    assert schedule.session_state(gp, "Practice 1", now) == schedule.UPCOMING


@pytest.mark.parametrize("bad", ["", "not a date", "2026-13-45T99:99:99Z", None])
def test_unparseable_times_never_claim_a_live_session(bad):
    gp = GrandPrix(name="Broken Grand Prix", date=bad, sessions=["Race"],
                   session_times={"Race": bad} if bad else {})
    assert schedule.live_sessions(gp, schedule.now_utc()) == []


# --------------------------------------------------------------------------- #
# 5. Across the calendar
# --------------------------------------------------------------------------- #
def spa() -> GrandPrix:
    return GrandPrix(
        round=17, name="Belgian Grand Prix", location="Spa", country="Belgium",
        date="2026-09-13T13:00:00Z",
        sessions=["Practice 1", "Qualifying", "Race"],
        session_times={"Practice 1": "2026-09-11T11:30:00Z",
                       "Qualifying": "2026-09-12T14:00:00Z",
                       "Race": "2026-09-13T13:00:00Z"})


def test_live_now_finds_the_one_session_running_anywhere():
    gps = [monza(), spa()]
    running = schedule.live_now(gps, at("2026-09-12T14:30:00"))
    assert running is not None
    gp, name = running
    assert (gp.name, name) == ("Belgian Grand Prix", "Qualifying")


def test_live_now_is_none_when_the_calendar_is_quiet():
    assert schedule.live_now([monza(), spa()], at("2026-09-09T12:00:00")) is None


def test_the_weekend_hands_over_to_the_next_grand_prix():
    gps = [monza(), spa()]
    after_monza = at("2026-09-06T16:00:00")
    assert schedule.live_now(gps, after_monza) is None
    assert schedule.next_session_across(gps, after_monza)[1] == "Practice 1"

    during_spa = at("2026-09-11T12:00:00")
    assert schedule.live_now(gps, during_spa)[0].name == "Belgian Grand Prix"


# --------------------------------------------------------------------------- #
# 6. `available_at` — the instant the client turns the page over on
# --------------------------------------------------------------------------- #
def test_available_at_is_the_moment_the_state_changes():
    gp = monza()
    opens = schedule.session_available_at(gp, "Practice 1")
    assert opens == at("2026-09-04T12:50:00")
    assert schedule.session_state(gp, "Practice 1", opens - timedelta(seconds=1)) \
        == schedule.LIVE
    assert schedule.session_state(gp, "Practice 1", opens) == schedule.AVAILABLE


def test_available_at_is_unknown_when_the_start_is():
    gp = GrandPrix(name="Undated Grand Prix", sessions=["Race"])
    assert schedule.session_available_at(gp, "Race") is None


# --------------------------------------------------------------------------- #
# The routes, end to end — with the clock standing where it needs to
# --------------------------------------------------------------------------- #
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app as _app  # noqa: E402

client = TestClient(_app)


@pytest.fixture
def weekend_in_progress(monkeypatch):
    """A calendar whose Practice 1 started forty minutes ago, hung off the
    real clock so the routes — which read `now` for themselves — see a live
    session without any of them being told what time it is."""
    from app.adapters import data_source_manager as dsm
    from app.models import DataSource

    now = datetime.now(UTC)
    friday = now - timedelta(minutes=40)

    def calendar(year: int):
        gp = GrandPrix(
            round=16, name="Fixture Grand Prix", location="Testville",
            country="Testland", date=friday.isoformat(),
            sessions=["Practice 1", "Practice 2", "Race"],
            session_times={
                "Practice 1": friday.isoformat(),
                "Practice 2": (friday + timedelta(hours=4)).isoformat(),
                "Race": (friday + timedelta(days=2)).isoformat(),
            })
        return [gp], DataSource.LIVE

    monkeypatch.setattr(dsm, "get_grands_prix", calendar)
    return now.year


def test_schedule_route_reports_the_session_on_track(weekend_in_progress):
    r = client.get("/api/schedule", params={"year": weekend_in_progress})
    assert r.status_code == 200
    live = r.json()["live"]
    assert live is not None
    assert live["session"] == "Practice 1"
    assert live["name"] == "Fixture Grand Prix"
    assert live["start"] and live["end"] and live["available_at"]
    assert live["next_session"]["name"] == "Practice 2"


def test_schedule_route_marks_each_session_with_its_state(weekend_in_progress):
    r = client.get("/api/schedule", params={"year": weekend_in_progress})
    states = {s["name"]: s["state"] for s in r.json()["events"][0]["sessions"]}
    assert states == {"Practice 1": "live", "Practice 2": "upcoming", "Race": "upcoming"}


def test_a_weekend_stays_on_the_schedule_during_its_own_final_session(monkeypatch):
    """The event used to be dropped the moment it had no session still to
    come — which is the moment the race is running, and the moment it matters
    most."""
    from app.adapters import data_source_manager as dsm
    from app.models import DataSource

    started = datetime.now(UTC) - timedelta(minutes=30)

    def calendar(year: int):
        return [GrandPrix(round=23, name="Finale Grand Prix", country="Testland",
                          date=started.isoformat(), sessions=["Race"],
                          session_times={"Race": started.isoformat()})], DataSource.LIVE

    monkeypatch.setattr(dsm, "get_grands_prix", calendar)

    body = client.get("/api/schedule", params={"year": datetime.now(UTC).year}).json()
    assert [e["name"] for e in body["events"]] == ["Finale Grand Prix"]
    assert body["events"][0]["next_session"] is None
    assert body["events"][0]["live_session"] == "Race"
    assert body["live"]["session"] == "Race"


def test_sessions_available_names_what_is_running(weekend_in_progress):
    r = client.get("/api/sessions/available",
                   params={"year": weekend_in_progress, "gp": "Fixture Grand Prix"})
    body = r.json()
    assert body["live"] == ["Practice 1"]
    assert body["sessions"] == [], "nothing has finished yet"
    assert body["states"]["Practice 1"] == "live"


def test_opening_a_live_session_says_live_rather_than_never_happened(weekend_in_progress):
    """The refusal is the same — there is genuinely nothing to analyse yet —
    but the reason is the truth, and the client turns this one into the live
    experience instead of an unavailable screen."""
    r = client.get("/api/session", params={
        "year": weekend_in_progress, "gp": "Fixture Grand Prix", "session": "Practice 1"})
    assert r.status_code == 503
    body = r.json()
    assert body["reason"] == "live_session"
    assert body["retryable"] is True, "unlike a future session, this resolves by itself"
    assert "running right now" in body["message"]


def test_a_session_still_to_come_is_still_refused_as_future(weekend_in_progress):
    r = client.get("/api/session", params={
        "year": weekend_in_progress, "gp": "Fixture Grand Prix", "session": "Race"})
    assert r.status_code == 503
    assert r.json()["reason"] == "future_session"
