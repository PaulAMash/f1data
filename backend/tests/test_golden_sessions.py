"""The golden sessions, run through the real pipeline and held to their facts.

One test per session. A failure names the session and the field, so a change
that repairs one record cannot quietly break another. See golden_sessions.py
for the set and why each expectation is what it is.
"""
from __future__ import annotations

import pytest

from app.adapters import data_source_manager as dsm, jolpica_adapter
from app.adapters.mock_adapter import get_mock_session
from app.analysis.engine import analyze
from app.analysis.qualifying import compute_qualifying
from tests.golden_sessions import GOLDEN, facts_of
from tests.test_canonical_record import ERGAST_1995, _REAL_JOLPICA
from tests.test_data_integrity import YEAR, world  # noqa: F401 — the fixture


def _load(name: str, entry: dict, world, monkeypatch):
    kind = entry["kind"]
    if kind == "openf1":
        race = entry["world"]()
        race = world(**{}) and race            # world() installs a default; replace it with ours
        _install(race, monkeypatch)
        return dsm.load_session(YEAR, race.gp, entry["session"])
    if kind == "archive":
        from tests.test_data_integrity import rc
        from app.models import (ClassificationRow, Compound, DataSource, Driver, Lap, PitStop, PositionPoint,
                                RaceSession, TrackStatus)
        from app.adapters import pitwall_adapter as fastf1
        field = [(33, "VER", "Max Verstappen", "Red Bull Racing", "#3671C6", 2, 1, None, 25, 71, False),
                 (16, "LEC", "Charles Leclerc", "Ferrari", "#E8002D", 1, 2, 2.724, 18, 71, False),
                 (77, "BOT", "Valtteri Bottas", "Mercedes", "#27F4D2", 3, 3, 18.960, 15, 71, False),
                 (5, "VET", "Sebastian Vettel", "Ferrari", "#E8002D", 9, 4, 19.610, 12, 71, False),
                 (44, "HAM", "Lewis Hamilton", "Mercedes", "#27F4D2", 4, 5, 22.805, 10, 71, False),
                 (26, "KVY", "Daniil Kvyat", "Toro Rosso", "#469BFF", 15, None, None, 0, 34, True)]
        drivers, rows = [], []
        for n, c, nm, tm, col, g, pos, gap, pts, laps, dnf in field:
            drivers.append(Driver(number=str(n), code=c, name=nm, team=tm, team_color=col, grid=g))
            rows.append(ClassificationRow(position=pos, driver=c, name=nm, team=tm, team_color=col, grid=g,
                                          status="DNF" if dnf else "Finished", gap=(f"+{gap:.3f}s" if gap else None),
                                          points=float(pts), retired=dnf, laps_completed=laps,
                                          retirement_reason="Engine" if dnf else None,
                                          race_time=(71 * 68.0 + (gap or 0.0)) if not dnf else None))
        laps = [Lap(driver=c, lap=k, lap_time=68.0 + i * 0.3, position=i + 1,
                    stint=1 if k < 30 else 2, compound=Compound.MEDIUM if k < 30 else Compound.HARD,
                    track_status=TrackStatus.SAFETY_CAR if 34 <= k <= 37 else TrackStatus.GREEN)
                for i, (n, c, *_r) in enumerate(field) for k in range(1, _r[-2] + 1)]
        s = RaceSession(
            year=2019, grand_prix="Austrian Grand Prix", session_type="Race", category="race", total_laps=71,
            data_source=DataSource.CACHE, drivers=drivers, classification=rows, laps=laps,
            source_report=fastf1._fastf1_report(laps, [], [], [], [], classification=rows),
            pit_stops=[PitStop(driver=c, lap=29, pit_lane_time=21.5, source="jolpica")
                       for _n, c, *_r in field if c != "KVY"],
            positions=[PositionPoint(driver=l.driver, lap=l.lap, position=l.position) for l in laps],
            race_control=[rc(34, "CAR 26 (KVY) STOPPED AT TURN 3", category="Other"),
                          rc(34, "SAFETY CAR DEPLOYED"), rc(37, "SAFETY CAR IN THIS LAP")])
        dsm._finalize_session(s)
        return s
    if kind == "ergast":
        world()
        for fname, fn in _REAL_JOLPICA.items():
            monkeypatch.setattr(jolpica_adapter, fname, fn)
        monkeypatch.setattr(jolpica_adapter, "_get", lambda path, **kw: ERGAST_1995[path])
        return dsm.load_session(1995, "Italian Grand Prix", "Race")
    if kind == "mock":
        s = get_mock_session(2026, "Austrian Grand Prix", entry["session"])
        dsm._finalize_session(s)
        return s
    raise AssertionError(kind)


def _install(race, monkeypatch):
    from app.adapters import headshots, openf1_adapter
    from app.adapters import pitwall_adapter as fastf1
    monkeypatch.setattr(openf1_adapter, "_resolve_session", race.meta)
    monkeypatch.setattr(openf1_adapter, "_get", race.openf1_get)
    monkeypatch.setattr(jolpica_adapter, "fetch_classification", race.jolpica_classification)
    monkeypatch.setattr(jolpica_adapter, "fetch_pitstops", race.jolpica_pitstops)
    monkeypatch.setattr(jolpica_adapter, "fetch_laps", lambda y, g: ([], []))
    monkeypatch.setattr(fastf1, "fetch_session", race.archive_session)
    monkeypatch.setattr(headshots, "enrich", lambda s: False)


@pytest.mark.parametrize("name", list(GOLDEN))
def test_golden_session(name, world, monkeypatch):
    entry = GOLDEN[name]
    session = _load(name, entry, world, monkeypatch)
    strategy, _pace = analyze(session)
    got = facts_of(session, strategy)
    expect = entry["expect"]
    if "interruption_causes" in expect:
        q = compute_qualifying(session)
        got["interruption_causes"] = [it["cause"] for it in q.interruptions]
    mismatches = {}
    for key, want in expect.items():
        have = got.get(key)
        if isinstance(want, dict) and isinstance(have, dict) and key in ("names", "pit_counts"):
            have = {k: have.get(k) for k in want}          # a sample of the field, not the whole
        if have != want:
            mismatches[key] = (want, have)
    assert not mismatches, f"{name}: " + "; ".join(f"{k}: expected {w!r}, got {h!r}" for k, (w, h) in mismatches.items())
