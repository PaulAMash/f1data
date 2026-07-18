"""
Deterministic race simulator that produces a *realistic* normalized RaceSession.

Why simulate instead of hand-writing numbers? A race intelligence app is only as
good as the internal consistency of its data: positions must follow from lap
times, gaps must follow from positions, undercuts must actually work out in the
maths. So we model pace + tyre degradation + fuel burn + pit loss + a VSC window
and let positions/gaps/stints fall out of the physics. The result is a dataset
the analysis engine can be genuinely tested against.

The scripted 2026 Austrian GP tells the demo story the product is built around:
  * LEC starts P2 with strong pace but Ferrari commits to a 3-stop and he loses
    track position to 2-stoppers -> the "hidden pace / strategy mistake" driver.
  * VER protects track position on a clean 2-stop and wins.
  * PIA and RUS pit under a VSC window (laps 34-37) and gain cheap time.
  * HAM runs a short middle stint that forces a long final hard stint.

This module is deterministic (fixed seed) so the demo is identical every run.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..models import (
    ClassificationRow,
    Circuit,
    Compound,
    Constructor,
    DataSource,
    Driver,
    Lap,
    PitStop,
    PositionPoint,
    RaceControlEvent,
    RaceSession,
    Stint,
    TrackStatus,
    TrackStatusWindow,
    WeatherPoint,
    session_category,
)

# --------------------------------------------------------------------------- #
# Static reference — 2026 grid (subset, ordered by grid position)
# --------------------------------------------------------------------------- #
TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "McLaren": "#FF8000",
    "Mercedes": "#27F4D2",
    "Aston Martin": "#229971",
    "Williams": "#64C4FF",
    "Alpine": "#FF87BC",
    "Haas F1 Team": "#B6BABD",
    "Kick Sauber": "#52E252",
    "Racing Bulls": "#6692FF",
}


@dataclass
class Plan:
    number: str
    code: str
    name: str
    team: str
    grid: int
    base_pace: float                     # reference clean lap in seconds (lower = faster)
    stints: list[tuple[str, int]]        # (compound, pit-in lap) ; last pit-in lap == total_laps
    country: str = ""
    dnf_lap: int | None = None
    dnf_reason: str = ""


TOTAL_LAPS = 71
BASE_LAP = 65.5           # green, full-tank reference at Red Bull Ring
FUEL_GAIN = 0.055         # seconds/lap the car gets faster as fuel burns
PIT_LOSS_GREEN = 20.6     # net pit-lane time loss under green
PIT_LOSS_VSC = 10.2       # net pit-lane loss when the field is slowed (cheap stop)
VSC_LAP_PENALTY = 17.5    # extra time per lap for a car circulating under VSC
VSC_START, VSC_END = 34, 37

COMPOUND_OFFSET = {
    Compound.SOFT: -0.45,
    Compound.MEDIUM: 0.0,
    Compound.HARD: 0.35,
}
COMPOUND_DEG = {           # seconds/lap added per lap of tyre age
    Compound.SOFT: 0.075,
    Compound.MEDIUM: 0.044,
    Compound.HARD: 0.027,
}


def _c(s: str) -> Compound:
    return Compound(s)


# Scripted field. Stints are (compound, pit-in lap). The final tuple's lap is the
# flag lap (TOTAL_LAPS). Pit laps chosen to produce the story described above.
PLANS: list[Plan] = [
    Plan("1", "VER", "Max Verstappen", "Red Bull Racing", 1, 65.30,
         [("MEDIUM", 25), ("HARD", 49), ("HARD", TOTAL_LAPS)], "Netherlands"),
    Plan("16", "LEC", "Charles Leclerc", "Ferrari", 2, 65.42,
         # 3-stop: strong pace wasted; his lap-50 green stop is the expensive one.
         [("SOFT", 16), ("MEDIUM", 32), ("HARD", 50), ("MEDIUM", TOTAL_LAPS)], "Monaco"),
    Plan("4", "NOR", "Lando Norris", "McLaren", 3, 65.40,
         [("MEDIUM", 23), ("HARD", 49), ("SOFT", TOTAL_LAPS)], "United Kingdom"),
    Plan("81", "PIA", "Oscar Piastri", "McLaren", 4, 65.53,
         # pits under the VSC window (lap 35) -> cheap stop, big net gain.
         [("SOFT", 15), ("MEDIUM", 35), ("HARD", TOTAL_LAPS)], "Australia"),
    Plan("63", "RUS", "George Russell", "Mercedes", 5, 65.70,
         # also converts the VSC window (lap 35).
         [("MEDIUM", 18), ("HARD", 35), ("MEDIUM", TOTAL_LAPS)], "United Kingdom"),
    Plan("44", "HAM", "Lewis Hamilton", "Ferrari", 6, 65.62,
         # short middle stint (soft, only 12 laps) forces a 41-lap final hard run.
         [("MEDIUM", 18), ("SOFT", 30), ("HARD", TOTAL_LAPS)], "United Kingdom"),
    Plan("12", "ANT", "Andrea Kimi Antonelli", "Mercedes", 7, 65.98,
         [("MEDIUM", 22), ("HARD", 48), ("MEDIUM", TOTAL_LAPS)], "Italy"),
    Plan("55", "SAI", "Carlos Sainz", "Williams", 8, 66.10,
         # aggressive 1-stop overcut play: long medium then hard to the flag.
         [("MEDIUM", 33), ("HARD", TOTAL_LAPS)], "Spain"),
    Plan("14", "ALO", "Fernando Alonso", "Aston Martin", 9, 66.16,
         [("MEDIUM", 20), ("HARD", 46), ("MEDIUM", TOTAL_LAPS)], "Spain"),
    Plan("10", "GAS", "Pierre Gasly", "Alpine", 10, 66.42,
         [("SOFT", 17), ("MEDIUM", 40), ("HARD", TOTAL_LAPS)], "France"),
    Plan("23", "ALB", "Alexander Albon", "Williams", 11, 66.34,
         [("MEDIUM", 24), ("HARD", TOTAL_LAPS)], "Thailand"),
    Plan("27", "HUL", "Nico Hulkenberg", "Kick Sauber", 12, 66.55,
         [("HARD", 30), ("MEDIUM", TOTAL_LAPS)], "Germany"),
    Plan("31", "OCO", "Esteban Ocon", "Haas F1 Team", 13, 66.60,
         [("MEDIUM", 26), ("HARD", TOTAL_LAPS)], "France"),
    Plan("30", "LAW", "Liam Lawson", "Racing Bulls", 14, 66.70,
         [("SOFT", 19), ("MEDIUM", 44), ("HARD", TOTAL_LAPS)], "New Zealand"),
    Plan("6", "HAD", "Isack Hadjar", "Racing Bulls", 15, 66.76,
         [("MEDIUM", 28), ("HARD", TOTAL_LAPS)], "France"),
    Plan("18", "STR", "Lance Stroll", "Aston Martin", 16, 66.85,
         [("MEDIUM", TOTAL_LAPS)], "Canada", dnf_lap=41, dnf_reason="Power unit"),
]


def _stint_at(plan: Plan, lap: int) -> tuple[int, Compound, int, bool]:
    """Return (stint_index, compound, tyre_age, is_out_lap) for a given lap."""
    start = 1
    for idx, (comp, pit_lap) in enumerate(plan.stints, start=1):
        end = pit_lap
        if lap <= end:
            age = lap - start + 1
            return idx, _c(comp), age, (lap == start and idx > 1)
        start = end + 1
    # Past the final flag lap — clamp to last stint.
    comp = plan.stints[-1][0]
    return len(plan.stints), _c(comp), lap, False


def _pit_laps(plan: Plan) -> list[int]:
    return [pl for (_, pl) in plan.stints[:-1]]


def simulate() -> RaceSession:
    rng = random.Random(2026_07_04)

    circuit = Circuit(
        id="red_bull_ring", name="Red Bull Ring", locality="Spielberg",
        country="Austria", length_km=4.318, laps=TOTAL_LAPS,
    )

    drivers: list[Driver] = []
    for p in PLANS:
        drivers.append(Driver(
            number=p.number, code=p.code, name=p.name, team=p.team,
            team_color=TEAM_COLORS.get(p.team, "#888888"), grid=p.grid, country=p.country,
        ))

    # --- 1. lap times & cumulative race time -------------------------------- #
    # cum[code][lap] = total elapsed race time after completing `lap`.
    cum: dict[str, dict[int, float]] = {p.code: {} for p in PLANS}
    laptime: dict[str, dict[int, float]] = {p.code: {} for p in PLANS}
    retired_after: dict[str, int] = {}

    for p in PLANS:
        t = 0.0
        # Grid drag: cars further back lose a little at the start and in traffic.
        grid_penalty = (p.grid - 1) * 0.35
        for lap in range(1, TOTAL_LAPS + 1):
            if p.dnf_lap and lap > p.dnf_lap:
                break
            _, compound, age, is_out = _stint_at(p, lap)
            lt = p.base_pace
            lt += COMPOUND_OFFSET[compound]
            lt += COMPOUND_DEG[compound] * (age - 1)
            lt -= FUEL_GAIN * (lap - 1)               # burns fuel, gets faster
            if lap == 1:
                lt += 2.2 + grid_penalty              # standing start + first-lap scrap
            if is_out:
                lt += 1.6                             # cold-tyre out-lap
            # per-lap noise (seeded, small)
            lt += rng.uniform(-0.12, 0.18)

            under_vsc = VSC_START <= lap <= VSC_END
            if under_vsc:
                lt += VSC_LAP_PENALTY

            # Pit-in this lap?
            if lap in _pit_laps(p):
                lt += PIT_LOSS_VSC if under_vsc else PIT_LOSS_GREEN

            t += lt
            laptime[p.code][lap] = round(lt, 3)
            cum[p.code][lap] = t
        if p.dnf_lap:
            retired_after[p.code] = p.dnf_lap

    # --- 2. positions & gaps per lap ---------------------------------------- #
    positions: list[PositionPoint] = []
    # position_by_lap[lap] -> ordered list of codes
    pos_by_lap: dict[int, list[str]] = {}
    for lap in range(1, TOTAL_LAPS + 1):
        running = [(cum[p.code][lap], p.code) for p in PLANS if lap in cum[p.code]]
        running.sort()
        order = [code for _, code in running]
        pos_by_lap[lap] = order
        for i, code in enumerate(order, start=1):
            positions.append(PositionPoint(driver=code, lap=lap, position=i))

    def _position(code: str, lap: int) -> int | None:
        order = pos_by_lap.get(lap, [])
        return order.index(code) + 1 if code in order else None

    # --- 3. per-lap normalized records -------------------------------------- #
    laps: list[Lap] = []
    for p in PLANS:
        pit_laps = set(_pit_laps(p))
        for lap in range(1, TOTAL_LAPS + 1):
            if lap not in cum[p.code]:
                break
            stint_idx, compound, age, is_out = _stint_at(p, lap)
            order = pos_by_lap[lap]
            pos = order.index(p.code) + 1
            leader = order[0]
            gap = round(cum[p.code][lap] - cum[leader][lap], 2) if pos > 1 else 0.0
            interval = None
            if pos > 1:
                ahead = order[pos - 2]
                interval = round(cum[p.code][lap] - cum[ahead][lap], 2)
            under_vsc = VSC_START <= lap <= VSC_END
            status = TrackStatus.VSC if under_vsc else TrackStatus.GREEN
            is_pit_in = lap in pit_laps
            # Outliers excluded from clean pace: lap 1, in-laps, out-laps, VSC laps.
            outlier = lap == 1 or is_pit_in or is_out or under_vsc
            laps.append(Lap(
                driver=p.code, lap=lap, lap_time=laptime[p.code][lap], position=pos,
                compound=compound, tyre_age=age, stint=stint_idx,
                pit_in=is_pit_in, pit_out=is_out, gap_to_leader=gap, interval=interval,
                track_status=status, is_outlier=outlier,
            ))

    # --- 4. stints ---------------------------------------------------------- #
    stints: list[Stint] = []
    for p in PLANS:
        start = 1
        for idx, (comp, pit_lap) in enumerate(p.stints, start=1):
            end = min(pit_lap, retired_after.get(p.code, TOTAL_LAPS))
            if start > end:
                break
            stint_laps = [l for l in laps
                          if l.driver == p.code and start <= l.lap <= end and not l.is_outlier]
            times = sorted(l.lap_time for l in stint_laps if l.lap_time)
            avg = round(sum(times) / len(times), 3) if times else None
            med = round(times[len(times) // 2], 3) if times else None
            best = round(min(times), 3) if times else None
            deg = None
            if len(times) >= 4:
                # crude linear degradation: slope across the stint (fuel-corrected-ish)
                first = sum(times[: max(1, len(times) // 3)]) / max(1, len(times) // 3)
                last = sum(times[-max(1, len(times) // 3):]) / max(1, len(times) // 3)
                deg = round((last - first) / max(1, (end - start)), 3)
            stints.append(Stint(
                driver=p.code, stint=idx, compound=_c(comp), start_lap=start,
                end_lap=end, laps=end - start + 1, is_new_tyre=(idx > 1 or comp != "MEDIUM"),
                avg_lap=avg, median_lap=med, best_lap=best, degradation=deg,
            ))
            start = end + 1
            if p.code in retired_after and end >= retired_after[p.code]:
                break

    # --- 5. pit stops ------------------------------------------------------- #
    pit_stops: list[PitStop] = []
    for p in PLANS:
        for pl in _pit_laps(p):
            if p.code in retired_after and pl > retired_after[p.code]:
                continue
            under_vsc = VSC_START <= pl <= VSC_END
            stationary = round(rng.uniform(2.2, 3.1), 2)
            comp_before = _stint_at(p, pl)[1]
            comp_after = _stint_at(p, pl + 1)[1]
            pit_stops.append(PitStop(
                driver=p.code, lap=pl, stationary_time=stationary,
                pit_lane_time=round(PIT_LOSS_VSC if under_vsc else PIT_LOSS_GREEN, 1),
                compound_before=comp_before, compound_after=comp_after,
                under_vsc=under_vsc, source="mock", confidence="high",
                explanation="Simulated stationary time.",
            ))

    # --- 6. race control ---------------------------------------------------- #
    rc: list[RaceControlEvent] = [
        RaceControlEvent(lap=1, category="Flag", flag="GREEN", scope="Track",
                         status=TrackStatus.GREEN, message="GREEN LIGHT - PIT EXIT OPEN"),
        RaceControlEvent(lap=3, category="Drs", message="DRS ENABLED"),
        RaceControlEvent(lap=VSC_START, category="SafetyCar", flag="YELLOW", scope="Track",
                         status=TrackStatus.VSC,
                         message="VIRTUAL SAFETY CAR DEPLOYED — CAR STOPPED AT TURN 4"),
        RaceControlEvent(lap=VSC_END, category="SafetyCar", flag="GREEN", scope="Track",
                         status=TrackStatus.GREEN, message="VIRTUAL SAFETY CAR ENDING"),
        RaceControlEvent(lap=52, category="Other", message="TURN 6 INCIDENT NOTED — LEC / SAI"),
        RaceControlEvent(lap=54, category="Flag", flag="BLACK AND WHITE", scope="Driver",
                         message="CAR 16 (LEC) TRACK LIMITS WARNING"),
        RaceControlEvent(lap=TOTAL_LAPS, category="Flag", flag="CHEQUERED", scope="Track",
                         message="CHEQUERED FLAG"),
    ]
    if any(p.dnf_lap for p in PLANS):
        dnf = next(p for p in PLANS if p.dnf_lap)
        rc.insert(3, RaceControlEvent(
            lap=dnf.dnf_lap, category="CarEvent",
            message=f"CAR {dnf.number} ({dnf.code}) STOPPED — {dnf.dnf_reason.upper()}"))

    windows = [TrackStatusWindow(status=TrackStatus.VSC, start_lap=VSC_START,
                                 end_lap=VSC_END, label="Virtual Safety Car")]

    # --- 7. weather (drifts over the race) ---------------------------------- #
    weather: list[WeatherPoint] = []
    for lap in range(1, TOTAL_LAPS + 1, 4):
        frac = lap / TOTAL_LAPS
        weather.append(WeatherPoint(
            lap=lap, time_min=round(lap * 1.12, 1),
            air_temp=round(27.5 - 2.0 * frac + rng.uniform(-0.3, 0.3), 1),
            track_temp=round(46.0 - 7.0 * frac + rng.uniform(-0.6, 0.6), 1),
            humidity=round(38 + 6 * frac + rng.uniform(-1, 1), 1),
            rainfall=False, wind_speed=round(rng.uniform(2.5, 4.5), 1),
            wind_direction=round(rng.uniform(180, 240)),
        ))

    # --- 8. classification -------------------------------------------------- #
    points_map = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
    final_order = pos_by_lap[TOTAL_LAPS]
    # Retired drivers are classified last, ordered by laps completed.
    classified_codes = list(final_order)
    retired_codes = sorted(retired_after, key=lambda c: -retired_after[c])
    for c in retired_codes:
        if c not in classified_codes:
            classified_codes.append(c)

    classification: list[ClassificationRow] = []
    for pos, code in enumerate(classified_codes, start=1):
        p = next(pp for pp in PLANS if pp.code == code)
        retired = code in retired_after
        laps_done = retired_after[code] if retired else TOTAL_LAPS
        best = min((l.lap_time for l in laps
                    if l.driver == code and l.lap_time and not l.pit_in and l.lap > 1),
                   default=None)
        n_pits = len([ps for ps in pit_stops if ps.driver == code])
        if retired:
            status = f"DNF — {p.dnf_reason}"
            gap = None
            display_pos = None
        else:
            status = "Finished"
            gap = "LEADER" if pos == 1 else f"+{cum[code][TOTAL_LAPS] - cum[final_order[0]][TOTAL_LAPS]:.1f}s"
            display_pos = pos
        classification.append(ClassificationRow(
            position=display_pos, driver=code, name=p.name, team=p.team,
            team_color=TEAM_COLORS.get(p.team, "#888888"), grid=p.grid,
            laps_completed=laps_done, status=status, gap=gap,
            best_lap=round(best, 3) if best else None, pit_stops=n_pits,
            points=points_map.get(pos) if not retired else None, retired=retired,
        ))

    constructors = []
    seen = set()
    for p in PLANS:
        if p.team not in seen:
            seen.add(p.team)
            constructors.append(Constructor(id=p.team.lower().replace(" ", "_"),
                                            name=p.team, color=TEAM_COLORS.get(p.team, "#888888")))

    return RaceSession(
        year=2026, grand_prix="Austrian Grand Prix",
        official_name="FORMULA 1 AUSTRIAN GRAND PRIX 2026",
        session_type="Race", category="race", circuit=circuit, total_laps=TOTAL_LAPS,
        data_source=DataSource.MOCK,
        notes=["Simulated demo race — realistic model, not an official result."],
        drivers=drivers, constructors=constructors, classification=classification,
        laps=laps, stints=stints, pit_stops=pit_stops, race_control=rc,
        weather=weather, positions=positions, track_status_windows=windows,
    )


# =========================================================================== #
# Practice session simulator
# =========================================================================== #
def simulate_qualifying(session_name: str = "Qualifying") -> RaceSession:
    """A realistic knockout qualifying: three segments, improving track, one
    red flag, a couple of deleted laps, per-segment bests on the classification."""
    rng = random.Random(2026_06_28)
    circuit = Circuit(id="red_bull_ring", name="Red Bull Ring", locality="Spielberg",
                      country="Austria", length_km=4.318, laps=TOTAL_LAPS)
    drivers = [Driver(number=p.number, code=p.code, name=p.name, team=p.team,
                      team_color=TEAM_COLORS.get(p.team, "#888888"), country=p.country)
               for p in PLANS]
    field = len(PLANS)

    # true one-lap order: base pace + a per-driver quali swing (some over-deliver)
    swing = {p.code: rng.uniform(-0.35, 0.35) for p in PLANS}
    swing[PLANS[6].code] -= 0.45          # the weekend's surprise performer
    order = sorted(PLANS, key=lambda p: p.base_pace + swing[p.code])

    laps: list[Lap] = []
    stints: list[Stint] = []
    seg_best: dict[str, dict[str, float]] = {p.code: {} for p in PLANS}
    rc: list[RaceControlEvent] = []
    EVO = 0.9                              # track gain per segment (s)

    def runs_in_segment(seg: int, rank: int) -> int:
        if seg == 1:
            return 2 if rank > field - 8 else 1   # cars in danger take two runs
        return 2

    lapno = {p.code: 0 for p in PLANS}
    for seg in (1, 2, 3):
        cutoff = field - 5 * seg if seg < 3 else 10
        runners = order if seg == 1 else order[: field - 5 * (seg - 1)]
        for rank, p in enumerate(runners):
            for run in range(runs_in_segment(seg, rank)):
                for k in range(3):                 # out, push, in
                    lapno[p.code] += 1
                    push = k == 1
                    lt = (p.base_pace - 2.2        # low fuel
                          + swing[p.code]
                          - EVO * (seg - 1) - (0.25 * run)
                          + rng.uniform(-0.05, 0.12))
                    if not push:
                        lt += rng.uniform(3.0, 4.5)
                    laps.append(Lap(driver=p.code, lap=lapno[p.code],
                                    lap_time=round(lt, 3), compound=Compound.SOFT,
                                    tyre_age=k + 1, stint=seg * 10 + run,
                                    sector1=round(lt * 0.28, 3) if push else None,
                                    sector2=round(lt * 0.41, 3) if push else None,
                                    sector3=round(lt * 0.31, 3) if push else None,
                                    pit_out=k == 0, is_outlier=not push))
                    if push:
                        cur = seg_best[p.code].get(f"q{seg}")
                        if cur is None or lt < cur:
                            seg_best[p.code][f"q{seg}"] = round(lt, 3)
        _ = cutoff

    # a mid-Q2 red flag and two deleted laps for track limits
    rc.append(RaceControlEvent(lap=None, category="Flag", flag="RED",
                               message="RED FLAG — CAR 22 (BEA) STOPPED AT TURN 6"))
    for code in (order[4].code, order[12].code):
        rc.append(RaceControlEvent(lap=None, category="Other",
                                   message=f"CAR {next(pp.number for pp in PLANS if pp.code == code)} "
                                           f"({code}) LAP DELETED — TRACK LIMITS AT TURN 10"))

    classification = []
    for pos, p in enumerate(order, start=1):
        sb = seg_best[p.code]
        best = min(sb.values()) if sb else None
        classification.append(ClassificationRow(
            position=pos, driver=p.code, name=p.name, team=p.team,
            team_color=TEAM_COLORS.get(p.team, "#888888"),
            laps_completed=lapno[p.code], status="Ran",
            best_lap=best, pit_stops=0, retired=False,
            q1=sb.get("q1"), q2=sb.get("q2") if pos <= field - 5 else None,
            q3=sb.get("q3") if pos <= 10 else None))

    weather = [WeatherPoint(lap=None, time_min=float(m), air_temp=round(25 + m / 30, 1),
                            track_temp=round(41 + m / 12, 1), humidity=38.0, rainfall=False,
                            wind_speed=round(rng.uniform(1.5, 3.5), 1))
               for m in range(0, 61, 10)]
    constructors = []
    seen: set[str] = set()
    for p in PLANS:
        if p.team not in seen:
            seen.add(p.team)
            constructors.append(Constructor(id=p.team.lower().replace(" ", "_"), name=p.team,
                                            color=TEAM_COLORS.get(p.team, "#888888")))

    return RaceSession(
        year=2026, grand_prix="Austrian Grand Prix",
        official_name="FORMULA 1 AUSTRIAN GRAND PRIX 2026",
        session_type=session_name, category=session_category(session_name),
        circuit=circuit, total_laps=max(lapno.values(), default=0),
        data_source=DataSource.MOCK,
        notes=["Simulated demo qualifying session — realistic model, not official."],
        drivers=drivers, constructors=constructors, classification=classification,
        laps=laps, stints=stints, weather=weather, race_control=rc,
    )


def simulate_practice(session_name: str = "Practice 2") -> RaceSession:
    """A realistic FP session: short push runs + long runs, track evolution.

    No finishing positions/DNFs — it produces a *session classification* by best
    lap, plus stints (runs) the analysis turns into long-run pace, tyre usage etc.
    """
    rng = random.Random(2026_06_27)
    circuit = Circuit(id="red_bull_ring", name="Red Bull Ring", locality="Spielberg",
                      country="Austria", length_km=4.318, laps=TOTAL_LAPS)
    drivers: list[Driver] = [Driver(number=p.number, code=p.code, name=p.name, team=p.team,
                                    team_color=TEAM_COLORS.get(p.team, "#888888"), country=p.country)
                             for p in PLANS]

    laps: list[Lap] = []
    stints: list[Stint] = []
    # session-wide track evolution: laps get ~1.2s faster from start to end
    EVO = 1.2
    # run plans per driver: list of (compound, n_laps). Some do a long run; a few low-running.
    def run_plan(i: int):
        if i % 7 == 5:           # low-running / reliability day
            return [("HARD", rng.randint(3, 5))]
        return [("HARD", rng.randint(6, 9)),        # installation / long-ish
                ("MEDIUM", rng.randint(10, 16)),    # long run (race sim)
                ("SOFT", rng.randint(2, 3))]        # quali sim push run

    global_lap = 0
    total_time = 60.0  # minutes of session
    for i, p in enumerate(PLANS):
        plan = run_plan(i)
        lap_counter = 0
        stint_no = 0
        for comp_name, n in plan:
            stint_no += 1
            comp = Compound(comp_name)
            run_start = lap_counter + 1
            for k in range(n):
                lap_counter += 1
                global_lap += 1
                is_out = k == 0
                is_in = k == n - 1
                age = k + 1
                # position in session 0..1 for track evolution
                frac = min(1.0, global_lap / (len(PLANS) * 20))
                lt = p.base_pace
                lt += COMPOUND_OFFSET[comp]
                lt += COMPOUND_DEG[comp] * (age - 1)
                lt -= EVO * frac                      # track rubbers in
                lt += 0.35 * (n - k) / max(1, n) * (2 if comp == Compound.MEDIUM else 0)  # fuel on long run
                lt += rng.uniform(-0.10, 0.15)
                if is_out:
                    lt += 3.5                          # out-lap
                if is_in:
                    lt += 4.0                          # in-lap
                outlier = is_out or is_in
                laps.append(Lap(driver=p.code, lap=lap_counter, lap_time=round(lt, 3),
                                compound=comp, tyre_age=age, stint=stint_no,
                                pit_out=is_out, is_outlier=outlier))
            clean = sorted(l.lap_time for l in laps
                           if l.driver == p.code and l.stint == stint_no and not l.is_outlier)
            stints.append(Stint(driver=p.code, stint=stint_no, compound=comp,
                                start_lap=run_start, end_lap=lap_counter, laps=n, is_new_tyre=True,
                                avg_lap=round(sum(clean) / len(clean), 3) if clean else None,
                                median_lap=round(clean[len(clean) // 2], 3) if clean else None,
                                best_lap=round(min(clean), 3) if clean else None))

    # session classification by best lap
    best_by: dict[str, float] = {}
    laps_by: dict[str, int] = {}
    for l in laps:
        laps_by[l.driver] = laps_by.get(l.driver, 0) + 1
        if l.lap_time and not l.is_outlier:
            best_by[l.driver] = min(best_by.get(l.driver, 9e9), l.lap_time)
    order = sorted(best_by, key=lambda c: best_by[c])
    classification: list[ClassificationRow] = []
    for pos, code in enumerate(order, start=1):
        p = next(pp for pp in PLANS if pp.code == code)
        classification.append(ClassificationRow(
            position=pos, driver=code, name=p.name, team=p.team,
            team_color=TEAM_COLORS.get(p.team, "#888888"),
            laps_completed=laps_by.get(code, 0), status="Ran",
            best_lap=round(best_by[code], 3), pit_stops=0, retired=False))

    weather = [WeatherPoint(lap=None, time_min=round(m, 1),
                            air_temp=round(24 + 2 * (m / total_time), 1),
                            track_temp=round(38 + 8 * (m / total_time), 1),
                            humidity=round(40 - 4 * (m / total_time), 1), rainfall=False,
                            wind_speed=round(rng.uniform(2, 4), 1))
               for m in range(0, int(total_time) + 1, 10)]

    constructors = []
    seen = set()
    for p in PLANS:
        if p.team not in seen:
            seen.add(p.team)
            constructors.append(Constructor(id=p.team.lower().replace(" ", "_"), name=p.team,
                                            color=TEAM_COLORS.get(p.team, "#888888")))

    return RaceSession(
        year=2026, grand_prix="Austrian Grand Prix",
        official_name="FORMULA 1 AUSTRIAN GRAND PRIX 2026",
        session_type=session_name, category="practice", circuit=circuit,
        total_laps=max(laps_by.values(), default=0), data_source=DataSource.MOCK,
        notes=["Simulated demo practice session — realistic model, not official."],
        drivers=drivers, constructors=constructors, classification=classification,
        laps=laps, stints=stints, weather=weather,
    )
