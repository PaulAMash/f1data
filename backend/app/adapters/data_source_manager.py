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
import threading
import time
from typing import Callable

from .. import cache
from ..analysis.events import infer_overtakes
from ..analysis.normalize import (
    canonicalize_names, fix_classification, order_classification, sync_grids,
)
from ..config import get_settings
from .. import timing, upstream
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
    TrackStatus,
    classification_is_official,
    session_category,
)
from . import (
    calendar_merge, headshots, jolpica_adapter, mock_adapter, openf1_adapter,
    pitstop_service, season_memory,
)
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
    "live_session": "This session is running right now. Timing data is published once it "
                    "has finished, and the full analysis will load then.",
    "awaiting_data": "This session has finished. Its completed timing has not reached our "
                     "sources yet — the analysis loads once it does.",
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
            # what the file said, before today's pipeline says otherwise — so a
            # record an older build wrote with shouted names or a grid on one
            # of its two copies is written back once it has been put right
            stale = (_readiness(cached), _identity(cached))
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
                #
                # AND A SESSION CACHED BEFORE ITS RESULT WAS PUBLISHED IS CACHED
                # UNSETTLED. That is the record the first request after a race
                # produces, and it used to be the record every later request got
                # for a month. It is served — it is real — but it is due to be
                # checked against the sources again once the entry is older than
                # the window the sources' own answers are kept for. A check that
                # gains nothing is remembered too, so the next reader in the same
                # window is not sent to ask again.
                due = (cache.age_seconds(year, gp, session_type) or 0.0) >= _REVALIDATE_AFTER
                try:
                    healed = _heal_cached(cached, revalidate=due)
                    if healed or (_readiness(cached), _identity(cached)) != stale:
                        cache.save(cached)
                    elif due and _needs_revalidation(cached):
                        cache.touch(year, gp, session_type)
                except Exception as exc:  # noqa: BLE001
                    log.info("cached facet heal failed: %s", exc)
            return cached

    attempts: list[dict] = []
    if settings.enable_live_fetch:
        for name, fetch in _chain(year):
            try:
                with timing.phase(f"fetch.{name}"):
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


# The source report is the one thing several enrichment steps write to, and
# since V84 those steps run at the same time (see `_together`). Both statements
# below are read-modify-write of a whole list, so two steps landing together
# could rebuild from the same starting point and lose one of the two facets —
# which would show up as a phantom "Partial data" chip that no source explains.
# The lock is uncontended in every realistic case and costs nothing.
_report_lock = threading.Lock()


def _set_facet(session: RaceSession, name: str, source: str,
               confidence: str = "high", detail: str | None = None,
               provisional: bool = False) -> None:
    """Record where a facet came from — REPLACING any existing row for that
    facet (no duplicate 'Results & classification' entries) and clearing it
    from the missing list."""
    if not session.source_report:
        return
    with _report_lock:
        session.source_report.facets = (
            [f for f in session.source_report.facets if f.facet != name]
            + [FacetSource(facet=name, source=source, confidence=confidence, detail=detail,
                           provisional=provisional)])
        session.source_report.missing = [m for m in session.source_report.missing if m != name]


# --------------------------------------------------------------------------- #
# results that are present, and not yet the official record
# --------------------------------------------------------------------------- #
#
# THE ITALIAN GRAND PRIX BUG, IN ONE SENTENCE: a classification was counted as
# present because the list was not empty, and nothing ever asked whether the
# list was the result.
#
# The first request for that race arrived before OpenF1 had published its
# `session_result` and before the results archive had the round. OpenF1 still
# answered — with every lap, stint and position — and its adapter, finding no
# official result, built a running order from the final positions. Twenty-two
# rows, every one "Finished", no gap, no time, no points, no retirement. That
# list was non-empty, so the facet merge never asked the archive for the real
# one; the retirement enrichment copied only reasons and times onto rows it
# did not know were placeholders; the audit counted `results` as present and
# declared the session complete; and the cache froze it for thirty days. Every
# "—" on the page, the "22/22 still running", the missing retirements card and
# the missing margin were that one list, read faithfully. The Dutch Grand Prix
# beside it was fine only because its first request happened to come later.
#
# Two rules close it, and neither is about Monza:
#
#   1. A RUNNING ORDER IS PROVISIONAL AND SAYS SO. The adapters flag it
#      (FacetSource.provisional), and — for records cached by builds that did
#      not — the audit recognises the shape by content: a race classification
#      with no gap, time, points or retirement on any row is not a result
#      (`_results_hollow`). A provisional record is still served; it is not
#      `settled`, and the clients read that one flag.
#   2. THE OFFICIAL RECORD IS RECONCILED IN, FIELD BY FIELD, from whichever
#      source publishes it first — the results archive, OpenF1's own result,
#      or the F1 archive — on the first fetch if it is already out, and on
#      revalidation of the cached record if it is not (`_reconcile_results`,
#      `_revalidate`). Nothing is estimated in the meantime: the official
#      fields stay None until an official source fills them.

