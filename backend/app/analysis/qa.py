"""
Natural-language question answering — deterministic, fuzzy, and forgiving.

Design goals for this version:
  * Understand messy language ("how did george overtake verstappen last minute").
  * Fuzzy-match drivers by nickname / first name / surname / code.
  * Cover overtakes, "what happened to X", pit, pace, tyres, strategy, weather,
    race control, and practice-specific questions.
  * NEVER dead-end. If no specific intent matches, give a best-effort answer from
    whatever entities and data are available, with an honest confidence level.
  * Optional "simple" mode rewrites the answer in beginner-friendly language.
  * Optional LLM layer only ever polishes wording — never invents facts.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..config import get_settings
from ..models import DriverPaceSummary, QuestionAnswer, RaceSession, StrategySummary
from .events import infer_overtakes, overtakes_between

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
    "Racing Bulls": ["racing bulls", "vcarb", "visa", "rb"],
}

# common first names / nicknames -> TLA (only accepted if that code is in the session)
NICKNAMES = {
    "george": "RUS", "russell": "RUS", "max": "VER", "verstappen": "VER", "mad max": "VER",
    "checo": "PER", "perez": "PER", "sergio": "PER", "charles": "LEC", "leclerc": "LEC",
    "lando": "NOR", "norris": "NOR", "oscar": "PIA", "piastri": "PIA", "lewis": "HAM",
    "hamilton": "HAM", "fernando": "ALO", "alonso": "ALO", "nando": "ALO", "carlos": "SAI",
    "sainz": "SAI", "kimi": "ANT", "antonelli": "ANT", "pierre": "GAS", "gasly": "GAS",
    "esteban": "OCO", "ocon": "OCO", "nico": "HUL", "hulkenberg": "HUL", "hulk": "HUL",
    "alex": "ALB", "albon": "ALB", "lance": "STR", "stroll": "STR", "liam": "LAW",
    "lawson": "LAW", "isack": "HAD", "hadjar": "HAD", "yuki": "TSU", "tsunoda": "TSU",
    "valtteri": "BOT", "bottas": "BOT", "franco": "COL", "colapinto": "COL",
}


@dataclass
class QAContext:
    session: RaceSession
    strategy: StrategySummary
    pace: list[DriverPaceSummary]
    _practice: object = field(default=None, repr=False)

    @property
    def pace_by_driver(self):
        return {p.driver: p for p in self.pace}

    @property
    def class_by_driver(self):
        return {c.driver: c for c in self.session.classification}

    @property
    def is_practice(self) -> bool:
        return self.session.category == "practice"

    @property
    def practice(self):
        if self._practice is None and self.is_practice:
            from .practice import compute_practice
            self._practice = compute_practice(self.session)
        return self._practice


# --------------------------------------------------------------------------- #
# entity extraction
# --------------------------------------------------------------------------- #
def _resolve_drivers(q: str, session: RaceSession) -> list[str]:
    ql = f" {q.lower()} "
    codes = {d.code for d in session.drivers}
    found: list[str] = []

    def add(code):
        if code in codes and code not in found:
            found.append(code)

    # exact TLA and surnames/first names from the actual entry list (order by appearance)
    hits: list[tuple[int, str]] = []
    for d in session.drivers:
        parts = d.name.lower().split()
        surname = parts[-1] if parts else ""
        first = parts[0] if parts else ""
        for token in filter(None, [d.code.lower(), surname, (first if len(first) > 3 else "")]):
            m = re.search(rf"\b{re.escape(token)}\b", ql)
            if m:
                hits.append((m.start(), d.code))
                break
    # nicknames / first names mapping
    for nick, code in NICKNAMES.items():
        if code in codes:
            m = re.search(rf"\b{re.escape(nick)}\b", ql)
            if m:
                hits.append((m.start(), code))
    for _, code in sorted(hits):
        add(code)
    return found


def _resolve_teams(q: str, session: RaceSession) -> list[str]:
    ql = q.lower()
    present = {c.team for c in session.classification}
    teams = []
    for team, aliases in TEAM_ALIASES.items():
        if any(re.search(rf"\b{re.escape(a)}\b", ql) for a in aliases) and (team in present or not present):
            teams.append(team)
    return teams


def _lap_hints(q: str, total: int) -> dict:
    ql = q.lower()
    late = bool(re.search(r"\b(last|final|end|closing|late|last minute|last lap|dying)\b", ql))
    early = bool(re.search(r"\b(start|first lap|opening|beginning|early|lights out|turn 1)\b", ql))
    m = re.search(r"lap\s*(\d+)", ql)
    return {"late": late, "early": early, "lap": int(m.group(1)) if m else None}


def _extract(q: str, ctx: QAContext) -> dict:
    return {
        "drivers": _resolve_drivers(q, ctx.session),
        "teams": _resolve_teams(q, ctx.session),
        "laps": _lap_hints(q, ctx.session.total_laps),
        "compound": next((c for c in ("soft", "medium", "hard", "intermediate", "wet")
                          if re.search(rf"\b{c}s?\b", q.lower())), None),
    }


def _fmt_time(sec):
    if sec is None:
        return "n/a"
    m, s = divmod(sec, 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}s"


def _reference_stops(session: RaceSession, exclude=None) -> int:
    from collections import Counter
    counts = Counter(c.pit_stops for c in session.classification
                     if c.position and c.position <= 8 and not c.retired and c.driver != exclude)
    return counts.most_common(1)[0][0] if counts else 2


# --------------------------------------------------------------------------- #
# intent handlers (each returns QuestionAnswer | None)
# --------------------------------------------------------------------------- #
def _h_overtake(q, ctx, ents):
    if ctx.is_practice:
        return None
    # NB: no trailing \b — we want "overtake"/"overtaking"/"passed" etc. to match.
    if not re.search(r"\b(overtak\w*|overtook|pass\w*|got\s+(past|ahead)|move[d]?\s+ahead|"
                     r"\bbeat\b|jump\w*|how did .*(get|end up).*(past|ahead)|"
                     r"took\s+\w+\s+(place|position))", q, re.I):
        return None
    drivers = ents["drivers"]
    if len(drivers) >= 2:
        return _overtake_between(q, ctx, drivers[0], drivers[1], ents)
    if len(drivers) == 1:
        return _overtake_single(q, ctx, drivers[0], ents)
    # generic "who made the best overtake / most overtakes"
    ots = ctx.session.overtakes or infer_overtakes(ctx.session)
    if not ots:
        return _missing(q, ["overtake / position-change data"], ctx)
    from collections import Counter
    counts = Counter(o.overtaker for o in ots if o.kind == "on_track")
    if not counts:
        counts = Counter(o.overtaker for o in ots)
    top = counts.most_common(3)
    ans = ("Most on-track passes: " + ", ".join(f"{d} ({n})" for d, n in top) + ".") if top else \
        "No clear on-track overtakes were detected."
    return _qa(q, ans, "overtake", "medium", ctx, drivers,
               follow_ups=["Compare their tyres", "Show the position chart"])


def _overtake_between(q, ctx, a, b, ents):
    ots = overtakes_between(ctx.session, a, b)
    late = ents["laps"]["late"]
    pos = {(p.driver, p.lap): p.position for p in ctx.session.positions}
    ca, cb = ctx.class_by_driver.get(a), ctx.class_by_driver.get(b)
    fups = ["Compare their tyres", "Show the lap where it happened", "Was it pit strategy or on-track?"]

    if ots:
        ev = sorted(ots, key=lambda o: o.lap)[-1 if late else -1]  # latest by default
        # who ended up ahead
        direction = f"{ev.overtaker} got ahead of {ev.overtaken}"
        kind_txt = {"on_track": "an on-track pass", "pit_cycle": "through the pit cycle",
                    "penalty": "via a penalty", "start": "at the start"}.get(ev.kind, "a position swap")
        # supporting evidence: tyre age + gap at that lap
        la = next((l for l in ctx.session.laps if l.driver == ev.overtaker and l.lap == ev.lap), None)
        lb = next((l for l in ctx.session.laps if l.driver == ev.overtaken and l.lap == ev.lap), None)
        ev_bits = []
        if la and lb and la.compound and lb.compound:
            ev_bits.append(f"{ev.overtaker} was on {la.compound.value.lower()}s (age {la.tyre_age}), "
                           f"{ev.overtaken} on {lb.compound.value.lower()}s (age {lb.tyre_age})")
        ans = (f"On lap {ev.lap}, {direction} — {kind_txt}. "
               f"{ev.overtaken} went from P{ev.position_after+1 if ev.position_after else '?'} to behind, "
               f"{ev.overtaker} up to P{ev.position_after}. "
               + ("; ".join(ev_bits) + "." if ev_bits else ""))
        conf = "high" if ev.source == "openf1" else "medium"
        return _qa(q, ans, "overtake", conf, ctx, [a, b], follow_ups=fups,
                   supporting={"lap": ev.lap, "kind": ev.kind, "source": ev.source})

    # No detected swap — reason from the finishing order + trace
    if ca and cb and ca.position and cb.position:
        ahead, behind = (a, b) if ca.position < cb.position else (b, a)
        # did they ever swap in the trace?
        swaps = [l for l in range(2, ctx.session.total_laps + 1)
                 if pos.get((ahead, l)) and pos.get((behind, l))
                 and pos.get((ahead, l - 1), 99) > pos.get((behind, l - 1), 99)
                 and pos.get((ahead, l), 99) < pos.get((behind, l), 99)]
        if swaps:
            lp = swaps[-1]
            ans = (f"I don't have a logged overtake event, but the position trace shows {ahead} moved "
                   f"ahead of {behind} around lap {lp}. Given the pit timing, it looks like "
                   + ("a pit-stop swap" if _near_pit(ctx.session, ahead, lp) or _near_pit(ctx.session, behind, lp)
                      else "an on-track move") + f". {ahead} finished P{ctx.class_by_driver[ahead].position}.")
            return _qa(q, ans, "overtake", "medium", ctx, [a, b], follow_ups=fups)
        ans = (f"{ahead} finished ahead of {behind} (P{ctx.class_by_driver[ahead].position} vs "
               f"P{ctx.class_by_driver[behind].position}), but I couldn't find a direct on-track pass "
               f"between them in the data — the gap was most likely built through pit strategy or "
               f"an early-lap exchange rather than a wheel-to-wheel move.")
        return _qa(q, ans, "overtake", "low", ctx, [a, b], follow_ups=fups)
    return _missing(q, [f"race data for {a} and/or {b}"], ctx)


def _overtake_single(q, ctx, code, ents):
    ots = [o for o in (ctx.session.overtakes or infer_overtakes(ctx.session))
           if o.overtaker == code or o.overtaken == code]
    if not ots:
        return _qa(q, f"I couldn't find clear overtakes involving {code}. "
                   f"They finished P{(ctx.class_by_driver.get(code) or _blank()).position}.",
                   "overtake", "low", ctx, [code])
    made = [o for o in ots if o.overtaker == code]
    lost = [o for o in ots if o.overtaken == code]
    ans = (f"{code} made {len(made)} pass(es) and was passed {len(lost)} time(s). "
           + (f"Latest: overtook {made[-1].overtaken} on lap {made[-1].lap}. " if made else "")
           + (f"Lost a place to {lost[-1].overtaker} on lap {lost[-1].lap}." if lost else ""))
    return _qa(q, ans, "overtake", "medium", ctx, [code],
               follow_ups=["Show the position chart", "What happened to " + code + "?"])


def _h_what_happened(q, ctx, ents):
    if not re.search(r"\bwhat happened|how did .*(race|day|go|do)|tell me about|summar(y|ise|ize)\b", q, re.I):
        return None
    drivers = ents["drivers"]
    if not drivers:
        return None
    code = drivers[0]
    c = ctx.class_by_driver.get(code)
    p = ctx.pace_by_driver.get(code)
    if not c:
        return _missing(q, [f"data for {code}"], ctx)
    bits = []
    if ctx.is_practice and ctx.practice:
        row = next((r for r in ctx.practice.rows if r.driver == code), None)
        if row:
            return _qa(q, f"In {ctx.session.session_type}, {code} was P{row.best_lap_rank} on the timesheets "
                       f"({_fmt_time(row.best_lap)}), completing {row.laps_completed} laps"
                       + (f" with a {_fmt_time(row.long_run_pace)} long-run pace" if row.long_run_pace else "")
                       + ".", "what_happened", "high", ctx, [code],
                       follow_ups=["Who had the best long run?", "Compare " + code + " and a rival"])
    if c.retired:
        bits.append(f"retired ({c.status})")
    else:
        if c.grid and c.position:
            delta = c.grid - c.position
            move = f"gained {delta}" if delta > 0 else f"lost {abs(delta)}" if delta < 0 else "held station"
            bits.append(f"started P{c.grid}, finished P{c.position} ({move} place{'s' if abs(delta)!=1 else ''})")
    if p and p.pace_rank:
        bits.append(f"had the P{p.pace_rank} clean-air pace")
    stops = [ps for ps in ctx.session.pit_stops if ps.driver == code]
    if stops:
        bits.append(f"pitted {len(stops)}× (laps {', '.join(str(s.lap) for s in stops)})")
    rc = [m for m in ctx.session.race_control if code in (m.message or "")]
    if rc:
        bits.append(f"noted by race control ({rc[0].message[:60]})")
    ans = f"{c.name}: " + "; ".join(bits) + "."
    return _qa(q, ans, "what_happened", "high", ctx, [code],
               follow_ups=[f"Why did {code} " + ("lose places?" if (c.grid or 0) < (c.position or 0) else "do well?"),
                           "Compare with a rival", "Explain simply"])


def _h_explain_race(q, ctx, ents):
    """Whole-session summary: 'explain the race', 'what happened', 'summarise'."""
    if ents["drivers"] or ents["teams"]:
        return None  # a driver/team-specific question -> let other handlers take it
    if not re.search(r"\b(explain|summar(y|ise|ize)|walk me|what happened|overview|recap|"
                     r"tell me about|break ?down|story|eli5|new to f1)\b", q, re.I):
        return None
    if ctx.is_practice and ctx.practice and ctx.practice.story:
        ans = " ".join(ctx.practice.story)
        return _qa(q, ans, "explain", "high", ctx, [],
                   follow_ups=["Who was fastest?", "Best long run?", "Explain simply"])
    story = ctx.strategy.story
    if story:
        return _qa(q, " ".join(story), "explain", "high", ctx,
                   [d for d in [ctx.strategy.winner, ctx.strategy.hidden_pace_driver] if d],
                   follow_ups=["Who had the best race pace?", "Who benefited from the VSC?", "Explain simply"])
    return None


# ---- practice-specific ---- #
def _h_practice_fastest(q, ctx, ents):
    if not ctx.is_practice:
        return None
    if re.search(r"\b(long run|race sim|race pace|high fuel|race trim)\b", q, re.I):
        return None  # let the long-run handler take it
    if not re.search(r"\b(fastest|quick\w*|best|top|pace|p1|leading|competitive|strong|good)\b", q, re.I):
        return None
    pr = ctx.practice
    if not pr or not pr.rows:
        return _missing(q, ["lap-time data"], ctx)
    if ents["teams"]:
        return _practice_team(q, ctx, ents["teams"][0])
    top = pr.rows[0]
    others = ", ".join(f"{r.driver} (+{r.gap_to_fastest:.3f})" for r in pr.rows[1:4] if r.gap_to_fastest)
    ans = (f"{top.driver} was fastest in {ctx.session.session_type} with a {_fmt_time(top.best_lap)}"
           + (f", ahead of {others}" if others else "") + ". "
           + ("The track was still improving, so later laps flattered runners who went out late."
              if pr.track_evolving else ""))
    return _qa(q, ans, "practice_fastest", "high", ctx, [top.driver],
               follow_ups=["Who had the best long run?", "Who did the most laps?", "Explain simply"])


def _h_practice_longrun(q, ctx, ents):
    if not ctx.is_practice:
        return None
    if not re.search(r"\b(long run|race sim|race pace|high fuel|race trim|stint)\b", q, re.I):
        return None
    pr = ctx.practice
    best = next((r for r in pr.rows if r.driver == pr.best_long_run_driver), None) if pr else None
    if not best or not best.long_run_pace:
        return _qa(q, "No driver did a long enough run to read race pace reliably in this session.",
                   "practice_longrun", "low", ctx, [])
    ans = (f"{best.driver} had the strongest long-run pace — a {_fmt_time(best.long_run_pace)} median over "
           f"{best.long_run_laps} laps. That's the best read on race pace from this session, though fuel "
           f"loads and engine modes are unknown.")
    return _qa(q, ans, "practice_longrun", "medium", ctx, [best.driver],
               follow_ups=["Who was fastest overall?", "Compare two teams", "Explain simply"])


def _h_practice_laps(q, ctx, ents):
    if not ctx.is_practice or not re.search(r"\b(most laps|how many laps|mileage|laps did)\b", q, re.I):
        return None
    pr = ctx.practice
    row = next((r for r in pr.rows if r.driver == pr.most_laps_driver), None) if pr else None
    if not row:
        return _missing(q, ["lap counts"], ctx)
    return _qa(q, f"{row.driver} did the most running with {row.laps_completed} laps in "
               f"{ctx.session.session_type}.", "practice_laps", "high", ctx, [row.driver],
               follow_ups=["Who was fastest?", "Who had the best long run?"])


def _practice_team(q, ctx, team):
    pr = ctx.practice
    rows = [r for r in pr.rows if r.team == team]
    if not rows:
        return _missing(q, [f"cars for {team}"], ctx)
    tr = next((t for t in pr.team_ranking if t["team"] == team), None)
    best = min(rows, key=lambda r: r.best_lap or 9e9)
    rank = [t["team"] for t in pr.team_ranking].index(team) + 1 if tr else None
    ans = (f"{team} in {ctx.session.session_type}: best lap {_fmt_time(best.best_lap)} ({best.driver})"
           + (f", ranking P{rank} of {len(pr.team_ranking)} on one-lap pace" if rank else "")
           + (f", {tr['gap']:.3f}s off the quickest team" if tr and tr['gap'] else "") + ".")
    return _qa(q, ans, "practice_team", "high", ctx, [best.driver],
               follow_ups=["Who was fastest overall?", "Best long run?"])


# ---- race handlers (kept + upgraded) ---- #
def _h_why_lost(q, ctx, ents):
    if ctx.is_practice or not re.search(r"\b(lose|lost|drop|dropped|fall|fell|slip|struggl)\b", q, re.I):
        return None
    drivers = ents["drivers"]
    if not drivers:
        return None
    code = drivers[0]
    p, c = ctx.pace_by_driver.get(code), ctx.class_by_driver.get(code)
    if not c:
        return _missing(q, [f"race data for {code}"], ctx)
    reasons = []
    if c.retired:
        reasons.append(f"retired from the race ({c.status})")
    if c.grid and c.position and c.position > c.grid:
        reasons.append(f"dropped from P{c.grid} to P{c.position}")
    if p and p.pace_rank and c.position and c.position > p.pace_rank:
        reasons.append(f"finished {c.position - p.pace_rank} place(s) below their P{p.pace_rank} pace")
    ref = _reference_stops(ctx.session, code)
    if c.pit_stops > ref:
        reasons.append(f"ran {c.pit_stops} stops vs the {ref} most used (~{20.5*(c.pit_stops-ref):.0f}s extra pit loss)")
    victims = [u for u in ctx.strategy.undercuts if u.victim == code]
    if victims:
        reasons.append(f"was undercut by {victims[0].attacker} around lap {victims[0].pit_lap}")
    if p and p.traffic_laps >= 8:
        reasons.append(f"spent {p.traffic_laps} laps in traffic")
    if not reasons:
        return _qa(q, f"{code} finished P{c.position} from P{c.grid} — no single big loss stands out; a steady race.",
                   "why_lost", "medium", ctx, [code])
    return _qa(q, f"{code} lost ground mainly because they " + "; ".join(reasons) + ".",
               "why_lost", "high", ctx, [code], follow_ups=["Show the position chart", "Explain simply"])


def _h_best_pace(q, ctx, ents):
    if ctx.is_practice:
        return None
    if not re.search(r"\b(best|strongest|fastest|quickest)\b.*\b(pace|race pace|car|speed)\b", q, re.I) \
       and not re.search(r"\bwho.*(fastest|quickest)\b", q, re.I):
        return None
    ranked = sorted([p for p in ctx.pace if p.pace_rank], key=lambda p: p.pace_rank)[:3]
    if not ranked:
        return _missing(q, ["lap-time data"], ctx)
    top = ranked[0]
    extra = ", then " + ", ".join(f"{p.driver}" for p in ranked[1:]) if len(ranked) > 1 else ""
    note = (f" Despite that they only finished P{top.finish}." if top.finish and top.finish > top.pace_rank else "")
    return _qa(q, f"{top.driver} had the best fuel/tyre-corrected clean-air pace{extra}.{note}",
               "best_pace", "high", ctx, [top.driver], follow_ups=["Why didn't they win?", "Explain simply"])


def _h_pit_loss(q, ctx, ents):
    if not re.search(r"\bpit", q, re.I) or not re.search(r"\b(lose|lost|time|slow|most|longest|duration|stop)\b", q, re.I):
        return None
    losses = []
    for c in ctx.session.classification:
        stops = [ps for ps in ctx.session.pit_stops if ps.driver == c.driver]
        total = sum((ps.pit_lane_time or ps.stop_duration or 0) for ps in stops) or len(stops) * 20.5
        losses.append((c.driver, len(stops), round(total, 1)))
    losses = [x for x in losses if x[1] > 0]
    if not losses:
        return _missing(q, ["pit-stop data (no stops recorded)"], ctx)
    losses.sort(key=lambda x: -x[2])
    worst = losses[0]
    return _qa(q, f"{worst[0]} spent the most time in the pits: {worst[1]} stops, ~{worst[2]:.0f}s total. "
               + "Next: " + ", ".join(f"{d} (~{t:.0f}s)" for d, n, t in losses[1:4]) + ".",
               "pit_loss", "high", ctx, [worst[0]])


def _h_vsc(q, ctx, ents):
    if not re.search(r"\b(vsc|virtual safety car|safety car|benefit|cheap stop)\b", q, re.I):
        return None
    bpt = ctx.strategy.best_pit_timing
    if bpt and "stop" in bpt.get("kind", ""):
        cheap = sorted({ps.driver for ps in ctx.session.pit_stops if ps.under_vsc or ps.under_safety_car})
        ans = bpt["detail"] + (f" Cars that converted it: {', '.join(cheap)}." if cheap else "")
        return _qa(q, ans, "vsc", "high", ctx, [bpt.get("driver")])
    if not ctx.session.track_status_windows:
        return _qa(q, "There were no safety-car or VSC periods in this race, so nobody gained a cheap stop.",
                   "vsc", "high", ctx, [])
    return _qa(q, "There were neutralizations but no driver clearly converted a cheap stop from them.",
               "vsc", "medium", ctx, [])


def _h_compare(q, ctx, ents):
    if not re.search(r"\b(compare|vs\.?|versus|against|difference|better)\b", q, re.I):
        return None
    if len(ents["teams"]) >= 2:
        return _compare_teams(q, ctx, ents["teams"][0], ents["teams"][1])
    if len(ents["drivers"]) >= 2:
        return _compare_drivers(q, ctx, ents["drivers"][0], ents["drivers"][1])
    return None


def _compare_teams(q, ctx, t1, t2):
    if ctx.is_practice and ctx.practice:
        r1 = min((r for r in ctx.practice.rows if r.team == t1), key=lambda r: r.best_lap or 9e9, default=None)
        r2 = min((r for r in ctx.practice.rows if r.team == t2), key=lambda r: r.best_lap or 9e9, default=None)
        if not r1 or not r2:
            return _missing(q, ["cars for one of those teams"], ctx)
        faster = t1 if (r1.best_lap or 9e9) < (r2.best_lap or 9e9) else t2
        return _qa(q, f"In {ctx.session.session_type}, {t1} best {_fmt_time(r1.best_lap)} ({r1.driver}) vs "
                   f"{t2} {_fmt_time(r2.best_lap)} ({r2.driver}). {faster} looked quicker on one lap.",
                   "compare_teams", "high", ctx, [r1.driver, r2.driver])

    def summ(team):
        rows = [c for c in ctx.session.classification if c.team == team]
        return rows
    d1, d2 = summ(t1), summ(t2)
    if not d1 or not d2:
        return _missing(q, ["cars for one of those teams"], ctx)
    def line(team, rows):
        return f"{team}: " + "; ".join(
            f"{r.driver} P{r.position or 'DNF'} ({r.pit_stops} stops)" for r in rows)
    best1 = min((r.position for r in d1 if r.position), default=99)
    best2 = min((r.position for r in d2 if r.position), default=99)
    verdict = f"{t1 if best1 < best2 else t2} came out ahead."
    return _qa(q, f"{line(t1, d1)}. {line(t2, d2)}. {verdict}", "compare_teams", "high", ctx,
               [r.driver for r in d1 + d2])


def _compare_drivers(q, ctx, a, b):
    from .engine import compare_drivers
    cmp = compare_drivers(ctx.session, a, b)
    if "error" in cmp:
        return _missing(q, [cmp["error"]], ctx)
    return _qa(q, cmp["verdict"], "compare_drivers", "high", ctx, [a, b],
               follow_ups=["Compare their tyres", "Show the position chart", "Explain simply"],
               supporting={"compound_sequence": cmp["compound_sequence"], "pit_loss": cmp["pit_loss"]})


def _h_alt_strategy(q, ctx, ents):
    if ctx.is_practice or not re.search(r"\b(alternative|alternate|better strateg|should have|extra stop|make sense|worth it)\b", q, re.I):
        return None
    ws = ctx.strategy.worst_strategy
    if not ws:
        return _qa(q, "No obvious strategic blunder stands out — the front-runners were closely matched on stops.",
                   "alt_strategy", "low", ctx, [])
    code = ws["driver"]
    ref = _reference_stops(ctx.session, code)
    return _qa(q, f"{ws['detail']} A cleaner call was probably to match the {ref}-stop cars: track position "
               f"was worth more than the fresher-tyre pace {code} chased. Saving one stop ≈ 20s of pit loss, "
               f"with higher end-stint wear.", "alt_strategy", "medium", ctx, [code])


def _h_worst_team(q, ctx, ents):
    if ctx.is_practice or not re.search(r"\bworst.*(strateg|call|team)\b", q, re.I):
        return None
    by_team = {}
    for p in ctx.pace:
        c = ctx.class_by_driver.get(p.driver)
        if c and c.position and p.pace_rank and not c.retired:
            by_team.setdefault(p.team, []).append(c.position - p.pace_rank)
    if not by_team:
        return _missing(q, ["pace vs result data"], ctx)
    team, deltas = max(by_team.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))
    avg = sum(deltas) / len(deltas)
    if avg <= 0.3:
        return _qa(q, "No team clearly threw away positions relative to pace — the calls were broadly sound.",
                   "worst_team", "low", ctx, [])
    return _qa(q, f"{team} lost the most relative to pace — on average {avg:.1f} positions worse than their "
               f"speed suggested.", "worst_team", "medium", ctx, [])


def _h_undercut(q, ctx, ents):
    if ctx.is_practice or not re.search(r"\bundercut|overcut\b", q, re.I):
        return None
    if not ctx.strategy.undercuts:
        return _qa(q, "No clear undercut/overcut swings were detected — the pit cycles mostly held station.",
                   "undercut", "medium", ctx, [])
    u = ctx.strategy.undercuts[0]
    return _qa(q, f"Yes — the clearest was {u.attacker} {u.kind}ing {u.victim} by stopping on lap {u.pit_lap} "
               f"and emerging ahead ({u.positions_gained} place gained).", "undercut", "high", ctx,
               [u.attacker, u.victim])


def _h_winner(q, ctx, ents):
    if not re.search(r"\bwho won|winner|win the race|fastest overall|p1\b", q, re.I):
        return None
    if ctx.is_practice and ctx.practice:
        top = ctx.practice.rows[0] if ctx.practice.rows else None
        if top:
            return _qa(q, f"{top.name} topped {ctx.session.session_type} with a {_fmt_time(top.best_lap)}.",
                       "fastest", "high", ctx, [top.driver])
    w = ctx.strategy.winner
    c = ctx.class_by_driver.get(w) if w else None
    if not c:
        return _missing(q, ["classification"], ctx)
    return _qa(q, f"{c.name} ({c.team}) won the {ctx.session.grand_prix} from P{c.grid}, running {c.pit_stops} stops.",
               "winner", "high", ctx, [w])


def _h_tyre(q, ctx, ents):
    if not re.search(r"\b(tyre|tire|compound|stint|strateg|mediums?|softs?|hards?)\b", q, re.I):
        return None
    drivers = ents["drivers"]
    if not drivers:
        return None
    code = drivers[0]
    sts = sorted([s for s in ctx.session.stints if s.driver == code], key=lambda s: s.stint)
    if not sts:
        return _missing(q, [f"tyre stint data for {code}"], ctx)
    seq = " → ".join(f"{s.compound.value.title()} ({s.laps} laps)" for s in sts)
    tail = f" A {len(sts)-1}-stop race." if not ctx.is_practice else f" {len(sts)} runs."
    return _qa(q, f"{code}'s tyres: {seq}.{tail}", "tyre_strategy", "high", ctx, [code])


def _h_weather(q, ctx, ents):
    if not re.search(r"\b(weather|rain|temperature|hot|cold|wet|dry|track temp)\b", q, re.I):
        return None
    if ctx.strategy.weather_summary:
        return _qa(q, f"Conditions: {ctx.strategy.weather_summary}.", "weather", "high", ctx, [])
    if ctx.session.weather:
        w = ctx.session.weather[-1]
        return _qa(q, f"Latest: air {w.air_temp}°C, track {w.track_temp}°C, "
                   + ("wet" if w.rainfall else "dry") + ".", "weather", "high", ctx, [])
    return _missing(q, ["weather data"], ctx)


def _h_gainer_loser(q, ctx, ents):
    if ctx.is_practice or not re.search(r"\b(gain|gained|climb|most places|biggest mover|loser|biggest los)\b", q, re.I):
        return None
    if re.search(r"\blos", q, re.I) and ctx.strategy.biggest_losers:
        g = ctx.strategy.biggest_losers[0]
        return _qa(q, f"{g['driver']} lost the most: P{g['grid']}→P{g['finish']} ({g['net']} places).",
                   "loser", "high", ctx, [g["driver"]])
    if ctx.strategy.biggest_gainers:
        g = ctx.strategy.biggest_gainers[0]
        return _qa(q, f"{g['driver']} gained the most: P{g['grid']}→P{g['finish']} (+{g['net']} places).",
                   "gainer", "high", ctx, [g["driver"]])
    return None


HANDLERS = [
    _h_overtake, _h_what_happened, _h_explain_race,
    _h_practice_longrun, _h_practice_laps, _h_practice_fastest,
    _h_why_lost, _h_undercut, _h_vsc, _h_pit_loss, _h_compare, _h_alt_strategy, _h_worst_team,
    _h_best_pace, _h_winner, _h_tyre, _h_weather, _h_gainer_loser,
]


# --------------------------------------------------------------------------- #
# best-effort fallback (never dead-ends)
# --------------------------------------------------------------------------- #
def _best_effort(q, ctx, ents) -> QuestionAnswer:
    drivers = ents["drivers"]
    teams = ents["teams"]
    if len(drivers) >= 2:
        return _compare_drivers(q, ctx, drivers[0], drivers[1]) or _generic(q, ctx, ents)
    if len(drivers) == 1:
        # summarize that driver's session
        res = _h_what_happened(f"what happened to {drivers[0]}", ctx, ents)
        if res:
            res.question = q
            res.confidence = "low"
            res.answer = "I'm not certain what you're asking, but here's what the data shows: " + res.answer
            return res
    if teams:
        c = _compare_teams(q, ctx, teams[0], teams[1]) if len(teams) >= 2 else None
        if c:
            return c
    return _generic(q, ctx, ents)


def _generic(q, ctx, ents) -> QuestionAnswer:
    if ctx.is_practice and ctx.practice and ctx.practice.story:
        ans = " ".join(ctx.practice.story[:2])
    elif ctx.strategy.story:
        ans = " ".join(ctx.strategy.story[:3])
    else:
        w = ctx.strategy.winner
        ans = f"{w} led the way." if w else "Here is what the loaded session shows."
    ans = ("I couldn't pin down the exact question, so here's the headline from the loaded "
           f"{ctx.session.session_type}: " + ans)
    return _qa(q, ans, "overview", "low", ctx, [],
               follow_ups=["Who was fastest?" if ctx.is_practice else "Who had the best race pace?",
                           "What happened to a specific driver?", "Explain simply"],
               missing=["a more specific question"])


# --------------------------------------------------------------------------- #
# public
# --------------------------------------------------------------------------- #
def answer_question(question: str, ctx: QAContext, simple: bool = False) -> QuestionAnswer:
    q = (question or "").strip()
    if not q:
        return QuestionAnswer(question=q, answer="Ask me anything about the loaded session.",
                              kind="empty", confidence="low")
    simple = simple or bool(re.search(r"\b(explain|eli5|simpl(e|y|ify)|beginner|new to f1|like i'?m new)\b", q, re.I))
    ents = _extract(q, ctx)
    result = None
    for handler in HANDLERS:
        try:
            result = handler(q, ctx, ents)
        except Exception:  # noqa: BLE001 — one broken handler must not kill the endpoint
            result = None
        if result is not None:
            break
    if result is None:
        result = _best_effort(q, ctx, ents)

    result.entities = {"drivers": ents["drivers"], "teams": ents["teams"]}
    if simple:
        result = _make_simple(result)
    return _maybe_polish(result, ctx)


def _qa(q, answer, kind, confidence, ctx, drivers, follow_ups=None, supporting=None, missing=None):
    fu = follow_ups or []
    if "Explain simply" not in fu and kind not in ("overview",):
        fu = fu + ["Explain simply"]
    return QuestionAnswer(question=q, answer=answer, kind=kind, confidence=confidence,
                          supporting=supporting or {}, missing_data=missing or [],
                          follow_ups=fu[:4], entities={"drivers": drivers})


def _missing(q, what, ctx) -> QuestionAnswer:
    return QuestionAnswer(question=q, kind="missing", confidence="low", missing_data=what,
                          answer=f"I can't fully answer that from the loaded data — missing: {', '.join(what)}. "
                                 f"This session is {ctx.session.session_type} ({ctx.session.category}).",
                          follow_ups=["Who was fastest?" if ctx.is_practice else "Who won?"])


# ---- simple mode ---- #
_JARGON = [
    (r"\bclean-air pace\b", "true one-lap speed"),
    (r"\bclean air\b", "clear track"),
    (r"\bundercut(ting|s)?\b", "pitting earlier to jump a rival"),
    (r"\bovercut(ting|s)?\b", "staying out longer to jump a rival"),
    (r"\bdegradation\b", "tyre wear"),
    (r"\bdelta\b", "time difference"),
    (r"\bpit loss\b", "time lost in the pit lane"),
    (r"\bstint\b", "run on one set of tyres"),
    (r"\bout-?lap\b", "first lap on new tyres"),
    (r"\bin-?lap\b", "lap into the pits"),
    (r"\bVSC\b", "virtual safety car (everyone slows)"),
    (r"\binterval\b", "gap to the car ahead"),
    (r"\btyre age\b", "how many laps the tyres had done"),
    (r"\bgrid\b", "starting position"),
]


def _make_simple(qa: QuestionAnswer) -> QuestionAnswer:
    text = qa.answer
    for pat, repl in _JARGON:
        text = re.sub(pat, repl, text, flags=re.I)
    qa.answer = "In simple terms: " + text
    qa.simple = True
    return qa


def _maybe_polish(qa: QuestionAnswer, ctx: QAContext) -> QuestionAnswer:
    settings = get_settings()
    if not settings.llm_available or qa.kind in ("missing", "empty"):
        return qa
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.llm_api_key)
        style = "for someone brand new to F1, avoiding jargon" if qa.simple else "concisely for a fan"
        msg = client.messages.create(
            model=settings.llm_model, max_tokens=300,
            messages=[{"role": "user", "content":
                       f"Rephrase this F1 answer {style}. Do NOT add facts; keep all numbers.\n\n"
                       f"Q: {qa.question}\nA: {qa.answer}\nFacts: {qa.supporting}"}])
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        if text:
            qa.answer, qa.used_llm = text, True
    except Exception:  # noqa: BLE001
        pass
    return qa


# small helpers used above
def _near_pit(session, code, lap):
    return any(abs(ps.lap - lap) <= 2 for ps in session.pit_stops if ps.driver == code)


def _blank():
    from ..models import ClassificationRow
    return ClassificationRow(driver="?", name="?", team="?")
