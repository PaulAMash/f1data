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
import time

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
from . import headshots, jolpica_adapter, mock_adapter, openf1_adapter, pitstop_service
from . import pitwall_adapter as fastf1

log = logging.getLogger("pitwall_iq.dsm")


# --------------------------------------------------------------------------- #
# source chain by era
# --------------------------------------------------------------------------- #
def _chain(year: int):
    """Ordered list of (name, fetch_callable) real sources for a year."""
    openf1_src = ("openf1", openf1_adapter.fetch_session)
    fastf1_src = ("f1-archive", fastf1.fetch_session)
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
            # Fill portraits that were missing when this session was cached —
            # and persist, so it's a one-time cost per session.
            if settings.enable_live_fetch:
                try:
                    if headshots.enrich(cached):
                        cache.save(cached)
                except Exception as exc:  # noqa: BLE001
                    log.info("cached headshot enrich failed: %s", exc)
                # A session cached while a source was down is cached *incomplete*,
                # and the cache is thirty days deep — so one bad afternoon would
                # keep showing "partial data" for a month after the source came
                # back. Retry the still-missing facets (the breaker makes a
                # still-dead host free) and re-save only if we actually gained.
                try:
                    if _heal_cached(cached):
                        cache.save(cached)
                except Exception as exc:  # noqa: BLE001
                    log.info("cached facet heal failed: %s", exc)
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


def _set_facet(session: RaceSession, name: str, source: str,
               confidence: str = "high", detail: str | None = None) -> None:
    """Record where a facet came from — REPLACING any existing row for that
    facet (no duplicate 'Results & classification' entries) and clearing it
    from the missing list."""
    if not session.source_report:
        return
    session.source_report.facets = (
        [f for f in session.source_report.facets if f.facet != name]
        + [FacetSource(facet=name, source=source, confidence=confidence, detail=detail)])
    session.source_report.missing = [m for m in session.source_report.missing if m != name]


def _merge_missing_facets(session: RaceSession, primary: str) -> None:
    """Facet-level multi-source fallback. A primary source can return a session
    that exists but is hollow (no laps / results / pit stops); rather than
    accepting a 'partial' shell, pull those facets from Jolpica."""
    if primary == "jolpica" or session.category not in ("race", "sprint"):
        return
    if not session.laps:
        try:
            laps, positions = jolpica_adapter.fetch_laps(session.year, session.grand_prix)
            if laps:
                session.laps = laps
                _set_facet(session, "laps", "jolpica", "medium",
                           "Lap times from the historical archive (no outlier/sector detail).")
                if not session.positions and positions:
                    session.positions = positions
                    _set_facet(session, "positions", "jolpica", "medium")
        except Exception as exc:  # noqa: BLE001
            log.info("jolpica laps merge failed: %s", exc)
    if not session.pit_stops:
        try:
            stops = jolpica_adapter.fetch_pitstops(session.year, session.grand_prix)
            if stops:
                session.pit_stops = stops
                _set_facet(session, "pit_stops", "jolpica", "high")
        except Exception as exc:  # noqa: BLE001
            log.info("jolpica pit merge failed: %s", exc)
    if not session.classification:
        try:
            _drivers, rows, _meta = jolpica_adapter.fetch_classification(session.year, session.grand_prix)
            if rows:
                session.classification = rows
                if not session.drivers:
                    session.drivers = _drivers
                _set_facet(session, "results", "jolpica", "high")
        except Exception as exc:  # noqa: BLE001
            log.info("jolpica classification merge failed: %s", exc)


#: Facets the F1 live-timing archive carries that Jolpica does not. Jolpica is a
#: results archive — it has no tyre stints, no weather trace and no race-control
#: log — so these were the facets nothing ever backfilled.
_ARCHIVE_FACETS = ("stints", "race_control", "weather")


class _Breaker:
    """Stop asking a source that has just told us, repeatedly, that it is down.

    Enrichment is optional by definition: the session is already loaded and
    usable before we ask. So the cost of asking a dead host is paid entirely by
    the user, in seconds, on every single session they open — and the answer is
    the same every time. After a couple of consecutive failures we take the host
    at its word and skip it, re-testing once the cooldown expires so recovery is
    automatic and needs no restart.

    Deliberately not thread-safe beyond CPython's own atomicity: the worst race
    is one extra attempt, which is exactly what the cooldown probe does anyway.
    """

    def __init__(self, threshold: int, cooldown: float) -> None:
        self.threshold, self.cooldown = threshold, cooldown
        self.failures = 0
        self.opened_at = 0.0
        self.detail: str | None = None

    @property
    def open(self) -> bool:
        return self.failures >= self.threshold and (
            time.monotonic() - self.opened_at) < self.cooldown

    def allows(self) -> bool:
        if self.open:
            return False
        if self.failures >= self.threshold:
            self.failures = 0        # cooldown expired — let one request re-test
        return True

    def succeeded(self) -> None:
        self.failures, self.detail = 0, None

    def failed(self, detail: str) -> None:
        self.failures += 1
        self.opened_at = time.monotonic()
        self.detail = detail[:160]


