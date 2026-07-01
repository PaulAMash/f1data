"""
Natural-language question answering — deterministic first, LLM-optional.

Every answer is computed from the loaded race data (classification, pace,
strategy, stints, pits, race control). No API key is required. If one *is*
configured, an LLM is used only to polish the wording of the already-computed
answer — it never invents facts. If a question can't be answered from the
available data, we say exactly what is missing.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import get_settings
from ..models import DriverPaceSummary, QuestionAnswer, RaceSession, StrategySummary

# team name -> aliases users might type
TEAM_ALIASES = {
    "Red Bull Racing": ["red bull", "redbull", "rbr"],
    "Ferrari": ["ferrari", "scuderia"],
    "McLaren": ["mclaren"],
    "Mercedes": ["mercedes", "merc"],
    "Aston Martin": ["aston", "aston martin"],
    "Williams": ["williams"],
    "Alpine": ["alpine"],
    "Haas F1 Team": ["haas"],
    "Kick Sauber": ["sauber", "kick"],
    "Racing Bulls": ["racing bulls", "rb", "vcarb", "visa"],
}


@dataclass
class QAContext:
    session: RaceSession
    strategy: StrategySummary
    pace: list[DriverPaceSummary]

    @property
    def pace_by_driver(self) -> dict[str, DriverPaceSummary]:
        return {p.driver: p for p in self.pace}

    @property
    def class_by_driver(self):
        return {c.driver: c for c in self.session.classification}


# --------------------------------------------------------------------------- #
# entity extraction
# --------------------------------------------------------------------------- #
def _resolve_drivers(q: str, session: RaceSession) -> list[str]:
    ql = q.lower()
    found: list[str] = []
    for d in session.drivers:
        code = d.code.upper()
        last = d.name.split()[-1].lower()
        if re.search(rf"\b{code.lower()}\b", ql) or (len(last) > 3 and last in ql):
            if code not in found:
                found.append(code)
    return found


def _resolve_teams(q: str) -> list[str]:
    ql = q.lower()
    teams = []
    for team, aliases in TEAM_ALIASES.items():
        if any(re.search(rf"\b{re.escape(a)}\b", ql) for a in aliases):
            teams.append(team)
    return teams


def _fmt_time(sec: float | None) -> str:
    if sec is None:
        return "n/a"
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}s"


def _reference_stops(session: RaceSession, exclude: str | None = None) -> int:
    """Most common stop count among the front-runners — the 'normal' strategy."""
    from collections import Counter
    counts = Counter(c.pit_stops for c in session.classification
                     if c.position and c.position <= 8 and not c.retired and c.driver != exclude)
    return counts.most_common(1)[0][0] if counts else 2


# --------------------------------------------------------------------------- #
# intent handlers — each returns QuestionAnswer or None
# --------------------------------------------------------------------------- #
def _h_why_lost(q, ctx: QAContext):
    if not re.search(r"\b(lose|lost|drop|dropped|fall|fell|slip)\b", q, re.I):
        return None
    drivers = _resolve_drivers(q, ctx.session)
    if not drivers:
        return None
    code = drivers[0]
    p = ctx.pace_by_driver.get(code)
    c = ctx.class_by_driver.get(code)
    if not p or not c:
        return _missing(q, [f"race data for {code}"])
    reasons = []
    if c.grid and c.position and c.position > c.grid:
        reasons.append(f"dropped from P{c.grid} on the grid to P{c.position}")
    if p.pace_rank and c.position and c.position > p.pace_rank:
        reasons.append(f"finished {c.position - p.pace_rank} place(s) below their P{p.pace_rank} clean-air pace")
    stops = c.pit_stops
    ref_stops = _reference_stops(ctx.session, exclude=code)
    if stops > ref_stops:
        reasons.append(f"ran {stops} pit stops vs the {ref_stops} most rivals used, "
                       f"paying ~{20.5 * (stops - ref_stops):.0f}s of extra pit loss")
    victims = [u for u in ctx.strategy.undercuts if u.victim == code]
    if victims:
        reasons.append(f"was undercut by {victims[0].attacker} around lap {victims[0].pit_lap}")
    if p.traffic_laps >= 8:
        reasons.append(f"spent {p.traffic_laps} laps stuck in traffic")
    if not reasons:
        return QuestionAnswer(question=q, kind="why_lost", confidence="medium",
                              answer=f"{code} finished P{c.position} from P{c.grid} — no single big loss stands out; "
                                     f"it looks like a steady race rather than a strategic error.")
    ans = f"{code} lost ground mainly because they " + "; ".join(reasons) + "."
    return QuestionAnswer(question=q, answer=ans, kind="why_lost", confidence="high",
                          supporting={"grid": c.grid, "finish": c.position, "pace_rank": p.pace_rank,
                                      "pit_stops": stops})


def _h_best_pace(q, ctx: QAContext):
    if not re.search(r"\b(best|strongest|fastest|quickest)\b.*\b(pace|race pace|car|speed)\b", q, re.I) \
       and not re.search(r"\bwho.*(fastest|quickest)\b", q, re.I):
        return None
    ranked = sorted([p for p in ctx.pace if p.pace_rank], key=lambda p: p.pace_rank)[:3]
    if not ranked:
        return _missing(q, ["lap-time data"])
    top = ranked[0]
    extra = ", then " + ", ".join(f"{p.driver} (P{p.pace_rank})" for p in ranked[1:]) if len(ranked) > 1 else ""
    note = ""
    if top.finish and top.finish > top.pace_rank:
        note = f" Despite the pace, they only finished P{top.finish} — track position/strategy held them back."
    ans = (f"{top.driver} had the best fuel- and tyre-corrected clean-air pace "
           f"(~{_fmt_time(top.clean_air_pace)} normalized){extra}.{note}")
    return QuestionAnswer(question=q, answer=ans, kind="best_pace", confidence="high",
                          supporting={"ranking": [{"driver": p.driver, "rank": p.pace_rank,
                                                    "clean_air": p.clean_air_pace} for p in ranked]})


def _h_pit_loss(q, ctx: QAContext):
    if not re.search(r"\bpit", q, re.I) or not re.search(r"\b(lose|lost|time|slow|most)\b", q, re.I):
        return None
    # most total pit-lane time lost = stops * avg loss (+ any slow stops)
    losses = []
    for c in ctx.session.classification:
        stops = [ps for ps in ctx.session.pit_stops if ps.driver == c.driver]
        total = sum(ps.pit_lane_time for ps in stops if ps.pit_lane_time) or (len(stops) * 20.5)
        losses.append((c.driver, len(stops), round(total, 1)))
    losses.sort(key=lambda x: -x[2])
    if not losses:
        return _missing(q, ["pit-stop data"])
    worst = losses[0]
    ans = (f"{worst[0]} spent the most time in the pits: {worst[1]} stops for roughly "
           f"{worst[2]:.0f}s of pit-lane time. Next: "
           + ", ".join(f"{d} ({n} stops, ~{t:.0f}s)" for d, n, t in losses[1:4]) + ".")
    return QuestionAnswer(question=q, answer=ans, kind="pit_loss", confidence="high",
                          supporting={"ranking": [{"driver": d, "stops": n, "seconds": t}
                                                  for d, n, t in losses[:6]]})


def _h_vsc(q, ctx: QAContext):
    if not re.search(r"\b(vsc|virtual safety car|safety car|benefit)\b", q, re.I):
        return None
    bpt = ctx.strategy.best_pit_timing
    if bpt and ("stop" in bpt.get("kind", "")):
        ans = bpt["detail"]
        cheap = sorted({ps.driver for ps in ctx.session.pit_stops if ps.under_vsc or ps.under_safety_car})
        if cheap:
            ans += f" Cars that converted the window: {', '.join(cheap)}."
        return QuestionAnswer(question=q, answer=ans, kind="vsc", confidence="high",
                              supporting={"cheap_stoppers": cheap})
    if not ctx.session.track_status_windows:
        return _missing(q, ["safety car / VSC windows (no neutralizations in this race)"])
    return QuestionAnswer(question=q, kind="vsc", confidence="medium",
                          answer="There were neutralizations but no driver clearly converted a cheap stop from them.")


def _h_compare(q, ctx: QAContext):
    if not re.search(r"\b(compare|vs|versus|against|difference)\b", q, re.I):
        return None
    teams = _resolve_teams(q)
    drivers = _resolve_drivers(q, ctx.session)
    if len(teams) >= 2:
        return _compare_teams(q, ctx, teams[0], teams[1])
    if len(drivers) >= 2:
        return _compare_drivers_strategy(q, ctx, drivers[0], drivers[1])
    return None


def _compare_teams(q, ctx: QAContext, t1, t2):
    def summary(team):
        rows = [c for c in ctx.session.classification if c.team == team]
        drivers = [r.driver for r in rows]
        stops = {r.driver: r.pit_stops for r in rows}
        seqs = {}
        for r in rows:
            seq = [s.compound.value for s in sorted(
                [st for st in ctx.session.stints if st.driver == r.driver], key=lambda s: s.stint)]
            seqs[r.driver] = seq
        best_fin = min((r.position for r in rows if r.position), default=None)
        return drivers, stops, seqs, best_fin
    d1, s1, q1, f1 = summary(t1)
    d2, s2, q2, f2 = summary(t2)
    if not d1 or not d2:
        missing = [t for t, d in ((t1, d1), (t2, d2)) if not d]
        return _missing(q, [f"cars for {', '.join(missing)}"])
    parts = [f"{t1}: " + "; ".join(f"{d} ran {s1[d]} stops ({'-'.join(q1[d]) or 'n/a'})" for d in d1)
             + f", best finish P{f1}.",
             f"{t2}: " + "; ".join(f"{d} ran {s2[d]} stops ({'-'.join(q2[d]) or 'n/a'})" for d in d2)
             + f", best finish P{f2}."]
    verdict = (f"{t1} came out ahead." if (f1 or 99) < (f2 or 99) else f"{t2} came out ahead.")
    return QuestionAnswer(question=q, answer=" ".join(parts) + " " + verdict, kind="compare_teams",
                          confidence="high", supporting={t1: q1, t2: q2})


def _compare_drivers_strategy(q, ctx: QAContext, a, b):
    from .engine import compare_drivers
    cmp = compare_drivers(ctx.session, a, b)
    if "error" in cmp:
        return _missing(q, [cmp["error"]])
    return QuestionAnswer(question=q, answer=cmp["verdict"], kind="compare_drivers",
                          confidence="high", supporting={"compound_sequence": cmp["compound_sequence"],
                                                         "pit_loss": cmp["pit_loss"]})


def _h_final_stint(q, ctx: QAContext):
    if not re.search(r"\bfinal stint|last stint|strongest.*stint|end of the race\b", q, re.I):
        return None
    best = None
    for p in ctx.pace:
        if not p.stints:
            continue
        fs = p.stints[-1]
        if fs.median_lap is None:
            continue
        if best is None or fs.median_lap < best[1]:
            best = (p.driver, fs.median_lap, fs.compound.value, fs.laps)
    if not best:
        return _missing(q, ["stint-level lap times"])
    ans = (f"{best[0]} had the strongest final stint — a median of {_fmt_time(best[1])} over "
           f"{best[3]} laps on the {best[2].lower()}.")
    return QuestionAnswer(question=q, answer=ans, kind="final_stint", confidence="medium")


def _h_alt_strategy(q, ctx: QAContext):
    if not re.search(r"\b(alternative|alternate|better strateg|should have|extra stop|make sense)\b", q, re.I):
        return None
    ws = ctx.strategy.worst_strategy
    if not ws:
        return QuestionAnswer(question=q, kind="alt_strategy", confidence="low",
                              answer="No obvious strategic blunder stands out — the front-runners were closely matched on stops.")
    code = ws["driver"]
    stops = ws.get("stops")
    ref_stops = _reference_stops(ctx.session, exclude=code)
    ans = (f"{ws['detail']} A cleaner call would likely have been to match the {ref_stops}-stop cars: "
           f"holding track position was worth more than the fresher-tyre pace {code} chased with the extra stop. "
           f"Est. saving of one fewer stop ≈ {20.5:.0f}s of pit loss, though with higher end-stint degradation risk.")
    return QuestionAnswer(question=q, answer=ans, kind="alt_strategy", confidence="medium",
                          supporting={"driver": code, "stops": stops, "suggested_stops": ref_stops})


def _h_worst_team(q, ctx: QAContext):
    if not re.search(r"\bworst.*(strateg|call|team)\b", q, re.I):
        return None
    by_team: dict[str, list[int]] = {}
    for p in ctx.pace:
        c = ctx.class_by_driver.get(p.driver)
        if c and c.position and p.pace_rank and not c.retired:
            by_team.setdefault(p.team, []).append(c.position - p.pace_rank)  # + = lost vs pace
    if not by_team:
        return _missing(q, ["pace vs result data"])
    ranked = sorted(by_team.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    team, deltas = ranked[0]
    avg = sum(deltas) / len(deltas)
    if avg <= 0.3:
        return QuestionAnswer(question=q, kind="worst_team", confidence="low",
                              answer="No team clearly threw away positions relative to pace — strategy calls were broadly sound.")
    ans = (f"{team} lost the most relative to pace: on average {avg:.1f} positions worse than their "
           f"clean-air speed suggested, the biggest strategic underperformance of the race.")
    return QuestionAnswer(question=q, answer=ans, kind="worst_team", confidence="medium",
                          supporting={"team_deltas": {t: round(sum(d) / len(d), 2) for t, d in by_team.items()}})


def _h_undercut(q, ctx: QAContext):
    if not re.search(r"\bundercut|overcut\b", q, re.I):
        return None
    if not ctx.strategy.undercuts:
        return QuestionAnswer(question=q, kind="undercut", confidence="medium",
                              answer="No clear undercut/overcut swings were detected — the pit cycles mostly held station.")
    u = ctx.strategy.undercuts[0]
    others = "; ".join(f"{x.attacker} {x.kind} {x.victim}" for x in ctx.strategy.undercuts[1:4])
    ans = (f"Yes — the clearest was {u.attacker} {u.kind}ing {u.victim} by stopping on lap {u.pit_lap} "
           f"and emerging ahead ({u.positions_gained} place gained).")
    if others:
        ans += f" Others: {others}."
    return QuestionAnswer(question=q, answer=ans, kind="undercut", confidence="high")


def _h_winner(q, ctx: QAContext):
    if not re.search(r"\bwho won|winner|win the race|p1\b", q, re.I):
        return None
    w = ctx.strategy.winner
    c = ctx.class_by_driver.get(w) if w else None
    if not c:
        return _missing(q, ["classification"])
    ans = (f"{c.name} ({c.team}) won the {ctx.session.grand_prix}, from P{c.grid} on the grid, "
           f"running {c.pit_stops} stops.")
    return QuestionAnswer(question=q, answer=ans, kind="winner", confidence="high")


def _h_tyre(q, ctx: QAContext):
    if not re.search(r"\b(tyre|tire|compound|stint|strateg)\b", q, re.I):
        return None
    drivers = _resolve_drivers(q, ctx.session)
    if not drivers:
        return None
    code = drivers[0]
    sts = sorted([s for s in ctx.session.stints if s.driver == code], key=lambda s: s.stint)
    if not sts:
        return _missing(q, [f"tyre stint data for {code}"])
    seq = " → ".join(f"{s.compound.value.title()} ({s.laps} laps)" for s in sts)
    ans = f"{code}'s tyre strategy: {seq}. That's a {len(sts) - 1}-stop race."
    return QuestionAnswer(question=q, answer=ans, kind="tyre_strategy", confidence="high")


def _h_weather(q, ctx: QAContext):
    if not re.search(r"\b(weather|rain|temperature|hot|cold|wet|dry)\b", q, re.I):
        return None
    if not ctx.strategy.weather_summary:
        return _missing(q, ["weather data"])
    return QuestionAnswer(question=q, answer=f"Conditions: {ctx.strategy.weather_summary}.",
                          kind="weather", confidence="high")


def _h_gainer_loser(q, ctx: QAContext):
    if not re.search(r"\b(gain|gained|climb|most places|biggest mover|loser|biggest los)\b", q, re.I):
        return None
    if re.search(r"\blos", q, re.I) and ctx.strategy.biggest_losers:
        g = ctx.strategy.biggest_losers[0]
        return QuestionAnswer(question=q, kind="loser", confidence="high",
                              answer=f"{g['driver']} lost the most: P{g['grid']} → P{g['finish']} ({g['net']} places).")
    if ctx.strategy.biggest_gainers:
        g = ctx.strategy.biggest_gainers[0]
        return QuestionAnswer(question=q, kind="gainer", confidence="high",
                              answer=f"{g['driver']} gained the most: P{g['grid']} → P{g['finish']} (+{g['net']} places).")
    return None


HANDLERS = [
    _h_why_lost, _h_undercut, _h_vsc, _h_pit_loss, _h_compare, _h_final_stint,
    _h_alt_strategy, _h_worst_team, _h_best_pace, _h_winner, _h_tyre, _h_weather,
    _h_gainer_loser,
]


# --------------------------------------------------------------------------- #
# public
# --------------------------------------------------------------------------- #
def answer_question(question: str, ctx: QAContext) -> QuestionAnswer:
    q = (question or "").strip()
    if not q:
        return QuestionAnswer(question=q, answer="Ask me something about the loaded race.",
                              kind="empty", confidence="low")
    for handler in HANDLERS:
        try:
            res = handler(q, ctx)
        except Exception:  # noqa: BLE001 — a broken handler must not kill the endpoint
            res = None
        if res is not None:
            return _maybe_polish(res, ctx)
    return _fallback(q, ctx)


def _fallback(q, ctx: QAContext) -> QuestionAnswer:
    hints = ("Try: “why did LEC lose places?”, “who had the best race pace?”, "
             "“who benefited from the VSC?”, “compare Ferrari and Red Bull strategy”, "
             "“did the extra stop make sense?”")
    return QuestionAnswer(
        question=q, kind="fallback", confidence="low",
        answer=("I can only answer from the loaded race data and I couldn't map that question to a "
                f"known analysis. {hints}"),
        missing_data=["a recognized question intent"])


def _missing(q, what: list[str]) -> QuestionAnswer:
    return QuestionAnswer(question=q, kind="missing", confidence="low", missing_data=what,
                          answer=f"I can't answer that from the loaded data — missing: {', '.join(what)}.")


def _maybe_polish(qa: QuestionAnswer, ctx: QAContext) -> QuestionAnswer:
    """If an LLM key is configured, rephrase the (already-correct) answer more
    naturally. The LLM is given only the computed answer + facts and told not to
    add new claims. Any failure falls back to the deterministic answer."""
    settings = get_settings()
    if not settings.llm_available or qa.kind in ("missing", "fallback", "empty"):
        return qa
    try:
        import anthropic  # optional dependency
        client = anthropic.Anthropic(api_key=settings.llm_api_key)
        prompt = (
            "You are an F1 strategy analyst. Rephrase the following answer more naturally and "
            "concisely for a fan. Do NOT add any facts not present. Keep all numbers.\n\n"
            f"Question: {qa.question}\nComputed answer: {qa.answer}\n"
            f"Supporting facts: {qa.supporting}"
        )
        msg = client.messages.create(
            model=settings.llm_model, max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in msg.content if getattr(block, "type", "") == "text")
        if text.strip():
            qa.answer = text.strip()
            qa.used_llm = True
    except Exception:  # noqa: BLE001
        pass  # deterministic answer stands
    return qa
