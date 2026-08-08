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
from ..analysis.normalize import order_classification
from ..config import get_settings
from ..models import (
    DataSource,
    Driver,
    FacetSource,
    GrandPrix,
    PositionPoint,
    RaceSession,
    Season,
    SourceProbe,
    SourceReport,
    session_category,
)
from . import headshots, jolpica_adapter, mock_adapter, openf1_adapter, pitstop_service
from . import pitwall_adapter as fastf1
from .pitwall_runtime import ArchiveClientUnavailable, explain_import

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
        session = mock_adapter.get_mock_session(year, gp, session_type)
        # through the same offline finalizer the real path uses: a demo that
        # skips the pipeline is not standing in for it, and cannot catch a
        # regression in it (see _finalize_session)
        _finalize_session(session)
        return session

    if not refresh:
        cached = cache.load(year, gp, session_type)
        if cached is not None:
            if cached.source_report:
                cached.source_report.data_source = DataSource.CACHE
            # A CACHED SESSION IS A SESSION THAT SKIPPED THE PIPELINE.
            #
            # Everything derived — the entry list, the position trace, FIA
            # order, the audit verdict — was computed in `_post_process` on the
            # way IN and then frozen into the file. Read back out, none of it
            # ran again, so a session cached by an older build keeps whatever
            # that build failed to derive for as long as the entry lives. That
            # is a month here, and it is invisible in development because a
            # laptop's cache is minutes old and written by the code you are
            # running. In production the cache long outlives the deploy that
            # filled it, which is how a fixed derivation still shipped broken.
            #
            # Re-deriving on the way out costs nothing (no network, no provider
            # knowledge) and makes the fix retroactive: the next read of a stale
            # entry heals it, rather than waiting thirty days for it to expire.
            _finalize_session(cached)
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
                    _set_facet(session, "drivers", "jolpica", "high")
                _set_facet(session, "results", "jolpica", "high")
        except Exception as exc:  # noqa: BLE001
            log.info("jolpica classification merge failed: %s", exc)


def _derive_positions(session: RaceSession) -> None:
    """The lap-by-lap position trace, which used to depend on who answered.

    THIS IS WHY EVERY LINE CHART IN THE PRODUCT WENT BLANK IN PRODUCTION. The
    trace was only ever set by whichever adapter happened to supply it, plus one
    opportunistic top-up from Jolpica. When neither answered with positions the
    facet simply stayed empty — and nothing downstream noticed, because
    `positions` is not one of the essential facets the gate checks. So the
    session passed as complete, the page rendered in full, and every chart that
    plots the trace drew axes, grid and neutralisation bands over an empty plot.
    A chart with no line is indistinguishable from a chart that failed, and the
    reader was given no reason to doubt any of it.

    It never needed a source. `Lap.position` already carries where each car was
    at the end of each lap, and the lap table IS essential — the gate guarantees
    it for every race and sprint. So the trace is reconstructible from data we
    are already holding, at no network cost, for exactly the sessions that need
    it. Same shape as the entry-list backfill above, and for the same reason: a
    facet the product cannot be read without must not be left to chance.

    The order matters. This runs before the overtake inference, which needs a
    trace to work over — without it, a missing position feed silently produced
    an empty overtakes list too, and the cascade reported the race as one where
    nobody passed anybody.
    """
    if session.positions or not session.laps:
        return
    if session.category not in ("race", "sprint"):
        return
    trace = [PositionPoint(driver=lp.driver, lap=lp.lap, position=lp.position)
             for lp in session.laps
             if lp.driver and lp.lap is not None and lp.position is not None]
    if not trace:
        return
    trace.sort(key=lambda p: (p.lap, p.position))
    session.positions = trace
    _set_facet(session, "positions", "derived", "high",
               "Rebuilt from the lap table's own per-lap positions — no separate "
               "position feed answered for this session.")


