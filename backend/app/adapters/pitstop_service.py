"""
PitStopDataService — get the best available pit-stop timing, gracefully.

Order of preference for how long the car was stationary / the stop cost:
  1. Measured stationary time (F1 archive PitStopSeries, 2025+)  -> high confidence
  2. Measured pit-lane time (OpenF1 pit_duration, Jolpica duration) -> the stop COST,
     with a LABELLED estimate of the stationary part                -> low confidence
  3. Unknown                                                        -> only if nothing exists

WHAT A LANE TIME IS NOT. OpenF1's `pit_duration` and Ergast/Jolpica's pit-stop
`duration` are both measured from pit entry to pit exit — twenty-odd seconds. They
used to be written to `stop_duration` as well as `pit_lane_time`, and every reader
of `stop_duration` treated it as the stop itself: "Stop 24.2s", a "stationary time"
meter with a 2.0s scale drawn to 24.20s. The lane time is the pit LOSS and is
reported as one; the stationary time, when nothing measured it, is an estimate and
says so. The rules live in analysis/normalize.finalize_pit_stop so that they hold
on every read, for records cached before they did.

Instead of a scary "not available" banner, every stop ends up with a calm,
user-friendly label + an explanation of where the number came from.
"""
from __future__ import annotations

from . import jolpica_adapter
from ..analysis.normalize import (  # noqa: F401 — re-exported for callers and tests
    MAX_RACING_PIT_LANE_S, MIN_STATIONARY_S, TYPICAL_LANE_TRANSIT_S, finalize_pit_stop,
)
from ..models import PitStop, RaceSession


def _measured(p: PitStop) -> bool:
    return bool(p.stationary_time or p.pit_lane_time or p.stop_duration)


def enrich(session: RaceSession, allow_network: bool = True) -> None:
    """Fill in the best pit-stop timing fields in place."""
    if not session.pit_stops:
        return

    # If the primary source lacked any timing, try the results archive for the
    # lane durations it publishes (2011+).
    if not any(_measured(p) for p in session.pit_stops) and allow_network \
            and session.data_source.value in ("live", "cache"):
        try:
            jstops = {(s.driver, s.lap): s for s in
                      jolpica_adapter.fetch_pitstops(session.year, session.grand_prix)}
        except Exception:  # noqa: BLE001
            jstops = {}
        for p in session.pit_stops:
            js = jstops.get((p.driver, p.lap))
            if js and js.pit_lane_time:
                p.pit_lane_time = js.pit_lane_time
                p.source = "jolpica"
                p.confidence = "medium"
                p.explanation = js.explanation

    for p in session.pit_stops:
        finalize_pit_stop(p)


#: the name this service exposed before the rules moved to the normalizer
_finalize = finalize_pit_stop


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