#: What the official classification decides, per row. Everything else on a row
#: — the best lap, the pit count, the colour — was measured locally from the
#: laps, is right already, and is kept.
_OFFICIAL_ROW_FIELDS = ("position", "status", "retired", "gap", "race_time", "points",
                        "laps_completed", "retirement_reason", "retirement_source")

_HOLLOW_RESULTS_NOTE = ("Provisional running order — no gap, race time, points or "
                        "retirement has been recorded for any car, so the official "
                        "classification has not been reconciled into this session yet.")


def _results_hollow(session: RaceSession) -> bool:
    """A race classification with nothing in it that only a result carries.

    Content, not provenance: this is how a record cached by a build that never
    flagged provisional results is recognised on the way out of the cache, so
    the fix is retroactive rather than waiting a month for the entry to expire.
    The rule itself lives with the model (`classification_is_official`) because
    the adapters apply the same one on the way in.
    """
    rows = session.classification
    if not rows or session.category not in ("race", "sprint"):
        return False
    return not classification_is_official(rows)


def _results_provisional(session: RaceSession) -> bool:
    """Is the classification standing in for the official one?"""
    report = session.source_report
    if report and any(f.facet == "results" and f.source != "none" and f.provisional
                      for f in report.facets):
        return True
    return _results_hollow(session)


def _reconcile_results(session: RaceSession, rows, source: str,
                       detail: str | None = None) -> bool:
    """Lay the official classification over a provisional one, row by row.

    THIS REPLACES "IF THE LIST IS EMPTY, TAKE THEIRS". The old merge treated a
    classification as all-or-nothing, and a provisional list is neither: its
    order is real, its best laps and pit counts were measured from laps we
    hold, and only the official fields are missing. So the official source
    decides exactly those fields — position, status, retirement, gap, race
    time, points, laps — and the row keeps what it already knew. A car the
    official list names that the position feed never saw (a non-starter) is
    added; a car the feed saw that the official list does not name keeps its
    provisional row, because a fact about where it was running is still a
    fact, and inventing a status for it would not be.

    Never estimates. A field the official source leaves empty stays empty.
    Returns whether anything was reconciled.
    """
    if not rows:
        return False
    by_code = {(r.driver or "").upper(): r for r in rows if r.driver}
    if not by_code:
        return False
    merged, seen = [], set()
    for c in session.classification:
        code = (c.driver or "").upper()
        src = by_code.get(code)
        if src is None:
            merged.append(c)
            continue
        seen.add(code)
        for field in _OFFICIAL_ROW_FIELDS:
            value = getattr(src, field)
            # position is None BECAUSE a car retired; status and retirement
            # are always stated; anything else the source left blank does not
            # blank what the timing feed measured
            if field in ("position", "status", "retired") or value is not None:
                setattr(c, field, value)
        if c.grid is None and src.grid is not None:
            c.grid = src.grid
        if c.best_lap is None and src.best_lap is not None:
            c.best_lap = src.best_lap
        # a car the position feed could not name gets its name from the result
        if (not c.name or c.name == c.driver) and src.name:
            c.name = src.name
        if c.team in ("", "?") and src.team:
            c.team, c.team_color = src.team, src.team_color
        merged.append(c)
    for code, src in by_code.items():
        if code not in seen:
            merged.append(src.model_copy())
    session.classification = merged
    _set_facet(session, "results", source, "high", detail, provisional=False)
    return True


