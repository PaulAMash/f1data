"""
Qualifying analysis.

Qualifying is NOT a race: nobody wins anything yet — drivers earn grid slots
one flying lap at a time. This module answers the questions that matter on a
Saturday: who took pole and by how much, who over- or under-delivered, how the
track evolved, who went out early, and what interrupted the session. It never
implies the Grand Prix has already happened.
"""
from __future__ import annotations

import re
import statistics
from collections import defaultdict

from ..models import (
    Lap,
    QualiDriverRow,
    QualifyingSummary,
    RaceSession,
)


def compute_qualifying(session: RaceSession) -> QualifyingSummary:
    laps_by: dict[str, list[Lap]] = defaultdict(list)
    for l in session.laps:
        laps_by[l.driver].append(l)
    meta = {d.code: d for d in session.drivers}
    cls_by = {c.driver: c for c in session.classification}
    field = len(session.classification) or len(laps_by) or 20

    rows: list[QualiDriverRow] = []
    for code, d in meta.items():
        dl = sorted(laps_by.get(code, []), key=lambda x: x.lap)
        clean = [l.lap_time for l in dl if l.lap_time and not l.is_outlier]
        c = cls_by.get(code)
        best = min(clean) if clean else (c.best_lap if c else None)
        rows.append(QualiDriverRow(
            driver=code, name=d.name, team=d.team, team_color=d.team_color,
            position=c.position if c else None,
            best_lap=round(best, 3) if best else None,
            laps_completed=len(dl),
            q1=c.q1 if c else None, q2=c.q2 if c else None, q3=c.q3 if c else None,
            knocked_out_in=_knockout(c.position if c else None, field),
            improvement=_improvement(clean),
            consistency_score=round(statistics.pstdev(clean), 3) if len(clean) > 1 else None,
            best_sectors=_best_sectors(dl),
        ))
    rows = [r for r in rows if r.best_lap or r.position]
    rows.sort(key=lambda r: (r.position is None, r.position or 99,
                             r.best_lap is None, r.best_lap or 9e9))
    pole = rows[0] if rows and (rows[0].position == 1 or rows[0].best_lap) else None
    if pole and pole.best_lap:
        for r in rows:
            if r.best_lap:
                r.gap_to_pole = round(r.best_lap - pole.best_lap, 3)
    _teammate_deltas(rows)
    _scale_consistency(rows)

    p2 = next((r for r in rows if r.position == 2), rows[1] if len(rows) > 1 else None)
    pole_margin = (round(p2.best_lap - pole.best_lap, 3)
                   if pole and p2 and pole.best_lap and p2.best_lap else None)

    summary = QualifyingSummary(
        session_type=session.session_type,
        pole_driver=pole.driver if pole else None,
        pole_lap=pole.best_lap if pole else None,
        pole_margin=pole_margin,
        closest_pair=_closest_pair(rows),
        biggest_surprise=_surprise(rows),
        biggest_disappointment=_disappointment(rows),
        biggest_improvement_driver=_most_improved(rows),
        fastest_sector_driver=_sector_king(rows),
        most_consistent_driver=_most_consistent(rows),
        early_elimination=_early_exit(rows),
        track_evolving=_track_evolving(session),
        red_flags=_red_flags(session),
        deleted_laps=_deleted_laps(session),
        pole_sector_breakdown=_pole_sectors(pole, rows) if pole else None,
        segment_bests=_segment_bests(rows),
        rows=rows,
        team_ranking=_team_ranking(rows),
        team_progression=_team_progression(rows),
        avg_final_run_gain=_avg_gain(rows),
        conditions=_conditions(session),
        notes=_notes(session),
    )
    return _with_stories(session, summary)


# --------------------------------------------------------------------------- #
def _knockout(position: int | None, field: int) -> str | None:
    """Modern knockout format: the last 5 out in Q1, the next 5 in Q2."""
    if position is None or field < 12:
        return None
    if position > field - 5:
        return "Q1"
    if position > field - 10:
        return "Q2"
    return None


def _improvement(clean: list[float]) -> float | None:
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


