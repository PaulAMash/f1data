"""
Strategy Simulator Lite — transparent "what-if" estimates.

This is deliberately a *lite* model and is always labelled an estimate. It grounds
its numbers in the real race: the driver's actual pit-lane loss, stint degradation
and the gap-to-leader trace (to estimate where they would rejoin and into whose
dirty air). It answers "roughly better or worse, and why", not an exact result.
"""
from __future__ import annotations

from collections import defaultdict

from ..models import (
    Compound,
    DriverPaceSummary,
    RaceSession,
    SimulationResult,
)

DEFAULT_PIT_LOSS = 20.5
SMOOTH = 0.6           # damps the linear tyre-age model


def _gap_index(session: RaceSession) -> dict[tuple[str, int], float]:
    idx: dict[tuple[str, int], float] = {}
    for l in session.laps:
        if l.gap_to_leader is not None:
            idx[(l.driver, l.lap)] = l.gap_to_leader
    return idx


def _driver_pit_loss(session: RaceSession, code: str) -> float:
    vals = [ps.pit_lane_time for ps in session.pit_stops
            if ps.driver == code and ps.pit_lane_time]
    if vals:
        return round(sum(vals) / len(vals), 1)
    allvals = [ps.pit_lane_time for ps in session.pit_stops if ps.pit_lane_time]
    return round(sum(allvals) / len(allvals), 1) if allvals else DEFAULT_PIT_LOSS


def _rejoin(session: RaceSession, code: str, lap: int, added_gap: float) -> tuple[int | None, str | None]:
    """Estimate rejoin position after adding `added_gap` seconds at `lap`."""
    gaps = _gap_index(session)
    my = gaps.get((code, lap))
    if my is None:
        return None, None
    new_gap = my + added_gap
    others = [(gaps[(d, lap)], d) for (d, lp) in gaps if lp == lap and d != code]
    ahead = [g for g in others if g[0] <= new_gap]
    rejoin_pos = len(ahead) + 1
    behind = max(ahead, key=lambda g: g[0])[1] if ahead else None
    return rejoin_pos, behind


