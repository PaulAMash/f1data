"""The golden sessions — permanent guardrails for the canonical record.

Each entry is a session as its providers answer it, plus the canonical facts
the pipeline MUST produce from those answers. The expectations are written by
hand from the scenario's own stated facts (who won, who retired on which lap,
which lines race control published) — never snapshotted from the pipeline's
output, so a change that "fixes" one session and quietly breaks another fails
here, with the session and the field named.

Twelve sessions: the 2026 Italian Grand Prix (Safety Car, red flag, restart
Safety Car, VSC, three retirements, grid from the results archive), a clean
Dutch Grand Prix, a Safety-Car-heavy race, a VSC-heavy race, a red flag with a
standing restart, a race with six retirements, a 2019 archive race with coded
laps, a 1995 Ergast race, the simulator's practice and qualifying sessions, a
sprint, and the Italian Grand Prix as a provisional record before any result
was published.

The facts asserted are the ones the clients show: winner and grid, margin,
entries / finishers / retirements, who retired and on which lap, every
neutralisation window with its cause (which is None unless a deployment line
stated one), the neutralisation counts, pit counts, names, what the record is
still owed, whether it is settled, and whether the position trace is whole.
"""
from __future__ import annotations

from typing import Callable

from app.models import TrackStatus as TS

from tests.test_data_integrity import ITALY_2026, ITALY_2026_RACE_CONTROL, RaceWorld

# --------------------------------------------------------------------------- #
# rosters and logs
# --------------------------------------------------------------------------- #

def _finish_all(roster):
    """The same field, everyone classified, nobody retired."""
    out, pos = [], 0
    for n, code, f, l, team, col, g, _p, gap, pts, _laps, _dnf, _reason in roster:
        pos += 1
        gap = 0 if pos == 1 else (gap if isinstance(gap, (int, float)) and gap else 3.0 * pos)
        out.append((n, code, f, l, team, col, g, pos, gap, pts, 53, False, None))
    return out


def _retire(roster, retirements: dict[str, tuple[int, str]]):
    """Retire the named cars on the given laps, renumbering the finishers."""
    out, pos = [], 0
    for n, code, f, l, team, col, g, _p, gap, pts, laps, _dnf, _reason in roster:
        if code in retirements:
            lap, reason = retirements[code]
            out.append((n, code, f, l, team, col, g, None, None, 0, lap, True, reason))
        else:
            pos += 1
            gap = 0 if pos == 1 else (gap if isinstance(gap, (int, float)) and gap else 3.0 * pos)
            out.append((n, code, f, l, team, col, g, pos, gap, pts, 53, False, None))
    return out


def _line(lap, message, category="SafetyCar", flag=None, scope="Track"):
    return dict(lap_number=lap, category=category, flag=flag, scope=scope, message=message)


CLEAN_LOG = [_line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
             _line(53, "CHEQUERED FLAG", "Flag", "CHEQUERED")]

SC_HEAVY_LOG = [
    _line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
    _line(1, "CARS 4 (NOR) AND 81 (PIA) CONTACT AT TURN 1", "Other", None, None),
    _line(1, "SAFETY CAR DEPLOYED"), _line(3, "SAFETY CAR IN THIS LAP"),
    _line(20, "CAR 27 (HUL) STOPPED AT TURN 7", "Other", None, None),
    _line(20, "SAFETY CAR DEPLOYED"), _line(22, "SAFETY CAR IN THIS LAP"),
    _line(40, "SAFETY CAR DEPLOYED"), _line(43, "SAFETY CAR IN THIS LAP"),
    _line(53, "CHEQUERED FLAG", "Flag", "CHEQUERED"),
]

