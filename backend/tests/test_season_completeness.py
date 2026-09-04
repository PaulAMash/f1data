"""
The schedule is the season. All of it.

THE BUG THESE TESTS EXIST FOR — the second time it happened, by a different
mechanism than the first.

V102 stopped the *sources* from truncating a season: OpenF1 only knows the
rounds its timing system has created, so the calendar is merged with Jolpica's
complete one (adapters/calendar_merge). That was real, and it was not what the
reader was seeing. `/api/schedule` answered with a WINDOW — only events with a
session still to come, and at most `limit` of them, six by default — so a
twenty-three round season came back as six events ending at São Paulo, and Las
Vegas, Qatar and Abu Dhabi were missing from the page whose entire job is to
say what is coming. A complete calendar was assembled and then trimmed.

Both filters decided MEMBERSHIP OF A SEASON from things that are not facts
about the season: what time it is, and a number in a query string.

So these tests are written against that distinction rather than against three
race names. A round belongs to the season because it is on the calendar. What
the clock decides is `state`, per session, and nothing else. Nothing here
mentions Las Vegas, Qatar or Abu Dhabi by name, and no test asserts "23" — a
calendar that grows or loses a race next year must pass unchanged.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import schedule as app_schedule
from app.adapters import data_source_manager as dsm
from app.main import app
from app.models import Circuit, DataSource, GrandPrix


UTC = timezone.utc
client = TestClient(app)

#: The instant every test in this file stands at: mid-season, on the Friday of
#: a race weekend — the shape the bug was reported from. Fixed, because a rule
#: that only misfires two thirds of the way through a year is not tested by
#: running it today.
NOW = datetime(2026, 9, 4, 9, 0, tzinfo=UTC)

#: A synthetic season. Long enough that a six- or eight-event window visibly
#: truncates it, and it is generated rather than transcribed so that nothing
#: here depends on a real calendar that will change.
ROUNDS = 23
FIRST_RACE = datetime(2026, 3, 8, 14, 0, tzinfo=UTC)
SPACING = timedelta(days=13)


def season(rounds: int = ROUNDS) -> list[GrandPrix]:
    out = []
    for i in range(rounds):
        sunday = FIRST_RACE + SPACING * i
        out.append(GrandPrix(
            round=i + 1, name=f"Round {i + 1} Grand Prix",
            location=f"Place {i + 1}", country=f"Country {i + 1}",
            circuit=Circuit(id=f"c{i+1}", name=f"Circuit {i + 1}"),
            date=sunday.isoformat(),
            sessions=["Practice 1", "Qualifying", "Race"],
            session_times={
                "Practice 1": (sunday - timedelta(days=2)).isoformat(),
                "Qualifying": (sunday - timedelta(days=1)).isoformat(),
                "Race": sunday.isoformat(),
            }))
    return out


@pytest.fixture()
def calendar(monkeypatch):
    """A full season on the wire and a fixed clock, so every assertion below is
    about the rules rather than about the day the suite happens to run."""
    cal = season()
    monkeypatch.setattr(app_schedule, "now_utc", lambda: NOW)
    monkeypatch.setattr(dsm, "get_grands_prix_detailed", lambda year: (
        cal, DataSource.LIVE,
        {"mode": "live", "sources": {"jolpica": ROUNDS, "openf1": 18},
         "retained": 0, "rounds": ROUNDS}))
    monkeypatch.setattr(dsm, "get_grands_prix", lambda year: (cal, DataSource.LIVE))
    return cal


def get(**params) -> dict:
    r = client.get("/api/schedule", params={"year": 2026, **params})
    assert r.status_code == 200
    return r.json()


# --------------------------------------------------------------------------- #
# 1. The season arrives whole
# --------------------------------------------------------------------------- #
def test_the_schedule_returns_every_round_of_the_season(calendar):
    """THE HEADLINE GUARANTEE. Not 'the next few' — the season."""
    events = get()["events"]
    assert len(events) == len(calendar)
    assert [e["round"] for e in events] == list(range(1, len(calendar) + 1))


def test_the_final_rounds_of_the_season_are_present(calendar):
    """The tail is what went missing, twice. It is checked by position rather
    than by name so that this still means something next season."""
    names = [e["name"] for e in get()["events"]]
    assert names[-3:] == [g.name for g in calendar[-3:]]


def test_rounds_come_back_in_chronological_order(calendar):
    starts = [e["sessions"][0]["start"] for e in get()["events"]]
    assert starts == sorted(starts)


def test_no_round_appears_twice(calendar):
    events = get()["events"]
    assert len({e["name"] for e in events}) == len(events)
    assert len({e["round"] for e in events}) == len(events)


def test_no_session_of_any_round_is_dropped(calendar):
    by_name = {g.name: g for g in calendar}
    for event in get()["events"]:
        assert [s["name"] for s in event["sessions"]] == by_name[event["name"]].sessions


# --------------------------------------------------------------------------- #
# 2. The clock does not decide membership
# --------------------------------------------------------------------------- #
def test_a_race_months_away_is_on_the_schedule(calendar):
    """The rule the old window broke: being in the future is not grounds for
    being left off a calendar."""
    events = get()["events"]
    future = [e for e in events
              if all(s["state"] == "upcoming" for s in e["sessions"])]
    assert future, "a mid-season calendar has races still to come"
    assert future[-1]["name"] == calendar[-1].name


def test_a_race_already_run_is_still_on_the_schedule(calendar):
    """And the same rule from the other side — a schedule that forgets what
    happened cannot answer 'when was round 3'."""
    events = get()["events"]
    past = [e for e in events
            if all(s["state"] == "completed" for s in e["sessions"])]
    assert past, "a mid-season calendar has races already run"
    assert past[0]["name"] == calendar[0].name


def test_the_number_of_rounds_does_not_depend_on_what_time_it_is(monkeypatch, calendar):
    """Swept across the whole year: the season is the same length in January,
    mid-season and after the last race."""
    for when in (datetime(2026, 1, 1, tzinfo=UTC), NOW,
                 datetime(2026, 6, 1, tzinfo=UTC),
                 FIRST_RACE + SPACING * ROUNDS + timedelta(days=1)):
        monkeypatch.setattr(app_schedule, "now_utc", lambda w=when: w)
        assert len(get()["events"]) == ROUNDS, when


# --------------------------------------------------------------------------- #
# 3. On the calendar is not the same as available
# --------------------------------------------------------------------------- #
def test_a_future_race_is_never_reported_as_available(calendar):
    """The distinction the whole lifecycle exists for. Appearing on a schedule
    is not evidence that Pitwall IQ can analyse it."""
    for event in get()["events"]:
        for s in event["sessions"]:
            if s["state"] == "upcoming":
                assert s["available"] is False, (event["name"], s["name"])


def test_every_session_carries_a_lifecycle_and_a_data_state(calendar):
    """TWO AXES, AND THE ASYMMETRY BETWEEN THEM. What the cars are doing and
    what Pitwall IQ can show are different questions: readable implies
    finished, but finished does not imply readable — which is the twenty
    minutes after the flag that used to be reported as still live."""
    for event in get()["events"]:
        for s in event["sessions"]:
            assert s["state"] in ("upcoming", "live", "completed")
            assert s["analysis"] in ("available", "awaiting")
            assert (s["analysis"] == "available") is s["available"]
            if s["analysis"] == "available":
                assert s["state"] == "completed", (event["name"], s["name"])


def test_states_run_forwards_across_the_season(calendar):
    """Everything before now is readable, everything after it is not: no
    upcoming session may sit earlier than an available one."""
    flat = [(s["start"], s["state"])
            for e in get()["events"] for s in e["sessions"]]
    flat.sort()
    seen_upcoming = False
    for start, state in flat:
        if state == "upcoming":
            seen_upcoming = True
        elif seen_upcoming:
            pytest.fail(f"{state} session at {start} sits after an upcoming one")


def test_a_completed_weekend_is_marked_and_a_future_one_is_not(calendar):
    events = {e["name"]: e for e in get()["events"]}
    assert events[calendar[0].name]["completed"] is True
    assert events[calendar[-1].name]["completed"] is False


# --------------------------------------------------------------------------- #
# 4. The window still exists — as a view, for callers that ask for one
# --------------------------------------------------------------------------- #
def test_limit_still_trims_to_the_next_few_events(calendar):
    body = get(limit=6)
    assert len(body["events"]) == 6
    for event in body["events"]:
        assert event["next_session"] or event["live_session"], \
            "the window is what is still to come, as it always was"


def test_the_window_reports_the_season_it_was_cut_from(calendar):
    """The diagnostic that would have ended this in one request: how long the
    season is, next to how much of it this response carries."""
    body = get(limit=6)
    assert body["calendar"]["rounds"] == ROUNDS
    assert body["calendar"]["returned"] == 6


def test_the_full_answer_returns_the_season_and_says_so(calendar):
    body = get()
    assert body["calendar"]["rounds"] == body["calendar"]["returned"] == ROUNDS
    assert body["calendar"]["sources"] == {"jolpica": ROUNDS, "openf1": 18}


# --------------------------------------------------------------------------- #
# 5. What the countdown and the Explorer read off the same calendar
# --------------------------------------------------------------------------- #
def test_the_next_session_is_the_next_one_that_has_not_started(calendar):
    events = get()["events"]
    upcoming = sorted(s["start"] for e in events for s in e["sessions"]
                      if s["state"] == "upcoming")
    named = [e["next_session"] for e in events if e["next_session"]]
    assert named, "mid-season there is always something next"
    assert min(n["start"] for n in named) == upcoming[0]


def test_current_opens_on_the_most_recent_session_that_has_run(calendar):
    from app.service import get_current, get_grands_prix

    cur = get_current()
    gps, _ = get_grands_prix(cur["year"])
    match = next((g for g in gps if g.name == cur["gp"]), None)
    assert match is not None
    assert cur["session"] in match.available_sessions, \
        "the Explorer must open on a session that exists"


def test_nothing_is_live_when_no_session_is_running(calendar):
    assert get()["live"] is None


# --------------------------------------------------------------------------- #
# 6. Seasons that are not the current one
# --------------------------------------------------------------------------- #
def test_a_finished_season_still_returns_all_of_its_rounds(monkeypatch, calendar):
    """A season in the past is a complete historical record, not an empty
    upcoming list — the old shape returned nothing at all for one."""
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2027, 2, 1, tzinfo=UTC))
    events = get()["events"]
    assert len(events) == ROUNDS
    assert all(e["completed"] for e in events)
    assert all(s["state"] == "completed" for e in events for s in e["sessions"])
    assert all(s["analysis"] == "available" for e in events for s in e["sessions"])


def test_a_season_before_it_starts_returns_all_of_its_rounds(monkeypatch, calendar):
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2026, 1, 2, tzinfo=UTC))
    events = get()["events"]
    assert len(events) == ROUNDS
    assert all(not e["completed"] for e in events)
    assert all(s["state"] == "upcoming" for e in events for s in e["sessions"])


# --------------------------------------------------------------------------- #
# 7. One definition of "completed", for the page that acts on it
# --------------------------------------------------------------------------- #
def test_completed_is_the_races_lifecycle_and_nothing_else(calendar):
    """THE EVENT-LEVEL FLAG FOLLOWS THE FLAG, NOT THE ARCHIVE.

    `completed` is what the Schedule's card prints, and a race is over when it
    is over. It used to mean "the race's data has settled", so a finished race
    read as still in progress for twenty minutes on the card as well. Whether
    its analysis has arrived is `analysis`, and the two are deliberately not
    the same field.
    """
    for event in get()["events"]:
        race = next((s for s in event["sessions"] if s["name"] == "Race"), None)
        assert race is not None
        assert event["completed"] is (race["state"] == "completed"), event["name"]


def test_a_race_the_schedule_would_link_to_is_one_the_explorer_will_serve(calendar):
    """The other half of the same promise: every round the page may link to is
    a round whose Race the session guard lets through."""
    from app.service import get_grands_prix

    gps = {g.name: g for g in get_grands_prix(2026)[0]}
    for event in get()["events"]:
        if not event["completed"]:
            continue
        assert "Race" in gps[event["name"]].available_sessions, event["name"]
