"""
Neutralisations — Safety Car, Virtual Safety Car, red flag — from the record,
with provenance, and with the event kept apart from whatever may have caused it.

WHAT THIS REPLACES, AND WHY IT HAD TO.

Two window builders lived in two adapters, and a third attributor lived in the
normalizer. Between them they could produce every one of these from a clean
race-control log:

  * a Safety Car that never happened — any message containing "SAFETY CAR"
    opened a window, so a stewards' line ("… 5 SECOND TIME PENALTY - SAFETY CAR
    INFRINGEMENT") deployed one at the lap the penalty was announced;
  * a Safety Car that ended the lap it began — any message containing "CLEAR"
    closed every open window, and the FIA clears sectors ("CLEAR IN TRACK
    SECTOR 5") while the Safety Car is still out. That is the "Safety Car
    L3–3" the Italian Grand Prix showed;
  * a red flag that did not exist — the builder only paired VSC/SC lines, so a
    stoppage was invisible and the restart Safety Car after it read as a
    second, unexplained Safety Car;
  * a cause the source never stated — "Brought out when Leclerc and Hamilton
    collided" was the nearest incident-shaped message within three laps of the
    window's first lap, attached to every window it was near, which is how a
    restart Safety Car on lap 4 was captioned with a lap-1 collision.

The rules now, in one place:

  1. A WINDOW COMES FROM AN OFFICIAL STATUS, NEVER FROM A RESEMBLANCE. The
     FIA's own deployment and ending lines, recognised by their category and
     their exact wording ("SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR ENDING",
     "RED FLAG"); or the timing system's per-lap track-status codes, where the
     archive publishes them. A message that merely mentions a safety car is a
     message that mentions a safety car. A sector clear clears a sector.
  2. VSC, SC AND RED ARE THREE THINGS. Each opens and closes on its own lines;
     a red flag closes whatever was open, because the session stopped.
  3. THE EVENT IS NOT THE CAUSE. `cause` is set only when the deployment line
     itself states it. The official incident lines logged in the window's
     laps are attached as `incidents` — participants exactly as the FIA named
     them — and labelled as logged alongside the window, not as its trigger.
     A single retirement in the window is a retirement in the window.
  4. NOTHING IS INFERRED FROM LAP TIMES. Cars slowing down is not a Safety Car.

Every window says where it came from (`source`), how sure the boundary laps
are (`confidence`), and whether its end was published (`end_known`).
"""
from __future__ import annotations

import re

from ..models import (
    Incident, Lap, NeutralizationCounts, RaceControlEvent, RaceSession, TrackStatus,
    TrackStatusWindow,
)

# --------------------------------------------------------------------------- #
# the FIA's own lines
# --------------------------------------------------------------------------- #
_DEPLOY = re.compile(r"^\s*(?P<v>VIRTUAL\s+)?SAFETY\s+CAR\s+DEPLOYED\b", re.I)
_END = re.compile(r"^\s*(?P<v>VIRTUAL\s+)?SAFETY\s+CAR\s+(ENDING|IN\s+THIS\s+LAP)\b", re.I)
_RED = re.compile(r"^\s*RED\s+FLAG\b", re.I)
_RESUME = re.compile(r"\b(RESTART|RESUME|TRACK\s+CLEAR)\b", re.I)

LABEL = {TrackStatus.VSC: "Virtual Safety Car", TrackStatus.SAFETY_CAR: "Safety Car",
         TrackStatus.RED: "Red Flag"}


