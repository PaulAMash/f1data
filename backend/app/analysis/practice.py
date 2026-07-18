"""
Practice / non-race analysis.

A practice session is NOT a race: there are no finishing positions and no DNFs,
just runs. This module answers the questions that actually matter in practice —
who was fastest, who had the best long-run (race-sim) pace, who did the most laps,
who improved most as the track rubbered in — and returns a PracticeSummary.
"""
from __future__ import annotations

import statistics
from collections import defaultdict

from ..models import (
    Lap,
    PracticeDriverRow,
    PracticeSummary,
    RaceSession,
    Stint,
)

MIN_LONG_RUN = 5          # laps needed to count as a "long run"
LOW_RUNNING_LAPS = 4      # at/below this = not representative


def compute_practice(session: RaceSession) -> PracticeSummary:
    laps_by: dict[str, list[Lap]] = defaultdict(list)
    for l in session.laps:
        laps_by[l.driver].append(l)
    stints_by: dict[str, list[Stint]] = defaultdict(list)
    for s in session.stints:
        stints_by[s.driver].append(s)
    meta = {d.code: d for d in session.drivers}

    rows: list[PracticeDriverRow] = []
    for code, dl in laps_by.items():
        dl.sort(key=lambda x: x.lap)
        clean = [l.lap_time for l in dl if l.lap_time and not l.is_outlier]
        best = round(min(clean), 3) if clean else None
        laps_done = len(dl)
        long_pace, long_laps = _long_run(stints_by.get(code, []), dl)
        cons = round(statistics.pstdev(clean), 3) if len(clean) > 1 else None
        improvement = _improvement(dl)
        compounds = []
        for s in sorted(stints_by.get(code, []), key=lambda s: s.stint):
            if s.compound.value not in compounds:
                compounds.append(s.compound.value)
        d = meta.get(code)
        rows.append(PracticeDriverRow(
            driver=code, name=d.name if d else code, team=d.team if d else "?",
            team_color=d.team_color if d else "#888888", best_lap=best,
            laps_completed=laps_done, long_run_pace=long_pace, long_run_laps=long_laps,
            consistency=None, improvement=improvement, compounds=compounds,
            best_sectors=_best_sectors(dl), low_running=laps_done <= LOW_RUNNING_LAPS,
            consistency_score=cons,
        ))

    _rank(rows)
    fastest = rows[0].driver if rows and rows[0].best_lap else None
    fastest_lap = rows[0].best_lap if rows else None
    best_long = min((r for r in rows if r.long_run_pace), key=lambda r: r.long_run_pace, default=None)
    most_laps = max(rows, key=lambda r: r.laps_completed, default=None)
    most_improved = max((r for r in rows if r.improvement), key=lambda r: r.improvement, default=None)
    most_consistent = _most_consistent(rows)

    return PracticeSummary(
        session_type=session.session_type,
        fastest_driver=fastest, fastest_lap=fastest_lap,
        best_long_run_driver=best_long.driver if best_long else None,
        most_laps_driver=most_laps.driver if most_laps else None,
        most_improved_driver=most_improved.driver if most_improved else None,
        most_consistent_driver=most_consistent.driver if most_consistent else None,
        track_evolving=_track_evolving(session),
        rows=rows, team_ranking=_team_ranking(rows),
        story=_story(session, rows, fastest, best_long, most_improved),
        notes=_notes(rows),
    )


# --------------------------------------------------------------------------- #
def _long_run(stints: list[Stint], laps: list[Lap]) -> tuple[float | None, int]:
    """Median pace of the driver's longest clean run (>= MIN_LONG_RUN laps)."""
    best = None
    best_len = 0
    for s in stints:
        if s.laps < MIN_LONG_RUN:
            continue
        times = [l.lap_time for l in laps
                 if l.stint == s.stint and l.lap_time and not l.is_outlier]
        if len(times) >= MIN_LONG_RUN - 1:
            med = round(statistics.median(times), 3)
            if len(times) > best_len:
                best, best_len = med, len(times)
    return best, best_len


