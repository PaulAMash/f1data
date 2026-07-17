"""
Session normalization — guards against untrustworthy raw values reaching the UI.

Some sources report the leader's *cumulative race time* in the gap field, which
must never be shown as a "+5197s gap". And when a source has no pit data, we must
not let the app claim a "0-stop race". This runs once per loaded session.
"""
from __future__ import annotations

import re

from ..models import RaceSession

# A plausible on-track gap ceiling (seconds). Anything larger is almost certainly
# cumulative time, not a gap — so we drop it rather than display nonsense.
MAX_PLAUSIBLE_GAP_S = 300.0


def _parse_gap_seconds(gap: str | None) -> float | None:
    if not gap:
        return None
    m = re.search(r"([-+]?\d+(?:\.\d+)?)\s*s?", str(gap))
    return float(m.group(1)) if m else None


def fix_classification(session: RaceSession) -> None:
    """P1 has no gap; implausible gaps are dropped; keep lap-down labels."""
    rows = sorted(session.classification, key=lambda c: (c.position is None, c.position or 999))
    for c in rows:
        if c.position == 1:
            c.gap = None            # winner: the UI renders "Winner"
            continue
        if not c.gap:
            continue
        g = str(c.gap)
        if re.search(r"lap", g, re.I):
            continue                # "+1 Lap" etc. is fine
        secs = _parse_gap_seconds(g)
        if secs is None or secs < 0 or secs > MAX_PLAUSIBLE_GAP_S:
            c.gap = None            # looks like total time / garbage → hide


def pit_data_reliable(session: RaceSession) -> bool:
    """True only if we actually have pit-stop records for a race/sprint."""
    if session.category not in ("race", "sprint"):
        return False
    return len(session.pit_stops) > 0


def normalize_session(session: RaceSession) -> None:
    """In-place: fix gaps, fill derivable per-driver stats, and flag pit-data
    reliability so the UI never fabricates '0-stop race' claims or absurd gaps."""
    fix_classification(session)
    reliable = pit_data_reliable(session)
    session.pit_data_reliable = reliable

    if reliable:
        # Sources often deliver pit stops as a list but leave the per-driver
        # count on the classification at 0 — derive it so 'Pits' is never blank.
        counts: dict[str, int] = {}
        for ps in session.pit_stops:
            counts[ps.driver] = counts.get(ps.driver, 0) + 1
        for c in session.classification:
            if not c.pit_stops:
                c.pit_stops = counts.get(c.driver, 0)
    elif session.category in ("race", "sprint"):
        # Without pit data we can't trust per-driver stop counts — zero them out
        # so no "0-stop race" story is generated; the UI shows "pit data unavailable".
        for c in session.classification:
            c.pit_stops = 0

    # best race lap per driver, derived from the lap sheet when the result lacks it
    if session.laps:
        best: dict[str, float] = {}
        for lp in session.laps:
            if lp.lap_time and not lp.pit_in and not lp.pit_out:
                if lp.driver not in best or lp.lap_time < best[lp.driver]:
                    best[lp.driver] = lp.lap_time
        for c in session.classification:
            if c.best_lap is None:
                c.best_lap = best.get(c.driver)