VSC_HEAVY_LOG = [
    _line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
    _line(10, "VIRTUAL SAFETY CAR DEPLOYED"), _line(11, "VIRTUAL SAFETY CAR ENDING"),
    _line(35, "CAR 87 (BEA) STOPPED AT TURN 4", "Other", None, None),
    _line(35, "VIRTUAL SAFETY CAR DEPLOYED"), _line(36, "VIRTUAL SAFETY CAR ENDING"),
    _line(53, "CHEQUERED FLAG", "Flag", "CHEQUERED"),
]

RED_STANDING_RESTART_LOG = [
    _line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
    _line(10, "YELLOW IN TRACK SECTOR 1", "Flag", "YELLOW", "Sector"),
    _line(10, "CAR 55 (SAI) CRASHED AT TURN 1", "Other", None, None),
    _line(10, "RED FLAG", "Flag", "RED"),
    _line(12, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
    _line(12, "TRACK CLEAR", "Flag", "GREEN"),
    _line(53, "CHEQUERED FLAG", "Flag", "CHEQUERED"),
]

MANY_DNF_LOG = [
    _line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
    _line(5, "YELLOW IN TRACK SECTOR 2", "Flag", "YELLOW", "Sector"),
    _line(5, "CLEAR IN TRACK SECTOR 2", "Flag", "CLEAR", "Sector"),
    _line(53, "CHEQUERED FLAG", "Flag", "CHEQUERED"),
]

SPRINT_LOG = [_line(1, "GREEN LIGHT - PIT EXIT OPEN", "Other", "GREEN", None),
              _line(19, "CHEQUERED FLAG", "Flag", "CHEQUERED")]


def _italy() -> RaceWorld:
    w = RaceWorld()
    w.openf1_grid = False                       # production: the grid feed was empty
    return w


def _italy_provisional() -> RaceWorld:
    w = RaceWorld()
    w.openf1_result = False
    w.jolpica = False
    return w


def _dutch() -> RaceWorld:
    return RaceWorld(gp="Dutch Grand Prix", roster=_finish_all(ITALY_2026), race_control=CLEAN_LOG,
                     red_restart_lap=None, red_lap=None)


def _hungary() -> RaceWorld:
    return RaceWorld(gp="Hungarian Grand Prix",
                     roster=_retire(ITALY_2026, {"HUL": (19, "Engine"), "PIA": (1, "Collision")}),
                     race_control=SC_HEAVY_LOG, red_restart_lap=None, red_lap=None)


def _bahrain() -> RaceWorld:
    return RaceWorld(gp="Bahrain Grand Prix", roster=_retire(ITALY_2026, {"BEA": (34, "Gearbox")}),
                     race_control=VSC_HEAVY_LOG, red_restart_lap=None, red_lap=None)


def _spa() -> RaceWorld:
    return RaceWorld(gp="Belgian Grand Prix", roster=_retire(ITALY_2026, {"SAI": (9, "Accident")}),
                     race_control=RED_STANDING_RESTART_LOG, red_restart_lap=12, red_lap=10)


def _monaco() -> RaceWorld:
    return RaceWorld(gp="Monaco Grand Prix", roster=_retire(ITALY_2026, {
        "LEC": (3, "Accident"), "STR": (12, "Hydraulics"), "ALO": (25, "Gearbox"),
        "OCO": (30, "Collision"), "PER": (41, "Brakes"), "BOT": (50, "Engine")}),
        race_control=MANY_DNF_LOG, red_restart_lap=None, red_lap=None)


def _sprint() -> RaceWorld:
    roster = [(n, code, f, l, team, col, g, p, gap, pts, (19 if laps == 53 else laps), dnf, r)
              for n, code, f, l, team, col, g, p, gap, pts, laps, dnf, r in _finish_all(ITALY_2026)]
    return RaceWorld(gp="Chinese Grand Prix", roster=roster, race_control=SPRINT_LOG, laps=19,
                     pit_lap=8, red_restart_lap=None, red_lap=None, session_name="Sprint")


# --------------------------------------------------------------------------- #
# the set
# --------------------------------------------------------------------------- #
#: kind: "openf1" (the RaceWorld providers), "archive", "ergast", "mock"
GOLDEN: dict[str, dict] = {
    "italy-2026": dict(kind="openf1", world=_italy, session="Race", expect=dict(
        settled=True, category="race", winner="ANT", winner_name="Kimi Antonelli", winner_grid=19,
        margin="+3.857s", entries=22, finishers=19, retirements=3,
        retired={"LEC": 1, "STR": 29, "ALO": 39},
        windows=[(TS.SAFETY_CAR, 2, 3, None), (TS.RED, 3, 4, None), (TS.SAFETY_CAR, 4, 6, None), (TS.VSC, 30, 32, None)],
        # the lap-2 stop is logged in the laps of the Safety Car AND of the red
        # flag that followed it; the restart Safety Car has nothing logged
        incidents={(TS.SAFETY_CAR, 2): [("stopped", ["LEC"])], (TS.RED, 3): [("stopped", ["LEC"])],
                   (TS.SAFETY_CAR, 4): [], (TS.VSC, 30): [("stopped", ["STR"])]},
        counts=(2, 1, 1, 1), pit_counts={"ANT": 1, "RUS": 1, "LEC": 0, "STR": 1},
        names={"ANT": "Kimi Antonelli", "HUL": "Nico Hülkenberg"}, awaiting=[], trace_whole=True,
        grid_source="jolpica")),
    "dutch-2026": dict(kind="openf1", world=_dutch, session="Race", expect=dict(
        settled=True, category="race", winner="ANT", winner_grid=19, margin="+3.857s",
        entries=22, finishers=22, retirements=0, retired={}, windows=[], incidents={},
        counts=(0, 0, 0, 0), pit_counts={"ANT": 1, "LEC": 1}, names={"ANT": "Kimi Antonelli"},
        awaiting=[], trace_whole=True, grid_source="openf1")),
    "hungary-2026-safety-cars": dict(kind="openf1", world=_hungary, session="Race", expect=dict(
        settled=True, category="race", winner="ANT", entries=22, finishers=20, retirements=2,
        retired={"HUL": 19, "PIA": 1},
        windows=[(TS.SAFETY_CAR, 1, 3, None), (TS.SAFETY_CAR, 20, 22, None), (TS.SAFETY_CAR, 40, 43, None)],
        incidents={(TS.SAFETY_CAR, 1): [("collision", ["NOR", "PIA"])], (TS.SAFETY_CAR, 20): [("stopped", ["HUL"])],
                   (TS.SAFETY_CAR, 40): []},
        counts=(3, 0, 0, 0), awaiting=[], trace_whole=True)),
    "bahrain-2026-vscs": dict(kind="openf1", world=_bahrain, session="Race", expect=dict(
        settled=True, category="race", entries=22, finishers=21, retirements=1, retired={"BEA": 34},
        windows=[(TS.VSC, 10, 11, None), (TS.VSC, 35, 36, None)],
        incidents={(TS.VSC, 10): [], (TS.VSC, 35): [("stopped", ["BEA"])]},
        counts=(0, 2, 0, 0), awaiting=[], trace_whole=True)),
    "belgium-2026-red-flag": dict(kind="openf1", world=_spa, session="Race", expect=dict(
        settled=True, category="race", entries=22, finishers=21, retirements=1, retired={"SAI": 9},
        windows=[(TS.RED, 10, 12, None)], incidents={(TS.RED, 10): [("crash", ["SAI"])]},
        counts=(0, 0, 1, 1), pit_counts={"ANT": 1, "RUS": 1}, awaiting=[], trace_whole=True)),
    "monaco-2026-six-retirements": dict(kind="openf1", world=_monaco, session="Race", expect=dict(
        settled=True, category="race", entries=22, finishers=16, retirements=6,
        retired={"LEC": 3, "STR": 12, "ALO": 25, "OCO": 30, "PER": 41, "BOT": 50},
        windows=[], incidents={}, counts=(0, 0, 0, 1), awaiting=[], trace_whole=True)),
    "china-2026-sprint": dict(kind="openf1", world=_sprint, session="Sprint", expect=dict(
        settled=True, category="sprint", winner="ANT", winner_grid=19, entries=22, finishers=22, retirements=0,
        retired={}, windows=[], counts=(0, 0, 0, 0), pit_counts={"ANT": 1}, awaiting=[], trace_whole=True,
        grid_source="openf1")),
    "italy-2026-provisional": dict(kind="openf1", world=_italy_provisional, session="Race", expect=dict(
        settled=False, category="race", winner="ANT", entries=22, finishers=None, retirements=None,
        retired={}, statuses={"Provisional"},
        windows=[(TS.SAFETY_CAR, 2, 3, None), (TS.RED, 3, 4, None), (TS.SAFETY_CAR, 4, 6, None), (TS.VSC, 30, 32, None)],
        counts=(2, 1, 1, 1), margin=None)),
    "austria-2019-archive": dict(kind="archive", session="Race", expect=dict(
        settled=True, category="race", winner="VER", winner_grid=2, margin="+2.724s", entries=6, finishers=5,
        retirements=1, retired={"KVY": 34}, windows=[(TS.SAFETY_CAR, 34, 37, None)],
        incidents={(TS.SAFETY_CAR, 34): [("stopped", ["KVY"])]}, counts=(1, 0, 0, 0), awaiting=[],
        trace_whole=True)),
    "italy-1995-ergast": dict(kind="ergast", session="Race", expect=dict(
        settled=True, category="race", winner="HER", winner_name="Johnny Herbert", winner_grid=3,
        margin="+17.878s", entries=3, finishers=2, retirements=1, retired={"MIC": 23}, windows=[],
        counts=(0, 0, 0, 0), names={"HAK": "Mika Häkkinen"}, awaiting=[])),
    "mock-practice": dict(kind="mock", session="Practice 2", expect=dict(
        settled=True, category="practice", finishers=None, retirements=None, retired={}, windows=[])),
    "mock-qualifying": dict(kind="mock", session="Qualifying", expect=dict(
        settled=True, category="qualifying", finishers=None, retirements=None, retired={}, windows=[],
        interruption_causes=["stopped on track"])),
}


def facts_of(session, strategy) -> dict:
    """The comparable view of a loaded session: exactly the keys `expect` may name."""
    f = strategy.facts
    by_driver: dict[str, list[int]] = {}
    for p in session.positions:
        by_driver.setdefault(p.driver, []).append(p.lap)
    trace_whole = all(sorted(by_driver.get(c.driver, [])) == list(range(1, (c.laps_completed or 0) + 1))
                      for c in session.classification) if session.classification else None
    grid_facet = next((x.source for x in session.source_report.facets if x.facet == "starting_grid"), None) \
        if session.source_report else None
    out = dict(
        settled=session.settled, category=session.category,
        winner=f.winner, winner_name=f.winner_name, winner_grid=f.winner_grid, margin=f.margin,
        entries=f.entries, finishers=f.finishers, retirements=f.retirements,
        retired={c.driver: c.laps_completed for c in session.classification if c.retired},
        statuses={c.status for c in session.classification},
        windows=[(w.status, w.start_lap, w.end_lap, w.cause) for w in session.track_status_windows],
        incidents={(w.status, w.start_lap): [(i.kind, i.drivers) for i in w.incidents]
                   for w in session.track_status_windows},
        counts=(f.neutralizations.safety_cars, f.neutralizations.virtual_safety_cars,
                f.neutralizations.red_flags, f.neutralizations.local_yellows),
        pit_counts=strategy.pit_counts, names={c.driver: c.name for c in session.classification},
        awaiting=list(session.source_report.awaiting) if session.source_report else [],
        trace_whole=trace_whole, grid_source=grid_facet,
    )
    return out
