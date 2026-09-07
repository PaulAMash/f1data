"""
Race facts — the handful of race-level numbers every client shows, computed
once, from the canonical record, with None wherever the record cannot
establish them.

WHY. Each of these was being recomputed by whichever client was drawing it.
The website counted `!retired` rows for the finisher figure and subtracted two
already-rounded clean-air paces for the "best race pace" margin; the app did
its own arithmetic on the same record; they disagreed by a thousandth of a
second, and both were reading a payload that already contained everything
needed to say the number once. A domain fact has one implementation. This is
it; the clients format what it returns.

WHAT IS NOT HERE. Nothing estimated, nothing inferred from proximity. The
fastest lap is the quickest racing lap in the lap table and is labelled as
that, not as the FIA's fastest-lap award (which a source would have to state).
The finisher and retirement counts exist only once the classification is the
official one — a running order has nobody retired in it, which is not the same
as nobody having retired.
"""
from __future__ import annotations

import re

from ..models import DriverPaceSummary, RaceFacts, RaceSession
from .neutralizations import counts


def _margin_seconds(gap: str | None) -> float | None:
    if not gap or re.search(r"lap", str(gap), re.I):
        return None
    m = re.search(r"([-+]?\d+(?:\.\d+)?)", str(gap))
    if not m:
        return None
    v = float(m.group(1))
    return v if 0 < v < 3600 else None


def compute_facts(session: RaceSession, pace: list[DriverPaceSummary]) -> RaceFacts:
    report = session.source_report
    settled = bool(session.settled)
    facts = RaceFacts(
        settled=settled,
        awaiting=list(report.awaiting) if report else [],
        entries=len(session.classification) or None,
        race_distance_laps=session.total_laps or None,
        pit_data_reliable=bool(session.pit_data_reliable),
        neutralizations=counts(session),
    )
    if session.category not in ("race", "sprint"):
        return facts

    rows = session.classification
    ordered = sorted((c for c in rows if c.position), key=lambda c: c.position or 999)
    win = ordered[0] if ordered else None
    second = ordered[1] if len(ordered) > 1 else None
    if win:
        facts.winner, facts.winner_name, facts.winner_grid = win.driver, win.name, win.grid
    if second:
        facts.runner_up = second.driver
    # ---- only an official classification can count who finished ----------
    if settled and rows:
        facts.finishers = sum(1 for c in rows if not c.retired)
        facts.retirements = len(rows) - facts.finishers
        if second and second.gap:
            facts.margin = second.gap
            facts.margin_s = _margin_seconds(second.gap)
    # ---- the quickest racing lap in the table ------------------------------
    best_lap, best_driver = None, None
    for lp in session.laps:
        if lp.lap_time and not lp.pit_in and not lp.pit_out and (best_lap is None or lp.lap_time < best_lap):
            best_lap, best_driver = lp.lap_time, lp.driver
    if best_lap is not None:
        facts.fastest_lap, facts.fastest_lap_driver = round(best_lap, 3), best_driver
    # ---- best corrected pace, and its margin, rounded once -----------------
    ranked = sorted((p for p in pace if p.pace_rank and p.clean_air_pace is not None),
                    key=lambda p: p.pace_rank or 999)
    if ranked:
        top = ranked[0]
        facts.best_pace_driver, facts.best_pace = top.driver, top.clean_air_pace
        if len(ranked) > 1 and ranked[1].clean_air_pace is not None:
            facts.best_pace_gap = round(ranked[1].clean_air_pace - top.clean_air_pace, 3)
            facts.best_pace_gap_to = ranked[1].driver
    return facts