# --------------------------------------------------------------------------- #
# results that are official, and still missing a field another source has
# --------------------------------------------------------------------------- #
#
# THE ITALIAN GRAND PRIX, SECOND BUG, IN ONE SENTENCE: the record settled, and
# the pipeline stopped asking — for everything, including the fields the
# settling source never carries.
#
# OpenF1's `session_result` is the official classification and it has no
# starting grid in it; the grid is a separate feed, and when that feed is
# empty every row is built with `grid=None`. The results archive publishes the
# grid for every race since 1950, and it was being asked anyway — for
# retirement reasons — but the enrichment copied only reasons and times. So a
# race could have every position, gap and point right, be `settled`, be
# cached as such, and print "won from P?" on a page whose gainers, losers and
# standout-drive cards all read "no notable movers". Every 2026 record served
# through OpenF1 after V107 had it; the Dutch Grand Prix only escaped because
# its record had been written by the archive route, which reads the grid off
# the results.
#
# The rule: THE OFFICIAL RECORD IS COMPLETED FIELD BY FIELD from whichever
# configured source has the field — never overwriting a value a row already
# holds, never estimating — on the first fetch and, for a record that is
# still owed a field, on later reads at the same cadence as an unsettled one.
# `SourceReport.awaiting` names what is owed; it does not touch `settled`.

def _fill_official_fields(session: RaceSession, rows, source: str) -> set[str]:
    """Complete an official classification from another source's rows.

    The complement of `_reconcile_results`: that lays the official record over
    a provisional one and DECIDES the official fields; this only FILLS what a
    row has nothing for. The grid, the classified time, the laps and the
    retirement reason are per-car facts and fill whenever the row is blank.
    The gap and the points depend on the position, so they fill only when
    both sources agree where the car finished — a post-race penalty can move
    a car between two publications, and a gap for the wrong position is
    worse than none. Returns the names of the fields it filled.
    """
    by_code = {(r.driver or "").upper(): r for r in rows if r.driver}
    filled: set[str] = set()

    def take(row, field, value):
        setattr(row, field, value)
        filled.add(field)

    for c in session.classification:
        src = by_code.get((c.driver or "").upper())
        if src is None:
            continue
        if c.grid is None and src.grid is not None:
            take(c, "grid", src.grid)
        if c.laps_completed is None and src.laps_completed is not None:
            take(c, "laps_completed", src.laps_completed)
        if c.retired:
            if not c.retirement_reason and src.retirement_reason:
                take(c, "retirement_reason", src.retirement_reason)
                c.retirement_source = src.retirement_source or source
        else:
            if c.race_time is None and src.race_time is not None:
                take(c, "race_time", src.race_time)
            same_place = src.position is not None and src.position == c.position
            if (src.position is not None and c.position is not None and not same_place
                    and session.source_report is not None):
                # two official sources, two positions: nothing that depends on
                # the position is taken, and the disagreement is on record
                line = f"position {c.driver}: held={c.position} {source}={src.position}"
                if line not in session.source_report.conflicts:
                    session.source_report.conflicts.append(line)
            if c.gap is None and src.gap and same_place and c.position != 1:
                take(c, "gap", src.gap)
            if c.points is None and src.points is not None and same_place:
                take(c, "points", src.points)
        if (not c.name or c.name == c.driver) and src.name:
            c.name = src.name
        if c.team in ("", "?") and src.team:
            c.team, c.team_color = src.team, src.team_color
    if "grid" in filled:
        _set_facet(session, "starting_grid", source, "high",
                   f"Starting grid from {_SOURCE_NAMES.get(source, source)}, reconciled "
                   "onto a classification whose own source published none.")
    return filled


_SOURCE_NAMES = {"jolpica": "the results archive (Ergast/Jolpica)",
                 "f1-archive": "the F1 live-timing archive", "openf1": "OpenF1"}


def _results_archive_owes(session: RaceSession) -> list[str]:
    """The official fields this classification holds for NO car, that the
    results archive publishes for every race it has: the starting grid, the
    classified time of the lead-lap finishers, the reason each retirement
    retired. "No car" and not "some car": a lapped car never has a classified
    time and a car that finished has no retirement reason, so per-row gaps
    are the record being right, not the record being owed."""
    rows = session.classification
    if session.category != "race" or not rows:
        return []
    owed: list[str] = []
    if not any(c.grid is not None for c in rows):
        owed.append("grid")
    finishers = [c for c in rows if not c.retired]
    if finishers and not any(c.race_time is not None for c in finishers):
        owed.append("race_time")
    retired = [c for c in rows if c.retired]
    if retired and not any(c.retirement_reason for c in retired):
        owed.append("retirement_reason")
    return owed


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
    # RESULTS: absent, OR present only as a provisional running order. Both are
    # the same question to the results archive — "what was the official
    # classification?" — and a non-empty provisional list used to answer it
    # on the archive's behalf, which is the Italian Grand Prix bug above. The
    # reconciliation is races-only: the Jolpica results endpoint describes the
    # Grand Prix, and laying it over a sprint would be a different race.
    provisional = session.category == "race" and _results_provisional(session)
    if not session.classification or provisional:
        try:
            _drivers, rows, _meta = jolpica_adapter.fetch_classification(session.year, session.grand_prix)
            if rows and not session.classification:
                session.classification = rows
                if not session.drivers:
                    session.drivers = _drivers
                    _set_facet(session, "drivers", "jolpica", "high")
                _set_facet(session, "results", "jolpica", "high")
            elif rows:
                _reconcile_results(
                    session, rows, "jolpica",
                    "Official classification from the results archive, reconciled "
                    "over the timing feed's provisional running order.")
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