def _derive_total_laps(session: RaceSession) -> None:
    """The race distance, recomputed after the merges rather than before them.

    THIS IS THE OTHER WAY TO GET A BLANK CHART, AND IT BLANKS THE AXES TOO.
    Every adapter sets `total_laps` from `max(lap for lap in laps, default=0)`
    at the moment it builds the session — which is BEFORE `_merge_missing_facets`
    fills in the laps and positions that another source had. A source that
    answered with results but no lap table therefore froze the distance at zero,
    and nothing ever revisited it once the real lap data arrived.
    Zero is not a harmless default here. The Position chart builds one row per
    lap with `for (let l = 1; l <= total; l++)`, so a zero distance produces an
    empty data array; it then discards every position point, because each one
    fails `p.lap > total`. The session still carries a full trace, so the chart
    does not take its "no trace" early return — it renders the event band, the
    legend and an axis pair with nothing between them. Every line chart in the
    product goes blank while the classification table beside it is perfect.
    Four sources for the answer, cheapest and most trustworthy first. All of
    them are things the session already holds, so like the other derivations
    this costs nothing and cannot fail.
    """
    if session.total_laps and session.total_laps > 0:
        return
    candidates = [
        max((lp.lap for lp in session.laps if lp.lap), default=0),
        max((p.lap for p in session.positions if p.lap), default=0),
        max((c.laps_completed or 0 for c in session.classification), default=0),
        (session.circuit.laps or 0) if session.circuit else 0,
    ]
    best = max(candidates)
    if best > 0:
        session.total_laps = best


def _derive_drivers_from_classification(session: RaceSession) -> bool:
    """The cheap half of the entry-list backfill: no network, always available.

    Split out of `_backfill_drivers` so it can run on EVERY path that hands a
    session to the app, not only on a fresh fetch. Every classification row
    already carries a code, a name, a team and a colour, which is an entry list;
    rebuilding from it cannot fail and costs nothing. Returns whether it filled
    anything, so the caller can decide whether the network branch is still worth
    trying.
    """
    if session.drivers or not session.classification:
        return False
    seen: dict[str, Driver] = {}
    for row in session.classification:
        if not row.driver or row.driver in seen:
            continue
        seen[row.driver] = Driver(
            number="", code=row.driver, name=row.name or row.driver,
            team=row.team or "", team_color=row.team_color or "#888888",
            grid=row.grid)
    if not seen:
        return False
    session.drivers = list(seen.values())
    _set_facet(session, "drivers", "derived", "medium",
               "Entry list rebuilt from the classification — no separate "
               "driver feed answered for this session.")
    return True


def _backfill_drivers(session: RaceSession, primary: str) -> None:
    """The entry list, which used to be a by-product and is a facet.

    THIS IS WHY A GRAND PRIX RENDERED AS CAR NUMBERS. The driver list was only
    ever filled inside the branch that backfills a MISSING classification — so a
    source that returned results but no entry list left `drivers` empty, nothing
    else looked at it, and every surface that resolves a name from a code fell
    back to the number. The page loaded, said "partial data", and showed "12"
    where "Verstappen" belongs.

    Two ways back, cheapest first:

      1. DERIVE IT FROM THE CLASSIFICATION we already hold. Every row carries a
         code, a name, a team and a colour — which is an entry list. It costs no
         network call and it cannot fail, so it runs first and handles the case
         completely whenever results exist.
      2. ASK JOLPICA, for the sessions that have no classification either. This
         is the genuinely thin case, and it is allowed to fail.

    Derived entries are marked as such: their provenance is the results, and the
    sources panel should say so rather than implying a driver feed answered.
    """
    if session.drivers:
        return
    if _derive_drivers_from_classification(session):
        return
    if primary == "jolpica" or session.category not in ("race", "sprint"):
        return
    try:
        drivers, _rows, _meta = jolpica_adapter.fetch_classification(
            session.year, session.grand_prix)
        if drivers:
            session.drivers = drivers
            _set_facet(session, "drivers", "jolpica", "high")
    except Exception as exc:  # noqa: BLE001
        log.info("jolpica entry-list merge failed: %s", exc)


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

