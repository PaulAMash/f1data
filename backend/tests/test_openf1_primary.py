"""THE PRIMARY SOURCE THAT NEVER SERVED A SESSION — pinned on Bahrain 2026.

WHAT WAS WRONG. `openf1_adapter._lap_windows` closed a driver's last lap with
`date_start + lap_duration`: a datetime plus a float, which raises TypeError.
Every real session has lap rows with a start time, so every OpenF1 fetch died
there, was logged as "source openf1 failed (error)", and the chain fell through
to the F1 archive and then to Jolpica. The documented primary for 2023+ (V50 to
V106) never once served a session — and the 2026 Bahrain Grand Prix was the
weekend whose fallbacks could not cover for it.

Nothing exercised `fetch_session` with a lap table, because the fixtures either
had no laps or no `date_start`. These tests do, in the shape OpenF1 answers.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.adapters import data_source_manager as dsm
from app.adapters import openf1_adapter
from app.main import app
from tests.world_2026 import YEAR, world_2026  # noqa: F401  (fixture)

client = TestClient(app)

#: Three rows of `laps?session_key=…` for one car in the 2026 Bahrain Grand Prix:
#: lap 1 has no published duration (it always starts from the grid), the others do.
BAHRAIN_LAPS = [
    {"driver_number": 12, "lap_number": 1, "date_start": "2026-04-12T15:03:41.317000+00:00",
     "lap_duration": None, "is_pit_out_lap": False, "session_key": 9902},
    {"driver_number": 12, "lap_number": 2, "date_start": "2026-04-12T15:05:23.556000+00:00",
     "lap_duration": 96.421, "is_pit_out_lap": False, "session_key": 9902},
    {"driver_number": 12, "lap_number": 3, "date_start": "2026-04-12T15:06:59.977000+00:00",
     "lap_duration": 95.880, "is_pit_out_lap": False, "session_key": 9902},
]


def _ant(_number):
    return "ANT"


# --------------------------------------------------------------------------- #
# 1. The exact root cause
# --------------------------------------------------------------------------- #
def test_the_last_lap_window_is_closed_with_a_timedelta():
    """`ds + (dur or 100)` raised on the last row of every driver. It must be a
    duration added to an instant, and consecutive windows must still meet."""
    windows = openf1_adapter._lap_windows(BAHRAIN_LAPS, _ant)["ANT"]
    assert [n for n, _s, _e in windows] == [1, 2, 3]
    assert windows[0][2] == windows[1][1] and windows[1][2] == windows[2][1]
    _n, start, end = windows[-1]
    assert end - start == timedelta(seconds=95.880)


def test_a_last_lap_without_a_duration_is_closed_generously():
    """A car whose final lap has no published time (retired on it, or the feed
    stopped) still gets a window — a hundred seconds, as the code always
    documented and never once delivered."""
    windows = openf1_adapter._lap_windows(BAHRAIN_LAPS[:1], _ant)["ANT"]
    assert windows[0][2] - windows[0][1] == timedelta(seconds=100)


# --------------------------------------------------------------------------- #
# 2. A position is a state; a gap is a measurement
# --------------------------------------------------------------------------- #
def test_a_position_is_carried_across_the_laps_it_was_held():
    """OpenF1 publishes the initial placement and every change. A car that
    held P4 for three laps has one sample, and the trace must still say P4 on
    each of them — otherwise a chart reads a held position as a missing car."""
    windows = openf1_adapter._lap_windows(BAHRAIN_LAPS, _ant)
    samples = [{"driver_number": 12, "position": 4, "date": "2026-04-12T15:03:45+00:00"}]
    carried = openf1_adapter._timeseries_to_lap(samples, "position", windows, _ant, carry=True)
    assert carried == {("ANT", 1): 4, ("ANT", 2): 4, ("ANT", 3): 4}

    samples.append({"driver_number": 12, "position": 3, "date": "2026-04-12T15:05:30+00:00"})
    carried = openf1_adapter._timeseries_to_lap(samples, "position", windows, _ant, carry=True)
    assert carried == {("ANT", 1): 4, ("ANT", 2): 3, ("ANT", 3): 3}


def test_a_measurement_is_never_carried():
    windows = openf1_adapter._lap_windows(BAHRAIN_LAPS, _ant)
    samples = [{"driver_number": 12, "gap_to_leader": 1.2, "date": "2026-04-12T15:03:45+00:00"}]
    assert openf1_adapter._timeseries_to_lap(samples, "gap_to_leader", windows, _ant) == {("ANT", 1): 1.2}


# --------------------------------------------------------------------------- #
# 3. Bahrain 2026, end to end, from the primary
# --------------------------------------------------------------------------- #
def test_the_bahrain_2026_race_is_served_by_openf1_with_every_facet(world_2026):
    session = openf1_adapter.fetch_session(YEAR, "Bahrain Grand Prix", "Race")
    assert (session.year, session.grand_prix, session.session_type) == (YEAR, "Bahrain Grand Prix", "Race")
    assert session.official_name == "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026"
    served = {f.facet for f in session.source_report.facets if f.source == "openf1"}
    assert served >= {"drivers", "results", "laps", "positions", "stints", "pit_stops",
                      "race_control", "weather"}
    assert set(session.source_report.missing) <= {"overtakes"}, "overtakes are inferred downstream"
    # one position per completed lap per car, and every lap row carries its position
    laps_by: dict[str, set[int]] = {}
    for p in session.positions:
        laps_by.setdefault(p.driver, set()).add(p.lap)
    assert len(laps_by) == 20 and all(v == set(range(1, 13)) for v in laps_by.values())
    assert all(lp.position is not None for lp in session.laps)
    assert [c.grid for c in session.classification[:3]] == [1, 2, 3]


def test_the_source_chain_serves_bahrain_2026_from_the_primary_and_does_not_fall_through(world_2026):
    for name in ("Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"):
        session = dsm.load_session(YEAR, "Bahrain Grand Prix", name)
        assert (session.grand_prix, session.session_type, session.complete) == ("Bahrain Grand Prix", name, True)
        sources = {f.facet: f.source for f in session.source_report.facets}
        assert sources["drivers"] == "openf1" and sources["results"] == "openf1", (name, sources)
        if session.category == "race":
            assert sources["laps"] == "openf1" and sources["stints"] == "openf1"
    # the results archive was never asked for what the primary already had
    assert not any(url.endswith("/laps.json") for url, _ in world_2026.calls)


def test_the_api_answers_every_bahrain_2026_session(world_2026):
    for name in ("Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"):
        r = client.get("/api/session", params={"year": YEAR, "gp": "Bahrain Grand Prix", "session": name})
        assert r.status_code == 200, (name, r.text[:300])
        body = r.json()
        assert body["source"] == "live"
        s = body["session"]
        assert (s["year"], s["grand_prix"], s["session_type"], s["complete"]) == (YEAR, "Bahrain Grand Prix", name, True)
        assert s["source_report"]["missing"] == []
    # and the second read is the cache, under the same identity
    r = client.get("/api/session", params={"year": YEAR, "gp": "Bahrain Grand Prix", "session": "Race"})
    assert r.json()["source"] == "cache" and r.json()["session"]["grand_prix"] == "Bahrain Grand Prix"
