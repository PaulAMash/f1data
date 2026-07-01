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
def _reason_code(year: int, attempts: list[dict]) -> str:
    """A single machine-readable reason the UI maps to helpful guidance."""
    from datetime import date
    if year > date.today().year:
        return "future_session"
    cats = {a.get("category") for a in attempts}
    if not attempts:
        return "not_found"
    if cats == {"disabled"}:
        return "live_disabled"
    if cats <= {"not_available"}:
        return "no_source_coverage"
    if "timeout" in cats:
        return "timeout"
    if cats & {"unreachable"}:
        return "source_error"
    return "source_error"


_REASON_MESSAGE = {
    "future_session": "This session may not have happened yet, so no source has data for it.",
    "no_source_coverage": "None of our sources (OpenF1, FastF1, Jolpica) cover this session — "
                          "it may be too old for detailed timing, or the name didn't match.",
    "source_error": "The data sources were unreachable. This is usually a temporary network issue.",
    "timeout": "The data sources took too long to respond. Please try again.",
    "not_found": "We couldn't find this session. Check the season, Grand Prix and session.",
    "live_disabled": "Live data fetching is turned off on this server.",
    "partial_data": "Only part of this session's data was available.",
}


class DataUnavailableError(RuntimeError):
    """No real data could be loaded. Carries a structured, user-safe reason.

    The website NEVER silently substitutes demo data for a failed real fetch —
    this is raised instead, and the API turns it into an honest error the UI can
    show with reason-specific guidance, retry, and quick alternatives.
    """
    def __init__(self, year: int, gp: str, session_type: str, attempts: list[dict]):
        self.year, self.gp, self.session_type = year, gp, session_type
        self.attempts = attempts
        self.reason = _reason_code(year, attempts)
        self.retryable = self.reason in ("source_error", "timeout") or any(a.get("retryable") for a in attempts)
        super().__init__(f"No real data for {gp} {year} {session_type} ({self.reason})")

    def to_payload(self) -> dict:
        return {
            "error": "data_unavailable",
            "reason": self.reason,
            "message": (f"We couldn't load real data for {self.gp} {self.year} "
                        f"({self.session_type}). {_REASON_MESSAGE.get(self.reason, '')}").strip(),
            "retryable": self.retryable,
            "attempts": self.attempts,
        }


def _classify(exc: Exception) -> tuple[str, bool]:
    """(category, retryable) from an adapter exception — no secrets, no tracebacks."""
    msg = str(exc).lower()
    if any(t in msg for t in ("no ", "not found", "no session", "no results", "matches")):
        return "not_available", False
    if any(t in msg for t in ("timeout", "timed out")):
        return "timeout", True
    if any(t in msg for t in ("connection", "connect", "resolve", "network",
                              "403", "407", "proxy", "ssl", "certificate")):
        return "unreachable", True
    return "error", True


def load_session(year: int, gp: str, session_type: str,
                 force_mock: bool = False, refresh: bool = False) -> RaceSession:
    settings = get_settings()

    # Explicit, developer-only demo mode (make demo / PITWALL_IQ_MOCK_MODE=true).
    # Never used as a silent fallback for a failed real fetch.
    if force_mock or settings.mock_mode:
        return mock_adapter.get_mock_session(year, gp, session_type)

    if not refresh:
        cached = cache.load(year, gp, session_type)
        if cached is not None:
            if cached.source_report:
                cached.source_report.data_source = DataSource.CACHE
            return cached

    attempts: list[dict] = []
    if settings.enable_live_fetch:
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
                category, retryable = _classify(exc)
                attempts.append({"source": name, "category": category,
                                 "message": str(exc)[:160], "retryable": retryable})
                log.info("source %s failed (%s): %s", name, category, exc)
    else:
        attempts.append({"source": "live", "category": "disabled",
                         "message": "Live fetching is disabled (PITWALL_IQ_ENABLE_LIVE=false).",
                         "retryable": False})

    # No silent demo fallback — surface an honest, structured error.
    raise DataUnavailableError(year, gp, session_type, attempts)


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