def _laps_are_coded(session: RaceSession) -> bool:
    """Do the laps carry the timing system's OWN status codes?

    The archive route stamps every lap from the TrackStatus stream — those
    are evidence. OpenF1 publishes no per-lap status; this pipeline copies the
    windows onto its laps for the pace model, and a copy of a window is not
    evidence for a window. So the per-lap status is read back only for laps a
    coding source supplied, and rewritten on every read for the rest — a
    record cached with windows an older builder got wrong must not re-derive
    the same wrong windows from the statuses it stamped from them.
    """
    report = session.source_report
    src = next((f.source for f in report.facets if f.facet == "laps"), None) if report else None
    return src not in ("openf1", "jolpica", None) or (src is None and session.data_source == DataSource.MOCK)


def _derive_neutralizations(session: RaceSession) -> None:
    """The session's Safety Car / VSC / red-flag windows, from its own record,
    on every read — see analysis/neutralizations for the rules. Then the two
    things that follow from them: the per-lap status the pace model reads
    (stamped for a source with no codes of its own), and which pit stops fell
    inside a window."""
    from ..analysis import neutralizations as neu
    coded = _laps_are_coded(session)
    session.track_status_windows = neu.derive_windows(session, lap_status_authoritative=coded)
    neu.stamp_lap_status(session, overwrite=not coded)
    neu.attach_incidents(session)
    neu.stamp_pit_stops(session)


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


def _merge_from_archive(session: RaceSession, primary: str,
                        ask_for_results: bool = True) -> None:
    """Fill the facets only the F1 archive has.

    The archive was wired as a *fallback* — used when OpenF1 fails entirely —
    and never as an *enrichment* source. So when OpenF1 answered but returned an
    empty stint list (or no weather, or no race control), those facets stayed in
    `missing`, `partial` went true, and every single session wore the "Partial
    data" chip. The archive was sitting there with exactly that data and was
    never asked for it.

    Only runs when something is actually missing, only asks for the facets that
    are missing, and never overwrites data the primary source did supply.

    The archive also holds the official classification, so a session whose
    results are provisional counts that as missing too — when `ask_for_results`
    is set, which the fresh fetch and the revalidation are and the per-read
    heal of a cached record is not (that one must stay free of new round
    trips; see `_heal_cached`). Whenever the archive is fetched for any
    reason, an official classification it carries is reconciled in regardless.
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
    if ask_for_results and _results_provisional(session):
        wanted.append("results")
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
    # the archive's own classification is the official one (its static route
    # says otherwise, and is flagged) — lay it over a provisional order, or
    # complete an official one with the fields it carries that ours lacks
    # (the archive reads the grid off the results; OpenF1's result has none)
    if other.classification and not _results_provisional(other):
        if _results_provisional(session):
            _reconcile_results(
                session, other.classification, "f1-archive",
                "Official classification from the F1 live-timing archive, reconciled "
                "over the timing feed's provisional running order.")
        else:
            _fill_official_fields(session, other.classification, "f1-archive")


#: How often an UNSETTLED cached record is checked against the sources again.
#:
#: NOT A DELAY BEFORE THE DATA IS TRUSTED — the record is trusted for exactly
#: what it is, and labelled so, from the first read. This is the cadence of
#: re-asking, and it is the sources' own: `upstream` keeps a current-season
#: answer for this long before fetching it afresh, so asking more often than
#: this returns the same cached JSON and asking less often leaves a published
#: result sitting unread. A settled record is never re-asked; a record that is
#: revalidated and gains nothing is not re-asked before the next window.
_REVALIDATE_AFTER = upstream.TTL_LIVE


def _pit_timing_known(session: RaceSession) -> int:
    """How many stops carry a measured duration — the pit facet's readiness."""
    return sum(1 for p in session.pit_stops
               if p.stationary_time or p.stop_duration or p.pit_lane_time)


