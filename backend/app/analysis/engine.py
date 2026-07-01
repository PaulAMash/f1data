"""Top-level analysis orchestration + driver comparison."""
from __future__ import annotations

from ..models import DriverPaceSummary, RaceSession, StrategySummary
from .normalize import normalize_session
from .pace import compute_pace
from .strategy import compute_strategy


def analyze(session: RaceSession) -> tuple[StrategySummary, list[DriverPaceSummary]]:
    normalize_session(session)   # fix gaps + pit reliability before any analysis
    pace = compute_pace(session)
    strategy = compute_strategy(session, pace)
    return strategy, pace


def compare_drivers(session: RaceSession, a: str, b: str) -> dict:
    """Head-to-head comparison used by the Driver Comparison view."""
    a, b = a.upper(), b.upper()
    pace = {p.driver: p for p in compute_pace(session)}
    pa, pb = pace.get(a), pace.get(b)
    if not pa or not pb:
        missing = [d for d, p in ((a, pa), (b, pb)) if not p]
        return {"error": f"No data for: {', '.join(missing)}"}

    class_by = {c.driver: c for c in session.classification}
    ca, cb = class_by.get(a), class_by.get(b)

    # per-lap position + lap-time delta traces
    laps_a = {l.lap: l for l in session.laps if l.driver == a}
    laps_b = {l.lap: l for l in session.laps if l.driver == b}
    common = sorted(set(laps_a) & set(laps_b))
    lap_delta = []            # cumulative time delta a-b (positive => a slower)
    cum = 0.0
    for lp in common:
        la, lb = laps_a[lp], laps_b[lp]
        if la.lap_time and lb.lap_time and not la.pit_in and not lb.pit_in:
            cum += (la.lap_time - lb.lap_time)
        lap_delta.append({"lap": lp, "delta": round(cum, 2),
                          "pos_a": la.position, "pos_b": lb.position,
                          "gap_a": la.gap_to_leader, "gap_b": lb.gap_to_leader})

    def pit_loss(code):
        stops = [ps for ps in session.pit_stops if ps.driver == code]
        vals = [ps.pit_lane_time for ps in stops if ps.pit_lane_time]
        return round(sum(vals), 1) if vals else None

    # verdict
    faster = a if (pa.pace_rank or 99) < (pb.pace_rank or 99) else b
    finished_ahead = a if ((ca.position or 99) < (cb.position or 99)) else b
    verdict_bits = [
        f"{faster} was quicker on raw pace (P{pace[faster].pace_rank} vs "
        f"P{pace[b if faster==a else a].pace_rank}).",
        f"{finished_ahead} finished ahead (P{class_by[finished_ahead].position}).",
    ]
    if pa.traffic_laps != pb.traffic_laps:
        stuck = a if pa.traffic_laps > pb.traffic_laps else b
        verdict_bits.append(f"{stuck} spent more laps in traffic ({max(pa.traffic_laps, pb.traffic_laps)}).")
    if faster != finished_ahead:
        verdict_bits.append(f"{faster} had the pace but {finished_ahead} executed the better race.")

    return {
        "a": pa.model_dump(), "b": pb.model_dump(),
        "classification": {a: ca.model_dump() if ca else None,
                           b: cb.model_dump() if cb else None},
        "lap_delta": lap_delta,
        "pit_loss": {a: pit_loss(a), b: pit_loss(b)},
        "compound_sequence": {
            a: [s.compound.value for s in pa.stints],
            b: [s.compound.value for s in pb.stints],
        },
        "verdict": " ".join(verdict_bits),
    }
