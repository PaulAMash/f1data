"""
Service layer — thin facade over the DataSourceManager.

Keeps the API routes decoupled from the (now multi-source) data plumbing.
"""
from __future__ import annotations

from .adapters import data_source_manager as dsm
from .models import DataSource, GrandPrix, RaceSession, Season


def get_seasons() -> tuple[list[Season], DataSource]:
    return dsm.get_seasons()


def get_grands_prix(year: int) -> tuple[list[GrandPrix], DataSource]:
    return dsm.get_grands_prix(year)


def get_session(year: int, gp: str, session_type: str = "Race",
                force_mock: bool = False, refresh: bool = False) -> RaceSession:
    return dsm.load_session(year, gp, session_type, force_mock=force_mock, refresh=refresh)


def event_completed(g: GrandPrix) -> bool:
    """Has this Grand Prix already happened? Undated events are assumed completed
    (historical sources sometimes omit dates; future calendars always have them)."""
    from datetime import date, datetime
    if not g.date:
        return True
    try:
        d = datetime.fromisoformat(str(g.date).replace("Z", "+00:00")).date()
    except ValueError:
        return True
    return d <= date.today()


def get_current() -> dict:
    """What Race Explorer opens by default: the current season and its most
    recent *completed* Grand Prix — never a race that hasn't happened yet.
    Older seasons live in Historical."""
    from datetime import date
    from .config import get_settings

    settings = get_settings()
    cal_year = date.today().year

    # Try the calendar year's schedule directly (robust even if a seasons probe
    # flakes); fall back through previous years until one has a completed race.
    year, gp = cal_year, None
    for candidate in (cal_year, cal_year - 1, cal_year - 2):
        try:
            gps, _src = get_grands_prix(candidate)
        except Exception:  # noqa: BLE001
            continue
        done = [g for g in gps if event_completed(g)]
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