def _teammate_deltas(rows: list[QualiDriverRow]) -> None:
    by_team: dict[str, list[QualiDriverRow]] = defaultdict(list)
    for r in rows:
        by_team[r.team].append(r)
    for pair in by_team.values():
        if len(pair) == 2 and pair[0].best_lap and pair[1].best_lap:
            pair[0].vs_teammate = round(pair[0].best_lap - pair[1].best_lap, 3)
            pair[1].vs_teammate = round(pair[1].best_lap - pair[0].best_lap, 3)


def _scale_consistency(rows: list[QualiDriverRow]) -> None:
    stdevs = [r.consistency_score for r in rows if r.consistency_score is not None]
    if not stdevs:
        return
    lo, hi = min(stdevs), max(stdevs)
    span = (hi - lo) or 1.0
    for r in rows:
        if r.consistency_score is not None:
            r.consistency_score = round(100 * (1 - (r.consistency_score - lo) / span), 1)


def _closest_pair(rows) -> dict | None:
    timed = sorted((r for r in rows if r.best_lap and r.position and r.position <= 10),
                   key=lambda r: r.best_lap)
    best = None
    for a, b in zip(timed, timed[1:]):
        d = round(b.best_lap - a.best_lap, 3)
        if best is None or d < best["delta"]:
            best = {"a": a.driver, "b": b.driver, "delta": d,
                    "positions": f"P{a.position}–P{b.position}"}
    return best


def _surprise(rows) -> dict | None:
    """The driver who most out-ran their car: beat their teammate by the
    biggest margin while reaching a later segment."""
    cands = [r for r in rows if r.vs_teammate is not None and r.vs_teammate < -0.15
             and r.position]
    if not cands:
        return None
    star = min(cands, key=lambda r: r.vs_teammate)
    return {"driver": star.driver,
            "reason": f"qualified P{star.position}, {abs(star.vs_teammate):.3f}s "
                      f"quicker than their teammate"}


def _most_improved(rows) -> str | None:
    cands = [r for r in rows if r.improvement]
    return max(cands, key=lambda r: r.improvement).driver if cands else None


def _sector_king(rows) -> str | None:
    """Who owns the most session-best sectors?"""
    bests: list[str | None] = []
    for i in range(3):
        holder, t = None, None
        for r in rows:
            s = r.best_sectors[i] if len(r.best_sectors) > i else None
            if s and (t is None or s < t):
                holder, t = r.driver, s
        bests.append(holder)
    counts: dict[str, int] = defaultdict(int)
    for h in bests:
        if h:
            counts[h] += 1
    return max(counts, key=lambda k: counts[k]) if counts else None


def _most_consistent(rows) -> str | None:
    cands = [r for r in rows if r.consistency_score is not None and r.laps_completed >= 4]
    return max(cands, key=lambda r: r.consistency_score).driver if cands else None


def _early_exit(rows) -> dict | None:
    """A notable Q1 exit: the eliminated driver whose teammate reached Q3, or
    the quickest car knocked out first."""
    q1_out = [r for r in rows if r.knocked_out_in == "Q1"]
    if not q1_out:
        return None
    teams_in_q3 = {r.team for r in rows if r.knocked_out_in is None and r.position}
    notable = next((r for r in sorted(q1_out, key=lambda r: r.position or 99)
                    if r.team in teams_in_q3), None)
    pick = notable or min(q1_out, key=lambda r: r.position or 99)
    reason = (f"out in Q1 (P{pick.position}) while their teammate reached Q3"
              if notable else f"first big name out — eliminated in Q1 (P{pick.position})")
    return {"driver": pick.driver, "reason": reason}


def _track_evolving(session: RaceSession) -> bool:
    per_lap = defaultdict(list)
    for l in session.laps:
        if l.lap_time and not l.is_outlier:
            per_lap[l.lap].append(l.lap_time)
    pts = sorted((lap, statistics.median(v)) for lap, v in per_lap.items() if v)
    if len(pts) < 4:
        return False
    return pts[-1][1] < pts[0][1] - 0.3


def _red_flags(session: RaceSession) -> list[str]:
    out = []
    for m in session.race_control:
        if m.message and re.search(r"\bRED\s+FLAG\b", m.message, re.I):
            out.append(m.message.strip()[:110])
    return out[:4]


