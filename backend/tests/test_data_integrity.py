"""V109 — data integrity: incorrect data cannot be produced.

THE STANDARD. A number or an event Pitwall IQ shows must be supported by the
record it holds; where the record cannot support it, Pitwall IQ says so
instead of guessing. These tests exercise the failure modes that were
actually reached in production — not code paths for coverage — and they pin
the rule that closed each one:

  * a Safety Car comes from the FIA's deployment line, never from a line that
    mentions one; a sector clear does not end it; a red flag is a red flag;
    a VSC is not upgraded to a Safety Car;
  * the event is kept apart from whatever may have caused it: incident lines
    logged in a window's laps are listed with the cars the FIA named, and a
    cause is asserted only when the deployment line states one — never the
    nearest incident, never the car that happened to retire;
  * a red-flag stoppage is not a pit stop, a lane time is not a stationary
    time, a missing status is not "Finished", a missing grid is not pole;
  * two official sources disagreeing is recorded, not silently resolved;
  * the race-level numbers — margin, finishers, retirements, best-pace gap,
    neutralisation counts — are computed once, in the backend, and every
    client reads the same values;
  * a record cached with windows an older builder paired wrong is rebuilt
    from its own log on the next read.

The 2026 Italian Grand Prix is the forensic case: the record that exposed all
of it at once. Its official facts (Antonelli from P19, Russell +3.857s,
Leclerc out after one lap, Stroll and Alonso out, a Safety Car, a red flag, a
later VSC) are the fixture the generalised pipeline is checked against; none
of them is known to the production code.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app import cache, upstream
from app.adapters import data_source_manager as dsm
from app.adapters import headshots, jolpica_adapter, openf1_adapter
from app.adapters import pitwall_adapter as fastf1
from app.analysis import neutralizations as neu
from app.analysis.engine import analyze
from app.analysis.normalize import canonical_name
from app.config import get_settings
from app.models import (
    PROVISIONAL_STATUS, ClassificationRow, Driver, FacetSource, Lap, PitStop, RaceControlEvent,
    RaceSession, SourceReport, Stint, TrackStatus, TrackStatusWindow, classification_is_official,
)
from tests.test_completed_record import client  # noqa: F401 — the API under test

YEAR = 2026
START = datetime(2026, 9, 6, 13, 0, tzinfo=timezone.utc)
LAP_S = 84.0


def _iso(dt):
    return dt.isoformat().replace("+00:00", "+00:00")


# --------------------------------------------------------------------------- #
# the field, and the providers' answers about it
# --------------------------------------------------------------------------- #
# number, code, first, last, team, colour, grid, position, gap (s | "+1 LAP" | None), points, laps, dnf, reason
ITALY_2026 = [
    (12, "ANT", "Kimi", "Antonelli", "Mercedes", "#27F4D2", 19, 1, 0, 25, 53, False, None),
    (63, "RUS", "George", "Russell", "Mercedes", "#27F4D2", 2, 2, 3.857, 18, 53, False, None),
    (1, "VER", "Max", "Verstappen", "Red Bull Racing", "#3671C6", 3, 3, 14.718, 15, 53, False, None),
    (4, "NOR", "Lando", "Norris", "McLaren", "#FF8000", 1, 4, 19.056, 12, 53, False, None),
    (81, "PIA", "Oscar", "Piastri", "McLaren", "#FF8000", 4, 5, 19.253, 10, 53, False, None),
    (44, "HAM", "Lewis", "Hamilton", "Ferrari", "#E8002D", 6, 6, 24.655, 8, 53, False, None),
    (10, "GAS", "Pierre", "Gasly", "Alpine", "#FF87BC", 8, 7, 27.351, 6, 53, False, None),
    (41, "LIN", "Arvid", "Lindblad", "Racing Bulls", "#6692FF", 9, 8, 45.136, 4, 53, False, None),
    (43, "COL", "Franco", "Colapinto", "Alpine", "#FF87BC", 11, 9, 47.353, 2, 53, False, None),
    (22, "TSU", "Yuki", "Tsunoda", "Racing Bulls", "#6692FF", 14, 10, 58.187, 1, 53, False, None),
    (5, "BOR", "Gabriel", "Bortoleto", "Audi", "#52E252", 10, 11, 65.187, 0, 53, False, None),
    (27, "HUL", "Nico", "Hülkenberg", "Audi", "#52E252", 12, 12, 66.187, 0, 53, False, None),
    (55, "SAI", "Carlos", "Sainz", "Williams", "#64C4FF", 7, 13, 74.117, 0, 53, False, None),
    (30, "LAW", "Liam", "Lawson", "Red Bull Racing", "#3671C6", 13, 14, 75.609, 0, 53, False, None),
    (87, "BEA", "Oliver", "Bearman", "Haas", "#B6BABD", 15, 15, 78.958, 0, 53, False, None),
    (31, "OCO", "Esteban", "Ocon", "Haas", "#B6BABD", 16, 16, "+1 LAP", 0, 52, False, None),
    (23, "ALB", "Alexander", "Albon", "Williams", "#64C4FF", 17, 17, "+1 LAP", 0, 52, False, None),
    (11, "PER", "Sergio", "Perez", "Cadillac", "#C0C0C0", 18, 18, "+1 LAP", 0, 52, False, None),
    (77, "BOT", "Valtteri", "Bottas", "Cadillac", "#C0C0C0", 20, 19, "+2 LAPS", 0, 51, False, None),
    (18, "STR", "Lance", "Stroll", "Aston Martin", "#229971", 21, None, None, 0, 29, True, "Hydraulics"),
    (14, "ALO", "Fernando", "Alonso", "Aston Martin", "#229971", 22, None, None, 0, 39, True, "Gearbox"),
    (16, "LEC", "Charles", "Leclerc", "Ferrari", "#E8002D", 5, None, None, 0, 1, True, "Accident"),
]

#: the race-control log as OpenF1 publishes it, in publication order
ITALY_2026_RACE_CONTROL = [
    dict(lap_number=1, category="Other", flag="GREEN", scope=None, message="GREEN LIGHT - PIT EXIT OPEN"),
    dict(lap_number=1, category="Other", flag=None, scope=None,
         message="TURN 1 INCIDENT INVOLVING CARS 16 (LEC) AND 44 (HAM) UNDER INVESTIGATION"),
    dict(lap_number=2, category="Other", flag=None, scope=None, message="CAR 16 (LEC) STOPPED AT TURN 1"),
    dict(lap_number=2, category="SafetyCar", flag=None, scope="Track", message="SAFETY CAR DEPLOYED"),
    dict(lap_number=3, category="Flag", flag="CLEAR", scope="Sector", message="CLEAR IN TRACK SECTOR 1"),
    dict(lap_number=3, category="Flag", flag="RED", scope="Track", message="RED FLAG"),
    dict(lap_number=3, category="Other", flag=None, scope=None,
         message="FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 16 (LEC) AND 44 (HAM) NOTED - CAUSING A COLLISION"),
    dict(lap_number=4, category="Other", flag="GREEN", scope=None, message="GREEN LIGHT - PIT EXIT OPEN"),
    dict(lap_number=4, category="SafetyCar", flag=None, scope="Track", message="SAFETY CAR DEPLOYED"),
    dict(lap_number=6, category="SafetyCar", flag=None, scope="Track", message="SAFETY CAR IN THIS LAP"),
    dict(lap_number=10, category="Other", flag=None, scope=None,
         message="FIA STEWARDS: CAR 10 (GAS) 5 SECOND TIME PENALTY - SAFETY CAR INFRINGEMENT"),
    dict(lap_number=30, category="Other", flag=None, scope=None, message="CAR 18 (STR) STOPPED AT TURN 4"),
    dict(lap_number=30, category="SafetyCar", flag=None, scope="Track", message="VIRTUAL SAFETY CAR DEPLOYED"),
    dict(lap_number=32, category="SafetyCar", flag=None, scope="Track", message="VIRTUAL SAFETY CAR ENDING"),
    dict(lap_number=40, category="Flag", flag="YELLOW", scope="Sector", message="YELLOW IN TRACK SECTOR 2"),
    dict(lap_number=40, category="Other", flag=None, scope=None, message="CAR 14 (ALO) STOPPED AT TURN 11"),
    dict(lap_number=40, category="Flag", flag="CLEAR", scope="Sector", message="CLEAR IN TRACK SECTOR 2"),
    dict(lap_number=53, category="Flag", flag="CHEQUERED", scope="Track", message="CHEQUERED FLAG"),
]


class RaceWorld:
    """A completed race as the providers answer it — OpenF1's eleven feeds, the
    results archive, the F1 archive — built from a roster and a log, counted."""

    def __init__(self, gp="Italian Grand Prix", roster=ITALY_2026, race_control=ITALY_2026_RACE_CONTROL,
                 laps=53, pit_lap=20, red_restart_lap=4, red_lap=3):
        self.gp, self.roster, self.rc, self.laps = gp, roster, race_control, laps
        self.pit_lap, self.red_restart_lap, self.red_lap = pit_lap, red_restart_lap, red_lap
        self.openf1_result = True
        self.openf1_grid = True
        self.openf1_pits = True            # the pit and stint feeds answer
        self.jolpica = True
        self.jolpica_pits = True
        self.jolpica_positions: dict[str, int] = {}
        self.calls: dict[str, int] = {}

    # ---- resolution ------------------------------------------------------
    def meta(self, year, gp, session_type):
        if year != YEAR or gp.lower() != self.gp.lower() or session_type != "Race":
            return None
        return {"session_key": 9999, "meeting_key": 1290, "session_name": "Race", "session_type": "Race",
                "meeting_name": self.gp, "circuit_short_name": "Monza", "location": "Monza",
                "country_name": "Italy", "_display_name": self.gp}

    def openf1_get(self, path, **params):
        self.calls[f"openf1.{path}"] = self.calls.get(f"openf1.{path}", 0) + 1
        return getattr(self, f"_ep_{path}")()

    def _done(self, code):
        return next(r[10] for r in self.roster if r[1] == code)

    def _running(self, lap):
        return [r for r in self.roster if r[10] >= lap]

    # ---- OpenF1 ----------------------------------------------------------
    def _ep_drivers(self):
        return [{"driver_number": n, "name_acronym": c, "full_name": f"{f} {l.upper()}",
                 "first_name": f, "last_name": l, "broadcast_name": f"{f[0]} {l.upper()}",
                 "team_name": t, "team_colour": col.lstrip("#"), "country_code": "XX", "headshot_url": None}
                for n, c, f, l, t, col, *_r in self.roster]

    def _ep_laps(self):
        rows = []
        for i, (n, code, *_r) in enumerate(self.roster):
            done = self._done(code)
            for k in range(1, done + 1):
                dur = None if (k == done and _r[9]) else LAP_S + i * 0.05 + (2.0 if k == 1 else 0)
                rows.append({"driver_number": n, "lap_number": k, "date_start": _iso(START + timedelta(seconds=(k - 1) * LAP_S)),
                             "lap_duration": dur, "is_pit_out_lap": k == self.pit_lap + 1,
                             "duration_sector_1": None, "duration_sector_2": None, "duration_sector_3": None})
        return rows

    def _ep_position(self):
        rows = []
        for k in range(1, self.laps + 1):
            order = sorted(self._running(k), key=lambda r: (r[7] is None, r[7] or 99))
            for pos, r in enumerate(order, start=1):
                rows.append({"driver_number": r[0], "date": _iso(START + timedelta(seconds=(k - 1) * LAP_S + 40)),
                             "position": pos})
        return rows

    def _ep_intervals(self):
        return []

    def _ep_stints(self):
        rows = []
        if not self.openf1_pits:
            return rows
        for n, code, *_r in self.roster:
            done = self._done(code)
            bounds = [1]
            if self.red_restart_lap and done >= self.red_restart_lap:
                bounds.append(self.red_restart_lap)          # tyres changed under the red flag
            if done > self.pit_lap:
                bounds.append(self.pit_lap + 1)
            bounds = sorted(set(bounds))
            for i, start in enumerate(bounds):
                end = (bounds[i + 1] - 1) if i + 1 < len(bounds) else done
                rows.append({"driver_number": n, "stint_number": i + 1, "compound": "MEDIUM" if i == 0 else "HARD",
                             "lap_start": start, "lap_end": end, "tyre_age_at_start": 0})
        return rows

    def _ep_pit(self):
        rows = []
        if not self.openf1_pits:
            return rows
        for i, (n, code, *_r) in enumerate(self.roster):
            done = self._done(code)
            if self.red_lap and done >= self.red_lap:
                # the feed logs the parked field as pit entries, twenty-odd minutes each
                rows.append({"driver_number": n, "lap_number": self.red_lap,
                             "date": _iso(START + timedelta(seconds=(self.red_lap - 1) * LAP_S + 30)),
                             "pit_duration": 1290.0 + i})
            if done > self.pit_lap:
                rows.append({"driver_number": n, "lap_number": self.pit_lap,
                             "date": _iso(START + timedelta(seconds=(self.pit_lap - 1) * LAP_S + 60)),
                             "pit_duration": 24.5 + i * 0.1})
        return rows

    def _ep_weather(self):
        return [{"date": _iso(START), "air_temperature": 32.0, "track_temperature": 53.0,
                 "humidity": 37, "rainfall": 0, "wind_speed": 0.6, "wind_direction": 90}]

    def _ep_race_control(self):
        return list(self.rc)

    def _ep_overtakes(self):
        return []

    def _ep_starting_grid(self):
        if not self.openf1_grid:
            return []
        return [{"driver_number": n, "position": g} for n, _c, _f, _l, _t, _col, g, *_r in self.roster]

    def _ep_session_result(self):
        if not self.openf1_result:
            return []
        return [{"driver_number": n, "position": pos, "dnf": dnf, "dns": False, "dsq": False,
                 "gap_to_leader": gap, "number_of_laps": laps, "points": pts}
                for n, _c, _f, _l, _t, _col, _g, pos, gap, pts, laps, dnf, _reason in self.roster]

    # ---- the results archive ---------------------------------------------
    def jolpica_classification(self, year, gp):
        self.calls["jolpica.results"] = self.calls.get("jolpica.results", 0) + 1
        if not self.jolpica or year != YEAR or gp.lower() != self.gp.lower():
            raise jolpica_adapter.JolpicaError("No results")
        drivers, rows = [], []
        total = self.laps * LAP_S
        for n, code, f, l, team, col, g, pos, gap, pts, laps, dnf, reason in self.roster:
            pos = self.jolpica_positions.get(code, pos)
            name = f"{f} {l}"
            drivers.append(Driver(number=str(n), code=code, name=name, team=team, team_color=col, grid=g))
            lead_lap = not dnf and isinstance(gap, (int, float))
            rows.append(ClassificationRow(
                position=pos, driver=code, name=name, team=team, team_color=col, grid=g,
                laps_completed=laps, status=("DNF" if dnf else "Finished" if lead_lap else str(gap).title()),
                gap=(None if dnf or pos == 1 else (f"+{gap:.3f}s" if lead_lap else str(gap).title())),
                race_time=(total + gap) if lead_lap else None, points=float(pts), retired=dnf,
                retirement_reason=reason, retirement_source=("jolpica" if dnf else None)))
        return drivers, rows, {"round": 16, "raceName": self.gp}

    def jolpica_pitstops(self, year, gp):
        self.calls["jolpica.pitstops"] = self.calls.get("jolpica.pitstops", 0) + 1
        if not (self.jolpica and self.jolpica_pits) or year != YEAR or gp.lower() != self.gp.lower():
            raise jolpica_adapter.JolpicaError("No pit stops")
        return [PitStop(driver=code, lap=self.pit_lap, pit_lane_time=24.5 + i * 0.1, source="jolpica",
                        confidence="medium")
                for i, (_n, code, *_r) in enumerate(self.roster) if self._done(code) > self.pit_lap]

    def archive_session(self, year, gp, session_type):
        self.calls["archive"] = self.calls.get("archive", 0) + 1
        raise fastf1.FetchError("No such session in the archive")


@pytest.fixture
def world(monkeypatch, tmp_path):
    settings = get_settings()
    saved = (settings.cache_dir, settings.mock_mode, settings.enable_live_fetch)
    settings.cache_dir, settings.mock_mode, settings.enable_live_fetch = tmp_path, False, True
    upstream.cache_clear()
    monkeypatch.setattr(dsm, "_archive_breaker", dsm._Breaker(threshold=2, cooldown=600.0))
    monkeypatch.setattr(headshots, "enrich", lambda s: False)

    def make(**kw) -> RaceWorld:
        race = RaceWorld(**kw)
        monkeypatch.setattr(openf1_adapter, "_resolve_session", race.meta)
        monkeypatch.setattr(openf1_adapter, "_get", race.openf1_get)
        monkeypatch.setattr(jolpica_adapter, "fetch_classification", race.jolpica_classification)
        monkeypatch.setattr(jolpica_adapter, "fetch_pitstops", race.jolpica_pitstops)
        monkeypatch.setattr(jolpica_adapter, "fetch_laps", lambda y, g: ([], []))
        monkeypatch.setattr(fastf1, "fetch_session", race.archive_session)
        return race
    yield make
    settings.cache_dir, settings.mock_mode, settings.enable_live_fetch = saved
    upstream.cache_clear()


def load(gp="Italian Grand Prix", refresh=False):
    return dsm.load_session(YEAR, gp, "Race", refresh=refresh)


def by_code(session):
    return {c.driver: c for c in session.classification}


def windows_of(session):
    return [(w.status, w.start_lap, w.end_lap) for w in session.track_status_windows]


def text_of(strategy) -> str:
    return " ".join(strategy.story + strategy.story_advanced
                    + [i.detail for i in strategy.turning_points] + [i.detail for i in strategy.insights])


# --------------------------------------------------------------------------- #
# THE ITALIAN GRAND PRIX, FORENSICALLY
# --------------------------------------------------------------------------- #
def test_italian_grand_prix_2026_classification_is_the_official_one(world):
    """Production's path: OpenF1's result published, its grid feed empty, the
    results archive available. Every official fact lands where it belongs."""
    race = world()
    race.openf1_grid = False
    s = load()
    rows = by_code(s)
    assert s.settled is True and s.complete is True
    assert rows["ANT"].position == 1 and rows["ANT"].grid == 19 and rows["ANT"].name == "Kimi Antonelli"
    assert rows["RUS"].position == 2 and rows["RUS"].gap == "+3.857s"
    assert rows["LEC"].retired and rows["LEC"].position is None and rows["LEC"].laps_completed == 1
    assert rows["LEC"].retirement_reason == "Accident"
    assert rows["STR"].retired and rows["ALO"].retired
    assert sum(1 for c in s.classification if c.retired) == 3
    assert [c.name for c in s.classification][:3] == ["Kimi Antonelli", "George Russell", "Max Verstappen"]
    assert all(c.grid is not None for c in s.classification)
    assert rows["HUL"].name == "Nico Hülkenberg"
    assert s.source_report.awaiting == [] and s.source_report.conflicts == []


def test_italian_grand_prix_2026_neutralisations_are_the_logs_own(world):
    """One Safety Car after Leclerc stopped, a red flag, a restart Safety Car,
    a VSC when Stroll stopped — four windows, three kinds, and not one of
    them captioned with a cause the log never stated."""
    world()
    s = load()
    assert windows_of(s) == [(TrackStatus.SAFETY_CAR, 2, 3), (TrackStatus.RED, 3, 4),
                             (TrackStatus.SAFETY_CAR, 4, 6), (TrackStatus.VSC, 30, 32)]
    assert all(w.source == "race_control" and w.end_known for w in s.track_status_windows)
    sc1, red, sc2, vsc = s.track_status_windows
    assert all(w.cause is None and w.cause_source is None for w in s.track_status_windows)
    # what the log holds beside each window — the FIA's own cars, nothing more
    assert [(i.kind, i.drivers, i.lap) for i in sc1.incidents] == [("stopped", ["LEC"], 2)]
    assert sc2.incidents == [], "the restart Safety Car is not captioned with the lap-1 incident"
    assert [(i.kind, i.drivers) for i in vsc.incidents] == [("stopped", ["STR"])]
    assert "HAM" not in {d for w in s.track_status_windows for i in w.incidents for d in i.drivers}
    # the lines that used to produce false windows produce nothing
    assert [e.status for e in s.race_control if "INFRINGEMENT" in e.message] == [None]
    assert [e.status for e in s.race_control if e.message == "SAFETY CAR DEPLOYED"] == [TrackStatus.SAFETY_CAR] * 2


def test_italian_grand_prix_2026_story_says_only_what_the_record_supports(world):
    world()
    s = load()
    strategy, pace = analyze(s)
    text = text_of(strategy)
    assert "Kimi Antonelli won the Italian Grand Prix from P19" in text
    assert "won from P19 by +3.857s" in text
    assert "collid" not in text.lower() and "Hamilton" not in " ".join(i.detail for i in strategy.turning_points)
    assert "Brought out when" not in text
    tps = {i.title: i.detail for i in strategy.turning_points}
    assert "Race control logged Charles Leclerc stopped on track (lap 2) in these laps" in tps["Safety Car (laps 2-3)"]
    assert "does not state what triggered the safety car" in tps["Safety Car (laps 2-3)"]
    assert "didn't record what triggered it" in tps["Safety Car (laps 4-6)"]
    assert "Race stopped — red flag — from lap 3 to 4" in tps["Red Flag (laps 3-4)"]
    assert "not counted as one" in tps["Red Flag (laps 3-4)"]
    assert "Lance Stroll stopped on track (lap 30)" in tps["Virtual Safety Car (laps 30-32)"]
    # the facts every client reads
    f = strategy.facts
    assert (f.winner, f.winner_grid, f.runner_up, f.margin, f.margin_s) == ("ANT", 19, "RUS", "+3.857s", 3.857)
    assert (f.entries, f.finishers, f.retirements) == (22, 19, 3)
    assert (f.neutralizations.safety_cars, f.neutralizations.virtual_safety_cars,
            f.neutralizations.red_flags, f.neutralizations.total, f.neutralizations.local_yellows) == (2, 1, 1, 4, 1)
    assert f.neutralizations.source == "race_control"
    assert f.fastest_lap_driver == "ANT" and f.fastest_lap == pytest.approx(LAP_S, abs=0.2)
    ranked = sorted((p for p in pace if p.pace_rank), key=lambda p: p.pace_rank)
    assert f.best_pace_driver == ranked[0].driver
    assert f.best_pace_gap == ranked[1].gap_to_best == round(ranked[1].clean_air_pace - ranked[0].clean_air_pace, 3)


def test_italian_grand_prix_2026_pit_semantics(world):
    """Every finisher stopped once on lap 20. The tyre change under the red
    flag is not a second stop, the twenty-minute stay in the pit lane is not a
    pit loss, and the lane time is not a stationary time."""
    world()
    s = load()
    strategy, _ = analyze(s)
    assert strategy.pit_counts["ANT"] == 1 and strategy.pit_counts["RUS"] == 1
    assert strategy.pit_counts["LEC"] == 0 and strategy.pit_counts["STR"] == 1
    assert all(p.lap == 20 for p in s.pit_stops), "the parked field is not a list of pit stops"
    assert 20 < strategy.avg_pit_loss < 30 and strategy.avg_pit_loss_kind == "measured"
    assert strategy.best_pit_timing["lane_s"] and strategy.best_pit_timing["stationary_s"] is None
    assert not any(p.under_safety_car or p.under_vsc for p in s.pit_stops)
    assert "2-stop" not in " ".join(strategy.story)


# --------------------------------------------------------------------------- #
# THE RULES, ONE AT A TIME
# --------------------------------------------------------------------------- #
def rc(lap, message, category="SafetyCar", flag=None, scope=None):
    return RaceControlEvent(lap=lap, category=category, flag=flag, scope=scope, message=message)


def test_a_stewards_decision_about_the_safety_car_is_not_a_safety_car():
    ws = neu.windows_from_race_control([
        rc(10, "FIA STEWARDS: CAR 10 (GAS) 5 SECOND TIME PENALTY - SAFETY CAR INFRINGEMENT", category="Other"),
        rc(12, "CAR 1 (VER) SAFETY CAR RESTART INFRINGEMENT - UNDER INVESTIGATION", category="Other"),
    ])
    assert ws == []


def test_a_sector_clear_does_not_end_a_safety_car():
    ws = neu.windows_from_race_control([
        rc(3, "SAFETY CAR DEPLOYED"),
        rc(3, "CLEAR IN TRACK SECTOR 5", category="Flag", flag="CLEAR", scope="Sector"),
        rc(4, "CLEAR IN TRACK SECTOR 6", category="Flag", flag="CLEAR", scope="Sector"),
        rc(6, "SAFETY CAR IN THIS LAP"),
    ])
    assert [(w.status, w.start_lap, w.end_lap) for w in ws] == [(TrackStatus.SAFETY_CAR, 3, 6)]


def test_vsc_is_not_upgraded_to_a_safety_car_and_sc_is_not_a_vsc():
    ws = neu.windows_from_race_control([
        rc(8, "VIRTUAL SAFETY CAR DEPLOYED"), rc(10, "VIRTUAL SAFETY CAR ENDING"),
        rc(20, "SAFETY CAR DEPLOYED"), rc(23, "SAFETY CAR IN THIS LAP"),
    ])
    assert [(w.status, w.start_lap, w.end_lap) for w in ws] == \
        [(TrackStatus.VSC, 8, 10), (TrackStatus.SAFETY_CAR, 20, 23)]
    # a VSC ending line cannot close a Safety Car, and vice versa
    ws = neu.windows_from_race_control([rc(20, "SAFETY CAR DEPLOYED"), rc(22, "VIRTUAL SAFETY CAR ENDING")])
    assert [(w.status, w.end_known) for w in ws] == [(TrackStatus.SAFETY_CAR, False)]


def test_a_red_flag_is_its_own_window_and_closes_what_was_open():
    ws = neu.windows_from_race_control([
        rc(2, "SAFETY CAR DEPLOYED"),
        rc(3, "RED FLAG", category="Flag", flag="RED", scope="Track"),
        rc(3, "GREEN LIGHT - PIT EXIT OPEN", category="Other", flag="GREEN"),
        rc(5, "SAFETY CAR DEPLOYED"),
        rc(7, "SAFETY CAR IN THIS LAP"),
    ])
    assert [(w.status, w.start_lap, w.end_lap) for w in ws] == \
        [(TrackStatus.SAFETY_CAR, 2, 3), (TrackStatus.RED, 3, 5), (TrackStatus.SAFETY_CAR, 5, 7)]
    # a stoppage the log never resumes says so
    ws = neu.windows_from_race_control([rc(30, "RED FLAG", category="Flag", flag="RED"), rc(30, "DRS DISABLED", category="Drs")])
    assert [(w.status, w.end_known) for w in ws] == [(TrackStatus.RED, False)]


def test_an_incident_without_a_neutralisation_creates_no_window():
    events = [rc(40, "YELLOW IN TRACK SECTOR 2", category="Flag", flag="YELLOW", scope="Sector"),
              rc(40, "CAR 14 (ALO) STOPPED AT TURN 11", category="Other"),
              rc(40, "CARS 4 (NOR) AND 1 (VER) CONTACT AT TURN 4", category="Other"),
              rc(41, "CLEAR IN TRACK SECTOR 2", category="Flag", flag="CLEAR", scope="Sector")]
    assert neu.windows_from_race_control(events) == []
    assert neu.local_yellows(events) == 1
    inc = [neu.incident_of(e) for e in events]
    assert [(i.kind, i.drivers) for i in inc if i] == [("stopped", ["ALO"]), ("collision", ["NOR", "VER"])]


def test_a_neutralisation_without_a_stated_cause_has_none(world):
    race = world(race_control=[
        dict(lap_number=12, category="SafetyCar", flag=None, scope="Track", message="VIRTUAL SAFETY CAR DEPLOYED"),
        dict(lap_number=14, category="SafetyCar", flag=None, scope="Track", message="VIRTUAL SAFETY CAR ENDING"),
    ], red_restart_lap=None, red_lap=None)
    s = load()
    assert windows_of(s) == [(TrackStatus.VSC, 12, 14)]
    w = s.track_status_windows[0]
    assert w.cause is None and w.incidents == []
    strategy, _ = analyze(s)
    assert "didn't record what triggered it" in strategy.turning_points[0].detail
    assert "Brought out when" not in text_of(strategy)
    # STR retired on lap 29 with no window near it: no window is attributed to it either
    assert not any(inc.drivers for w in s.track_status_windows for inc in w.incidents)


def test_a_cause_needs_the_deployment_line_to_state_it():
    s = RaceSession(year=YEAR, grand_prix="Anywhere", session_type="Race", category="race",
                    drivers=[Driver(number="16", code="LEC", name="Charles Leclerc", team="Ferrari")],
                    race_control=[rc(2, "CAR 16 (LEC) STOPPED AT TURN 1", category="Other"),
                                  rc(2, "SAFETY CAR DEPLOYED"), rc(5, "SAFETY CAR IN THIS LAP")],
                    track_status_windows=[TrackStatusWindow(status=TrackStatus.SAFETY_CAR, start_lap=2, end_lap=5)])
    neu.attach_incidents(s)
    w = s.track_status_windows[0]
    assert w.cause is None and [i.drivers for i in w.incidents] == [["LEC"]]
    assert neu.logged_alongside(s, w) == "Charles Leclerc stopped on track (lap 2)"
    s.race_control[1] = rc(2, "SAFETY CAR DEPLOYED - CAR 16 (LEC) STOPPED AT TURN 1")
    neu.attach_incidents(s)
    assert w.cause == "Charles Leclerc stopped on track" and w.cause_source == "race_control"
    assert w.cause_message == "SAFETY CAR DEPLOYED - CAR 16 (LEC) STOPPED AT TURN 1"


def test_windows_from_the_timing_systems_own_status_codes():
    """The archive route: every lap carries the status code the timing system
    published. A local yellow is not a window; the three neutralising
    statuses are, with their provenance."""
    laps = [Lap(driver="VER", lap=k, lap_time=90.0, position=1,
                track_status=(TrackStatus.YELLOW if k == 5 else TrackStatus.SAFETY_CAR if 20 <= k <= 23
                              else TrackStatus.RED if k == 30 else TrackStatus.VSC if 40 <= k <= 41
                              else TrackStatus.GREEN))
            for k in range(1, 51)]
    ws = neu.windows_from_laps(laps)
    assert [(w.status, w.start_lap, w.end_lap, w.source) for w in ws] == [
        (TrackStatus.SAFETY_CAR, 20, 23, "track_status"), (TrackStatus.RED, 30, 30, "track_status"),
        (TrackStatus.VSC, 40, 41, "track_status")]


def test_archive_records_take_windows_from_log_and_codes_together():
    """A coded lap the log did not pair (the lap-1 Safety Car whose line
    predates the first lap stamp) is added from the codes; a window the log
    paired is not duplicated by the codes."""
    laps = [Lap(driver="VER", lap=k, lap_time=90.0, position=1,
                track_status=(TrackStatus.SAFETY_CAR if k in (1, 2) or 20 <= k <= 23 else TrackStatus.GREEN))
            for k in range(1, 51)]
    s = RaceSession(year=2021, grand_prix="Anywhere", session_type="Race", category="race", total_laps=50,
                    source_report=SourceReport(facets=[FacetSource(facet="laps", source="f1-archive")]),
                    laps=laps, race_control=[rc(20, "SAFETY CAR DEPLOYED"), rc(23, "SAFETY CAR IN THIS LAP")])
    dsm._finalize_session(s)
    assert [(w.status, w.start_lap, w.end_lap, w.source) for w in s.track_status_windows] == [
        (TrackStatus.SAFETY_CAR, 1, 2, "track_status"), (TrackStatus.SAFETY_CAR, 20, 23, "race_control")]
    assert s.laps[0].track_status == TrackStatus.SAFETY_CAR, "the archive's own codes are not rewritten"


def test_cached_windows_from_an_older_builder_are_rebuilt_on_read(world):
    """The record production held: two Safety Cars, one of them a single lap,
    both captioned with a collision, no red flag, no VSC. Read by this build
    it is rebuilt from its own log, and the file is put right once."""
    world()
    s = load()
    s.track_status_windows = [
        TrackStatusWindow(status=TrackStatus.SAFETY_CAR, start_lap=3, end_lap=3, label="Safety Car",
                          cause="Charles Leclerc and Lewis Hamilton collided"),
        TrackStatusWindow(status=TrackStatus.SAFETY_CAR, start_lap=4, end_lap=6, label="Safety Car",
                          cause="Charles Leclerc and Lewis Hamilton collided")]
    for lp in s.laps:
        lp.track_status = TrackStatus.SAFETY_CAR if 3 <= lp.lap <= 6 else TrackStatus.GREEN
    cache.save(s)
    healed = load()
    assert windows_of(healed) == [(TrackStatus.SAFETY_CAR, 2, 3), (TrackStatus.RED, 3, 4),
                                  (TrackStatus.SAFETY_CAR, 4, 6), (TrackStatus.VSC, 30, 32)]
    assert all(w.cause is None for w in healed.track_status_windows)
    assert {lp.track_status for lp in healed.laps if lp.lap == 31} == {TrackStatus.VSC}
    assert {lp.track_status for lp in healed.laps if lp.lap == 3} == {TrackStatus.RED}
    on_disk = cache.load(YEAR, "Italian Grand Prix", "Race")
    assert windows_of(on_disk) == windows_of(healed), "written back once"


def test_provider_disagreement_is_recorded_not_resolved(world):
    """OpenF1's result has Verstappen P3 and Norris P4; the archive has them
    the other way round. The settling source's positions stand, nothing
    position-dependent is taken from the other, the grid (a per-car fact)
    still is — and the disagreement is on the record for anyone to see."""
    race = world()
    race.openf1_grid = False
    race.jolpica_positions = {"VER": 4, "NOR": 3}
    s = load()
    rows = by_code(s)
    assert rows["VER"].position == 3 and rows["NOR"].position == 4
    assert rows["VER"].gap == "+14.718s" and rows["NOR"].gap == "+19.056s", "OpenF1's own gaps, untouched"
    assert rows["VER"].grid == 3 and rows["NOR"].grid == 1, "the grid is a fact about the car"
    assert sorted(s.source_report.conflicts) == ["position NOR: held=4 jolpica=3", "position VER: held=3 jolpica=4"]
    assert s.settled is True


def test_missing_data_stays_missing(world):
    """OpenF1's grid feed empty and the results archive down: the grid is
    unknown, the story does not say where anyone started, the winner card has
    no grid — and nothing else is withheld to make it look consistent."""
    race = world()
    race.openf1_grid = False
    race.jolpica = False
    s = load()
    assert all(c.grid is None for c in s.classification)
    assert s.settled is True
    assert s.source_report.awaiting == ["grid", "race_time", "retirement_reason"]
    strategy, _ = analyze(s)
    f = strategy.facts
    assert f.winner == "ANT" and f.winner_grid is None and f.margin == "+3.857s"
    assert (f.finishers, f.retirements) == (19, 3)
    text = text_of(strategy)
    assert " from P" not in text and "P?" not in text and "from pole" not in text
    assert strategy.biggest_gainers == [] and strategy.biggest_losers == []


def test_a_provisional_record_counts_nothing_it_cannot_know(world):
    race = world()
    race.openf1_result = False
    race.jolpica = False
    s = load()
    assert s.settled is False
    strategy, _ = analyze(s)
    f = strategy.facts
    assert f.settled is False and f.finishers is None and f.retirements is None and f.margin is None
    assert f.winner == "ANT", "a running order does say who was in front"
    assert f.neutralizations.total == 4, "the log is the log, whatever the result's state"
    assert all(c.status == PROVISIONAL_STATUS for c in s.classification)


def test_a_missing_status_is_not_finished():
    assert ClassificationRow(driver="VER", name="Max Verstappen", team="Red Bull Racing").status == PROVISIONAL_STATUS
    _drv, row = jolpica_adapter._driver_from({"Driver": {"code": "VER", "givenName": "Max", "familyName": "Verstappen"},
                                             "Constructor": {"name": "Red Bull Racing"}, "position": "1", "grid": "1"})
    assert row.status == PROVISIONAL_STATUS and row.retired is False
    assert classification_is_official([row]) is False
    _drv, row = jolpica_adapter._driver_from({"Driver": {"code": "VER", "givenName": "Max", "familyName": "Verstappen"},
                                             "Constructor": {"name": "Red Bull Racing"}, "position": "1",
                                             "status": "Finished", "points": "25", "grid": "1"})
    assert row.status == "Finished" and classification_is_official([row]) is True


def test_missing_pit_data_is_unknown_not_zero(world):
    race = world()
    race.openf1_pits = False
    race.jolpica_pits = False
    s = load()
    strategy, _ = analyze(s)
    assert s.pit_data_reliable is False and strategy.facts.pit_data_reliable is False
    assert strategy.avg_pit_loss is None and strategy.best_pit_timing is None
    assert "-stop" not in " ".join(strategy.story), "no stop count is claimed"


def test_settled_is_decided_per_session_type():
    def finalized(category, session_type, rows, facets, drivers=True):
        s = RaceSession(year=YEAR, grand_prix="Anywhere", session_type=session_type, category=category,
                        source_report=SourceReport(facets=facets),
                        drivers=([Driver(number="1", code="VER", name="Max Verstappen", team="Red Bull Racing")]
                                 if drivers else []),
                        classification=rows,
                        laps=[Lap(driver="VER", lap=1, lap_time=95.0, position=1)])
        dsm._finalize_session(s)
        return s
    def ok():
        return [FacetSource(facet="results", source="openf1"), FacetSource(facet="drivers", source="openf1"),
                FacetSource(facet="laps", source="openf1")]

    def running():
        return [ClassificationRow(position=1, driver="VER", name="Max Verstappen", team="Red Bull Racing")]

    def official():
        return [ClassificationRow(position=1, driver="VER", name="Max Verstappen", team="Red Bull Racing",
                                  status="Finished", points=25.0)]
    # a race: rows with positions are not a result until a field only a result carries is present
    assert finalized("race", "Race", running(), ok()).settled is False
    assert finalized("race", "Race", official(), ok()).settled is True
    # a sprint: the same rule
    assert finalized("sprint", "Sprint", running(), ok()).settled is False
    # qualifying: the adapter's own word decides (a running order is flagged), positions do not
    quali = [FacetSource(facet="results", source="openf1", provisional=True), FacetSource(facet="drivers", source="openf1")]
    assert finalized("qualifying", "Qualifying", running(), quali).settled is False
    assert finalized("qualifying", "Qualifying", running(), ok()).settled is True
    # practice has no result to settle; the entry list is what it needs
    assert finalized("practice", "Practice 1", [], [FacetSource(facet="drivers", source="openf1")]).settled is True
    assert finalized("practice", "Practice 1", [], [], drivers=False).complete is False


def test_both_clients_receive_one_set_of_facts(world, monkeypatch):
    """The website and the app read `strategy.facts` and `pace[].gap_to_best`
    from the same JSON; the landing page's headline reads the same facts."""
    from app import main, service
    monkeypatch.setattr(main.service, "get_grands_prix", lambda year: (_ for _ in ()).throw(RuntimeError("no calendar")))
    world()
    body = client.get("/api/session", params={"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"}).json()
    facts = body["strategy"]["facts"]
    assert facts["winner_grid"] == 19 and facts["margin"] == "+3.857s" and facts["finishers"] == 19
    assert facts["neutralizations"] == {"safety_cars": 2, "virtual_safety_cars": 1, "red_flags": 1,
                                        "total": 4, "local_yellows": 1, "source": "race_control"}
    ranked = sorted((p for p in body["pace"] if p["pace_rank"]), key=lambda p: p["pace_rank"])
    assert facts["best_pace_gap"] == ranked[1]["gap_to_best"]
    assert ranked[0]["gap_to_best"] == 0.0
    wins = body["session"]["track_status_windows"]
    assert [(w["status"], w["start_lap"], w["end_lap"], w["source"], w["cause"]) for w in wins] == [
        ("SAFETY_CAR", 2, 3, "race_control", None), ("RED", 3, 4, "race_control", None),
        ("SAFETY_CAR", 4, 6, "race_control", None), ("VSC", 30, 32, "race_control", None)]
    assert wins[0]["incidents"][0]["drivers"] == ["LEC"] and wins[2]["incidents"] == []

    session = service.get_session(YEAR, "Italian Grand Prix", "Race")
    monkeypatch.setattr(service, "get_current", lambda: {"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"})
    monkeypatch.setattr(service, "get_session", lambda *a, **kw: session)
    feat = client.get("/api/featured").json()
    assert feat["winner"]["grid"] == 19 and feat["margin"] == "+3.857s" and feat["finishers"] == 19


