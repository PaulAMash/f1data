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

# Official broadcast colours by team-name token, used to replace the generic
# grey when a source (mostly the historical archive) has no colour of its own.
# Ordered: more specific tokens first so "red bull" wins before "racing bulls".
TEAM_COLOR_TOKENS: list[tuple[str, str]] = [
    ("red bull", "#3671C6"), ("racing bulls", "#6692FF"), ("rb f1", "#6692FF"),
    ("alphatauri", "#5E8FAA"), ("toro rosso", "#469BFF"),
    ("ferrari", "#E8002D"), ("mclaren", "#FF8000"), ("mercedes", "#27F4D2"),
    ("aston martin", "#229971"), ("williams", "#64C4FF"), ("alpine", "#FF87BC"),
    ("haas", "#B6BABD"), ("sauber", "#52E252"), ("alfa romeo", "#C92D4B"),
    ("racing point", "#F596C8"), ("force india", "#F596C8"),
    ("renault", "#FFF500"), ("lotus", "#FFB800"), ("caterham", "#048646"),
    ("jordan", "#FFC700"), ("benetton", "#00A550"), ("brawn", "#B8FD6E"),
    ("toyota", "#CC0000"), ("bmw", "#0066B2"), ("jaguar", "#2C7A4B"),
    ("brabham", "#00665E"), ("tyrrell", "#0044AA"), ("cooper", "#004225"),
    ("minardi", "#DFBB00"), ("arrows", "#FF8749"), ("ligier", "#0066CC"),
    ("marussia", "#B22222"), ("manor", "#B22222"), ("hrt", "#8B7355"),
]
_GENERIC_COLORS = {"", "#888888", "#888", None}


def team_color_for(team: str | None) -> str | None:
    """Official colour for a team name, or None if unknown."""
    t = (team or "").lower()
    if not t:
        return None
    if t == "rb":  # OpenF1's short name for Racing Bulls
        return "#6692FF"
    for token, color in TEAM_COLOR_TOKENS:
        if token in t:
            return color
    return None


def fill_team_colors(session: RaceSession) -> None:
    """Replace generic grey team colours with official ones wherever the team
    name is recognisable — drivers, classification and constructors alike."""
    for d in session.drivers:
        if d.team_color in _GENERIC_COLORS:
            d.team_color = team_color_for(d.team) or "#888888"
    for c in session.classification:
        if c.team_color in _GENERIC_COLORS:
            c.team_color = team_color_for(c.team) or "#888888"
    for con in session.constructors:
        if con.color in _GENERIC_COLORS:
            con.color = team_color_for(con.name) or "#888888"


# --------------------------------------------------------------------------- #
# VSC / Safety-Car cause attribution
# --------------------------------------------------------------------------- #
_CAR_RE = re.compile(r"CARS?\s+(\d+)\s*\(([A-Z]{3})\)", re.I)


def _incident_verb(message: str) -> str:
    m = message.lower()
    if "crash" in m or "accident" in m or "barrier" in m or "wall" in m:
        return "crashed"
    if "collision" in m:
        return "was involved in a collision"
    if "spun" in m or "spin" in m:
        return "spun"
    if "stopped" in m:
        return "stopped on track"
    if "puncture" in m:
        return "had a puncture"
    if "debris" in m:
        return "left debris on track"
    return "had an incident"


def attach_window_causes(session: RaceSession) -> None:
    """Work out who brought out each VSC / Safety Car, from the official
    race-control messages first, then from retirements at the window start."""
    by_num = {str(d.number): d for d in session.drivers}
    by_code = {d.code: d for d in session.drivers}

    for w in session.track_status_windows:
        if w.cause:
            continue
        cause: str | None = None

        # 1) an official message naming the car, right around the window start
        msgs = [m for m in session.race_control
                if m.lap is not None and w.start_lap - 1 <= m.lap <= w.start_lap + 1
                and m.message]
        for m in msgs:
            hit = _CAR_RE.search(m.message)
            if not hit:
                continue
            drv = by_code.get(hit.group(2).upper()) or by_num.get(hit.group(1))
            name = drv.name if drv else hit.group(2).upper()
            cause = f"{name} {_incident_verb(m.message)}"
            break

        # 2) fall back to a retirement at (or just before) the window start
        if not cause:
            candidates = [c for c in session.classification
                          if c.retired and c.laps_completed is not None
                          and w.start_lap - 2 <= c.laps_completed <= w.end_lap]
            if candidates:
                c = min(candidates, key=lambda r: abs((r.laps_completed or 0) - w.start_lap))
                reason = (c.retirement_reason or "").strip()
                cause = f"{c.name} retired" + (
                    f" ({reason.lower()})" if reason and reason.lower() not in ("retired", "dnf") else "")

        w.cause = cause


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
    fill_team_colors(session)
    attach_window_causes(session)
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