#: Two strikes, then ten minutes of silence. Long enough that a sustained outage
#: costs one wasted request per ten minutes instead of one per page view; short
#: enough that a recovered host is back within a coffee break.
_archive_breaker = _Breaker(threshold=2, cooldown=600.0)

#: F1's live-timing archive starts here. Before it, tyre stints, weather traces
#: and race-control logs were never published in a machine-readable form by
#: anyone — the data doesn't exist rather than being unavailable to us.
_ARCHIVE_FIRST_YEAR = 2018

_ARCHIVE_DOWN_NOTE = ("The F1 live-timing archive isn't answering, so the tyre, "
                      "race-control and weather feeds it provides couldn't be loaded. "
                      "Everything else on this session is real and complete.")

_PRE_ARCHIVE_NOTE = (f"F1 only published lap-by-lap tyre, weather and race-control "
                     f"data from {_ARCHIVE_FIRST_YEAR} onwards, so those parts of this "
                     "session were never recorded — results and lap times are complete.")


def _note_missing_reason(session: RaceSession, reason: str) -> None:
    """Attach the first explanation we have; never overwrite a more specific one."""
    if session.source_report and not session.source_report.missing_reason:
        session.source_report.missing_reason = reason


def _merge_from_archive(session: RaceSession, primary: str) -> None:
    """Fill the facets only the F1 archive has.

    The archive was wired as a *fallback* — used when OpenF1 fails entirely —
    and never as an *enrichment* source. So when OpenF1 answered but returned an
    empty stint list (or no weather, or no race control), those facets stayed in
    `missing`, `partial` went true, and every single session wore the "Partial
    data" chip. The archive was sitting there with exactly that data and was
    never asked for it.

    Only runs when something is actually missing, only asks for the facets that
    are missing, and never overwrites data the primary source did supply.
    """
    # "fastf1" is the legacy name for the same host; asking the archive to
    # backfill a session the archive itself provided is a wasted round trip.
    if primary in ("f1-archive", "fastf1") or not session.source_report:
        return
    # F1's live-timing archive begins in 2018. A 1995 race has no stints there
    # and never will — asking is a guaranteed failure, and one that would drag
    # the breaker down and hide a genuinely healthy host from later sessions.
    if session.year < _ARCHIVE_FIRST_YEAR:
        _note_missing_reason(session, _PRE_ARCHIVE_NOTE)
        return
    wanted = [f for f in _ARCHIVE_FACETS if f in session.source_report.missing]
    if not wanted:
        return
    if not _archive_breaker.allows():
        log.info("archive facet merge skipped — circuit open (%s)", _archive_breaker.detail)
        _note_missing_reason(session, _ARCHIVE_DOWN_NOTE)
        return
    try:
        other = fastf1.fetch_session(session.year, session.grand_prix, session.session_type)
    except Exception as exc:  # noqa: BLE001
        log.info("archive facet merge unavailable: %s", exc)
        category, _retryable = _classify(exc)
        # "this session isn't in the archive" is a fact about the session and
        # says nothing about the host — it must not count towards the breaker.
        if category != "not_available":
            _archive_breaker.failed(f"{type(exc).__name__}: {exc}")
            _note_missing_reason(session, _ARCHIVE_DOWN_NOTE)
        return
    _archive_breaker.succeeded()

    if "stints" in wanted and other.stints and not session.stints:
        session.stints = other.stints
        _set_facet(session, "stints", "f1-archive", "high",
                   "Tyre stints from the F1 live-timing archive.")
    if "race_control" in wanted and other.race_control and not session.race_control:
        session.race_control = other.race_control
        # the derived neutralisation windows come from the same feed
        if other.track_status_windows and not session.track_status_windows:
            session.track_status_windows = other.track_status_windows
        _set_facet(session, "race_control", "f1-archive", "high",
                   "Official race-control log from the F1 live-timing archive.")
    if "weather" in wanted and other.weather and not session.weather:
        session.weather = other.weather
        _set_facet(session, "weather", "f1-archive", "high",
                   "Weather trace from the F1 live-timing archive.")


