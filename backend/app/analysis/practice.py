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

from .text import plural

from ..models import (
    Lap,
    PracticeDriverRow,
    PracticeSummary,
    RaceSession,
    Stint,
)

MIN_LONG_RUN = 5          # laps needed to count as a "long run"
LOW_RUNNING_LAPS = 4      # at/below this = not representative
# A lap more than this far off the quickest lap of its own stint is not a lap of
# the run — it is a cool-down, a tow-hunting crawl or a lap behind a yellow. Over
# five 2026 practice sessions the field's laps sat within 10% of their stint's
# quickest lap or beyond 25% of it, with almost nothing in between.
RUN_RHYTHM = 1.12


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
    """Median pace of the driver's longest run, and how many laps it was.

    A run is consecutive flying laps inside one stint. The timing feeds only flag
    pit laps and missing laps as outliers, so a Friday stint that alternates push
    laps with cool-down laps half a minute slower arrives looking like a nine-lap
    run — and its median then lands on whichever kind of lap happens to sit in the
    middle. Leclerc's Madrid FP2 "long run" of 1:35.5 was four qualifying laps
    interleaved with three 2:25s, ranked ahead of his real eleven-lap race run.

    So: laps more than RUN_RHYTHM off the stint's own quickest lap are dropped,
    the run must be consecutive, it must be at least MIN_LONG_RUN - 1 flying laps
    (a MIN_LONG_RUN-lap stint less its out-lap), and the longest run wins — on a
    tie the later one, because race simulations come at the end of a session.
    """
    best: float | None = None
    best_key: tuple[int, int] | None = None
    for s in stints:
        if s.laps < MIN_LONG_RUN:
            continue
        flying = sorted((l for l in laps
                         if l.stint == s.stint and l.lap_time and not l.is_outlier),
                        key=lambda l: l.lap)
        if not flying:
            continue
        ceiling = min(l.lap_time for l in flying) * RUN_RHYTHM
        run = _longest_consecutive([l for l in flying if l.lap_time <= ceiling])
        if len(run) < MIN_LONG_RUN - 1:
            continue
        key = (len(run), s.stint)
        if best_key is None or key > best_key:
            best = round(statistics.median(l.lap_time for l in run), 3)
            best_key = key
    return best, (best_key[0] if best_key else 0)


def _longest_consecutive(laps: list[Lap]) -> list[Lap]:
    """The longest stretch of laps whose lap numbers step by exactly one."""
    best: list[Lap] = []
    current: list[Lap] = []
    for l in laps:
        if current and l.lap == current[-1].lap + 1:
            current.append(l)
        else:
            current = [l]
        if len(current) > len(best):
            best = current
    return best


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

    # The card grid beside this story already states WHO was fastest, who had
    # the best long run and who improved most. Repeating those here turned the
    # panel into a caption for the cards. What belongs here is what those facts
    # MEAN together — the contrasts and the read on the weekend.
    s = []
    if fastest and rows:
        top = rows[0]
        s.append(f"{name_of(fastest)} set the pace in {session.session_type}, a "
                 f"{_fmt(top.best_lap)} best lap on the {(top.compounds or ['?'])[-1].lower()}.")
        # stay on the headline driver before handing over to anyone else
        second = rows[1] if len(rows) > 1 else None
        last = (name_of(fastest) or "").split()[-1]
        bits = []
        if second and second.gap_to_fastest:
            bits.append(f"finished {second.gap_to_fastest:.3f}s clear of "
                        f"{(second.name or second.driver).split()[-1]}")
        if top.laps_completed:
            bits.append(f"over {plural(top.laps_completed, 'lap')} of running")
        if bits:
            s.append(f"{last} " + " ".join(bits) + ".")
    if best_long and fastest:
        if best_long.driver != fastest:
            # the genuinely interesting case: one-lap and race-pace disagree
            s.append(f"Over a stint the picture changes — {name_of(best_long.driver)} was the "
                     f"strongest on race-simulation running, so Sunday and Saturday may not "
                     f"reward the same car.")
        else:
            s.append(f"{name_of(best_long.driver)} backed the lap time up over a stint too, "
                     f"topping the race-simulation running as well — the strongest possible "
                     f"read from a Friday.")

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