def _readiness(session: RaceSession) -> tuple:
    """Everything a revalidation can improve, as one comparable value."""
    r = session.source_report
    return (tuple(r.missing), tuple(r.provisional), r.settled, tuple(r.awaiting),
            _pit_timing_known(session)) if r else ()


def _identity(session: RaceSession) -> tuple:
    """Who is in the record and where they started — the two facts an older
    build could have written wrong (a shouted surname, a grid on one copy)
    and today's offline derivations put right. Compared before and after so
    the repair is written back once instead of redone on every read."""
    return (tuple((d.code, d.name, d.grid) for d in session.drivers),
            tuple((c.driver, c.name, c.grid) for c in session.classification),
            # the neutralisations too: a record cached with windows an older
            # builder paired wrong is rebuilt on read and written back once
            tuple((w.status, w.start_lap, w.end_lap, w.cause, w.source)
                  for w in session.track_status_windows))


def _needs_revalidation(session: RaceSession) -> bool:
    """Is there anything left for the sources to answer? Unsettled, or settled
    and still owed a field (see SourceReport.awaiting). A record with neither
    costs no round trips, ever."""
    r = session.source_report
    return bool(r) and (not r.settled or bool(r.awaiting))


def _adopt_pit_stops(session: RaceSession, stops) -> None:
    """Take a later answer from the pit feed: whole, if we had none, or just the
    durations, if the stops themselves were already known."""
    if not stops:
        return
    if not session.pit_stops:
        session.pit_stops = list(stops)
        _set_facet(session, "pit_stops", "openf1", "high")
        return
    by_key = {(s.driver, s.lap): s for s in stops}
    for p in session.pit_stops:
        late = by_key.get((p.driver, p.lap))
        if late and late.pit_lane_time and not (p.pit_lane_time or p.stop_duration or p.stationary_time):
            p.pit_lane_time = late.pit_lane_time
            p.source, p.confidence, p.explanation = late.source, late.confidence, late.explanation
            p.estimated_stationary_time = None


def _revalidate(session: RaceSession) -> None:
    """Ask again for what a record is still waiting on.

    THE SAME SOURCES, THE SAME MERGES, LATER. This is not a second pipeline:
    every step here is one the fresh fetch already runs, pointed at a record
    that was assembled before the sources had finished publishing. What was
    missing then is asked for now — the official classification first, from
    whichever source has it, then the fields the settling source never
    carries (`_results_archive_owes`), then the feeds that are only worth
    asking once a result exists. Nothing already authoritative is touched,
    and nothing is estimated: a source that still has nothing leaves the
    record as it was, to be asked again next window.

    A record that is settled and owed only a field asks only for that field:
    one request to the results archive, the pit feed if the durations are
    still blank — not the F1 archive's whole session over again.
    """
    provisional = _results_provisional(session)
    awaiting = session.source_report.awaiting if session.source_report else []
    if session.category in ("race", "sprint") and any(
            name == "openf1" for name, _fetch in _chain(session.year)):
        # the cheap question — the one endpoint a provisional record is waiting
        # on, without the eleven the first load paid for
        if provisional:
            try:
                rows = openf1_adapter.fetch_results(
                    session.year, session.grand_prix, session.session_type)
                if rows:
                    _reconcile_results(
                        session, rows, "openf1",
                        "Official classification from OpenF1's session result, "
                        "reconciled over the timing feed's provisional running order.")
            except Exception as exc:  # noqa: BLE001
                log.info("openf1 result revalidation failed: %s", exc)
        # …and the pit feed, whose durations land after the stops themselves —
        # for a record still assembling, or one whose stops are owed a time;
        # not for a settled record that is only waiting on its grid
        if (provisional or "pit_timing" in awaiting) and not _pit_timing_known(session):
            try:
                _adopt_pit_stops(session, openf1_adapter.fetch_pit_stops(
                    session.year, session.grand_prix, session.session_type))
            except Exception as exc:  # noqa: BLE001
                log.info("openf1 pit revalidation failed: %s", exc)
    if provisional:
        # the results archive and the F1 archive, exactly as on a fresh fetch
        _merge_missing_facets(session, primary="cache")
        _merge_from_archive(session, primary="cache", ask_for_results=True)
    _enrich_from_results_archive(session, primary="cache")
    try:
        pitstop_service.enrich(session, allow_network=True)
    except Exception as exc:  # noqa: BLE001
        log.info("pit-stop revalidation failed: %s", exc)
    _backfill_drivers(session, primary="cache")
    _finalize_session(session)


