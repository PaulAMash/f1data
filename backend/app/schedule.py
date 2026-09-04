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


def available_sessions(gp: GrandPrix, now: datetime | None = None) -> list[str]:
    """Every session of this weekend that has actually been run, in order."""
    now = now or now_utc()
    return [s for s in (gp.sessions or []) if session_available(gp, s, now)]


def race_done(gp: GrandPrix, now: datetime | None = None) -> bool:
    """Has the Grand Prix itself been run?

    This is what `GrandPrix.completed` has always meant, decided from the
    race's own instant instead of from a field that means Friday to one
    source and Sunday to another.
    """
    now = now or now_utc()
    if "Race" in (gp.sessions or []) or (gp.session_times or {}).get("Race"):
        return session_available(gp, "Race", now)
    # No race on the card at all (a testing event, a malformed record): fall
    # back to the event's own date, which is the only signal left.
    return session_available(gp, "Race", now)


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