def test_a_qualifying_red_flag_states_its_own_cause_or_none():
    """The red-flag line itself may say why the session stopped; a line
    logged beside it is reported as logged, never promoted into the cause."""
    from app.analysis.qualifying import _interruptions
    drivers = [Driver(number="22", code="BEA", name="Oliver Bearman", team="Haas"),
               Driver(number="4", code="NOR", name="Lando Norris", team="McLaren")]
    stated = RaceSession(year=YEAR, grand_prix="Anywhere", session_type="Qualifying", category="qualifying",
                         drivers=drivers, race_control=[
                             rc(None, "RED FLAG - CAR 22 (BEA) STOPPED AT TURN 6", category="Flag", flag="RED")])
    [it] = _interruptions(stated)
    assert (it["driver"], it["driver_name"], it["cause"], it["turn"]) == ("BEA", "Oliver Bearman", "stopped on track", "Turn 6")
    assert it["logged"] is None
    nearby = RaceSession(year=YEAR, grand_prix="Anywhere", session_type="Qualifying", category="qualifying",
                         drivers=drivers, race_control=[
                             rc(12, "CAR 4 (NOR) CRASHED AT TURN 9", category="Other"),
                             rc(12, "RED FLAG", category="Flag", flag="RED")])
    [it] = _interruptions(nearby)
    assert it["cause"] is None and it["driver"] is None, "the red-flag line said nothing"
    assert (it["logged"], it["logged_driver"], it["logged_driver_name"]) == ("crashed", "NOR", "Lando Norris")
    assert it["logged_message"] == "CAR 4 (NOR) CRASHED AT TURN 9"
    bare = RaceSession(year=YEAR, grand_prix="Anywhere", session_type="Qualifying", category="qualifying",
                       drivers=drivers, race_control=[
                           rc(12, "CAR 4 (NOR) NOTED - TRACK LIMITS AT TURN 9", category="Other"),
                           rc(12, "RED FLAG", category="Flag", flag="RED")])
    [it] = _interruptions(bare)
    assert it["cause"] is None and it["logged"] is None, "a track-limits note is not an incident"


def test_names_are_canonical_from_every_provider_shape():
    assert canonical_name("Kimi ANTONELLI") == "Kimi Antonelli"
    assert canonical_name("Nyck DE VRIES") == "Nyck de Vries"
    assert canonical_name("Kimi Antonelli") == "Kimi Antonelli"
    d = openf1_adapter._driver_name({"full_name": "Kimi ANTONELLI"}, "ANT")
    assert d == "Kimi Antonelli"
    assert openf1_adapter._driver_name({"first_name": "Kimi", "last_name": "Antonelli", "full_name": "Kimi ANTONELLI"}, "ANT") == "Kimi Antonelli"
    assert openf1_adapter._driver_name({}, "ANT") == "ANT"