def _heal_cached(session: RaceSession, revalidate: bool = False) -> bool:
    """Bring a cached session up to what today's pipeline would have produced.

    Three things go stale in a thirty-day cache: facets that were missing only
    because a source was down at fetch time, facets a newer release no longer
    considers missing at all — and, since V107, a record that was assembled
    before the sources had published the official result, which V108 widened
    to a record whose official result is missing a field another source has.
    All were frozen into the file, so a session kept showing "Partial data" —
    or a full page with a "—" in every result column, or "won from P?" — long
    after the reason had gone.

    The first two are free and run on every read. The third costs round trips
    and runs only when the caller says the record is due (`revalidate`), which
    `load_session` decides from the entry's age — see `_REVALIDATE_AFTER`.

    Returns True only when something actually changed, so a still-unreachable
    archive, or a result still unpublished, never triggers a pointless write.
    """
    report = session.source_report
    if not report:
        return False
    # measured before the audit, so a verdict the file froze and today's
    # pipeline disagrees with — a gap a newer release closed, a provisional
    # result an older one never flagged — counts as a change worth writing
    before = _readiness(session)
    _prune_inapplicable_facets(session)
    _audit_report(session)
    if any(f in report.missing for f in _ARCHIVE_FACETS):
        _merge_from_archive(session, primary="cache", ask_for_results=False)
        _audit_report(session)
    if revalidate and _needs_revalidation(session):
        _revalidate(session)
    return _readiness(session) != before


def _enrich_from_results_archive(session: RaceSession, primary: str) -> None:
    """Complete the classification from the results archive: the starting
    grid, the FIA classified time of each lead-lap finisher, the reason each
    car retired ("Hydraulics", "Collision", …), the laps a retirement made.

    THIS USED TO COPY REASONS AND TIMES AND NOTHING ELSE. It asked the archive
    for its classification — one request, cached and paced — and then read two
    fields off the answer while the starting grid sat in the same rows. That
    is the field "won from P?" was missing. Everything the archive publishes
    that the row lacks is filled now (`_fill_official_fields`), and nothing a
    row already holds is touched. Races only: the Jolpica results endpoint
    describes the Grand Prix, not sprints.
    """
    if primary == "jolpica" or session.category != "race":
        return
    retired = [c for c in session.classification if c.retired]
    need_reasons = retired and not all(c.retirement_reason for c in retired)
    need_times = any(not c.retired and c.race_time is None for c in session.classification)
    if not need_reasons and not need_times and not _results_archive_owes(session):
        return
    try:
        _drivers, rows, _meta = jolpica_adapter.fetch_classification(
            session.year, session.grand_prix)
    except Exception as exc:  # noqa: BLE001
        log.info("classification enrich failed: %s", exc)
        return
    _fill_official_fields(session, rows, "jolpica")


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

    # THE SECOND AXIS: PRESENT, BUT NOT THE OFFICIAL RECORD. An adapter that
    # fell back to a running order flagged the facet; a record cached before
    # any adapter did is recognised by its shape. Either way the row is
    # relabelled so the sources panel says what it is, and the verdict below
    # carries it to the clients.
    provisional: list[str] = []
    for f in facets:
        if f.source == "none":
            continue
        if f.facet == "results" and not f.provisional and _results_hollow(session):
            f.provisional, f.confidence = True, "low"
            f.detail = f.detail or _HOLLOW_RESULTS_NOTE
        if f.provisional:
            provisional.append(f.facet)

    report.facets = facets
    report.missing = missing
    report.partial = bool(missing)
    report.provisional = provisional
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
    # SETTLED IS COMPLETE AND OFFICIAL. `complete` keeps meaning "readable":
    # a race with a provisional classification has every lap, stint and
    # position, and refusing to show them for one late feed would be the
    # generic unavailable screen the product exists to avoid. What it must not
    # be is called finished — so that is a separate word, and the one the
    # clients gate their derived facts (margins, finishers, retirements) on.
    report.settled = report.complete and not any(p in essential for p in provisional)
    # THE THIRD AXIS: official, and still owed a field — see SourceReport.
    # Only asked of an official classification (a provisional one is owed
    # the whole result, and is already re-asked for it), and only for fields
    # a configured source publishes for this era.
    awaiting: list[str] = []
    if "results" not in provisional:
        awaiting += _results_archive_owes(session)
    if (cat in ("race", "sprint") and session.year >= _FACET_FROM["pit_stops"]
            and session.pit_stops and not _pit_timing_known(session)):
        awaiting.append("pit_timing")
    report.awaiting = awaiting
    if not missing:
        report.missing_reason = None
    session.partial = report.partial
    session.complete = report.complete
    session.settled = report.settled

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

    # names in the sport's own case, and the grid on both copies of the entry
    # — offline, on every path, so a record cached with "Kimi ANTONELLI" or
    # with the grid on its rows and not its drivers is right on its next read
    canonicalize_names(session)
    sync_grids(session)

    # the position trace, before anything that reads one. Every line chart in
    # the product plots it, and the overtake inference below needs it to work
    # over — see _derive_positions for why it must not depend on who answered.
    _derive_positions(session)

    # the neutralisations, from the log and the coded laps — never from the
    # windows an earlier build wrote — and everything stamped from them
    _derive_neutralizations(session)

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
            # and the gaps in one shape whichever source wrote them: none for
            # the winner (OpenF1 says "LEADER", the archive says nothing),
            # "+11.536s" for everyone else, a total time never shown as a gap
            fix_classification(session)
        except Exception as exc:  # noqa: BLE001
            log.warning("classification ordering failed: %s", exc)

    # a facet a session type cannot have is not a gap in our data
    _prune_inapplicable_facets(session)

    # and then the one audit that decides whether this session is complete —
    # from the session, not from whichever adapter happened to answer first
    _audit_report(session)


