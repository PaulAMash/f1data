"""
Scheduled is not available.

THE BUG THESE TESTS EXIST FOR. On the Friday the Italian Grand Prix weekend
opened, the Race Explorer opened on the Italian Grand Prix *Race* — a session
two days in the future — and spent a request looking for data that could not
exist. The cause was one field meaning two things: OpenF1 (tried first for
2023+) puts the weekend's Friday in `GrandPrix.date`, Jolpica puts the race's
Sunday there, and `event_completed` compared that field to today.

Every scenario the product can be in during a weekend is pinned here against
a frozen clock, because "it looks right today" is not a test of a rule that
only misfires on three days out of every seven.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app import schedule
from app.models import GrandPrix


UTC = timezone.utc


def monza(date_field: str = "2026-09-04T09:30:00+00:00") -> GrandPrix:
    """The 2026 Italian Grand Prix, Sep 4-6, as OpenF1 publishes it —
    `date` is the Friday the meeting opens, which is the shape that broke."""
    return GrandPrix(
        round=16, name="Italian Grand Prix", location="Monza", country="Italy",
        date=date_field,
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
# 1. A future Grand Prix, before anything has run
# --------------------------------------------------------------------------- #
def test_nothing_is_available_before_the_first_practice():
    gp = monza()
    now = at("2026-09-04T00:57:00")          # the reported moment, to the minute
    assert schedule.available_sessions(gp, now) == []
    assert schedule.race_done(gp, now) is False
    for name in gp.sessions:
        assert schedule.session_available(gp, name, now) is False, name


def test_a_future_race_is_never_available_merely_because_it_is_on_the_calendar():
    """The headline guarantee, stated as its own test so it cannot be lost in
    a refactor: being scheduled is not evidence of having happened."""
    gp = monza()
    for moment in ("2026-08-01T12:00:00", "2026-09-04T00:57:00",
                   "2026-09-05T23:59:00", "2026-09-06T12:59:00"):
        assert schedule.session_available(gp, "Race", at(moment)) is False, moment


def test_the_friday_date_field_no_longer_completes_the_weekend():
    """The regression itself. `date` is the Friday here; the race is Sunday."""
    gp = monza()
    friday = at("2026-09-04T09:31:00")
    assert str(gp.date)[:10] <= friday.date().isoformat(), "fixture must reproduce the old trigger"
    assert schedule.race_done(gp, friday) is False


# --------------------------------------------------------------------------- #
# 2-4. A weekend in progress — sessions arrive one at a time
# --------------------------------------------------------------------------- #
def test_practice_one_becomes_available_only_after_it_has_finished():
    gp = monza()
    during = at("2026-09-04T11:45:00")        # 15 minutes in
    assert schedule.session_available(gp, "Practice 1", during) is False, \
        "a session that is still running has no completed data to serve"
    after = at("2026-09-04T12:55:00")         # ended 12:30, plus settle
    assert schedule.session_available(gp, "Practice 1", after) is True
    assert schedule.available_sessions(gp, after) == ["Practice 1"]


def test_later_sessions_stay_unavailable_while_earlier_ones_open():
    gp = monza()
    after_fp2 = at("2026-09-04T16:30:00")
    assert schedule.available_sessions(gp, after_fp2) == ["Practice 1", "Practice 2"]
    assert schedule.session_available(gp, "Practice 3", after_fp2) is False
    assert schedule.session_available(gp, "Qualifying", after_fp2) is False
    assert schedule.race_done(gp, after_fp2) is False


def test_qualifying_available_but_the_race_is_not():
    gp = monza()
    saturday_night = at("2026-09-05T16:00:00")
    assert schedule.available_sessions(gp, saturday_night) == [
        "Practice 1", "Practice 2", "Practice 3", "Qualifying"]
    assert schedule.race_done(gp, saturday_night) is False


# --------------------------------------------------------------------------- #
# 5-6. Finished weekends
# --------------------------------------------------------------------------- #
def test_a_finished_weekend_offers_everything():
    gp = monza()
    monday = at("2026-09-07T09:00:00")
    assert schedule.available_sessions(gp, monday) == gp.sessions
    assert schedule.race_done(gp, monday) is True


def test_a_historical_grand_prix_is_complete():
    gp = GrandPrix(name="Monaco Grand Prix", date="1994-05-15",
                   sessions=["Qualifying", "Race"],
                   session_times={"Qualifying": "1994-05-14T13:00:00Z",
                                  "Race": "1994-05-15T13:00:00Z"})
    now = at("2026-09-04T00:57:00")
    assert schedule.race_done(gp, now) is True
    assert schedule.available_sessions(gp, now) == ["Qualifying", "Race"]


def test_an_undated_event_is_treated_as_historical():
    """Old seasons omit dates; future calendars never do."""
    gp = GrandPrix(name="Some Old Grand Prix", sessions=["Race"])
    assert schedule.race_done(gp, at("2026-09-04T00:57:00")) is True


# --------------------------------------------------------------------------- #
# 7-8. Thin, stale and missing upstream data
# --------------------------------------------------------------------------- #
def test_a_calendar_with_no_session_times_falls_back_only_for_the_race():
    """A missing time is not evidence a session ran. Only the race can be
    approximated from the event date, and only a full day later."""
    gp = GrandPrix(name="Italian Grand Prix", date="2026-09-06",
                   sessions=["Practice 1", "Qualifying", "Race"])
    during = at("2026-09-06T15:00:00")
    assert schedule.session_available(gp, "Practice 1", during) is False
    assert schedule.session_available(gp, "Qualifying", during) is False
    assert schedule.race_done(gp, during) is False, "same-day is too early to claim"
    assert schedule.race_done(gp, at("2026-09-07T13:00:00")) is True


def test_a_bare_date_string_is_read_as_utc_midnight():
    gp = GrandPrix(name="X", date="2026-09-06", sessions=["Race"])
    assert schedule.race_done(gp, at("2026-09-07T00:30:00")) is True
    assert schedule.race_done(gp, at("2026-09-06T23:30:00")) is False


@pytest.mark.parametrize("bad", ["", "not-a-date", None])
def test_unparseable_times_never_crash_and_never_claim_availability(bad):
    gp = GrandPrix(name="X", date=bad, sessions=["Practice 1", "Race"],
                   session_times={"Practice 1": bad or ""})
    now = at("2026-09-04T00:57:00")
    assert schedule.session_available(gp, "Practice 1", now) is False
    # An event with no usable date at all is historical, per the rule above.
    assert isinstance(schedule.race_done(gp, now), bool)


# --------------------------------------------------------------------------- #
# Timezones and offsets
# --------------------------------------------------------------------------- #
def test_offset_times_are_compared_as_instants_not_as_local_strings():
    """A session at 22:00-05:00 has not happened at 01:00Z the next day even
    though its date string is 'yesterday' — the comparison is on instants."""
    gp = GrandPrix(name="Las Vegas Grand Prix", date="2026-11-21",
                   sessions=["Race"],
                   session_times={"Race": "2026-11-21T22:00:00-08:00"})  # 06:00Z on the 22nd
    assert schedule.session_available(gp, "Race", at("2026-11-22T05:00:00")) is False
    assert schedule.session_available(gp, "Race", at("2026-11-22T09:00:00")) is True


# --------------------------------------------------------------------------- #
# The countdown reads the same table the availability rules read
# --------------------------------------------------------------------------- #
def test_next_session_walks_the_weekend_in_order():
    gp = monza()
    assert schedule.next_session(gp, at("2026-09-04T00:57:00"))[0] == "Practice 1"
    assert schedule.next_session(gp, at("2026-09-04T12:00:00"))[0] == "Practice 2"
    assert schedule.next_session(gp, at("2026-09-05T11:00:00"))[0] == "Qualifying"
    assert schedule.next_session(gp, at("2026-09-06T09:00:00"))[0] == "Race"
    assert schedule.next_session(gp, at("2026-09-07T09:00:00")) is None


def test_next_session_across_moves_to_the_following_grand_prix():
    monza_gp = monza()
    baku = GrandPrix(name="Azerbaijan Grand Prix", date="2026-09-13",
                     sessions=["Practice 1", "Race"],
                     session_times={"Practice 1": "2026-09-11T09:30:00Z",
                                    "Race": "2026-09-13T11:00:00Z"})
    after_monza = at("2026-09-06T18:00:00")
    nxt = schedule.next_session_across([monza_gp, baku], after_monza)
    assert nxt is not None
    gp, name, start = nxt
    assert gp.name == "Azerbaijan Grand Prix" and name == "Practice 1"
    assert start == at("2026-09-11T09:30:00")


def test_a_session_is_never_both_counted_down_to_and_available():
    """The invariant that keeps the countdown honest against the Explorer."""
    gp = monza()
    for hour in range(0, 96, 3):
        now = at("2026-09-04T00:00:00") + timedelta(hours=hour)
        nxt = schedule.next_session(gp, now)
        if nxt:
            assert nxt[0] not in schedule.available_sessions(gp, now), \
                f"{nxt[0]} is both upcoming and available at {now}"


# --------------------------------------------------------------------------- #
# The routes, end to end — the surfaces that actually reached the reader
# --------------------------------------------------------------------------- #
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app as _app  # noqa: E402

client = TestClient(_app)


def test_sessions_available_route_never_offers_an_unrun_session():
    from datetime import date as _date
    from app.service import get_grands_prix

    year = _date.today().year
    gps, _ = get_grands_prix(year)
    future = [g for g in gps if not g.completed]
    assert future, "the fixture must contain a race that has not been run"

    gp = future[0]
    r = client.get("/api/sessions/available", params={"year": year, "gp": gp.name})
    assert r.status_code == 200
    body = r.json()
    assert "Race" not in body["sessions"], \
        "a race that has not been run must never be offered as available"
    # the schedule still travels, because the countdown needs to show it
    assert "Race" in body["scheduled"]


def test_sessions_available_does_not_invent_a_list_for_an_unknown_grand_prix():
    """It used to answer with all five sessions for any name at all, which is
    how a race months away became loadable when the calendar was unreachable."""
    r = client.get("/api/sessions/available",
                   params={"year": 2026, "gp": "Not A Real Grand Prix"})
    assert r.status_code == 200
    body = r.json()
    assert body["sessions"] == [] and body["known"] is False


def test_current_opens_on_a_session_that_has_actually_been_run():
    from app.service import get_current, get_grands_prix

    cur = get_current()
    gps, _ = get_grands_prix(cur["year"])
    match = next((g for g in gps if g.name == cur["gp"]), None)
    assert match is not None
    assert cur["session"] in match.available_sessions, \
        "the Explorer's default session must be one that exists"


def test_schedule_route_lists_only_sessions_still_to_come():
    r = client.get("/api/schedule")
    assert r.status_code == 200
    body = r.json()
    assert body["events"], "there should be upcoming events in a season in progress"
    first = body["events"][0]
    assert first["next_session"]["name"]
    # every event on an upcoming schedule has something left to run
    for ev in body["events"]:
        assert any(not s["available"] for s in ev["sessions"])


def test_loading_an_unrun_session_is_refused_before_any_source_is_touched():
    """A link can still name a session that has not happened. It is answered
    from the calendar, not by asking three upstream sources about a race two
    days in the future and waiting out every timeout."""
    from datetime import date as _date
    from app.service import get_grands_prix

    year = _date.today().year
    gps, _ = get_grands_prix(year)
    future = next((g for g in gps if not g.completed), None)
    assert future is not None

    r = client.get("/api/session", params={"year": year, "gp": future.name, "session": "Race"})
    assert r.status_code == 503
    body = r.json()
    assert body["reason"] == "future_session"
    assert body["retryable"] is False
    assert "may not have happened yet" in body["message"]


def test_a_session_that_has_run_still_loads_normally():
    """The guard must refuse only what is genuinely still to come."""
    from app.service import get_current

    cur = get_current()
    r = client.get("/api/session",
                   params={"year": cur["year"], "gp": cur["gp"], "session": cur["session"]})
    assert r.status_code == 200


def test_an_unknown_grand_prix_is_not_refused_by_the_guard():
    """No calendar entry is not evidence of a future session — the normal
    unavailable path must still decide, rather than the guard denying blind."""
    r = client.get("/api/session",
                   params={"year": 2026, "gp": "Nowhere Grand Prix", "session": "Race"})
    assert r.status_code in (200, 503)
    if r.status_code == 503:
        assert r.json()["reason"] != "future_session"
