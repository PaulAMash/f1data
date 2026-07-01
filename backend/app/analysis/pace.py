"""
Pace analysis — turns raw laps into a per-driver pace picture.

The whole point is to separate *pace* from *result*: who was actually quick, who
was stuck in traffic, who was tyre-limited, and whose finishing position flatters
or flatters-to-deceive their real speed. Everything here is deterministic.

To compare pace fairly we normalize every lap the way a race engineer would:
  * fuel correction — cars get progressively faster as fuel burns off. We estimate
    the field-wide fuel slope (s/lap) and correct every lap to a mid-race load.
  * tyre normalization — soft/medium/hard have different base pace. We estimate
    the field's per-compound offset and normalize everyone to the medium.
The resulting "clean-air pace" is a realistic, comparable representative lap time,
and pace_rank orders drivers by true car speed rather than track position.
"""
from __future__ import annotations

import math
import statistics
from collections import defaultdict

from ..models import (
    Compound,
    DriverPaceSummary,
    Lap,
    RaceSession,
    Stint,
    StintPace,
)

# A lap where the car is within this many seconds of the car ahead is treated as
# "dirty air" / traffic and excluded from the clean-air pace estimate.
TRAFFIC_GAP_S = 1.5
# Stint degradation above this (s/lap) flags a driver as tyre-limited.
DEG_LIMIT = 0.06
# Keep the fastest fraction of clean laps when estimating representative pace,
# dropping the slowest laps (tyre management / late deg) that hide true speed.
TRIM_KEEP = 0.65


def _clean_laps(laps: list[Lap]) -> list[Lap]:
    return [l for l in laps if l.lap_time and not l.is_outlier]


def _is_traffic(l: Lap) -> bool:
    return l.interval is not None and 0 < l.interval < TRAFFIC_GAP_S and (l.position or 1) > 1


def _clean_air_laps(laps: list[Lap]) -> list[Lap]:
    return [l for l in _clean_laps(laps) if not _is_traffic(l)]


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 3) if values else None


def _trimmed_median(values: list[float]) -> float | None:
    if not values:
        return None
    if len(values) < 4:
        return round(statistics.median(values), 3)
    kept = sorted(values)[: max(3, math.ceil(len(values) * TRIM_KEEP))]
    return round(statistics.median(kept), 3)


# --------------------------------------------------------------------------- #
# field-wide normalization models
# --------------------------------------------------------------------------- #
def _fuel_slope(session: RaceSession) -> float:
    """Least-squares slope (s/lap) of clean green lap times vs lap number.

    Negative = cars get faster as fuel burns. Uses the median lap time per lap to
    damp per-driver noise, then a simple linear fit.
    """
    per_lap: dict[int, list[float]] = defaultdict(list)
    for l in session.laps:
        if l.lap_time and not l.is_outlier and l.track_status.value == "GREEN":
            per_lap[l.lap].append(l.lap_time)
    pts = [(lap, statistics.median(v)) for lap, v in per_lap.items() if len(v) >= 3]
    if len(pts) < 5:
        return 0.0
    n = len(pts)
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    sxx = sum(p[0] ** 2 for p in pts)
    sxy = sum(p[0] * p[1] for p in pts)
    denom = n * sxx - sx * sx
    if denom == 0:
        return 0.0
    slope = (n * sxy - sx * sy) / denom
    # clamp to a sane range (avoid deg-dominated stints skewing the fit)
    return max(-0.15, min(0.02, slope))


def _compound_offsets(session: RaceSession, slope: float, ref_lap: int) -> dict[Compound, float]:
    """Per-compound median of fuel-corrected clean laps, relative to MEDIUM."""
    by_comp: dict[Compound, list[float]] = defaultdict(list)
    for l in session.laps:
        if l.lap_time and not l.is_outlier and l.compound != Compound.UNKNOWN:
            by_comp[l.compound].append(l.lap_time - slope * (l.lap - ref_lap))
    medians = {c: statistics.median(v) for c, v in by_comp.items() if len(v) >= 4}
    ref = medians.get(Compound.MEDIUM)
    if ref is None and medians:
        ref = statistics.median(list(medians.values()))
    if ref is None:
        return {}
    return {c: (m - ref) for c, m in medians.items()}