_ARCHIVE_CLIENT_NOTE = ("The tyre, race-control and weather feeds are unavailable because "
                        "this install can't load its F1 archive client — not because F1 is "
                        "down. Fix: ")

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
    except (ImportError, ArchiveClientUnavailable) as exc:
        # Our own client won't load. Nothing is wrong with F1, and no amount of
        # retrying will change that — say what to install instead of blaming a
        # host we never contacted.
        log.warning("archive client unavailable: %s", exc)
        _archive_breaker.failed(str(exc))
        _note_missing_reason(session, _ARCHIVE_CLIENT_NOTE + explain_import(exc) + ".")
        return
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
    _audit_report(session)
    if any(f in report.missing for f in _ARCHIVE_FACETS):
        _merge_from_archive(session, primary="cache")
        _audit_report(session)
    return report.missing != before


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


# --------------------------------------------------------------------------- #
# "Is this session complete?" — asked once, of the session itself
# --------------------------------------------------------------------------- #
#
# EVERY ADAPTER USED TO ANSWER THIS QUESTION FOR ITSELF, and each answered a
# different question. The FastF1 report declares five facets; OpenF1 declares a
# different five; Jolpica declares its own and hard-codes `partial=True`. A
# facet an adapter never declared could never be reported missing — so a race
# fetched through FastF1 with no position trace at all reported COMPLETE, and
# the reader got a Race Story with no timeline in it and no explanation for the
# hole. That is the "Monaco is missing data but doesn't say so" report, and it
# was never about Monaco: it was about which source happened to answer first.
#
# So the report is now settled in one place, at the end of the pipeline, by
# looking at the session that was actually built. The adapters still say WHERE
# each facet came from — that is their job and they are the only ones who know
# — but WHETHER a facet is there is decided by whether it is there.
#
#: The first season each facet exists AT ALL, anywhere, from any source.
#:
#: THIS IS THE OTHER HALF OF THE CATEGORY ERROR V67 FIXED.
#:
#: That release stopped a qualifying hour being reported as missing its
#: overtakes, because a qualifying hour never had any. The same mistake was
#: still being made along the other axis: a 1975 Grand Prix was reported as
#: missing its lap times, its tyre stints, its weather trace and its
#: race-control log — none of which were ever recorded, by anybody, in 1975.
#: The reader was told a fifty-year-old race had a data problem, and it did not:
#: it had a 1975 problem, which is not the same thing and is not ours.
#:
#: The boundaries are the sources' own, not guesses:
#:   1950  results and entry lists — the championship's own start
#:   1996  lap-by-lap timing (and therefore positions, and therefore the
#:         overtakes inferred from them) — the first season Ergast/Jolpica
#:         publishes laps for
#:   2011  pit stops — the first season the pit-stop endpoint covers
#:   2018  tyre stints, weather and race control — the first season the F1
#:         live-timing archive FastF1 reads is complete for
#:
#: A facet before its era is not listed, not reported missing and does not make
#: a session partial. It IS explained: see `_era_note`, so absence has a reason
#: on screen rather than being a silence.
_FACET_FROM: dict[str, int] = {
    "laps": 1996,
    "positions": 1996,
    "overtakes": 1996,
    "pit_stops": 2011,
    "stints": 2018,
    "weather": 2018,
    "race_control": 2018,
}

#: What to tell the reader when a session predates a feed, keyed by the earliest
#: era boundary that applies to it.
_ERA_NOTE = {
    2018: "Tyre stints, weather and the race-control log begin in 2018 — the first "
          "season F1's live-timing archive covers. Everything else on this page is real.",
    2011: "Pit-stop timing begins in 2011, and tyre, weather and race-control data in "
          "2018. This session predates them; its results and lap times are real.",
    1996: "Lap-by-lap timing begins in 1996. For seasons before it the official "
          "classification is the complete record that exists.",
}


def _era_note(year: int) -> str | None:
    """One sentence explaining which feeds had not started yet, or None."""
    for boundary in (1996, 2011, 2018):
        if year < boundary:
            return _ERA_NOTE[boundary]
    return None