def _deleted_laps(session: RaceSession) -> list[str]:
    out = []
    for m in session.race_control:
        if m.message and re.search(r"\bDELETED\b", m.message, re.I):
            out.append(m.message.strip()[:110])
    return out[:8]


def _pole_sectors(pole: QualiDriverRow, rows) -> dict | None:
    if not pole or not any(pole.best_sectors):
        return None
    session_best = []
    for i in range(3):
        vals = [r.best_sectors[i] for r in rows
                if len(r.best_sectors) > i and r.best_sectors[i]]
        session_best.append(round(min(vals), 3) if vals else None)
    return {"pole": pole.best_sectors, "session_best": session_best}


def _segment_bests(rows) -> dict:
    out = {}
    for seg in ("q1", "q2", "q3"):
        vals = [getattr(r, seg) for r in rows if getattr(r, seg)]
        if vals:
            out[seg.upper()] = round(min(vals), 3)
    return out


def _team_ranking(rows) -> list[dict]:
    by_team: dict[str, list] = defaultdict(list)
    for r in rows:
        if r.best_lap:
            by_team[r.team].append((r.best_lap, r.team_color))
    out = [{"team": t, "color": v[0][1], "best": round(min(x[0] for x in v), 3)}
           for t, v in by_team.items()]
    out.sort(key=lambda x: x["best"])
    for o in out:
        o["gap"] = round(o["best"] - out[0]["best"], 3)
    return out


def _notes(session: RaceSession) -> list[str]:
    notes = []
    if not any(c.q1 or c.q2 or c.q3 for c in session.classification):
        notes.append("Per-segment (Q1/Q2/Q3) times weren't available for this session — "
                     "segment columns are hidden rather than guessed.")
    return notes


def _fmt(sec):
    if sec is None:
        return "—"
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}"


def _disappointment(rows) -> dict | None:
    """The driver who most under-delivered: eliminated early while their
    teammate went meaningfully deeper or faster."""
    cands = [r for r in rows
             if r.vs_teammate is not None and r.vs_teammate > 0.15 and r.knocked_out_in]
    if not cands:
        return None
    worst = max(cands, key=lambda r: r.vs_teammate)
    mate = next((x for x in rows if x.team == worst.team and x.driver != worst.driver), None)
    mate_txt = f" while their teammate qualified P{mate.position}" if mate and mate.position else ""
    return {"driver": worst.driver,
            "reason": f"out in {worst.knocked_out_in} (P{worst.position}), "
                      f"{worst.vs_teammate:.3f}s slower than their teammate{mate_txt}"}


def _team_progression(rows) -> list[dict]:
    """Per team: best Q1 vs best final-segment lap — who found the most time
    as the session went on."""
    by_team: dict[str, dict] = {}
    for r in rows:
        t = by_team.setdefault(r.team, {"team": r.team, "color": r.team_color,
                                        "q1": None, "final": None})
        if r.q1 and (t["q1"] is None or r.q1 < t["q1"]):
            t["q1"] = r.q1
        final = r.q3 or r.q2 or r.q1
        if final and (t["final"] is None or final < t["final"]):
            t["final"] = final
    out = []
    for t in by_team.values():
        if t["q1"] and t["final"] and t["final"] < t["q1"]:
            out.append({**t, "gain": round(t["q1"] - t["final"], 3)})
    out.sort(key=lambda x: -x["gain"])
    return out[:6]


def _avg_gain(rows) -> float | None:
    gains = [r.improvement for r in rows if r.improvement and r.improvement > 0]
    return round(sum(gains) / len(gains), 3) if gains else None


def _conditions(session: RaceSession) -> str | None:
    if not session.weather:
        return None
    temps = [w.track_temp for w in session.weather if w.track_temp]
    wet = any(w.rainfall for w in session.weather)
    bits = ["Wet at times" if wet else "Dry"]
    if temps:
        bits.append(f"track {min(temps):.0f}–{max(temps):.0f}°C")
    return " · ".join(bits)


def _grid_word(session: RaceSession) -> str:
    return "Sprint grid" if session.category == "sprint_qualifying" else "grid"


def _race_word(session: RaceSession) -> str:
    return "Sprint" if session.category == "sprint_qualifying" else "race"


