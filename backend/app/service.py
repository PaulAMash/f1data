"""
Service layer — thin facade over the DataSourceManager.

Keeps the API routes decoupled from the (now multi-source) data plumbing.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from .adapters import data_source_manager as dsm
from .models import DataSource, GrandPrix, RaceSession, Season


def get_seasons() -> tuple[list[Season], DataSource]:
    return dsm.get_seasons()


def get_grands_prix(year: int) -> tuple[list[GrandPrix], DataSource]:
    gps, src = dsm.get_grands_prix(year)
    return mark_completed(gps), src


def mark_completed(gps: list[GrandPrix]) -> list[GrandPrix]:
    """Stamp every event with whether its race has actually been run.

    THE ROOT CAUSE THIS EXISTS TO CLOSE. `event_completed` was already the
    server's answer to "has this happened", and `get_current` was the only thing
    that asked. Both calendar endpoints returned the whole season — so the Race
    Explorer's picker offered Brazil 2026 in August, and loading it produced an
    empty session that looked like a broken product rather than a race that has
    not been run yet. The same list fed the Historical page.

    Every client re-deriving that rule from `date` would be three copies of one
    decision, drifting apart the first time a session slips. It is decided here,
    once, and travels with the data.
    """
    for g in gps:
        g.completed = event_completed(g)
    return gps


def get_session(year: int, gp: str, session_type: str = "Race",
                force_mock: bool = False, refresh: bool = False) -> RaceSession:
    return dsm.load_session(year, gp, session_type, force_mock=force_mock, refresh=refresh)


#: HOW LONG A SESSION CAN STILL BE RUNNING AFTER IT STARTED.
#:
#: The sport's own ceiling: a race is two hours of running inside a three-hour
#: window once suspensions are counted, and no other session comes close. A
#: Grand Prix is therefore "run" once its final scheduled session started this
#: long ago — not before, and never on the strength of a calendar date alone.
EVENT_RUN_WINDOW = timedelta(hours=3)

#: The fallback when a calendar carries a start *instant* but no per-session
#: schedule: a weekend is three days from its first session, and the window
#: above covers the last of them.
EVENT_SPAN_WITHOUT_SCHEDULE = timedelta(days=3)


def _instant(text: str | None) -> datetime | None:
    """A timezone-aware instant from an ISO string, or None. A naive value is
    read as UTC, which is what every upstream source actually sends."""
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def last_session_start(g: GrandPrix) -> datetime | None:
    """The start of the event's final scheduled session, if the schedule says."""
    starts = [_instant(t) for t in (g.session_times or {}).values()]
    starts = [t for t in starts if t is not None]
    return max(starts) if starts else None


def event_completed(g: GrandPrix, now: datetime | None = None) -> bool:
    """Has this Grand Prix already been run?

    THE BUG THIS REPLACES. The previous rule reduced the event's `date` to a
    calendar day and asked whether that day had arrived. `date` is the *first*
    session's start — so from 00:00 UTC on Friday of a race weekend the whole
    Grand Prix read as completed: ten hours before Practice 1, two and a half
    days before the race. `get_current` then opened the app on a race with no
    data, and every client that trusted the flag moved its countdown on to the
    following Grand Prix while this one had not started.

    The answer now comes from the schedule itself, compared as instants:

    * with a session schedule, the event is run once its *last* session started
      `EVENT_RUN_WINDOW` ago — a race that has begun is in progress, not done;
    * with only a start instant (no schedule), the weekend is assumed to span
      `EVENT_SPAN_WITHOUT_SCHEDULE` from that instant;
    * with only a calendar day — historical sources give the race *day* — the
      event is run once that day is over, UTC;
    * with no date at all — some archive entries — it is history, as before.

    `now` is injectable so the rule can be tested at any instant.
    """
    now = now or datetime.now(timezone.utc)

    last = last_session_start(g)
    if last is not None:
        return now >= last + EVENT_RUN_WINDOW

    if not g.date:
        return True
    text = str(g.date)
    if "T" not in text:
        try:
            return now.date() > date.fromisoformat(text[:10])
        except ValueError:
            return True
    start = _instant(text)
    if start is None:
        return True
    return now >= start + EVENT_SPAN_WITHOUT_SCHEDULE


def get_current(now: datetime | None = None) -> dict:
    """What Race Explorer opens by default: the current season and its most
    recent *completed* Grand Prix — never a race that hasn't happened yet.
    Older seasons live in Historical. `now` is injectable for tests."""
    from .config import get_settings

    settings = get_settings()
    now = now or datetime.now(timezone.utc)
    cal_year = now.year

    # Try the calendar year's schedule directly (robust even if a seasons probe
    # flakes); fall back through previous years until one has a completed race.
    year, gp = cal_year, None
    for candidate in (cal_year, cal_year - 1, cal_year - 2):
        try:
            gps, _src = get_grands_prix(candidate)
        except Exception:  # noqa: BLE001
            continue
        done = [g for g in gps if event_completed(g, now=now)]
        if done:
            year = candidate
            if settings.mock_mode:
                gp = next((g.name for g in done if "austria" in g.name.lower()), None)
            gp = gp or done[-1].name
            break

    return {"year": year, "gp": gp, "session": "Race", "seasons": [year]}


def data_source_health():
    return dsm.data_source_health()


def source_label(source: DataSource) -> str:
    return {
        DataSource.LIVE: "Real F1 data",
        DataSource.CACHE: "Cached real data",
        DataSource.MOCK: "Demo / simulated data",
    }[source]