def classify_line(e: RaceControlEvent) -> tuple[TrackStatus | None, str | None]:
    """(status, action) for one race-control line, from what it IS, not what
    it mentions: ("SAFETY_CAR", "start") for "SAFETY CAR DEPLOYED", ("VSC",
    "end") for "VIRTUAL SAFETY CAR ENDING", ("RED", "start") for a red flag,
    ("RED", "end") for a line that resumes the session, (None, None) for
    everything else — including a stewards' decision about a safety-car
    infringement, which is not a safety car. The deployment and ending forms
    are anchored at the start of the line: "FIA STEWARDS: … SAFETY CAR
    INFRINGEMENT" can never match, whatever it contains."""
    msg = (e.message or "").strip()
    cat = (e.category or "").lower()
    flag = (e.flag or "").strip().upper()
    up = msg.upper()
    if cat in ("carevent", "drs"):
        return None, None                 # a car event or a DRS notice is never a status
    m = _DEPLOY.match(msg)
    if m:
        return (TrackStatus.VSC if m.group("v") else TrackStatus.SAFETY_CAR), "start"
    m = _END.match(msg)
    if m:
        return (TrackStatus.VSC if m.group("v") else TrackStatus.SAFETY_CAR), "end"
    if flag == "RED" or _RED.match(msg):
        return TrackStatus.RED, "start"
    if flag in ("GREEN", "CLEAR") and (e.scope or "").lower() in ("track", ""):
        if "PIT EXIT" in up:
            return None, None             # "GREEN LIGHT - PIT EXIT OPEN" is the pit lane, not the track
        return TrackStatus.RED, "end"
    if _RESUME.search(msg) and "SECTOR" not in up:
        return TrackStatus.RED, "end"
    return None, None


def windows_from_race_control(events: list[RaceControlEvent]) -> list[TrackStatusWindow]:
    """Windows paired from the FIA's deployment and ending lines, in log order.

    Lap numbers: the feed is chronological and a line without a lap is still
    on the lap of the line before it — carried forward, and a window whose
    boundary was carried says so (`confidence="medium"`). A line with no lap
    to inherit places nothing.
    """
    windows: list[TrackStatusWindow] = []
    open_: dict[TrackStatus, TrackStatusWindow] = {}
    carried: int | None = None
    last_lap = 0
    for e in events:
        lap = e.lap if e.lap is not None else carried
        carried_lap = e.lap is None
        if lap is not None:
            carried, last_lap = lap, max(last_lap, lap)
        status, action = classify_line(e)
        if status is None or lap is None:
            continue
        conf = "medium" if carried_lap else "high"
        if action == "start":
            if status in open_:
                continue                      # the feed repeats a deployment; one window
            if status == TrackStatus.RED:
                # the session stopped: whatever was out is over at this lap
                for st, w in list(open_.items()):
                    w.end_lap = max(w.start_lap, lap)
                    windows.append(w)
                    del open_[st]
            elif TrackStatus.RED in open_:
                # a Safety Car deployed during a stoppage is the restart: the
                # stoppage ends where the field gets going again
                w = open_.pop(TrackStatus.RED)
                w.end_lap = max(w.start_lap, lap)
                windows.append(w)
            w = TrackStatusWindow(status=status, start_lap=lap, end_lap=lap, label=LABEL[status],
                                  source="race_control", confidence=conf)
            open_[status] = w
        elif action == "end":
            if status == TrackStatus.RED:
                w = open_.pop(TrackStatus.RED, None)
                if w is not None:
                    w.end_lap = max(w.start_lap, lap)
                    if conf == "medium":
                        w.confidence = "medium"
                    windows.append(w)
                continue
            w = open_.pop(status, None)
            if w is None:
                continue                      # an ending for nothing open: the line is logged, not a window
            w.end_lap = max(w.start_lap, lap)
            if conf == "medium":
                w.confidence = "medium"
            windows.append(w)
    # a deployment the log never closed: it ran to the last lap the log knows,
    # and the window says its end was not published
    for st, w in open_.items():
        w.end_lap = max(w.start_lap, last_lap)
        w.end_known = False
        windows.append(w)
    # a Safety Car deployed as a restart after a red flag begins where the
    # stoppage ends; keep the log's own order of events
    return sorted(windows, key=lambda w: (w.start_lap, _SEVERITY[w.status]))


_SEVERITY = {TrackStatus.GREEN: 0, TrackStatus.YELLOW: 1, TrackStatus.VSC: 2,
             TrackStatus.SAFETY_CAR: 3, TrackStatus.RED: 4}


