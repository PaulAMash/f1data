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


def data_source_health():
    return dsm.data_source_health()


def source_label(source: DataSource) -> str:
    return {
        DataSource.LIVE: "Real F1 data",
        DataSource.CACHE: "Cached real data",
        DataSource.MOCK: "Demo / simulated data",
    }[source]
