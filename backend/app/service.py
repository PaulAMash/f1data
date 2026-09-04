"""
Service layer — thin facade over the DataSourceManager.

Keeps the API routes decoupled from the (now multi-source) data plumbing.
"""
from __future__ import annotations

from . import schedule
from .adapters import data_source_manager as dsm
from .models import DataSource, GrandPrix, RaceSession, Season


def get_seasons() -> tuple[list[Season], DataSource]:
    return dsm.get_seasons()


def get_grands_prix(year: int) -> tuple[list[GrandPrix], DataSource]:
    gps, src = dsm.get_grands_prix(year)
    return mark_completed(gps), src


def mark_completed(gps: list[GrandPrix]) -> list[GrandPrix]:
    """Stamp every event with what has actually been run.

    THE ROOT CAUSE THIS EXISTS TO CLOSE. `event_completed` was already the
    server's answer to "has this happened", and `get_current` was the only thing
    that asked. Both calendar endpoints returned the whole season — so the Race
    Explorer's picker offered Brazil 2026 in August, and loading it produced an
    empty session that looked like a broken product rather than a race that has
    not been run yet. The same list fed the Historical page.

    Every client re-deriving that rule from `date` would be three copies of one
    decision, drifting apart the first time a session slips. It is decided here,
    once, and travels with the data.

    V101 MOVED THE ANSWER OFF `date` AND ONTO THE SESSION TIMES, because the
    rule above was right and its input was not: OpenF1 puts the weekend's
    Friday in `date` and Jolpica puts the race's Sunday there, so on the
    opening day of a weekend the event was stamped completed and the Explorer
    went looking for a race two days out. Both sources agree about
    `session_times`, so that is what decides — per session, not per weekend.
    See app/schedule.py.
    """
    now = schedule.now_utc()
    for g in gps:
        g.available_sessions = schedule.available_sessions(g, now)
        g.completed = schedule.race_done(g, now)
    return gps


def get_session(year: int, gp: str, session_type: str = "Race",
                force_mock: bool = False, refresh: bool = False) -> RaceSession:
    return dsm.load_session(year, gp, session_type, force_mock=force_mock, refresh=refresh)


def event_completed(g: GrandPrix) -> bool:
    """Has this Grand Prix's race actually been run?

    Kept as the named question the rest of the app asks; the answer now comes
    from the race's own start time rather than from `date` — see
    schedule.race_done and the note in mark_completed.
    """
    return schedule.race_done(g)


def get_current() -> dict:
    """What Race Explorer opens by default: the season in progress and the most
    recent session that has actually been run.

    IT NAMES THE SESSION, and that is the half that used to be missing. This
    returned a Grand Prix and the literal string "Race", and the Explorer
    opened on whatever it was handed — so during a weekend whose race is still
    two days away the page asked for a race that did not exist. The most recent
    RUN session is the honest answer to "what is there to read", and mid-weekend
    it is Practice 1 or Qualifying rather than nothing at all.

    Older seasons live in Historical.
    """
    from datetime import date
    from .config import get_settings

    settings = get_settings()
    cal_year = date.today().year
    now = schedule.now_utc()

    # Try the calendar year's schedule directly (robust even if a seasons probe
    # flakes); fall back through previous years until one has something run.
    year, gp, session = cal_year, None, "Race"
    for candidate in (cal_year, cal_year - 1, cal_year - 2):
        try:
            gps, _src = get_grands_prix(candidate)
        except Exception:  # noqa: BLE001
            continue
        # An event is worth opening as soon as ANY of its sessions has run —
        # a Friday reader gets Practice 1 rather than last month's race.
        started = [g for g in gps if g.available_sessions]
        if not started:
            continue
        year = candidate
        chosen = started[-1]
        if settings.mock_mode:
            chosen = next((g for g in started if "austria" in g.name.lower()), chosen)
        gp = chosen.name
        # The latest session that has been run, which is the one a reader
        # arriving mid-weekend actually wants.
        session = chosen.available_sessions[-1]
        break

    return {"year": year, "gp": gp, "session": session, "seasons": [year]}


def data_source_health():
    return dsm.data_source_health()


def source_label(source: DataSource) -> str:
    return {
        DataSource.LIVE: "Real F1 data",
        DataSource.CACHE: "Cached real data",
        DataSource.MOCK: "Demo / simulated data",
    }[source]