def simulate_whatif(session: RaceSession, pace: list[DriverPaceSummary], driver: str,
                    new_pit_lap: int | None = None, num_stops: int | None = None,
                    compounds: list[str] | None = None) -> SimulationResult:
    code = driver.upper()
    p = next((x for x in pace if x.driver == code), None)
    row = next((c for c in session.classification if c.driver == code), None)
    if not p or not row:
        return SimulationResult(driver=code, summary=f"No race data for {code}.",
                                verdict="neutral", is_estimate=True,
                                assumptions=[f"{code} is not in the loaded session."])

    pit_loss = _driver_pit_loss(session, code)
    stints = sorted(p.stints, key=lambda s: s.stint)
    baseline_finish = row.position
    assumptions = [
        f"Pit-lane loss taken from {code}'s real stops (~{pit_loss:.0f}s).",
        "Tyre effect modelled as linear degradation from the affected stints.",
        "Rejoin position estimated from the real gap-to-leader trace (traffic may differ).",
    ]

    # --- change number of stops ------------------------------------------- #
    actual_stops = max(0, len(stints) - 1)
    if num_stops is not None and num_stops != actual_stops:
        d_stops = num_stops - actual_stops
        # each removed stop saves one pit loss but extends stints (deg risk); each
        # added stop costs a pit loss but freshens tyres.
        deg = max((s.degradation or 0.03) for s in stints) if stints else 0.04
        stint_len = session.total_laps / max(1, num_stops + 1)
        deg_penalty = deg * stint_len * abs(d_stops) * SMOOTH
        delta = d_stops * (-pit_loss) + (deg_penalty if d_stops < 0 else -deg_penalty * 0.5)
        verdict = "worse" if delta > 1.5 else ("better" if delta < -1.5 else "neutral")
        risk = "high" if (d_stops < 0) else "medium"
        summary = (
            f"Going from {actual_stops} to {num_stops} stops: "
            f"{'saving' if d_stops < 0 else 'spending'} ~{abs(d_stops)*pit_loss:.0f}s of pit loss "
            f"but {'adding' if d_stops < 0 else 'reducing'} end-stint degradation "
            f"(~{deg:.02f}s/lap). Net estimate ≈ {delta:+.1f}s — looks {verdict}."
        )
        return SimulationResult(
            driver=code, summary=summary, baseline_finish=baseline_finish,
            estimated_finish=None, delta_seconds=round(delta, 1), tyre_risk=risk,
            verdict=verdict, assumptions=assumptions, is_estimate=True)

    # --- change one pit lap ----------------------------------------------- #
    if new_pit_lap is not None and len(stints) >= 2:
        actual_pits = [s.end_lap for s in stints[:-1]]
        old_lap = min(actual_pits, key=lambda l: abs(l - new_pit_lap))
        which = actual_pits.index(old_lap)
        delta_laps = new_pit_lap - old_lap          # <0 = earlier
        before = stints[which]
        after = stints[which + 1]
        deg_before = before.degradation if before.degradation is not None else 0.05
        deg_after = after.degradation if after.degradation is not None else 0.03
        # pitting earlier: skip the worn tail of `before`, extend the tail of `after`.
        deg_saved = deg_before * abs(delta_laps) * SMOOTH
        deg_added = deg_after * abs(delta_laps) * SMOOTH
        if delta_laps < 0:      # earlier
            track_delta = -(deg_saved) + deg_added
        else:                   # later (overcut attempt)
            track_delta = deg_saved - deg_added
        rejoin_pos, behind = _rejoin(session, code, min(new_pit_lap, session.total_laps), pit_loss)
        final_stint_len = after.laps - delta_laps
        risk = "high" if final_stint_len > 28 else ("medium" if final_stint_len > 18 else "low")
        verdict = "better" if track_delta < -1.0 else ("worse" if track_delta > 1.0 else "neutral")
        summary = (
            f"If {code} had pitted on lap {new_pit_lap} instead of {old_lap} "
            f"({'earlier' if delta_laps < 0 else 'later'} by {abs(delta_laps)} laps), the model "
            f"estimates a net {track_delta:+.1f}s on tyre life"
            + (f" and a rejoin around P{rejoin_pos}" + (f" behind {behind}" if behind else "") if rejoin_pos else "")
            + f". Final stint would be ~{final_stint_len} laps ({risk} degradation risk). Looks {verdict}."
        )
        return SimulationResult(
            driver=code, summary=summary, baseline_finish=baseline_finish,
            estimated_finish=rejoin_pos, delta_seconds=round(track_delta, 1),
            rejoin_position=rejoin_pos, rejoin_behind=behind, tyre_risk=risk,
            verdict=verdict, assumptions=assumptions, is_estimate=True)

    # --- change compound sequence (qualitative) --------------------------- #
    if compounds:
        seq = [c.upper() for c in compounds]
        softer = seq.count("SOFT")
        risk = "high" if softer >= 2 else ("medium" if softer == 1 else "low")
        summary = (
            f"Running {' → '.join(s.title() for s in seq)} instead of "
            f"{' → '.join(s.compound.value.title() for s in stints)}: softer tyres add outright pace "
            f"but higher degradation ({risk} risk). This is a directional estimate only — "
            f"track position and safety cars dominate the real outcome."
        )
        return SimulationResult(driver=code, summary=summary, baseline_finish=baseline_finish,
                                tyre_risk=risk, verdict="neutral", assumptions=assumptions,
                                is_estimate=True)

    return SimulationResult(
        driver=code, summary=f"{code}'s actual strategy: "
        + " → ".join(f"{s.compound.value.title()}({s.laps})" for s in stints)
        + f", {len(stints)-1} stops, finished P{baseline_finish}. Change a pit lap or stop count to compare.",
        baseline_finish=baseline_finish, verdict="neutral", assumptions=assumptions, is_estimate=True)