def _together(steps: list[tuple[str, bool, Callable[[], None]]]) -> None:
    """Run independent enrichment steps at the same time instead of in turn.

    Each step is (phase name, whether a failure is survivable, callable).

    The order they were WRITTEN in was never a dependency — it was just the
    order they were added. Every step here reads and writes a different facet,
    so the only thing the sequence bought was a wall clock equal to the sum of
    every upstream's latency, paid by whoever opened the page. Concurrently, it
    is roughly the slowest one.

    Two details this has to get right, and both are about not changing anything
    except the waiting:

    * `contextvars` do not cross a thread boundary, so a worker would record its
      timing into nothing and the phase would vanish from Server-Timing exactly
      when it mattered. Each step therefore runs inside its own copy of the
      request context — which shares the same buffer object, so the appends land
      where the header will look for them. A separate copy per step because one
      Context cannot be entered by two threads at once.
    * A step that could previously fail the whole fetch still can. Swallowing
      those here would silently convert "this source did not work, try the next
      one" into "this source worked and returned less", which is a data-quality
      regression wearing a performance fix's clothes.
    """
    def run(name: str, fn) -> None:
        with timing.phase(name):
            fn()

    if len(steps) < 2:
        for name, survivable, fn in steps:
            try:
                run(name, fn)
            except Exception as exc:  # noqa: BLE001
                if not survivable:
                    raise
                log.info("%s failed: %s", name, exc)
        return

    from concurrent.futures import ThreadPoolExecutor
    import contextvars

    with ThreadPoolExecutor(max_workers=len(steps)) as pool:
        futures = [(name, survivable,
                    pool.submit(contextvars.copy_context().run, run, name, fn))
                   for name, survivable, fn in steps]
    fatal: Exception | None = None
    for name, survivable, fut in futures:
        try:
            fut.result()
        except Exception as exc:  # noqa: BLE001
            if survivable:
                log.info("%s failed: %s", name, exc)
            elif fatal is None:
                fatal = exc
    if fatal is not None:
        raise fatal