def _improvement(laps: list[Lap]) -> float | None:
    clean = [l.lap_time for l in laps if l.lap_time and not l.is_outlier]
    if len(clean) < 3:
        return None
    early = min(clean[: max(1, len(clean) // 3)])
    best = min(clean)
    return round(early - best, 3) if early > best else 0.0


def _best_sectors(laps: list[Lap]) -> list:
    def m(attr):
        vals = [getattr(l, attr) for l in laps if getattr(l, attr)]
        return round(min(vals), 3) if vals else None
    return [m("sector1"), m("sector2"), m("sector3")]


def _rank(rows: list[PracticeDriverRow]) -> None:
    ranked = sorted([r for r in rows if r.best_lap], key=lambda r: r.best_lap)
    fastest = ranked[0].best_lap if ranked else None
    for i, r in enumerate(ranked, start=1):
        r.best_lap_rank = i
        r.gap_to_fastest = round(r.best_lap - fastest, 3) if fastest else None
    rows.sort(key=lambda r: (r.best_lap_rank is None, r.best_lap_rank or 999))
    # consistency score across field (lower stdev = higher score)
    stdevs = [r.consistency_score for r in rows if r.consistency_score is not None]
    if stdevs:
        lo, hi = min(stdevs), max(stdevs)
        span = (hi - lo) or 1.0
        for r in rows:
            if r.consistency_score is not None:
                r.consistency_score = round(100 * (1 - (r.consistency_score - lo) / span), 1)


def _most_consistent(rows):
    cands = [r for r in rows if r.consistency_score is not None and not r.low_running]
    return max(cands, key=lambda r: r.consistency_score, default=None)


def _team_ranking(rows: list[PracticeDriverRow]) -> list[dict]:
    by_team: dict[str, list] = defaultdict(list)
    for r in rows:
        if r.best_lap:
            by_team[r.team].append((r.best_lap, r.team_color))
    out = [{"team": t, "color": v[0][1], "best": round(min(x[0] for x in v), 3)}
           for t, v in by_team.items()]
    out.sort(key=lambda x: x["best"])
    for i, o in enumerate(out):
        o["gap"] = round(o["best"] - out[0]["best"], 3)
    return out


def _track_evolving(session: RaceSession) -> bool:
    per_lap = defaultdict(list)
    for l in session.laps:
        if l.lap_time and not l.is_outlier:
            per_lap[l.lap].append(l.lap_time)
    pts = sorted((lap, statistics.median(v)) for lap, v in per_lap.items() if v)
    if len(pts) < 4:
        return False
    return pts[-1][1] < pts[0][1] - 0.3


def _story(session, rows, fastest, best_long, most_improved) -> list[str]:
    """What we LEARNED — not just who topped the sheet: one-lap picture,
    race-sim picture, who prioritized what, and what it hints for the weekend."""
    # full names, matching how race stories read ("Lewis Hamilton", never "HAM")
    def name_of(code):
        return next((r.name for r in rows if r.driver == code and r.name), code)

    s = []
    if fastest and rows:
        top = rows[0]
        s.append(f"{name_of(fastest)} set the pace in {session.session_type}, a "
                 f"{_fmt(top.best_lap)} best lap on the {(top.compounds or ['?'])[-1].lower()}.")
    if best_long:
        s.append(f"On race-simulation running, {name_of(best_long.driver)} looked strongest with a "
                 f"{_fmt(best_long.long_run_pace)} long-run pace over {best_long.long_run_laps} laps.")
    if most_improved and most_improved.improvement:
        s.append(f"{name_of(most_improved.driver)} improved the most as the track rubbered in "
                 f"(about {most_improved.improvement:.1f}s quicker than their early laps).")

    # which teams ran a race-pace-first programme (most long-run mileage)
    team_lr: dict[str, int] = defaultdict(int)
    for r in rows:
        team_lr[r.team] += r.long_run_laps
    focused = [t for t, n in sorted(team_lr.items(), key=lambda kv: -kv[1]) if n >= 16][:2]
    if focused:
        s.append(f"{' and '.join(focused)} banked the most race-simulation laps — "
                 "a race-pace-first programme.")

    # what it suggests for the rest of the weekend
    one_lap = [r for r in rows if r.best_lap][:3]
    if len(one_lap) >= 2:
        s.append("Qualifying outlook: " + ", ".join(name_of(r.driver) for r in one_lap)
                 + " head the one-lap order so far.")
    longs = sorted((r for r in rows if r.long_run_pace), key=lambda r: r.long_run_pace)[:3]
    if len(longs) >= 2:
        s.append("Race outlook: " + ", ".join(name_of(r.driver) for r in longs)
                 + " look strongest over a stint.")

    s.append("Practice times mix fuel loads and engine modes, so treat outright pace as indicative, "
             "not a true grid order.")
    return s


def _notes(rows) -> list[str]:
    low = [r.driver for r in rows if r.low_running]
    notes = []
    if low:
        notes.append(f"Low mileage (few laps, not representative): {', '.join(low)}.")
    return notes


def _fmt(sec):
    if sec is None:
        return "—"
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}"
