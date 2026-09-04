"""
The lifecycle of a Grand Prix weekend: scheduled, running, available.

WHY THIS MODULE EXISTS — AND THE BUG THAT PROVED IT HAD TO.

`service.event_completed` decided "has this happened" from `GrandPrix.date`
alone, and that field means two different things depending on which adapter
answered:

    OpenF1   (tried first for 2023+)  date = meeting.date_start  -> FRIDAY
    Jolpica  (the fallback)           date = race.date           -> SUNDAY

So on the Friday the Italian Grand Prix weekend opened, OpenF1's calendar
made `date <= today` true, the event was stamped `completed`, `get_current`
handed the Race Explorer `{gp: "Italian Grand Prix", session: "Race"}`, and
the product spent a request looking for a race two days in the future. The
same rule would misfire on the opening day of every weekend of the season.

One ambiguous field cannot carry this decision, and neither can a date: a
Grand Prix is not one event but six, each with its own instant. So the
question moves to where the answer actually lives — `session_times`, which
both adapters populate with real ISO instants per session, and which the
model has always carried for exactly this purpose.

THE DISTINCTION THIS MODULE IS BUILT ON:

    SCHEDULED   the calendar says this session will happen.  `sessions`
    AVAILABLE   the session has been run and its data can exist. `available_sessions`

A calendar tells you the first. Only the clock tells you the second, and
conflating them is what put an unrun race in front of a reader.

BETWEEN THEM SITS THE STATE THE PRODUCT LIVES FOR. A session that has started
and not yet finished is neither scheduled nor available, and a boolean has
nowhere to put it — so a reader arriving during Practice 1 was told the
session had not happened, which is the one thing that was not true.

AND THOSE ARE TWO QUESTIONS, NOT ONE. `session_state` used to answer "is it
live" with "is it unreadable", which made a slow archive look like a running
session: after the Italian Grand Prix's Practice 2 the site claimed the cars
were still out for the twenty minutes the settle window lasted. The lifecycle
(`session_state`: UPCOMING / LIVE / COMPLETED) is now read from the schedule
alone and nothing that fetches may move it; what Pitwall IQ can show for a
session is `session_analysis` (AVAILABLE / AWAITING), layered on top. Everything
above — the countdown, the schedule, the Explorer's gate, the live page —
reads those two answers rather than re-deriving its own.

WHY "FINISHED", NOT "STARTED". A session that began ninety seconds ago has
no classification, no stint table and no strategy to analyse — asking for it
buys a reader a spinner and an empty page. Availability therefore means the
session has *ended*, plus a short settling window for the archive to publish.
That is the honest reading of "data exists", and it is what keeps the product
from promising a session it cannot yet explain.

Everything above the adapters reads its answer from here, once, so no client
re-derives it and drifts — the same argument `service.mark_completed` makes,
now applied at the granularity the question actually has.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .models import GrandPrix

#: How long each session runs, in minutes. Regulation lengths, and where a
#: session can overrun (a red-flagged race, a qualifying hour that stretches)
#: the settle window below absorbs it — being a few minutes late to offer a
#: session costs nothing, being early costs a reader an empty page.
SESSION_MINUTES: dict[str, int] = {
    "Practice 1": 60,
    "Practice 2": 60,
    "Practice 3": 60,
    "Qualifying": 60,
    "Sprint Qualifying": 45,
    "Sprint Shootout": 45,
    "Sprint": 60,
    "Race": 150,          # two hours of racing, plus the grid and the podium
}

#: An unrecognised session name still needs an end. An hour is the shape of
#: almost every session on an F1 weekend.
DEFAULT_MINUTES = 60

#: The archive does not publish the moment the chequered flag falls. Timing
#: data lands within minutes; this is the grace period between a session
#: ending and the product claiming it can explain it.
SETTLE_MINUTES = 20

#: When a calendar carries no per-session times at all — an older season, a
#: source that publishes only race dates — the race is the one session whose
#: instant `date` can still be trusted to approximate. A whole day after it
#: is comfortably past any race that started that day, in any timezone.
DATE_ONLY_GRACE_HOURS = 24


def _parse(value: str | None) -> datetime | None:
    """An ISO instant from any of the shapes the adapters produce.

    Dates arrive as `2026-09-06`, `2026-09-06T13:00:00Z` and
    `2026-09-04T09:30:00+00:00` depending on the source. A bare date is read
    as midnight UTC, which is the earliest the day can begin anywhere — the
    conservative reading for a rule that must not fire early.
    """
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        # A bare date is the only other shape the adapters emit.
        try:
            parsed = datetime.fromisoformat(text[:10])
        except ValueError:
            return None
    # Naive values are treated as UTC: every source publishes UTC or an
    # explicit offset, and guessing a local zone on a server is how a
    # schedule silently shifts by an hour twice a year.
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def session_start(gp: GrandPrix, name: str) -> datetime | None:
    """When this session is scheduled to begin, or None if unknown."""
    return _parse((gp.session_times or {}).get(name))


def session_end(gp: GrandPrix, name: str) -> datetime | None:
    """When this session is expected to be over."""
    start = session_start(gp, name)
    if start is None:
        return None
    return start + timedelta(minutes=SESSION_MINUTES.get(name, DEFAULT_MINUTES))


def session_available_at(gp: GrandPrix, name: str) -> datetime | None:
    """The instant this session stops being live and becomes readable.

    SENT TO THE CLIENT SO IT NEED NOT GUESS. The browser already holds every
    start time and can move a session from upcoming to live the second the
    clock passes it; without this it could not do the same at the other end,
    because the settle window lives here and nowhere else. Publishing the
    instant rather than the rule keeps one definition of "available" — this
    one — and still lets the page turn over exactly on time instead of
    whenever it next happens to ask.
    """
    end = session_end(gp, name)
    return end + timedelta(minutes=SETTLE_MINUTES) if end else None


def session_available(gp: GrandPrix, name: str, now: datetime | None = None) -> bool:
    """Has this session run, such that completed data can exist for it?

    Falls back to the event date only for the Race, and only when the
    calendar gave no time at all — see DATE_ONLY_GRACE_HOURS. Every other
    session without a published time is treated as unavailable rather than
    guessed at: a missing time is not evidence that a session has happened.
    """
    now = now or now_utc()
    end = session_end(gp, name)
    if end is not None:
        return now >= end + timedelta(minutes=SETTLE_MINUTES)

    if name != "Race":
        return False
    dated = _parse(gp.date)
    if dated is None:
        # An undated event is historical — sources omit dates on old seasons,
        # and future calendars always carry them.
        return True
    return now >= dated + timedelta(hours=DATE_ONLY_GRACE_HOURS)


# --------------------------------------------------------------------------- #
# TWO QUESTIONS, NOT ONE.
#
# THE BUG THIS SEPARATION EXISTS TO CLOSE. `session_state` used to answer
# "where is this session in its life" with `AVAILABLE if settled else LIVE` —
# so LIVE meant "started and not yet readable", and a session went on calling
# itself live for the whole twenty-minute settle window after the flag. During
# the Italian Grand Prix that is exactly what a reader saw: Practice 2 finished,
# and the site said it was still running for another twenty minutes. Then the
# window elapsed, the session flipped straight to "available", the data still
# had not arrived, and the same session went from "on track" to a bare failure
# screen without ever having been allowed to be simply *over*.
#
# The settle window is a fact about ARCHIVES, not about cars. Conflating the two
# meant a provider being slow could change what the product believed about the
# real world. So there are two independent answers now:
#
#   LIFECYCLE   what the cars are doing.  Read from the schedule alone.
#               upcoming -> live -> completed, and `live` ends at the
#               scheduled end, not twenty minutes later.
#
#   ANALYSIS    what Pitwall IQ can show.  available, or awaiting.
#               A session can be completed for an hour and still be awaiting;
#               that is a normal state of the world and now has a name.
#
# Nothing that fetches may move the lifecycle. The system can know "the session
# is over" without knowing "the analysis is ready", which is the whole point.
# --------------------------------------------------------------------------- #

#: Lifecycle — the schedule's own answer, and never a fetch's.
UPCOMING = "upcoming"       # the clock has not reached it
LIVE = "live"               # the cars are on track, right now
COMPLETED = "completed"     # the flag has fallen

#: Analysis — what can actually be loaded for it.
AVAILABLE = "available"     # settled; the archive can be expected to answer
AWAITING = "awaiting"       # over, but the completed record has not landed yet


def session_state(gp: GrandPrix, name: str, now: datetime | None = None) -> str:
    """Where this session is in its life: UPCOMING, LIVE or COMPLETED.

    THE SCHEDULE DECIDES THIS AND NOTHING ELSE DOES. It is a statement about
    the world — whether the cars are running — so a provider having a bad
    afternoon cannot change it, and neither can a settle window. `live` ends
    when the session is scheduled to end.

    AN EVENT WITH NO PUBLISHED START IS NEVER CALLED LIVE. A bare calendar
    date parses to midnight UTC — thirteen hours before a race that starts at
    one in the afternoon — so claiming a session is underway on the strength
    of it would put a red dot on a page for most of a day for no reason. With
    no instant to stand on, the honest states are the two on either side.
    """
    now = now or now_utc()
    start = session_start(gp, name)
    if start is None:
        # No instant to stand on: the only evidence left is the date fallback
        # inside `session_available`, which is deliberately conservative.
        return COMPLETED if session_available(gp, name, now) else UPCOMING
    if now < start:
        return UPCOMING
    end = session_end(gp, name)
    return LIVE if end is not None and now < end else COMPLETED


def session_analysis(gp: GrandPrix, name: str, now: datetime | None = None) -> str:
    """What Pitwall IQ can show for it: AVAILABLE or AWAITING.

    AWAITING IS NOT A FAILURE. It is the ordinary state of a session between
    the chequered flag and the moment its official timing is published, and it
    is the state that had no name — which is why a finished session with no
    data yet could only be described as either still running or broken.
    """
    return AVAILABLE if session_available(gp, name, now) else AWAITING


def available_sessions(gp: GrandPrix, now: datetime | None = None) -> list[str]:
    """Every session of this weekend whose analysis can be loaded, in order."""
    now = now or now_utc()
    return [s for s in (gp.sessions or []) if session_available(gp, s, now)]


def completed_sessions(gp: GrandPrix, now: datetime | None = None) -> list[str]:
    """Every session of this weekend that has been run — whether or not its
    data has arrived. The larger set: everything in `available_sessions` is
    here, and so is a session that finished ten minutes ago."""
    now = now or now_utc()
    return [s for s in (gp.sessions or []) if session_state(gp, s, now) == COMPLETED]


def live_sessions(gp: GrandPrix, now: datetime | None = None) -> list[str]:
    """Every session of this weekend whose cars are on track right now.

    A list rather than one name because the model permits it, not because the
    sport does — two sessions of one Grand Prix never overlap, and if a
    schedule ever says they do, saying so is better than picking one.
    """
    now = now or now_utc()
    return [s for s in (gp.sessions or []) if session_state(gp, s, now) == LIVE]


def live_now(gps: list[GrandPrix], now: datetime | None = None
             ) -> tuple[GrandPrix, str] | None:
    """The session being run right now, anywhere on the calendar, if any.

    The whole basis of the live experience: one question, asked of the same
    session times the countdown counts and the Explorer gates on, so the site
    cannot simultaneously call a session live and offer to analyse it.
    """
    now = now or now_utc()
    for gp in gps:
        running = live_sessions(gp, now)
        if running:
            return gp, running[0]
    return None


def race_done(gp: GrandPrix, now: datetime | None = None) -> bool:
    """Has the Grand Prix itself been run?

    This is what `GrandPrix.completed` has always meant, decided from the
    race's own instant instead of from a field that means Friday to one
    source and Sunday to another.

    IT IS THE LIFECYCLE QUESTION, so it turns true when the chequered flag
    falls rather than twenty minutes later when the archive catches up. A race
    is over when it is over; whether its analysis has arrived is
    `session_analysis`, and the two are deliberately not the same field.
    """
    now = now or now_utc()
    return session_state(gp, "Race", now) == COMPLETED


def weekend_started(gp: GrandPrix, now: datetime | None = None) -> bool:
    """Has any session of this weekend been run yet?"""
    return bool(available_sessions(gp, now))


def next_session(gp: GrandPrix, now: datetime | None = None) -> tuple[str, datetime] | None:
    """The next session of this weekend that has not started, with its start."""
    now = now or now_utc()
    upcoming = [(s, t) for s in (gp.sessions or [])
                if (t := session_start(gp, s)) is not None and t > now]
    return min(upcoming, key=lambda pair: pair[1]) if upcoming else None


def next_session_across(gps: list[GrandPrix], now: datetime | None = None
                        ) -> tuple[GrandPrix, str, datetime] | None:
    """The very next session anywhere on the calendar.

    The countdown's whole job, answered from the same table the availability
    rules read — so a session cannot be counted down to and simultaneously
    offered as loadable, and neither can drift from the other.
    """
    now = now or now_utc()
    best: tuple[GrandPrix, str, datetime] | None = None
    for gp in gps:
        nxt = next_session(gp, now)
        if nxt and (best is None or nxt[1] < best[2]):
            best = (gp, nxt[0], nxt[1])
    return best