def windows_from_laps(laps: list[Lap]) -> list[TrackStatusWindow]:
    """Windows from the timing system's per-lap status codes (the archive
    stamps every lap with the most severe status seen during it). Only the
    three neutralising statuses; a local yellow is not a window."""
    per_lap: dict[int, TrackStatus] = {}
    for lp in laps:
        st = lp.track_status
        if st in (TrackStatus.VSC, TrackStatus.SAFETY_CAR, TrackStatus.RED):
            cur = per_lap.get(lp.lap)
            per_lap[lp.lap] = st if cur is None or _SEVERITY[st] >= _SEVERITY[cur] else cur
    windows: list[TrackStatusWindow] = []
    cur: TrackStatusWindow | None = None
    for lap in sorted(per_lap):
        st = per_lap[lap]
        if cur and cur.status == st and lap == cur.end_lap + 1:
            cur.end_lap = lap
        else:
            if cur:
                windows.append(cur)
            cur = TrackStatusWindow(status=st, start_lap=lap, end_lap=lap, label=LABEL[st],
                                    source="track_status")
    if cur:
        windows.append(cur)
    return windows


def _overlaps(a: TrackStatusWindow, b: TrackStatusWindow) -> bool:
    return a.status == b.status and a.start_lap <= b.end_lap and b.start_lap <= a.end_lap


def derive_windows(session: RaceSession, lap_status_authoritative: bool) -> list[TrackStatusWindow]:
    """The session's neutralisations, from its own record, on every read.

    The race-control log first — its deployment lines are the explicit fact.
    Then, when the laps carry the timing system's own status codes (the
    archive route; never the codes this pipeline stamped onto OpenF1 laps
    from earlier windows), any neutralisation the codes show that the log
    did not pair is added from them: the lap-1 Safety Car whose deployment
    line predates the first lap stamp is the usual case. A session with no
    log and no coded laps keeps the windows its adapter supplied (the
    simulator's), labelled as its.
    """
    rc = windows_from_race_control(session.race_control)
    lap_windows = windows_from_laps(session.laps) if lap_status_authoritative else []
    if rc or lap_windows:
        out = list(rc)
        for w in lap_windows:
            if not any(_overlaps(w, r) for r in out):
                out.append(w)
        return sorted(out, key=lambda w: (w.start_lap, _SEVERITY[w.status]))
    if session.race_control or (lap_status_authoritative and session.laps):
        return []                             # a log with no deployments is a green race
    # no log and no coded laps: only the adapter's own word for it remains
    return [w.model_copy(update={"source": w.source if w.source != "unknown" else "mock"})
            for w in session.track_status_windows]


# --------------------------------------------------------------------------- #
# incidents: what race control logged, exactly as it named it
# --------------------------------------------------------------------------- #
# every car cited in a message. FIA writes "CARS 44 (HAM) AND 63 (RUS)" — one
# "CARS" for both — so we match the bare "<number> (COD)" token.
_ALL_CARS_RE = re.compile(r"\b(\d{1,2})\s*\(([A-Z]{2,3})\)")

# a car is mentioned, but NOT because it caused anything — never an incident
_NON_CAUSE_RE = re.compile(
    r"(?i)\b(track\s*limits?|lap\s*deleted|deleted|noted|under\s+investigation|"
    r"will\s+be\s+investigated|no\s+further\s+action|investigat|penal|reprimand|"
    r"warning|black[\s-]*and[\s-]*white|blue\s+flag|false\s+start|unsafe\s+release|"
    r"impeding|forced\s+off|left\s+the\s+track|pit\s+lane\s+speed)\b")