def _heal_cached(session: RaceSession) -> bool:
    """Bring a cached session up to what today's pipeline would have produced.

    Two things go stale in a thirty-day cache: facets that were missing only
    because a source was down at fetch time, and facets a newer release no
    longer considers missing at all. Both were frozen into the file, so a
    session kept showing "Partial data" long after the reason had gone.

    Returns True only when something actually changed, so a still-unreachable
    archive never triggers a pointless cache write.
    """
    report = session.source_report
    if not report:
        return False
    before = list(report.missing)
    _prune_inapplicable_facets(session)
    if any(f in report.missing for f in _ARCHIVE_FACETS):
        _merge_from_archive(session, primary="cache")
    if report.missing == before:
        return False
    report.partial = bool(report.missing)
    if not report.missing:
        report.missing_reason = None
    session.partial = report.partial
    return True


def _enrich_retirements(session: RaceSession, primary: str) -> None:
    """Copy across what live timing lacks from the official archive: retirement
    reasons ("Hydraulics", "Collision", ...) for the DNF badge, and the FIA
    classified race time for each lead-lap finisher. Races only: the Jolpica
    results endpoint describes the Grand Prix, not sprints."""
    if primary == "jolpica" or session.category != "race":
        return
    retired = [c for c in session.classification if c.retired]
    need_reasons = retired and not all(c.retirement_reason for c in retired)
    need_times = any(not c.retired and c.race_time is None for c in session.classification)
    if not need_reasons and not need_times:
        return
    try:
        _drivers, rows, _meta = jolpica_adapter.fetch_classification(
            session.year, session.grand_prix)
    except Exception as exc:  # noqa: BLE001
        log.info("classification enrich failed: %s", exc)
        return
    by_code = {r.driver: r for r in rows}
    for c in session.classification:
        src = by_code.get(c.driver)
        if not src:
            continue
        if c.retired and src.retirement_reason and not c.retirement_reason:
            c.retirement_reason = src.retirement_reason
            c.retirement_source = "jolpica"
            if c.laps_completed is None:
                c.laps_completed = src.laps_completed
        if not c.retired and c.race_time is None and src.race_time is not None:
            c.race_time = src.race_time


def quali_grid_changes(session: RaceSession, quali_rows) -> list[dict]:
    """Every difference between where a driver qualified and where they start.

    A gearbox or engine penalty is announced once the session's own race-control
    feed has closed, so it can never appear in the qualifying messages — which is
    why a driver could qualify P2 and the page still showed no penalty. The
    official starting grid is the trustworthy record.

    Three kinds of change exist, and the grid is only honest when it reports all
    of them:

    * ``drop``      — a steward decision cost this driver places.
    * ``promotion`` — someone ahead was penalised, so this driver inherits a
      better slot. Nothing they did; still not where they qualified. Reporting
      only drops was why drivers who moved UP (the far more numerous group, since
      one penalty at the front shifts everyone behind it) showed nothing at all.
    * ``pit_lane``  — Ergast encodes a pit-lane start as grid 0, which the old
      truthiness test silently discarded along with the driver.

    Every changed row is returned — the grid renders these per driver, so
    truncating the list would blank out real rows further down the order.
    """
    if session.category not in ("qualifying", "sprint_qualifying"):
        return []
    try:
        _drivers, race_rows, _meta = jolpica_adapter.fetch_classification(
            session.year, session.grand_prix)
    except Exception as exc:  # noqa: BLE001
        log.info("grid-change lookup unavailable: %s", exc)
        return []
    # `is not None` and not truthiness: grid 0 is a pit-lane start, not "no data"
    grid_of = {r.driver: r.grid for r in race_rows if r.grid is not None}
    out: list[dict] = []
    for row in quali_rows:
        qpos, start = row.position, grid_of.get(row.driver)
        if not qpos or start is None:
            continue
        if start == 0:
            out.append({"driver": row.driver, "name": row.name, "kind": "pit_lane",
                        "qualified": qpos, "starts": 0, "places": None})
        elif start != qpos:
            out.append({"driver": row.driver, "name": row.name,
                        "kind": "drop" if start > qpos else "promotion",
                        "qualified": qpos, "starts": start, "places": abs(start - qpos)})
    # biggest movements first — a stable, meaningful order for any consumer that
    # wants a summary rather than a per-driver lookup
    return sorted(out, key=lambda d: -(d["places"] or 99))


def _enrich_quali_segments(session: RaceSession, primary: str) -> None:
    """Merge official Q1/Q2/Q3 bests into a qualifying classification. Plain
    qualifying only — the archive has no per-segment data for sprint shootouts."""
    if session.category != "qualifying" or primary == "jolpica":
        return
    if any(c.q1 or c.q2 or c.q3 for c in session.classification):
        return
    try:
        segs = jolpica_adapter.fetch_quali_segments(session.year, session.grand_prix)
    except Exception as exc:  # noqa: BLE001
        log.info("quali segment enrich failed: %s", exc)
        return
    for c in session.classification:
        s = segs.get(c.driver)
        if s:
            c.q1, c.q2, c.q3 = s.get("q1"), s.get("q2"), s.get("q3")
            if c.position is None:
                c.position = s.get("position")