#: WHAT A SESSION CANNOT BE RECONSTRUCTED WITHOUT.
#:
#: Every facet below is one the page is built ON rather than enriched by. Without
#: the entry list a classification is a column of car numbers with question marks
#: under them — which is exactly what a Grand Prix rendered as when the driver
#: list failed to arrive and nothing backfilled it. Without results there is no
#: race to write about.
#:
#: Lap times are essential to a RACE and a SPRINT and to nothing else: the whole
#: product — pace, strategy, the position trace, the story — is derived from
#: them, and a race page without them is four empty tabs and a results table.
#: A practice or qualifying hour is a different claim and stands on its own
#: results.
#:
#: Everything not listed here — stints, weather, race control, pit stops,
#: overtakes — is enriching. Its absence is explained in the sources panel and
#: never gates the page, because a 2024 race with no weather trace is still a
#: complete and trustworthy read of that race.
_ESSENTIAL_FACETS: dict[str, set[str]] = {
    "race": {"results", "drivers", "laps"},
    "sprint": {"results", "drivers", "laps"},
    "qualifying": {"results", "drivers"},
    "sprint_qualifying": {"results", "drivers"},
    "practice": {"drivers"},
}


def _essential_for(category: str, year: int) -> set[str]:
    """Essential facets for this category, minus any the era never recorded.

    A 1975 Grand Prix has no lap times and never will; demanding them would
    declare half of the sport's history unavailable, which is the opposite of
    honest. The era boundary already decided that absence is not a gap, and this
    keeps the two rules from contradicting each other.
    """
    return {f for f in _ESSENTIAL_FACETS.get(category, {"results", "drivers"})
            if year >= _FACET_FROM.get(f, 0)}


#: THE ONLY FACET WHOSE TRUE VALUE IS ROUTINELY ZERO.
#:
#: For this one, a recorded source — including our own derivation — means the
#: question was asked and answered, and an empty list is the answer rather than
#: a gap. Monaco is the sport's own example: a Grand Prix can genuinely finish
#: with nobody passed on track.
#:
#: This governs the WORDING of `missing` and the Sources panel only — see
#: `_audit_report` below for why it stopped governing whether the page renders.
#: V76 also listed race_control and pit_stops here, and that was too generous
#: for a list that (at the time) still gated the page: a modern race always
#: produces race-control messages, a race nobody pitted in has not happened
#: since refuelling ended, and treating their absence as routine let a session
#: through with panels that had nothing to draw. Their era boundaries already
#: cover the seasons that never recorded them.
_MAY_BE_EMPTY = {"overtakes"}

#: facet -> (attribute holding it, human name for the reader)
_CANONICAL_FACETS: dict[str, tuple[str, str]] = {
    "results": ("classification", "results & classification"),
    "drivers": ("drivers", "the entry list"),
    "laps": ("laps", "lap times"),
    "positions": ("positions", "the lap-by-lap position trace"),
    "stints": ("stints", "tyre stints"),
    "pit_stops": ("pit_stops", "pit stops"),
    "overtakes": ("overtakes", "overtakes"),
    "race_control": ("race_control", "the race-control log"),
    "weather": ("weather", "weather"),
}