def _post_process(session: RaceSession, primary: str) -> None:
    """Enrich a freshly-fetched real session and finalize its source report."""
    session.category = session.category or session_category(session.session_type)

    # STAGE ONE — the two steps that can INTRODUCE a facet.
    #
    # They fill disjoint sets (this one laps / results / pit stops / drivers,
    # the archive one stints / race control / weather), so they do not contend;
    # but everything downstream reads what they produced, so nothing else may
    # start until both have finished. `_set_facet` is the one place they both
    # write, and it takes a lock for exactly that reason.
    _together([
        # fill hollow facets from other sources before any analysis-dependent steps
        ("merge.facets", False, lambda: _merge_missing_facets(session, primary)),
        # …including the stints / race control / weather that only the F1 archive
        # has. Skipping this step is why every session reported partial data.
        # Both may lay the official classification over a provisional one; they
        # reconcile the same fields from the same record, so whichever lands
        # second changes nothing.
        ("merge.archive", False, lambda: _merge_from_archive(session, primary,
                                                              ask_for_results=True)),
    ])

    # STAGE TWO — four decorations of what stage one settled.
    #
    # Retirements and qualifying segments both touch classification rows but can
    # never both run (one is races-only, the other qualifying-only, and a
    # session is one or the other). Pit stops touch pit stops; portraits touch
    # drivers. Nothing here reads another's output.
    _together([
        # the fields the results archive has that the primary lacks — the
        # starting grid, classified times, retirement reasons
        ("enrich.results", False, lambda: _enrich_from_results_archive(session, primary)),
        # qualifying: per-segment Q1/Q2/Q3 bests from the archive (live timing
        # exposes laps but not which knockout segment they belonged to)
        ("enrich.quali", False, lambda: _enrich_quali_segments(session, primary)),
        # pit-stop timing (may pull durations from Jolpica)
        ("enrich.pitstops", True, lambda: pitstop_service.enrich(session, allow_network=True)),
        # driver portraits: season-wide map fills what the session record lacked
        ("enrich.headshots", True, lambda: headshots.enrich(session)),
    ])

    # the entry list, before anything that resolves a name from a code
    with timing.phase("derive.drivers"):
        _backfill_drivers(session, primary)

    # everything from here needs no provider and no network — and is shared
    # with the demo path, so the two cannot drift apart again
    with timing.phase("finalize"):
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
    """The season's calendar — every round of it.

    IT IS A MERGE, NOT A RACE. This used to return the first source that
    answered with anything, and OpenF1 answers first: a live-timing mirror
    that creates a meeting weeks, not months, before the cars run. Mid-season
    it therefore knows the rounds that have happened and the few that are
    imminent, and the season quietly ended wherever its knowledge did — in
    2026, at São Paulo, with Las Vegas, Qatar and Abu Dhabi missing from the
    page whose whole job is to say what is coming.

    Jolpica knows which Grands Prix exist and how they are numbered from the
    day the calendar is published; OpenF1 knows exactly when each session of a
    weekend it has loaded will start. Both are asked and the two are merged —
    see adapters/calendar_merge — so the list is as long as the season and as
    precise as the sources allow. Either source failing costs detail or
    ordering, never an event.
    """
    gps, src, _report = get_grands_prix_detailed(year)
    return gps, src


def get_grands_prix_detailed(year: int) -> tuple[list[GrandPrix], DataSource, dict]:
    """The calendar, plus how many rounds each source actually contributed.

    THE THIRD RETURN VALUE IS A DEBUGGING TOOL WITH A HISTORY. "The schedule
    is missing the last three races" is a sentence that cost two releases to
    answer, because from the outside a short season and a filtered season look
    identical. The counts say which it is in one request: if Jolpica reported
    23 and the page shows 6, the calendar is fine and something downstream is
    trimming; if Jolpica reported 20, the season really did arrive short and
    the question is why.
    """
    settings = get_settings()
    report: dict = {"mode": "mock", "sources": {}, "rounds": 0}
    if not settings.mock_mode and settings.enable_live_fetch:
        def ask(fn) -> list[GrandPrix]:
            try:
                return fn(year) or []
            except Exception:  # noqa: BLE001
                return []

        # AT THE SAME TIME, NOT ONE AFTER THE OTHER. Asking a second source is
        # what makes the calendar complete; making the reader wait for the sum
        # of two hosts to find that out is not. This call is on the critical
        # path of the Explorer's first paint, so the merge costs the slower of
        # the two rather than both. Pre-2023 predates OpenF1 entirely, and
        # asking it costs a timeout for a certain empty answer.
        if year >= 2023:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=2) as pool:
                spine_f = pool.submit(ask, jolpica_adapter.list_grands_prix)
                detail_f = pool.submit(ask, openf1_adapter.list_grands_prix)
                spine, detail = spine_f.result(), detail_f.result()
        else:
            spine, detail = ask(jolpica_adapter.list_grands_prix), []

        fetched = calendar_merge.merge(spine, detail)
        merged = season_memory.widest(year, fetched)
        if merged:
            report = {
                "mode": "live",
                "sources": {"jolpica": len(spine), "openf1": len(detail)},
                # Rounds this answer owes to the remembered calendar rather
                # than to what the sources just said — non-zero means a source
                # is degraded right now and the season survived it.
                "retained": len(merged) - len(fetched),
                "rounds": len(merged),
            }
            return merged, DataSource.LIVE, report

    gps = mock_adapter.mock_grands_prix(year)
    report["rounds"] = len(gps)
    return gps, DataSource.MOCK, report


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