# genuine incident descriptors, strongest first; (regex, kind, verb phrase)
_INCIDENT_PATTERNS = [
    (re.compile(r"(?i)\b(collision|collided|contact|clash|incident\s+involving)\b"), "collision", "collided"),
    (re.compile(r"(?i)\b(crash(?:ed|es|ing)?|accident|into\s+(the\s+)?(barrier|wall)|hit\s+(the\s+)?(barrier|wall))\b"), "crash", "crashed"),
    (re.compile(r"(?i)\b(spun|spin)\b"), "spun", "spun"),
    (re.compile(r"(?i)\b(stopped|stationary|beached|stranded|off\s+at)\b"), "stopped", "stopped on track"),
    (re.compile(r"(?i)\bpunctured?\b"), "puncture", "had a puncture"),
    (re.compile(r"(?i)\bdebris\b"), "debris", "left debris on track"),
    (re.compile(r"(?i)\bincident\b"), "incident", "was involved in an incident"),
]
VERB = {kind: verb for _re, kind, verb in _INCIDENT_PATTERNS}


def cars_in(message: str) -> list[str]:
    """Driver codes cited by a message, in order, de-duplicated."""
    out: list[str] = []
    for _num, code in _ALL_CARS_RE.findall(message or ""):
        if code.upper() not in out:
            out.append(code.upper())
    return out


def incident_of(e: RaceControlEvent) -> Incident | None:
    """The incident a line describes, or None when it describes none — a line
    that cites a car incidentally (track limits, an investigation, a penalty)
    is not an incident and never becomes one."""
    msg = (e.message or "").strip()
    if not msg or _NON_CAUSE_RE.search(msg):
        return None
    for pat, kind, _verb in _INCIDENT_PATTERNS:
        if pat.search(msg):
            return Incident(lap=e.lap, kind=kind, drivers=cars_in(msg), message=msg)
    return None


def incidents_logged(session: RaceSession, w: TrackStatusWindow) -> list[Incident]:
    """Incident lines logged from the lap before the window opened to the lap
    it closed. Logged ALONGSIDE — the deployment lap and the one before it are
    where a trigger would be logged, but the log does not say which line, if
    any, was the trigger, and neither does this."""
    out: list[Incident] = []
    carried: int | None = None
    for e in session.race_control:
        lap = e.lap if e.lap is not None else carried
        if e.lap is not None:
            carried = e.lap
        if lap is None or not (w.start_lap - 1 <= lap <= w.end_lap):
            continue
        inc = incident_of(e)
        if inc is not None:
            inc.lap = lap
            out.append(inc)
    return out


def stated_cause(session: RaceSession, w: TrackStatusWindow) -> tuple[str | None, str | None]:
    """A cause the deployment line ITSELF states — "SAFETY CAR DEPLOYED - CAR
    16 STOPPED AT TURN 1" — with the line as evidence. Most feeds never do;
    then there is no cause, and the window says so by carrying none."""
    for e in session.race_control:
        status, action = classify_line(e)
        if status != w.status or action != "start" or e.lap not in (None, w.start_lap):
            continue
        inc = incident_of(e)
        if inc is None:
            return None, None
        names = [driver_name(session, c) for c in inc.drivers]
        phrase = _phrase(names, inc.kind)
        return phrase, (e.message or "").strip()
    return None, None


def driver_name(session: RaceSession, code: str) -> str:
    return next((d.name for d in session.drivers if d.code == code), code)


def _phrase(names: list[str], kind: str) -> str:
    verb = VERB.get(kind, "was involved in an incident")
    if not names:
        return {"collision": "cars collided", "crash": "a car crashed", "spun": "a car spun",
                "stopped": "a car stopped on track", "puncture": "a car had a puncture",
                "debris": "debris was left on track"}.get(kind, "an incident on track")
    if kind == "collision":
        if len(names) >= 2:
            more = f" (+{len(names) - 2} more)" if len(names) > 2 else ""
            return f"{' and '.join(names[:2])} collided{more}"
        return f"{names[0]} was involved in a collision"
    return f"{names[0]} {verb}"


def describe_incident(session: RaceSession, inc: Incident) -> str:
    """"Charles Leclerc stopped on track" — the message's own cars and verb."""
    return _phrase([driver_name(session, c) for c in inc.drivers], inc.kind)


