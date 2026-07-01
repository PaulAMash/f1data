"""
PitStopDataService — get the best available pit-stop timing, gracefully.

Order of preference for how long the car was stationary / the stop cost:
  1. Measured stationary time (rare in open data)   -> high confidence
  2. OpenF1 pit_duration / Jolpica duration          -> high/medium confidence
  3. FastF1 pit-lane time only                        -> medium confidence
  4. Derived estimate from pit-lane loss              -> low confidence, labelled
  5. Unknown                                          -> only if nothing exists

Instead of a scary "not available" banner, every stop ends up with a calm,
user-friendly label + an explanation of where the number came from.
"""
from __future__ import annotations

from . import jolpica_adapter
from ..models import PitStop, RaceSession

# Typical green-flag pit-lane transit (drive in + out, excluding the stop itself).
# Used only to derive an estimated stationary time from total pit-lane loss.
TYPICAL_LANE_TRANSIT_S = 18.5
MIN_STATIONARY_S = 1.9


def enrich(session: RaceSession, allow_network: bool = True) -> None:
    """Fill in the best pit-stop timing fields in place."""
    if not session.pit_stops:
        return

    have_duration = any(p.stop_duration or p.stationary_time for p in session.pit_stops)

    # If the primary source lacked stop durations, try Jolpica for them.
    if not have_duration and allow_network and session.data_source.value in ("live", "cache"):
        try:
            jstops = {(s.driver, s.lap): s for s in
                      jolpica_adapter.fetch_pitstops(session.year, session.grand_prix)}
        except Exception:  # noqa: BLE001
            jstops = {}
        for p in session.pit_stops:
            js = jstops.get((p.driver, p.lap))
            if js and js.stop_duration:
                p.stop_duration = js.stop_duration
                p.source = "jolpica"
                p.confidence = "medium"
                p.explanation = js.explanation

    for p in session.pit_stops:
        _finalize(p)


def _finalize(p: PitStop) -> None:
    if p.stationary_time:
        p.confidence = "high"
        p.explanation = p.explanation or "Measured stationary time (wheel-gun to release)."
        return
    if p.stop_duration:
        # OpenF1 pit_duration / Jolpica duration ≈ the stop cost.
        p.confidence = p.confidence if p.confidence != "medium" or p.source != "unknown" else "medium"
        p.explanation = p.explanation or f"{p.source.title()} pit duration."
        return
    if p.pit_lane_time:
        # Derive a plausible stationary estimate from total pit-lane loss.
        est = round(max(MIN_STATIONARY_S, p.pit_lane_time - TYPICAL_LANE_TRANSIT_S), 1)
        p.estimated_stationary_time = est
        p.confidence = "low"
        p.source = p.source if p.source not in ("unknown",) else "derived"
        p.explanation = (f"Estimated from pit-lane loss (~{p.pit_lane_time:.0f}s − "
                         f"~{TYPICAL_LANE_TRANSIT_S:.0f}s transit). Approximate.")
        return
    p.confidence = "low"
    p.explanation = "No stop-duration data available for this session."


def label(p: PitStop) -> dict:
    """A clean, user-facing representation for the UI."""
    if p.stationary_time:
        return {"text": f"Stop {p.stationary_time:.1f}s", "kind": "measured"}
    if p.stop_duration:
        return {"text": f"Stop {p.stop_duration:.1f}s", "kind": "measured"}
    if p.estimated_stationary_time:
        return {"text": f"~{p.estimated_stationary_time:.1f}s est.", "kind": "estimated"}
    if p.pit_lane_time:
        return {"text": f"Pit loss {p.pit_lane_time:.1f}s", "kind": "lane"}
    return {"text": "—", "kind": "unknown"}
