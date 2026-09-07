"""
Session normalization — guards against untrustworthy raw values reaching the UI.

Some sources report the leader's *cumulative race time* in the gap field, which
must never be shown as a "+5197s gap". And when a source has no pit data, we must
not let the app claim a "0-stop race". This runs once per loaded session.
"""
from __future__ import annotations

import re

from ..models import Compound, PitStop, RaceSession, Stint, TrackStatus

# A plausible on-track gap ceiling (seconds). Anything larger is almost certainly
# cumulative time, not a gap — so we drop it rather than display nonsense.
MAX_PLAUSIBLE_GAP_S = 300.0


# --------------------------------------------------------------------------- #
# A driver's name, in one case
#
# "Kimi ANTONELLI" is not a fallback and it is not a style: it is the literal
# `full_name` OpenF1 publishes, surname shouted the way a timing screen does.
# For as long as the OpenF1 adapter could not serve a session (V107 fixed the
# crash that kept it out of the chain) nobody saw it; the day it became the
# primary for 2023+, every name on every page arrived in that case, and every
# surface that takes the last word of a name as the surname — the story, the
# position chart, the initials in an avatar — inherited it. The website and
# the app do not style names; they show what the record says. So the record
# says it once, here, the way the sport writes it: given name, family name,
# each capitalised, particles ("de", "van der") lower where they belong.
#
# Applied on the way in (the OpenF1 adapter builds from `first_name` and
# `last_name` and only falls back to this) and on the way out of the cache
# (`data_source_manager._finalize_session`), so a record cached with shouted
# names is healed on its next read at no cost.
# --------------------------------------------------------------------------- #
_NAME_PARTICLES = {"de", "da", "di", "del", "della", "van", "der", "den", "von",
                   "la", "le", "du", "dos", "das", "af", "av"}


