"""The API contract both clients decode — checked on the JSON itself.

The website and the iOS app read one payload. What each field MEANS is
written in docs/API_CONTRACT.md; what this file checks is that the payload
keeps that meaning: a status is never empty, `retired` is the one retirement
signal and is always present, the position trace has one point per completed
lap and none beyond it, the race facts are present and typed, the pace gap is
computed once, windows carry their provenance, and nothing in the document is
NaN or a Python object a strict decoder would reject.

The app's own decoding could not be run here (its source is not in this
repository); these are the guarantees it is entitled to rely on.
"""
from __future__ import annotations

import json
import math

import pytest

from tests.test_completed_record import client  # noqa: F401
from tests.test_data_integrity import YEAR, world  # noqa: F401


@pytest.fixture
def payload(world, monkeypatch):
    from app import main
    monkeypatch.setattr(main.service, "get_grands_prix",
                        lambda year: (_ for _ in ()).throw(RuntimeError("no calendar")))
    race = world()
    race.openf1_grid = False
    r = client.get("/api/session", params={"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"})
    assert r.status_code == 200
    return r.json()


def _walk(node, path="$"):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield path, node


def test_no_nan_or_infinity_anywhere(payload):
    bad = [p for p, v in _walk(payload) if isinstance(v, float) and (math.isnan(v) or math.isinf(v))]
    assert bad == []
    json.dumps(payload, allow_nan=False)      # a strict decoder accepts it


def test_classification_rows_carry_the_retirement_signal_and_a_status(payload):
    rows = payload["session"]["classification"]
    assert len(rows) == 22
    for r in rows:
        assert isinstance(r["retired"], bool), r
        assert isinstance(r["status"], str) and r["status"], r
        assert r["driver"] and r["name"] and r["team"]
        assert r["grid"] is None or isinstance(r["grid"], int)
        assert r["laps_completed"] is None or isinstance(r["laps_completed"], int)
        assert r["position"] is None or isinstance(r["position"], int)
        # a retirement has no position and a finisher has one — never both, never neither
        assert (r["position"] is None) == r["retired"], r
    finished = [r for r in rows if not r["retired"]]
    assert len(finished) == 19 and [r["driver"] for r in rows if r["retired"]] == ["ALO", "STR", "LEC"]


def test_the_position_trace_is_one_point_per_completed_lap(payload):
    rows = {r["driver"]: r for r in payload["session"]["classification"]}
    laps_by = {}
    for p in payload["session"]["positions"]:
        assert isinstance(p["position"], int) and isinstance(p["lap"], int)
        laps_by.setdefault(p["driver"], set()).add(p["lap"])
    for code, r in rows.items():
        assert laps_by[code] == set(range(1, r["laps_completed"] + 1)), code
    # a lap row without a lap time is a lap the car did not complete: no position on it
    for lp in payload["session"]["laps"]:
        if lp["lap_time"] is None and lp["lap"] > rows[lp["driver"]]["laps_completed"]:
            assert lp["position"] is None, lp


def test_race_facts_are_present_typed_and_consistent(payload):
    f = payload["strategy"]["facts"]
    assert f["settled"] is True and f["awaiting"] == []
    assert (f["winner"], f["winner_grid"], f["margin"], f["margin_s"]) == ("ANT", 19, "+3.857s", 3.857)
    assert (f["entries"], f["finishers"], f["retirements"]) == (22, 19, 3)
    assert f["finishers"] == sum(1 for r in payload["session"]["classification"] if not r["retired"])
    assert isinstance(f["best_pace_gap"], float) and isinstance(f["fastest_lap"], float)
    n = f["neutralizations"]
    assert set(n) == {"safety_cars", "virtual_safety_cars", "red_flags", "total", "local_yellows", "source"}
    assert n["total"] == n["safety_cars"] + n["virtual_safety_cars"] + n["red_flags"]


def test_the_pace_gap_is_computed_once(payload):
    ranked = sorted((p for p in payload["pace"] if p["pace_rank"]), key=lambda p: p["pace_rank"])
    assert ranked[0]["gap_to_best"] == 0.0
    for p in ranked[1:]:
        assert p["gap_to_best"] == round(p["clean_air_pace"] - ranked[0]["clean_air_pace"], 3)
    assert payload["strategy"]["facts"]["best_pace_gap"] == ranked[1]["gap_to_best"]
    for p in payload["pace"]:
        if not p["pace_rank"]:
            assert p["gap_to_best"] is None


def test_windows_carry_provenance_and_keep_event_apart_from_cause(payload):
    wins = payload["session"]["track_status_windows"]
    assert [w["status"] for w in wins] == ["SAFETY_CAR", "RED", "SAFETY_CAR", "VSC"]
    for w in wins:
        assert w["source"] == "race_control" and w["end_known"] is True and w["confidence"] == "high"
        assert w["end_lap"] >= w["start_lap"]
        assert w["cause"] is None and w["cause_source"] is None
        for inc in w["incidents"]:
            assert inc["kind"] and isinstance(inc["drivers"], list) and inc["message"]
    assert wins[0]["incidents"][0]["drivers"] == ["LEC"] and wins[2]["incidents"] == []


def test_pit_stops_keep_lane_time_apart_from_stationary_time(payload):
    for p in payload["session"]["pit_stops"]:
        assert p["pit_lane_time"] is None or p["pit_lane_time"] < 180
        assert p["stop_duration"] is None
        assert isinstance(p["under_safety_car"], bool) and isinstance(p["under_vsc"], bool)
    bpt = payload["strategy"]["best_pit_timing"]
    assert bpt["stationary_s"] is None and bpt["lane_s"]


def test_the_report_names_what_is_owed_and_what_conflicts(payload):
    rep = payload["session"]["source_report"]
    assert isinstance(rep["awaiting"], list) and isinstance(rep["conflicts"], list)
    assert rep["settled"] is True and rep["provisional"] == []
