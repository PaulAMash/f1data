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
#
# Accuracy over presentation: a neutralization's cause is taken ONLY from
# official FIA race-control messages that genuinely describe an incident, never
# from a bare car mention. Messages that merely reference a car for an
# unrelated reason (track limits, "noted", under investigation, penalties, blue
# flags, false-start checks) are explicitly rejected so they can never be
# mistaken for the trigger. When the official feed does not conclusively
# identify a cause we say so, rather than inventing one.
# --------------------------------------------------------------------------- #
# every car cited in a message. FIA writes "CARS 44 (HAM) AND 63 (RUS)" — one
# "CARS" for both — so we match the bare "<number> (COD)" token, which catches
# every car whether or not it carries its own CAR/CARS prefix.
_ALL_CARS_RE = re.compile(r"\b(\d{1,2})\s*\(([A-Z]{2,3})\)")

# a car is mentioned, but NOT because it caused anything — never a trigger
_NON_CAUSE_RE = re.compile(
    r"(?i)\b(track\s*limits?|lap\s*deleted|deleted|noted|under\s+investigation|"
    r"will\s+be\s+investigated|no\s+further\s+action|investigat|penal|reprimand|"
    r"warning|black[\s-]*and[\s-]*white|blue\s+flag|false\s+start|unsafe\s+release|"
    r"impeding|forced\s+off|left\s+the\s+track|pit\s+lane\s+speed)\b")

# genuine incident descriptors, strongest first; (regex, verb, severity rank)
_INCIDENT_PATTERNS = [
    (re.compile(r"(?i)\b(collision|collided|contact|clash|incident\s+involving)\b"), "collided", 0),
    (re.compile(r"(?i)\b(crash|accident|into\s+(the\s+)?(barrier|wall)|hit\s+(the\s+)?(barrier|wall))\b"), "crashed", 1),
    (re.compile(r"(?i)\b(spun|spin)\b"), "spun", 2),
    (re.compile(r"(?i)\b(stopped|stationary|beached|stranded|off\s+at)\b"), "stopped on track", 3),
    (re.compile(r"(?i)\bpuncture\b"), "had a puncture", 4),
    (re.compile(r"(?i)\bdebris\b"), "left debris on track", 5),
    (re.compile(r"(?i)\bincident\b"), "was involved in an incident", 6),
]


def _cars_in(message: str, by_code: dict, by_num: dict) -> list[str]:
    """Driver names for every car cited in a message, in order, de-duplicated."""
    names: list[str] = []
    for num, code in _ALL_CARS_RE.findall(message):
        drv = by_code.get(code.upper()) or by_num.get(num)
        name = drv.name if drv else code.upper()
        if name not in names:
            names.append(name)
    return names


# neutral phrasing when an official incident is logged but names no car — still
# accurate, just not attributed to a driver (fits "Brought out when {…}")
_NEUTRAL = {
    "collided": "cars collided",
    "crashed": "a car crashed",
    "spun": "a car spun",
    "stopped on track": "a car stopped on track",
    "had a puncture": "a car had a puncture",
    "left debris on track": "debris was left on track",
    "was involved in an incident": "an incident on track",
}


def _phrase(names: list[str], verb: str) -> str | None:
    """Human cause phrase from the drivers involved and the incident verb.
    A car-less incident message still yields a neutral but official cause."""
    if not names:
        return _NEUTRAL.get(verb)
    if verb == "collided":
        if len(names) >= 2:
            head = " and ".join(names[:2])
            more = f" (+{len(names) - 2} more)" if len(names) > 2 else ""
            return f"{head} collided{more}"
        return f"{names[0]} was involved in a collision"
    return f"{names[0]} {verb}"


def classify_incident_message(session: RaceSession, message: str) -> tuple[list[str], str | None]:
    """(driver names, incident verb) if the message genuinely describes an
    incident and is not an incidental non-cause mention (track limits, noted,
    under investigation, penalty…); else ([], None). Used wherever a single
    race-control line needs interpreting (e.g. qualifying red flags)."""
    if not message or _NON_CAUSE_RE.search(message):
        return [], None
    by_num = {str(d.number): d for d in session.drivers}
    by_code = {d.code: d for d in session.drivers}
    for pat, verb, _rank in _INCIDENT_PATTERNS:
        if pat.search(message):
            return _cars_in(message, by_code, by_num), verb
    return [], None


def official_incident_cause(session: RaceSession, w) -> tuple[str | None, str | None]:
    """(human cause, verbatim official message) for a window, or (None, None)
    if no official race-control message conclusively identifies the cause.
    Best genuine-incident message wins — never the first car mentioned."""
    by_num = {str(d.number): d for d in session.drivers}
    by_code = {d.code: d for d in session.drivers}

    for span in (1, 2, 3):   # widen only if a tighter window found nothing
        # rank: a car-naming message beats a car-less one, then by incident
        # severity, then by proximity to the window start
        best: tuple[tuple, list[str], str, str] | None = None
        for m in session.race_control:
            if not m.message or m.lap is None:
                continue
            if not (w.start_lap - span <= m.lap <= w.start_lap + 1):
                continue
            if _NON_CAUSE_RE.search(m.message):
                continue   # incidental car mention — never a trigger
            for pat, verb, rank in _INCIDENT_PATTERNS:
                if pat.search(m.message):
                    names = _cars_in(m.message, by_code, by_num)
                    key = (0 if names else 1, rank, abs(m.lap - w.start_lap))
                    if best is None or key < best[0]:
                        best = (key, names, verb, m.message.strip())
                    break
        if best:
            _, names, verb, message = best
            phrase = _phrase(names, verb)
            if phrase:
                return phrase, message
            # an official incident with no car named — neutral, still official
            return "an unidentified incident", message
    return None, None


def attach_window_causes(session: RaceSession) -> None:
    """Set each VSC / Safety-Car window's cause: official race-control incident
    message first (authoritative), then a cautious single-retirement inference,
    else left unset so the UI states the cause was not officially recorded."""
    for w in session.track_status_windows:
        if w.cause:
            continue

        cause, _msg = official_incident_cause(session, w)

        # cautious inference — ONLY when the official feed named no cause AND a
        # single car retired right at the window start (an unambiguous
        # coincidence). Anything less is left undetermined, not guessed.
        if not cause:
            retirements = [c for c in session.classification
                           if c.retired and c.laps_completed is not None
                           and w.start_lap - 1 <= c.laps_completed <= w.start_lap + 1]
            if len(retirements) == 1:
                c = retirements[0]
                reason = (c.retirement_reason or "").strip()
                extra = (f" ({reason.lower()})"
                         if reason and reason.lower() not in ("retired", "dnf") else "")
                cause = f"{c.name} retired{extra}"

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
