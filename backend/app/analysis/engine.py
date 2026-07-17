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

    def fmt(t):
        if t is None:
            return "—"
        m, s = int(t // 60), t % 60
        return f"{m}:{s:06.3f}" if m else f"{s:.3f}s"

    # ---- detailed, statistics-backed verdict --------------------------------
    faster = a if (pa.pace_rank or 99) < (pb.pace_rank or 99) else b
    slower = b if faster == a else a
    finished_ahead = a if ((ca.position or 99) < (cb.position or 99)) else b
    behind = b if finished_ahead == a else a
    points: list[str] = []

    points.append(f"{finished_ahead} finished ahead: P{class_by[finished_ahead].position} vs "
                  f"P{class_by[behind].position}"
                  + (f", with a final margin of {abs(lap_delta[-1]['delta']):.1f}s on track"
                     if lap_delta and abs(lap_delta[-1]["delta"]) < 300 else "") + ".")

    if pa.clean_air_pace and pb.clean_air_pace:
        d = abs(pa.clean_air_pace - pb.clean_air_pace)
        points.append(f"True pace: {faster} was quicker once fuel and tyres are corrected — "
                      f"{fmt(pace[faster].clean_air_pace)} vs {fmt(pace[slower].clean_air_pace)} "
                      f"({d:.3f}s/lap, pace rank P{pace[faster].pace_rank} vs P{pace[slower].pace_rank}).")
    if pa.best_lap and pb.best_lap:
        bl = a if pa.best_lap <= pb.best_lap else b
        points.append(f"Best lap: {bl} — {fmt(pace[bl].best_lap)} against "
                      f"{fmt(pace[b if bl == a else a].best_lap)}.")
    if pa.consistency_score is not None and pb.consistency_score is not None:
        cs = a if pa.consistency_score >= pb.consistency_score else b
        points.append(f"Consistency: {cs} was steadier ({pace[cs].consistency_score:.0f}/100 vs "
                      f"{pace[b if cs == a else a].consistency_score:.0f}/100 on clean laps).")

    stops_a = len([p for p in session.pit_stops if p.driver == a])
    stops_b = len([p for p in session.pit_stops if p.driver == b])
    pl_a, pl_b = pit_loss(a), pit_loss(b)
    if session.pit_data_reliable and (stops_a or stops_b):
        pit_bit = f"Pit strategy: {a} stopped {stops_a}× vs {b} {stops_b}×"
        if pl_a is not None and pl_b is not None:
            cheaper = a if pl_a <= pl_b else b
            pit_bit += (f"; total pit-lane time {pl_a:.1f}s vs {pl_b:.1f}s — "
                        f"{cheaper} paid less for their stops")
        points.append(pit_bit + ".")

    seq_a = [s.compound.value[0] for s in pa.stints]
    seq_b = [s.compound.value[0] for s in pb.stints]
    if seq_a and seq_b and seq_a != seq_b:
        points.append(f"Tyres: {a} ran {'→'.join(seq_a)} against {b}'s {'→'.join(seq_b)}.")

    if pa.traffic_laps != pb.traffic_laps:
        stuck = a if pa.traffic_laps > pb.traffic_laps else b
        points.append(f"Traffic: {stuck} spent more green laps in dirty air "
                      f"({max(pa.traffic_laps, pb.traffic_laps)} vs {min(pa.traffic_laps, pb.traffic_laps)}).")

    # biggest swing between them (largest single-lap delta change)
    if len(lap_delta) > 2:
        swings = [(abs(lap_delta[i]["delta"] - lap_delta[i - 1]["delta"]), lap_delta[i]["lap"])
                  for i in range(1, len(lap_delta))]
        mag, lap = max(swings)
        if mag >= 2.5:
            points.append(f"The biggest single swing came on lap {lap} (~{mag:.1f}s), "
                          f"most likely a pit stop or on-track incident — check the delta trace there.")

    if faster != finished_ahead:
        points.append(f"Bottom line: {faster} had the outright speed, but {finished_ahead} "
                      f"converted the race — execution and track position decided it.")
    else:
        points.append(f"Bottom line: {finished_ahead} was both the quicker and the better-executed "
                      f"race — a deserved result on the data.")

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
        "verdict": " ".join(points[:3] + points[-1:]),
        "verdict_points": points,
    }