def _with_stories(session: RaceSession, q: QualifyingSummary) -> QualifyingSummary:
    """Two tellings of the same Saturday. Simple reads like a broadcast recap;
    Advanced reads like the analyst's debrief. Neither ever implies the
    Grand Prix has been run."""
    name = {r.driver: r.name for r in q.rows}
    n = lambda code: name.get(code, code)  # noqa: E731

    # ---- Simple: plain English, few bullets ----
    s: list[str] = []
    if q.pole_driver:
        margin = (f" — just {q.pole_margin:.3f}s ahead of the next car"
                  if q.pole_margin is not None else "")
        s.append(f"{n(q.pole_driver)} was the fastest of anyone and starts first{margin}.")
    if q.biggest_surprise:
        s.append(f"The surprise of the day: {n(q.biggest_surprise['driver'])}, who "
                 f"{q.biggest_surprise['reason']}.")
    if q.biggest_disappointment:
        s.append(f"The disappointment: {n(q.biggest_disappointment['driver'])}, "
                 f"{q.biggest_disappointment['reason']}.")
    if q.red_flags:
        s.append("The session was stopped by a red flag along the way.")
    elif q.deleted_laps:
        s.append("A few lap times were deleted for running off track.")
    if q.conditions:
        s.append(f"Conditions: {q.conditions}.")
    s = s[:5] + [f"This sets tomorrow's {_grid_word(session)} — the {_race_word(session)} "
                 "is still to come."]

    # ---- Advanced: the analyst's debrief ----
    a: list[str] = []
    if q.pole_driver and q.pole_lap:
        margin = f", {q.pole_margin:.3f}s in hand" if q.pole_margin is not None else ""
        a.append(f"Pole: {n(q.pole_driver)}, {_fmt(q.pole_lap)}{margin}"
                 + (f"; tightest gap in the top ten was {q.closest_pair['delta']:.3f}s "
                    f"({q.closest_pair['a']}–{q.closest_pair['b']})." if q.closest_pair else "."))
    evo_bits = []
    if q.segment_bests.get("Q1") and (q.segment_bests.get("Q3") or q.segment_bests.get("Q2")):
        final_seg = q.segment_bests.get("Q3") or q.segment_bests.get("Q2")
        evo_bits.append(f"the benchmark fell {q.segment_bests['Q1'] - final_seg:.3f}s "
                        f"from Q1 to the final segment")
    if q.avg_final_run_gain:
        evo_bits.append(f"drivers averaged −{q.avg_final_run_gain:.2f}s from first run to last")
    if evo_bits:
        a.append(("Track evolution was decisive: " if q.track_evolving else "Session trend: ")
                 + "; ".join(evo_bits)
                 + (f". Conditions: {q.conditions}." if q.conditions else "."))
    if q.team_progression:
        tp = q.team_progression[0]
        a.append(f"{tp['team']} gained the most through the segments (−{tp['gain']:.3f}s "
                 f"Q1→final); teammate deltas peaked at "
                 + (f"{max(abs(r.vs_teammate) for r in q.rows if r.vs_teammate is not None):.3f}s."
                    if any(r.vs_teammate is not None for r in q.rows) else "n/a."))
    over_under = []
    if q.biggest_surprise:
        over_under.append(f"over-delivery from {q.biggest_surprise['driver']} "
                          f"({q.biggest_surprise['reason']})")
    if q.biggest_disappointment:
        over_under.append(f"under-delivery from {q.biggest_disappointment['driver']} "
                          f"({q.biggest_disappointment['reason']})")
    if over_under:
        a.append("Biggest swings vs expectation: " + "; ".join(over_under) + ".")
    if q.deleted_laps:
        a.append(f"{len(q.deleted_laps)} lap(s) deleted for track limits"
                 + (" — enough to reshuffle an elimination zone." if len(q.deleted_laps) > 1 else "."))
    if q.red_flags:
        a.append(f"Interruption: {q.red_flags[0].lower()} — runs immediately after the restart "
                 "carried the timing risk.")
    a = a[:6] + [f"Net result: the {_grid_word(session)} is set; race pace remains unproven "
                 "until lights out."]

    return q.model_copy(update={"story": s, "story_advanced": a})