def _audit_report(session: RaceSession) -> None:
    """Settle `facets`, `missing` and `partial` from the session as built.

    Idempotent and total: every canonical facet that applies to this category
    gets exactly one row, present or absent, whichever adapter fetched it and
    whichever ones enriched it afterwards. Running it twice changes nothing,
    which is what lets the cache-healing path call it as well.
    """
    report = session.source_report
    if not report:
        return
    cat = session.category or session_category(session.session_type)
    known = {f.facet: f for f in report.facets}
    facets: list[FacetSource] = []
    missing: list[str] = []

    for name, (attr, human) in _CANONICAL_FACETS.items():
        if cat not in _FACET_APPLIES.get(name, {"race", "sprint", "qualifying",
                                                "sprint_qualifying", "practice"}):
            continue
        # a feed that had not been invented yet is not a gap in our data
        if session.year < _FACET_FROM.get(name, 0):
            continue
        prior = known.get(name)
        # AN EMPTY ANSWER IS NOT AN ABSENT ONE, for the facets that can
        # legitimately count zero. A race with no safety car has an empty
        # race-control log; a race nobody pitted in has no pit stops; Monaco has
        # no overtakes. Recomputing presence from `bool(list)` alone discarded
        # the provenance that said a source had answered, turned a true zero
        # into a gap, and made the session partial for holding a fact.
        answered = bool(prior and prior.source != "none")
        present = bool(getattr(session, attr, None)) or (
            name in _MAY_BE_EMPTY and answered)
        if present:
            # keep the adapter's provenance; only invent one if nobody claimed it
            facets.append(prior if prior and prior.source != "none" else FacetSource(
                facet=name, source="derived", confidence="medium",
                detail=f"Present in the session, source unrecorded."))
        else:
            facets.append(FacetSource(
                facet=name, source="none", confidence="low",
                detail=prior.detail if prior and prior.detail else
                f"No {human} were returned for this session."))
            missing.append(name)

    # anything an adapter reported that is not in the canonical set is still a
    # fact about the session and is kept rather than quietly dropped
    for f in report.facets:
        if f.facet not in _CANONICAL_FACETS and f.source != "none":
            facets.append(f)

    report.facets = facets
    report.missing = missing
    report.partial = bool(missing)
    # THE ONE VERDICT, AND WHY IT GATES ON *ESSENTIAL* FACETS ONLY.
    #
    # V76 made this strict — `complete = not missing`, every absent facet
    # blocking the page — reasoning that a page we are not fully certain of is a
    # page we should not show. V77 then had to narrow `_MAY_BE_EMPTY` to stop
    # that strictness swallowing whole sessions, and narrowing it broke Miami:
    # a race with a genuinely empty race-control log (green flag throughout)
    # started failing the SAME check that Monaco's genuinely-empty overtake list
    # had just been exempted from.
    #
    # That was not two bugs. It was one: A FIXED LIST OF "FACETS THAT MAY BE
    # EMPTY" CANNOT BE RIGHT FOR EVERY RACE, because whether a count of zero is
    # a fact or a failure depends on the race, not the facet. Race control is
    # legitimately empty for a clean afternoon and illegitimately empty when the
    # feed drops out — nothing about the FACET tells you which. Widen the list
    # to fix one race's false negative and it creates another race's false
    # positive; narrow it to fix that and the first race breaks again. Every
    # future circuit was going to take a turn at one side of that seesaw.
    #
    # The only board is essential vs. enriching (`_ESSENTIAL_FACETS`), and it
    # doesn't have the seesaw's problem: results, the entry list, and — for a
    # race — lap times are the facts every panel is built FROM, and none of
    # them is ever legitimately empty. A session missing one of those cannot
    # produce a real page no matter which race it is, so gating on them is safe
    # for every circuit at once. Everything else is a fact ABOUT the race
    # rather than a building block, individual panels already show it missing
    # gracefully (an empty weather widget, a quiet race-control log), and V77's
    # own audit proved that a page built from complete essentials never renders
    # half of itself — the failure mode strict was reaching for doesn't occur
    # once the essentials are actually there.
    #
    # `_MAY_BE_EMPTY` still matters for what `missing` SAYS (Monaco's overtake
    # count reads as a real zero in the Sources panel rather than a gap), but it
    # no longer decides whether the page exists — nothing derived from a count
    # does.
    essential = _essential_for(cat, session.year)
    report.essential_missing = [m for m in missing if m in essential]
    report.complete = not report.essential_missing
    if not missing:
        report.missing_reason = None
    session.partial = report.partial
    session.complete = report.complete

    # and say which feeds had not started yet, so the absence has a reason
    note = _era_note(session.year)
    if note and note not in session.notes:
        session.notes.append(note)