def _cased(token: str) -> str:
    """"ANTONELLI" -> "Antonelli", "O'WARD" -> "O'Ward", "JEAN-ERIC" -> "Jean-Eric"."""
    return re.sub(r"[^\W\d_]+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), token)


def canonical_name(name: str | None) -> str:
    """A display name in the sport's own case; a name already in it is unchanged.

    Only tokens that are ENTIRELY upper-case are touched, so "Nyck de Vries",
    "JJ Lehto" and "Zhou Guanyu" pass through as written. A lone three-letter
    token is a driver code standing in for a name and is left alone.
    """
    if not name:
        return name or ""
    tokens = name.split()
    out: list[str] = []
    for i, tok in enumerate(tokens):
        letters = sum(1 for ch in tok if ch.isalpha())
        shouted = letters >= 2 and tok == tok.upper() and tok != tok.lower()
        if not shouted:
            out.append(tok)
        elif i > 0 and tok.lower() in _NAME_PARTICLES:
            out.append(tok.lower())
        elif letters <= 2 or (len(tokens) == 1 and letters <= 3):
            out.append(tok)                     # initials ("JJ"), or a bare code
        else:
            out.append(_cased(tok))
    return " ".join(out)


def canonicalize_names(session: RaceSession) -> bool:
    """Every driver and classification name in canonical case. Returns whether
    anything changed, so a cached record that needed it can be written back."""
    changed = False
    for d in session.drivers:
        fixed = canonical_name(d.name)
        if fixed != d.name:
            d.name, changed = fixed, True
    for c in session.classification:
        fixed = canonical_name(c.name)
        if fixed != c.name:
            c.name, changed = fixed, True
    return changed


# --------------------------------------------------------------------------- #
# One fact, held twice
# --------------------------------------------------------------------------- #
def sync_grids(session: RaceSession) -> bool:
    """The starting grid lives on the entry list AND on the classification row,
    and the reconciliation steps fill only the row. The pace model reads the
    entry list first, so a grid the row knew and the entry did not produced a
    pace table with no net positions on a race whose classification had every
    one. Fill each from the other; never overwrite either."""
    by_code = {c.driver: c for c in session.classification}
    changed = False
    for d in session.drivers:
        c = by_code.get(d.code)
        if c is None:
            continue
        if d.grid is None and c.grid is not None:
            d.grid, changed = c.grid, True
        elif c.grid is None and d.grid is not None:
            c.grid, changed = d.grid, True
    return changed


# --------------------------------------------------------------------------- #
# The gap, in one format
# --------------------------------------------------------------------------- #
def canonical_gap(gap: str | None) -> str | None:
    """"+17.878" (Ergast's own string) -> "+17.878s"; "+1 Lap", "LEADER" and
    "+11.536s" are already canonical. Every source's margin reads the same."""
    if gap is None:
        return None
    g = str(gap).strip()
    if not g:
        return None
    if re.fullmatch(r"[-+]?\d+(?:\.\d+)?", g):
        return f"{g if g.startswith(('+', '-')) else '+' + g}s"
    return g


# --------------------------------------------------------------------------- #
# What a pit-lane duration is, and when it is not a stop
# --------------------------------------------------------------------------- #
#: Longer than this in the pit lane is not a racing stop. A tyre change with a
#: front-wing replacement is forty seconds; a rear-wing change or a puncture
#: repair, ninety. Twenty minutes is a red flag — every car parked in the lane
#: until the restart — or a car in the garage for repairs, and the feeds record
#: both as a pit entry with a duration. Averaging those into "pit loss" put a
#: 1,298-second figure on a card whose scale ends at thirty.
MAX_RACING_PIT_LANE_S = 180.0
#: Typical green-flag pit-lane transit (drive in + out, excluding the stop
#: itself), used only to derive a LABELLED estimate of the stationary time
#: from the lane time when nothing measured the stop.
TYPICAL_LANE_TRANSIT_S = 18.5
MIN_STATIONARY_S = 1.9

_STOPPAGE_NOTE = ("In the pit lane for {secs:.0f}s — a stoppage, repair or garage stay "
                  "rather than a racing stop, so it is not counted as a stop cost.")


def finalize_pit_stop(p: PitStop) -> bool:
    """Settle every derived pit-stop field from the measured ones, for any
    source and any season, idempotently. Returns whether anything changed.

    Three rules, in order:

    1. A lane duration that arrived in `stop_duration` from a source that only
       ever measured the lane (they used to be written to both fields) is a
       lane time and is moved there; the stop itself was never measured.
    2. A lane time beyond `MAX_RACING_PIT_LANE_S` is a stoppage, not a stop
       cost: the entry stays (the car did enter the pit lane) and the cost
       fields are cleared, with the reason kept in plain words.
    3. Confidence, explanation and the labelled stationary ESTIMATE follow
       from whatever measured value remains.
    """
    before = (p.stationary_time, p.pit_lane_time, p.stop_duration,
              p.estimated_stationary_time, p.confidence, p.explanation)
    if p.stop_duration is not None and p.stop_duration == p.pit_lane_time:
        p.stop_duration = None
    for field in ("pit_lane_time", "stop_duration"):
        v = getattr(p, field)
        if v is not None and v > MAX_RACING_PIT_LANE_S:
            p.pit_lane_time = p.stop_duration = p.estimated_stationary_time = None
            p.confidence = "low"
            p.explanation = _STOPPAGE_NOTE.format(secs=v)
            break
    if p.stationary_time:
        p.confidence = "high"
        p.explanation = p.explanation or "Measured stationary time (wheel-gun to release)."
    elif p.stop_duration:
        p.explanation = p.explanation or f"{p.source.title()} stop duration."
    elif p.pit_lane_time:
        # Derive a plausible stationary estimate from total pit-lane loss.
        p.estimated_stationary_time = round(
            max(MIN_STATIONARY_S, p.pit_lane_time - TYPICAL_LANE_TRANSIT_S), 1)
        p.confidence = "low"
        p.source = p.source if p.source not in ("unknown",) else "derived"
        p.explanation = (f"Estimated from pit-lane loss (~{p.pit_lane_time:.0f}s − "
                         f"~{TYPICAL_LANE_TRANSIT_S:.0f}s transit). Approximate.")
    else:
        p.estimated_stationary_time = None
        p.confidence = "low"
        p.explanation = p.explanation or "No stop-duration data available for this session."
    return (p.stationary_time, p.pit_lane_time, p.stop_duration,
            p.estimated_stationary_time, p.confidence, p.explanation) != before


def finalize_pit_stops(session: RaceSession) -> bool:
    changed = False
    for p in session.pit_stops:
        changed = finalize_pit_stop(p) or changed
    return changed

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
# Incidents, as race control logged them
#
# THE ATTRIBUTION THAT USED TO LIVE HERE IS GONE. `official_incident_cause`
# took the best incident-shaped message within three laps of a window's first
# lap and called it the cause; `attach_window_causes` fell back to "the one
# car that retired around then". Both are temporal proximity dressed as
# provenance, and both are how a restart Safety Car was captioned with a
# lap-1 collision. Windows now carry the incidents logged in their laps as
# incidents, and a cause only when a line states one — see
# analysis/neutralizations. What remains here is the one interpreter of a
# single line, used by the qualifying red-flag parse.
# --------------------------------------------------------------------------- #
def classify_incident_message(session: RaceSession, message: str) -> tuple[list[str], str | None]:
    """(driver names, incident verb) if the message genuinely describes an
    incident and is not an incidental non-cause mention (track limits, noted,
    under investigation, penalty…); else ([], None). The cars are the ones the
    line cites, by their codes — never a car that was merely nearby."""
    from .neutralizations import VERB, incident_of
    from ..models import RaceControlEvent
    inc = incident_of(RaceControlEvent(message=message or ""))
    if inc is None:
        return [], None
    by_code = {d.code: d for d in session.drivers}
    names = [by_code[c].name if c in by_code else c for c in inc.drivers]
    return names, VERB.get(inc.kind, "was involved in an incident")


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
        c.gap = canonical_gap(c.gap)
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


def fill_laps_completed(session: RaceSession) -> None:
    """Every classified retirement should report the lap it happened on. When a
    source leaves ``laps_completed`` blank, derive it from the furthest lap the
    driver actually reached in the lap / position data — a real figure straight
    from the timing, never a guess. Only fills a missing value; never overrides
    one the source provided."""
    if session.category not in ("race", "sprint"):
        return
    reached: dict[str, int] = {}
    for l in session.laps:
        reached[l.driver] = max(reached.get(l.driver, 0), l.lap)
    for p in session.positions:
        reached[p.driver] = max(reached.get(p.driver, 0), p.lap)
    for c in session.classification:
        if c.retired and not c.laps_completed:
            d = reached.get(c.driver)
            if d:
                c.laps_completed = d


def reconcile_stints_and_stops(session: RaceSession) -> None:
    """Enforce the physical invariant that a driver runs exactly one more tyre
    stint than the pit stops they completed (stints == stops + 1), and that a
    car which enters the pits only to retire is never credited with a completed
    stop or a fresh stint.

    Data sources sometimes emit a phantom trailing stint or count the final
    pit-lane entry of a retiring car — e.g. Hard → Soft → Hard → retired can
    arrive as 4 stints / 3 stops instead of the correct 3 stints / 2 stops.
    Both artefacts are removed here from real, source-provided data (nothing is
    ever invented), so the tyre-strategy chart and the pit-stop counts can
    never disagree. Runs for every source and season."""
    if session.category not in ("race", "sprint"):
        return

    # The last lap each driver actually completed under power — the boundary a
    # genuine stint or stop must fall on or before.
    last_lap: dict[str, int] = {}
    for l in session.laps:
        if l.lap_time is not None:
            last_lap[l.driver] = max(last_lap.get(l.driver, 0), l.lap)
    for c in session.classification:
        if c.laps_completed:
            last_lap[c.driver] = max(last_lap.get(c.driver, 0), c.laps_completed)

    # 1) Drop phantom stints: a "stint" the driver never ran a racing lap in
    #    (it begins after the last lap they completed) came from a retirement
    #    pit entry, not from racing.
    kept_stints: list[Stint] = []
    stints_by_driver: dict[str, list[Stint]] = {}
    for st in sorted(session.stints, key=lambda s: (s.driver, s.stint)):
        ll = last_lap.get(st.driver)
        if ll is not None and st.start_lap > ll:
            continue   # never ran this stint → phantom
        kept_stints.append(st)
        stints_by_driver.setdefault(st.driver, []).append(st)
    session.stints = kept_stints

    # 2) Drop retirement pit entries: a stop the driver never rejoined from
    #    (no completed racing lap after it) is not a racing pit stop. And a
    #    pit-lane entry during a red flag: the field is parked there, the feed
    #    logs it as an entry, and it is a stoppage rather than a stop.
    red = [w for w in session.track_status_windows if w.status == TrackStatus.RED]
    kept_stops: list[PitStop] = []
    for ps in session.pit_stops:
        ll = last_lap.get(ps.driver)
        if ll is not None and ps.lap >= ll:
            continue   # entered the pits and stayed there → retirement, not a stop
        if any(w.start_lap <= ps.lap <= w.end_lap for w in red):
            continue   # parked under a red flag → a stoppage, not a stop
        kept_stops.append(ps)
    session.pit_stops = kept_stops

    # 3) Make the per-driver stop count agree with the stints actually run.
    #    With real stint data the count is exact (stops == stints - 1); without
    #    it, fall back to the cleaned pit-stop list.
    #
    #    A TYRE CHANGE UNDER A RED FLAG IS NOT A PIT STOP. The field sits in
    #    the pit lane during a stoppage and may change tyres there; the stint
    #    feed records a new stint at the restart, and counting stints alone
    #    credited every car with a stop it never made. A stint that begins
    #    inside a red-flag window or at its restart is a stint change, not a
    #    stop — the feed logs the parked car as a pit entry too, so the entry
    #    cannot tell the two apart; the window can.
    def under_red_flag(st: Stint) -> bool:
        return any(w.start_lap <= st.start_lap <= w.end_lap + 1 for w in red)

    stops_from_list: dict[str, int] = {}
    for ps in kept_stops:
        stops_from_list[ps.driver] = stops_from_list.get(ps.driver, 0) + 1
    for c in session.classification:
        sts = stints_by_driver.get(c.driver)
        if sts:
            later = sorted(sts, key=lambda s: s.stint)[1:]
            c.pit_stops = sum(1 for st in later if not under_red_flag(st))
        else:
            c.pit_stops = stops_from_list.get(c.driver, c.pit_stops)


def recover_stint_compounds(session: RaceSession) -> None:
    """Fill in tyre compounds the source actually recorded but our derivation lost.

    A stint's compound is usually taken from the first lap of that stint — which
    is the out-lap, and out-laps are exactly the laps the timing feeds most often
    leave blank. One missing value therefore turned a whole stint grey and
    labelled it "Unknown" even though every other lap in it named the tyre. The
    same gap hides laps from long-run pace analysis, which skips laps with no
    compound.

    Both directions are repaired here, from the session's own data only — nothing
    is inferred from what a driver "probably" fitted:

    1. a stint with no compound adopts the compound its own laps report;
    2. a lap with no compound adopts the compound of the stint it ran in.

    Whatever is still unknown afterwards genuinely was not recorded, and the UI
    says so in those words.
    """
    known = lambda c: c is not None and c != Compound.UNKNOWN   # noqa: E731

    # 1) stint ← its laps. Lap membership is by stint number where the source
    #    provides one, and by lap range otherwise (the two disagree on sessions
    #    where a red flag restarts the numbering).
    laps_by_stint: dict[tuple[str, int], list] = {}
    laps_by_driver: dict[str, list] = {}
    for l in session.laps:
        laps_by_driver.setdefault(l.driver, []).append(l)
        if l.stint is not None:
            laps_by_stint.setdefault((l.driver, l.stint), []).append(l)

    for st in session.stints:
        if known(st.compound):
            continue
        pool = laps_by_stint.get((st.driver, st.stint)) or [
            l for l in laps_by_driver.get(st.driver, [])
            if st.start_lap <= l.lap <= st.end_lap
        ]
        counts: dict[Compound, int] = {}
        for l in pool:
            if known(l.compound):
                counts[l.compound] = counts.get(l.compound, 0) + 1
        if counts:
            # most-reported wins; a stray mislabelled lap can't outvote the rest
            st.compound = max(counts.items(), key=lambda kv: kv[1])[0]

    # 2) lap ← its stint, so pace analysis sees every lap the driver ran on a
    #    known tyre rather than dropping the out-lap and any blank alongside it.
    by_key = {(s.driver, s.stint): s for s in session.stints if known(s.compound)}
    for l in session.laps:
        if known(l.compound):
            continue
        st = by_key.get((l.driver, l.stint)) if l.stint is not None else None
        if st is None:
            st = next((s for s in session.stints
                       if s.driver == l.driver and known(s.compound)
                       and s.start_lap <= l.lap <= s.end_lap), None)
        if st is not None:
            l.compound = st.compound


def normalize_session(session: RaceSession) -> None:
    """In-place: fix gaps, fill derivable per-driver stats, and flag pit-data
    reliability so the UI never fabricates '0-stop race' claims or absurd gaps."""
    fix_classification(session)
    fill_team_colors(session)
    canonicalize_names(session)
    sync_grids(session)
    # a stoppage is not a stop cost, and a lane time is not a stationary time —
    # settled here, on every read, so a cached record's stops are right too
    finalize_pit_stops(session)
    # what race control logged in each window's laps, and which stops fell
    # inside one — from the canonical windows, so every client reads one answer
    from .neutralizations import attach_incidents, stamp_pit_stops
    attach_incidents(session)
    stamp_pit_stops(session)
    # Give every retirement a real "laps completed" from the timing when the
    # source left it blank, so the DNF badge and pace verdict always show a lap.
    fill_laps_completed(session)
    # Remove phantom stints / retirement pit entries and make per-driver stop
    # counts agree with the stints actually run, before anything reads them.
    reconcile_stints_and_stops(session)
    # Recover compounds the source recorded but the first-lap-wins derivation
    # dropped, so "Unknown" only ever means genuinely unrecorded.
    recover_stint_compounds(session)
    reliable = pit_data_reliable(session)
    session.pit_data_reliable = reliable

    if not reliable and session.category in ("race", "sprint"):
        # Without pit-lane data AND without stint evidence we can't trust a stop
        # count — zero those so no "0-stop race" story is generated (the UI shows
        # "pit data unavailable"). Drivers whose count came from real stint data
        # keep it: the number of stints is authoritative even without lane timing.
        drivers_with_stints = {s.driver for s in session.stints}
        for c in session.classification:
            if c.driver not in drivers_with_stints:
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


def order_classification(session: RaceSession) -> None:
    """FIA order, settled once, from the session as built.

    A FINISHER IS NEVER BELOW A RETIREMENT. That is the rule, and the reason it
    had to move here is that it cannot be enforced anywhere else: each adapter
    ordered its own rows correctly by its own provider's convention, and then
    the merge steps mixed conventions. Live timing gives a retirement no
    position at all; the results archive numbers retirements straight on after
    the finishers. Take the classification from one and the retirement flags
    from the other — which is exactly what `_enrich_from_results_archive` does — and a
    driver who took the flag ends up sitting between two DNFs.

    So the order is decided after every merge, from the facts on the rows,
    identically for every source and every session:

      * Classified finishers first, in their existing order (position where a
        source gave one, then laps completed, then classified race time).
      * Retirements after them, the ones who got furthest first, which is the
        order the sport itself ranks them in.

    Finishers are then renumbered 1..N. That is not rewriting a result: it
    closes the gaps left where a retirement used to hold a number, so the
    printed position and the row's place in the table agree. Retirements lose
    their number on purpose — the table reads NC, which is what they are, and
    it is what the DNF badge beside them already said.
    """
    rows = session.classification
    if not rows:
        return

    def finished_key(c):
        return (c.position is None, c.position or 999,
                -(c.laps_completed or 0), c.race_time if c.race_time is not None else 9e9)

    def retired_key(c):
        # furthest first; a source-given position breaks ties among equals
        return (-(c.laps_completed or 0), c.position is None, c.position or 999)

    finishers = sorted((c for c in rows if not c.retired), key=finished_key)
    retirements = sorted((c for c in rows if c.retired), key=retired_key)

    for i, c in enumerate(finishers, start=1):
        c.position = i
    for c in retirements:
        c.position = None

    session.classification = finishers + retirements