def _normalize(l: Lap, slope: float, ref_lap: int, offsets: dict[Compound, float]) -> float:
    """Fuel- and tyre-normalized lap time (to medium tyre, mid-race fuel)."""
    return l.lap_time - slope * (l.lap - ref_lap) - offsets.get(l.compound, 0.0)


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def compute_pace(session: RaceSession) -> list[DriverPaceSummary]:
    laps_by_driver: dict[str, list[Lap]] = defaultdict(list)
    for l in session.laps:
        laps_by_driver[l.driver].append(l)

    stints_by_driver: dict[str, list[Stint]] = defaultdict(list)
    for st in session.stints:
        stints_by_driver[st.driver].append(st)

    class_by_driver = {c.driver: c for c in session.classification}
    driver_meta = {d.code: d for d in session.drivers}

    ref_lap = max(1, session.total_laps // 2)
    slope = _fuel_slope(session)
    offsets = _compound_offsets(session, slope, ref_lap)

    summaries: list[DriverPaceSummary] = []
    for code, dl in laps_by_driver.items():
        dl.sort(key=lambda x: x.lap)
        clean = _clean_laps(dl)
        clean_air = _clean_air_laps(dl)
        clean_times = [l.lap_time for l in clean]

        best = round(min(clean_times), 3) if clean_times else None
        median = _median(clean_times)
        average = round(sum(clean_times) / len(clean_times), 3) if clean_times else None
        # normalized representative clean-air pace (fuel + tyre corrected, trimmed)
        norm_air = [_normalize(l, slope, ref_lap, offsets) for l in clean_air]
        clean_air_pace = _trimmed_median(norm_air)
        stdev = round(statistics.pstdev(clean_times), 3) if len(clean_times) > 1 else None

        traffic_laps = sum(1 for l in clean if _is_traffic(l))

        meta = driver_meta.get(code)
        row = class_by_driver.get(code)
        grid = meta.grid if meta else (row.grid if row else None)
        finish = row.position if row else None
        net = (grid - finish) if (grid and finish) else None

        stint_paces: list[StintPace] = []
        degs = []
        for st in sorted(stints_by_driver.get(code, []), key=lambda s: s.stint):
            stint_paces.append(StintPace(
                stint=st.stint, compound=st.compound, start_lap=st.start_lap,
                end_lap=st.end_lap, laps=st.laps, avg_lap=st.avg_lap,
                median_lap=st.median_lap, degradation=st.degradation,
            ))
            if st.degradation is not None:
                degs.append(st.degradation)
        tyre_limited = bool(degs) and (max(degs) > DEG_LIMIT)

        summaries.append(DriverPaceSummary(
            driver=code, name=meta.name if meta else code,
            team=meta.team if meta else (row.team if row else "?"),
            team_color=meta.team_color if meta else "#888888",
            grid=grid, finish=finish, net_positions=net,
            best_lap=best, median_lap=median, average_lap=average,
            clean_air_pace=clean_air_pace, consistency=stdev,
            pit_stops=row.pit_stops if row else 0, traffic_laps=traffic_laps,
            tyre_limited=tyre_limited, stints=stint_paces,
        ))

    _rank_and_score(summaries)
    _write_verdicts(summaries)
    return summaries


def _rank_and_score(summaries: list[DriverPaceSummary]) -> None:
    """Pace rank by normalized clean-air pace; consistency score across the field."""
    ranked = sorted([s for s in summaries if s.clean_air_pace], key=lambda s: s.clean_air_pace)
    for i, s in enumerate(ranked, start=1):
        s.pace_rank = i

    stdevs = [s.consistency for s in summaries if s.consistency is not None]
    if stdevs:
        lo, hi = min(stdevs), max(stdevs)
        span = (hi - lo) or 1.0
        for s in summaries:
            if s.consistency is not None:
                s.consistency_score = round(100 * (1 - (s.consistency - lo) / span), 1)


def _write_verdicts(summaries: list[DriverPaceSummary]) -> None:
    for s in summaries:
        bits = []
        if s.pace_rank:
            bits.append(f"P{s.pace_rank} on raw pace")
        if s.finish and s.pace_rank and s.finish - s.pace_rank >= 2:
            bits.append("finished below their pace (track position / strategy cost them)")
        elif s.pace_rank and s.finish and s.pace_rank - s.finish >= 2:
            bits.append("finished above their pace (strategy / track position helped)")
        if s.traffic_laps >= 8:
            bits.append(f"{s.traffic_laps} laps stuck in traffic")
        if s.tyre_limited:
            bits.append("tyre-limited in at least one stint")
        s.verdict = "; ".join(bits) if bits else "solid, unremarkable run"
