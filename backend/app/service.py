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


def get_current() -> dict:
    """Best-effort 'what should Race Explorer open by default' — the current
    season and its most recent Grand Prix race. Race Explorer is scoped to this
    season; older seasons live in Historical."""
    from datetime import date
    from .config import get_settings

    settings = get_settings()
    seasons, _ = get_seasons()
    cal_year = date.today().year
    years = [s.year for s in seasons] or [cal_year]
    completed = [y for y in years if y <= cal_year]
    year = max(completed) if completed else max(years)

    gp = None
    try:
        gps, _src = get_grands_prix(year)
        if settings.mock_mode:
            gp = next((g.name for g in gps if "austria" in g.name.lower()), None)
        gp = gp or (gps[-1].name if gps else None)
    except Exception:  # noqa: BLE001
        pass
    return {"year": year, "gp": gp, "session": "Race", "seasons": years}


def data_source_health():
    return dsm.data_source_health()


def source_label(source: DataSource) -> str:
    return {
        DataSource.LIVE: "Real F1 data",
        DataSource.CACHE: "Cached real data",
        DataSource.MOCK: "Demo / simulated data",
    }[source]