#: Which session categories a facet can meaningfully exist for.
#:
#: A qualifying hour has no overtakes, no strategy pit stops and no lap-by-lap
#: position trace; a practice hour has none of them either. The adapters recorded
#: all three as *missing* anyway, so every qualifying and practice session was
#: flagged partial on arrival — which is a category error dressed up as honesty,
#: and it is why the "Partial data" chip was lit on essentially everything.
#: A warning that is always on carries no information at all.
_FACET_APPLIES: dict[str, set[str]] = {
    "overtakes": {"race", "sprint"},
    "pit_stops": {"race", "sprint"},
    "positions": {"race", "sprint"},
}


def _prune_inapplicable_facets(session: RaceSession) -> None:
    """Drop facets this kind of session was never going to have.

    Only "none" rows are dropped: if a qualifying session really did record pit
    stops, that is a real fact and it stays on the report.
    """
    report = session.source_report
    if not report:
        return
    cat = session.category or ""
    drop = {f for f, cats in _FACET_APPLIES.items() if cat not in cats}
    if not drop:
        return
    report.missing = [m for m in report.missing if m not in drop]
    report.facets = [f for f in report.facets
                     if not (f.facet in drop and f.source == "none")]


def _post_process(session: RaceSession, primary: str) -> None:
    """Enrich a freshly-fetched real session and finalize its source report."""
    session.category = session.category or session_category(session.session_type)

    # fill hollow facets from other sources before any analysis-dependent steps
    _merge_missing_facets(session, primary)
    # …including the stints / race control / weather that only the F1 archive
    # has. Skipping this step is why every session reported partial data.
    _merge_from_archive(session, primary)

    # retirement reasons for the DNF badge (jolpica has them, live timing doesn't)
    _enrich_retirements(session, primary)

    # qualifying: per-segment Q1/Q2/Q3 bests from the archive (live timing
    # exposes laps but not which knockout segment they belonged to)
    _enrich_quali_segments(session, primary)

    # pit-stop timing (may pull durations from Jolpica)
    try:
        pitstop_service.enrich(session, allow_network=True)
    except Exception as exc:  # noqa: BLE001
        log.info("pitstop enrich failed: %s", exc)

    # overtakes: infer if the source didn't supply them (races/sprints only)
    if not session.overtakes and session.category in ("race", "sprint") and session.positions:
        session.overtakes = infer_overtakes(session)
        _set_facet(session, "overtakes", "inferred", "medium",
                   "Derived from the lap-by-lap position trace.")

    # driver portraits: season-wide map fills what the session record lacked
    try:
        headshots.enrich(session)
    except Exception as exc:  # noqa: BLE001
        log.info("headshot enrich failed: %s", exc)

    # a facet a session type cannot have is not a gap in our data
    _prune_inapplicable_facets(session)

    if session.source_report:
        session.source_report.partial = bool(session.source_report.missing)
        if not session.source_report.missing:
            # a later step filled everything in — the explanation is now stale
            session.source_report.missing_reason = None
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
    """Probe every real source — concurrently, and with a hard ceiling.

    These ran one after another at the 30s data-fetch timeout, so one slow host
    made the whole endpoint take as long as all of them added together. Behind a
    button that is indistinguishable from a dead backend: the browser gives up
    and reports "cannot reach the API", which is exactly what it did.

    Now they run at the same time and each is capped, so the endpoint costs the
    slowest single probe rather than their sum, and always answers.
    """
    from concurrent.futures import ThreadPoolExecutor

    cap = get_settings().probe_timeout + 4   # request timeout + a little slack

    def run(name: str, fn) -> SourceProbe:
        try:
            ok, detail = fn()
            return SourceProbe(name=name, reachable=ok, detail=detail)
        except Exception as exc:  # noqa: BLE001
            # a probe that throws is a failed probe, never a failed endpoint
            return SourceProbe(name=name, reachable=False,
                               detail=f"probe error — {type(exc).__name__}: {exc}"[:160])

    jobs = [
        ("openf1", openf1_adapter.probe),
        ("jolpica", jolpica_adapter.probe),
        ("f1-archive", fastf1.probe),
    ]
    probes: list[SourceProbe] = []
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = [(name, pool.submit(run, name, fn)) for name, fn in jobs]
        for name, fut in futures:
            try:
                probes.append(fut.result(timeout=cap))
            except Exception:  # noqa: BLE001
                probes.append(SourceProbe(
                    name=name, reachable=False,
                    detail=f"no answer within {cap}s — host is not responding at all"))
    probes.append(SourceProbe(name="cache", reachable=True,
                              detail=str(get_settings().cache_dir)))
    return probes