def logged_alongside(session: RaceSession, w: TrackStatusWindow) -> str | None:
    """One clause for the text layer: what the log holds in these laps, with
    no claim that it caused anything — or None when it holds nothing."""
    if not w.incidents:
        return None
    parts = []
    for inc in w.incidents[:2]:
        parts.append(describe_incident(session, inc) + (f" (lap {inc.lap})" if inc.lap else ""))
    return "; ".join(parts)


def attach_incidents(session: RaceSession) -> None:
    """Fill `incidents`, and `cause` only where a line states it, for every
    window. Idempotent: computed from the log each time."""
    for w in session.track_status_windows:
        w.incidents = incidents_logged(session, w)
        cause, message = stated_cause(session, w)
        w.cause, w.cause_source, w.cause_message = cause, ("race_control" if cause else None), message


# --------------------------------------------------------------------------- #
# what the windows say about the rest of the record
# --------------------------------------------------------------------------- #
def stamp_pit_stops(session: RaceSession) -> None:
    """A stop is under a neutralisation when its lap is inside a window of
    that kind — from the canonical windows, so every client reads one answer.
    A red flag is not a pit stop under neutralisation: the car is parked."""
    for p in session.pit_stops:
        p.under_safety_car = any(w.status == TrackStatus.SAFETY_CAR and w.start_lap <= p.lap <= w.end_lap
                                 for w in session.track_status_windows)
        p.under_vsc = any(w.status == TrackStatus.VSC and w.start_lap <= p.lap <= w.end_lap
                          for w in session.track_status_windows)


def stamp_lap_status(session: RaceSession, overwrite: bool) -> None:
    """Per-lap status inherited from the windows, for a source that only knows
    it as windows. `overwrite` for laps whose status this pipeline stamped
    (OpenF1's have none of their own), never for laps the archive coded."""
    if not session.laps:
        return
    if overwrite:
        for lp in session.laps:
            lp.track_status = TrackStatus.GREEN
    elif any(lp.track_status != TrackStatus.GREEN for lp in session.laps):
        return
    for w in session.track_status_windows:
        for lp in session.laps:
            if w.start_lap <= lp.lap <= w.end_lap and _SEVERITY[w.status] > _SEVERITY[lp.track_status]:
                lp.track_status = w.status


def local_yellows(events: list[RaceControlEvent]) -> int:
    """Yellow-flag EPISODES, sector-aware: the feed repeats a yellow for as
    long as the incident stands, so a message count is not an incident count.
    A yellow opens an episode for its sector; its clear (or any track-wide
    green / chequered / red) closes it."""
    open_: set[str] = set()
    episodes = 0
    for e in events:
        flag = (e.flag or "").strip().upper()
        up = (e.message or "").upper()
        m = re.search(r"SECTOR\s*(\d+)", up)
        sector = f"S{m.group(1)}" if m else "TRACK"
        if flag == "RED" or _RED.match(up):
            open_.clear()
        elif "YELLOW" in flag:
            if sector not in open_:
                open_.add(sector)
                episodes += 1
        elif flag in ("GREEN", "CHEQUERED", "CHECKERED"):
            open_.clear()
        elif flag == "CLEAR" or "TRACK CLEAR" in up:
            if sector == "TRACK":
                open_.clear()
            else:
                open_.discard(sector)
    return episodes


def counts(session: RaceSession) -> NeutralizationCounts:
    ws = session.track_status_windows
    sc = sum(1 for w in ws if w.status == TrackStatus.SAFETY_CAR)
    vsc = sum(1 for w in ws if w.status == TrackStatus.VSC)
    red = sum(1 for w in ws if w.status == TrackStatus.RED)
    sources = {w.source for w in ws}
    source = ("race_control" if "race_control" in sources else
              "track_status" if "track_status" in sources else
              "mock" if "mock" in sources else "none")
    if not ws and session.race_control:
        source = "race_control"
    return NeutralizationCounts(safety_cars=sc, virtual_safety_cars=vsc, red_flags=red,
                                total=sc + vsc + red, local_yellows=local_yellows(session.race_control),
                                source=source)
