"""
Service layer — orchestrates data sources and applies the fallback policy.

Resolution order for a session (unless mock mode is forced):
    1. explicit force_mock            -> simulated demo race (labelled MOCK)
    2. local cache (real data)        -> instant, labelled CACHE
    3. live fetch via pitwall/FastF1  -> labelled LIVE, then cached
    4. anything failed                -> simulated demo race (labelled MOCK)

Calendars follow the same idea: try real, fall back to the mock calendar.
"""
from __future__ import annotations

import logging

from . import cache
from .adapters import mock_adapter
from .adapters import pitwall_adapter as real
from .config import get_settings
from .models import DataSource, GrandPrix, RaceSession, Season

log = logging.getLogger("pitwall_iq.service")


# --------------------------------------------------------------------------- #
# Calendar
# --------------------------------------------------------------------------- #
def get_seasons() -> tuple[list[Season], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
        try:
            return real.list_seasons(), DataSource.LIVE
        except Exception as exc:  # noqa: BLE001
            log.info("season list falling back to mock: %s", exc)
    return mock_adapter.mock_seasons(), DataSource.MOCK


def get_grands_prix(year: int) -> tuple[list[GrandPrix], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
        try:
            return real.list_grands_prix(year), DataSource.LIVE
        except Exception as exc:  # noqa: BLE001
            log.info("gp list falling back to mock: %s", exc)
    return mock_adapter.mock_grands_prix(year), DataSource.MOCK


# --------------------------------------------------------------------------- #
# Session
# --------------------------------------------------------------------------- #
def get_session(year: int, gp: str, session_type: str = "Race",
                force_mock: bool = False, refresh: bool = False) -> RaceSession:
    settings = get_settings()

    if force_mock or settings.mock_mode:
        return mock_adapter.get_mock_session(year, gp, session_type)

    if not refresh:
        cached = cache.load(year, gp, session_type)
        if cached is not None:
            return cached

    if settings.enable_live_fetch:
        try:
            session = real.fetch_session(year, gp, session_type)
            try:
                cache.save(session)
            except Exception as exc:  # noqa: BLE001
                log.warning("could not cache session: %s", exc)
            return session
        except Exception as exc:  # noqa: BLE001
            log.info("live fetch failed, using mock: %s", exc)
            session = mock_adapter.get_mock_session(year, gp, session_type)
            session.notes = [
                "Live fetch failed — showing simulated demo data.",
                f"Reason: {str(exc)[:240]}",
            ]
            return session

    return mock_adapter.get_mock_session(year, gp, session_type)


def source_label(source: DataSource) -> str:
    return {
        DataSource.LIVE: "Real F1 data (pitwall)",
        DataSource.CACHE: "Cached real data",
        DataSource.MOCK: "Demo / simulated data",
    }[source]
