"""
DataSourceManager — picks and combines real F1 data sources, with fallback.

Priority by era (see the README):
  * 2023+   : OpenF1 -> FastF1/pitwall -> Jolpica -> cache -> mock
  * 2018-22 : FastF1/pitwall -> Jolpica -> cache -> mock
  * pre-2018: Jolpica (advanced facets marked unavailable) -> cache -> mock

The first source that returns a usable session becomes the *primary*. We then
enrich it: pit-stop durations (PitStopDataService, possibly from Jolpica),
inferred overtakes if none were provided, and a SourceReport describing exactly
which facet came from where. Mock is used only on total failure or when forced.
"""
from __future__ import annotations

import logging

from .. import cache
from ..analysis.events import infer_overtakes
from ..config import get_settings
from ..models import (
    DataSource,
    FacetSource,
    GrandPrix,
    RaceSession,
    Season,
    SourceProbe,
    SourceReport,
    session_category,
)
from . import jolpica_adapter, mock_adapter, openf1_adapter, pitstop_service
from . import pitwall_adapter as fastf1

log = logging.getLogger("pitwall_iq.dsm")


# --------------------------------------------------------------------------- #
# source chain by era
# --------------------------------------------------------------------------- #
def _chain(year: int):
    """Ordered list of (name, fetch_callable) real sources for a year."""
    openf1_src = ("openf1", openf1_adapter.fetch_session)
    fastf1_src = ("fastf1", fastf1.fetch_session)
    jolpica_src = ("jolpica", jolpica_adapter.fetch_session)
    if year >= 2023:
        return [openf1_src, fastf1_src, jolpica_src]
    if year >= 2018:
        return [fastf1_src, jolpica_src]
    return [jolpica_src]


# --------------------------------------------------------------------------- #
# session load
# --------------------------------------------------------------------------- #
def load_session(year: int, gp: str, session_type: str,
                 force_mock: bool = False, refresh: bool = False) -> RaceSession:
    settings = get_settings()

    if force_mock or settings.mock_mode:
        return mock_adapter.get_mock_session(year, gp, session_type)

    if not refresh:
        cached = cache.load(year, gp, session_type)
        if cached is not None:
            if cached.source_report:
                cached.source_report.data_source = DataSource.CACHE
            return cached

    if settings.enable_live_fetch:
        errors: list[str] = []
        for name, fetch in _chain(year):
            try:
                session = fetch(year, gp, session_type)
                _post_process(session, primary=name)
                try:
                    cache.save(session)
                except Exception as exc:  # noqa: BLE001
                    log.warning("cache save failed: %s", exc)
                return session
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{name}: {str(exc)[:120]}")
                log.info("source %s failed: %s", name, exc)
        # everything failed -> mock, clearly labelled with the reason
        session = mock_adapter.get_mock_session(year, gp, session_type)
        session.notes = ["Live data unavailable from every source — showing demo data.",
                         *[f"· {e}" for e in errors[:4]]]
        if session.source_report:
            session.source_report.missing = ["all live sources unreachable"]
        return session

    return mock_adapter.get_mock_session(year, gp, session_type)


def _post_process(session: RaceSession, primary: str) -> None:
    """Enrich a freshly-fetched real session and finalize its source report."""
    session.category = session.category or session_category(session.session_type)

    # pit-stop timing (may pull durations from Jolpica)
    try:
        pitstop_service.enrich(session, allow_network=True)
    except Exception as exc:  # noqa: BLE001
        log.info("pitstop enrich failed: %s", exc)

    # overtakes: infer if the source didn't supply them (races/sprints only)
    if not session.overtakes and session.category in ("race", "sprint") and session.positions:
        session.overtakes = infer_overtakes(session)
        if session.source_report:
            session.source_report.facets.append(
                FacetSource(facet="overtakes", source="inferred", confidence="medium",
                            detail="Derived from the lap-by-lap position trace."))

    # classification fallback from Jolpica if the primary lacked it
    if not session.classification and primary != "jolpica":
        try:
            _drivers, rows, _meta = jolpica_adapter.fetch_classification(session.year, session.grand_prix)
            session.classification = rows
            if not session.drivers:
                session.drivers = _drivers
            if session.source_report:
                session.source_report.facets.append(
                    FacetSource(facet="results", source="jolpica", confidence="high"))
        except Exception:  # noqa: BLE001
            pass

    if session.source_report:
        session.source_report.partial = bool(session.source_report.missing)
        session.source_report.cache_key = cache.cache_key(
            session.year, session.grand_prix, session.session_type)
    session.partial = bool(session.source_report and session.source_report.missing)


# --------------------------------------------------------------------------- #
# calendar
# --------------------------------------------------------------------------- #
def get_seasons() -> tuple[list[Season], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
        for fn in (openf1_adapter.list_seasons, jolpica_adapter.list_seasons, fastf1.list_seasons):
            try:
                seasons = fn()
                if seasons:
                    return _merge_seasons(seasons), DataSource.LIVE
            except Exception:  # noqa: BLE001
                continue
    return mock_adapter.mock_seasons(), DataSource.MOCK


def _merge_seasons(seasons: list[Season]) -> list[Season]:
    seen = {}
    for s in seasons:
        seen.setdefault(s.year, s)
    return sorted(seen.values(), key=lambda s: -s.year)


def get_grands_prix(year: int) -> tuple[list[GrandPrix], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
        sources = ([openf1_adapter.list_grands_prix, jolpica_adapter.list_grands_prix]
                   if year >= 2023 else [jolpica_adapter.list_grands_prix])
        for fn in sources:
            try:
                gps = fn(year)
                if gps:
                    return gps, DataSource.LIVE
            except Exception:  # noqa: BLE001
                continue
    return mock_adapter.mock_grands_prix(year), DataSource.MOCK


# --------------------------------------------------------------------------- #
# health / diagnostics
# --------------------------------------------------------------------------- #
def data_source_health() -> list[SourceProbe]:
    probes: list[SourceProbe] = []
    ok, detail = openf1_adapter.probe()
    probes.append(SourceProbe(name="openf1", reachable=ok, detail=detail))
    ok, detail = jolpica_adapter.probe()
    probes.append(SourceProbe(name="jolpica", reachable=ok, detail=detail))
    # FastF1 / pitwall share the F1 archive host
    try:
        fastf1.list_seasons()
        probes.append(SourceProbe(name="fastf1", reachable=True, detail="reachable"))
    except Exception as exc:  # noqa: BLE001
        probes.append(SourceProbe(name="fastf1", reachable=False, detail=str(exc)[:120]))
    probes.append(SourceProbe(name="pitwall", reachable=None, detail="uses FastF1 / F1 archive"))
    probes.append(SourceProbe(name="cache", reachable=True,
                              detail=str(get_settings().cache_dir)))
    return probes