def _finalize_session(session: RaceSession) -> None:
    """The offline half of post-processing: derive what we already hold, then
    take the one verdict.

    SPLIT OUT SO THE DEMO PATH CANNOT DIVERGE FROM THE REAL ONE. Mock sessions
    returned straight from the simulator and never went through any of this —
    no derivations, no ordering, no audit — so demo mode was not exercising the
    pipeline it was supposed to stand in for. A facet the real path leaves empty
    was fully populated by the simulator, which is precisely how a blank
    position trace reached production while every local review looked perfect.

    Nothing in here touches the network or knows which provider answered, so it
    is safe to run over a simulated session and a fetched one alike. The
    provider-specific merges stay in `_post_process`, above this.
    """
    session.category = session.category or session_category(session.session_type)

    # the race distance, first: it is the x-axis every lap-indexed panel is
    # drawn against, and the adapters fixed it before the merges that complete
    # the lap data — see _derive_total_laps.
    _derive_total_laps(session)

    # the entry list, before anything that resolves a name — or draws a line —
    # from a code. Every series in the Position chart comes from `drivers`, so
    # an empty entry list is a chart with nothing to plot even when the trace
    # underneath it is complete.
    _derive_drivers_from_classification(session)

    # the position trace, before anything that reads one. Every line chart in
    # the product plots it, and the overtake inference below needs it to work
    # over — see _derive_positions for why it must not depend on who answered.
    _derive_positions(session)

    # overtakes: infer if the source didn't supply them (races/sprints only).
    #
    # THE ANSWER "NONE" IS AN ANSWER. A derivation that runs over a complete
    # position trace and finds nothing has told us something true about the
    # race — Monaco is the sport's own example of a Grand Prix where barely a
    # car is passed on track. Recording the facet only when the list came back
    # non-empty is what made a clean street race indistinguishable from a feed
    # that never replied, and it is why Monaco wore a partial-data chip while
    # holding every fact it needed.
    if not session.overtakes and session.category in ("race", "sprint") and session.positions:
        session.overtakes = infer_overtakes(session)
        _set_facet(session, "overtakes", "inferred", "medium",
                   f"Derived from the lap-by-lap position trace — "
                   f"{len(session.overtakes)} found."
                   if session.overtakes else
                   "Derived from the lap-by-lap position trace: no on-track "
                   "passes were detected in this session.")

    # FIA order, after every merge — see analysis/normalize.order_classification
    if session.category in ("race", "sprint"):
        try:
            order_classification(session)
        except Exception as exc:  # noqa: BLE001
            log.warning("classification ordering failed: %s", exc)

    # a facet a session type cannot have is not a gap in our data
    _prune_inapplicable_facets(session)

    # and then the one audit that decides whether this session is complete —
    # from the session, not from whichever adapter happened to answer first
    _audit_report(session)


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

    # driver portraits: season-wide map fills what the session record lacked
    try:
        headshots.enrich(session)
    except Exception as exc:  # noqa: BLE001
        log.info("headshot enrich failed: %s", exc)

    # the entry list, before anything that resolves a name from a code
    _backfill_drivers(session, primary)

    # everything from here needs no provider and no network — and is shared
    # with the demo path, so the two cannot drift apart again
    _finalize_session(session)

    if session.source_report:
        session.source_report.cache_key = cache.cache_key(
            session.year, session.grand_prix, session.session_type)


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
        except (ImportError, ArchiveClientUnavailable) as exc:
            # A package that won't load is not a host that won't answer. Marking
            # it "not answering" sent a reader to F1's status page for a problem
            # living in their own virtualenv — reachable=None says, correctly,
            # that we never got as far as asking.
            return SourceProbe(name=name, reachable=None, detail=explain_import(exc))
        except Exception as exc:  # noqa: BLE001
            # a probe that throws is a failed probe, never a failed endpoint
            return SourceProbe(name=name, reachable=False,
                               detail=f"the check itself failed — {type(exc).__name__}: {exc}"[:160])

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
