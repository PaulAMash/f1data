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
# Driver codes that are also everyday English words ("who HAD the biggest
# loss", "0.2s PER lap", "neither…NOR…"). These only count as a driver when
# typed in UPPERCASE — surnames and nicknames still match them normally.
_AMBIGUOUS_CODES = {"HAD", "PER", "LAW", "GAS", "NOR", "COL", "BOT", "ANT"}


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
        code_token = d.code.lower()
        if d.code in _AMBIGUOUS_CODES and not re.search(rf"\b{d.code}\b", q):
            code_token = ""          # lowercase "had"/"per"/… is English, not a TLA
        for token in filter(None, [code_token, surname, (first if len(first) > 3 else "")]):
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


_ORDINAL_WORDS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
                  "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10}
_COUNT_WORDS = {"three": 3, "four": 4, "five": 5, "six": 6, "eight": 8, "ten": 10}


def _row_line(ctx, c, with_gap: bool = True) -> str:
    gap = f" ({c.gap})" if with_gap and c.gap else ""
    return f"P{c.position} {c.name} ({c.team}){gap}"


def _h_results(q, ctx, ents):
    """Basic questions everyone asks: 'who was on the podium', 'top 5',
    'finishing order', 'who came 4th' — answered directly, high confidence."""
    ql = q.lower()

    if ctx.is_practice:
        pr = ctx.practice
        if not pr or not pr.rows:
            return None
        m = re.search(r"\btop\s*(\d+)\b", ql)
        n = int(m.group(1)) if m else next(
            (v for w, v in _COUNT_WORDS.items() if re.search(rf"\btop\s+{w}\b", ql)), None)
        if n is None and re.search(r"\b(timesheet|classification|order|results?)\b", ql):
            n = 5
        if n is None:
            return None
        rows = pr.rows[:min(n, len(pr.rows))]
        lines = [f"P{i + 1} {r.name} ({_fmt_time(r.best_lap)})" for i, r in enumerate(rows)]
        return _qa(q, f"Top {len(rows)} in {ctx.session.session_type}: " + "; ".join(lines) + ".",
                   "results", "high", ctx, [r.driver for r in rows],
                   follow_ups=["Who had the best long run?", "Compare two drivers"])

    rows = sorted((c for c in ctx.session.classification if c.position),
                  key=lambda c: c.position)
    if not rows:
        return None

    # "who came 4th / finished second / was P3"
    m_pos = re.search(r"\bwho\s+(?:was|came|finished|ended\s+up|got|placed)\s*(?:in\s*)?"
                      r"(?:p\s*(\d+)|(\d+)\s*(?:st|nd|rd|th)|"
                      r"(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth))\b", ql)
    if m_pos:
        n = int(m_pos.group(1) or m_pos.group(2) or _ORDINAL_WORDS[m_pos.group(3)])
        c = next((r for r in rows if r.position == n), None)
        if not c:
            return _qa(q, f"Nobody was classified P{n} in this race.", "results", "high", ctx, [])
        extra = (f", from P{c.grid} on the grid" if c.grid else "")
        return _qa(q, f"P{n}: {c.name} ({c.team}){extra}"
                   + (f", {c.gap} behind the winner" if c.gap else "") + ".",
                   "results", "high", ctx, [c.driver],
                   follow_ups=[f"What happened to {c.driver}?", "Show the full top 10"])

    # "podium", "top 5", "finishing order / results"
    n = 3 if re.search(r"\bpodium\b", ql) else None
    if n is None:
        m = re.search(r"\btop\s*(\d+)\b", ql)
        if m:
            n = int(m.group(1))
        else:
            n = next((v for w, v in _COUNT_WORDS.items() if re.search(rf"\btop\s+{w}\b", ql)), None)
    if n is None and (
        re.search(r"\b(finishing\s+order|final\s+(order|result|positions?)|classification|"
                  r"full\s+results?|how did it (end|finish)|who finished where)\b", ql)
        or re.search(r"\bresults?\s*[?!.]*\s*$", ql)
    ):
        n = 10
    if n is None:
        return None
    n = max(1, min(n, len(rows)))
    top = rows[:n]
    label = "Podium" if n == 3 and "podium" in ql else f"Top {n}"
    ans = f"{label}: " + "; ".join(_row_line(ctx, c) for c in top) + "."
    if top and top[0].grid and top[0].grid > 1:
        ans += f" {top[0].name} won it from P{top[0].grid} on the grid."
    return _qa(q, ans, "results", "high", ctx, [c.driver for c in top[:6]],
               follow_ups=["Who had the best race pace?", "What was the turning point?"])


def _h_why_retired(q, ctx, ents):
    """'why did max dnf?' — retirement reason, lap, and what it triggered."""
    if ctx.is_practice:
        return None
    if not re.search(r"\b(dnf\w*|retire\w*|drop(ped)?\s+out|not\s+finish|didn'?t\s+finish|"
                     r"stopp?e?d?\s+(racing|running)|out\s+of\s+the\s+race)\b", q, re.I):
        return None
    drivers = ents["drivers"]
    if not drivers:
        retired = [c for c in ctx.session.classification if c.retired]
        if not retired:
            return _qa(q, "Nobody retired from this race — every car was classified at the flag.",
                       "retirement", "high", ctx, [])
        names = "; ".join(
            f"{c.name} ({(c.retirement_reason or 'reason not given').lower()}"
            + (f", after lap {c.laps_completed}" if c.laps_completed else "") + ")"
            for c in retired[:6])
        return _qa(q, f"{len(retired)} car(s) retired: {names}.", "retirement", "high", ctx,
                   [c.driver for c in retired])
    code = drivers[0]
    c = ctx.class_by_driver.get(code)
    if not c:
        return _missing(q, [f"race data for {code}"], ctx)
    if not c.retired:
        return _qa(q, f"{c.name} didn't retire — they finished P{c.position or '?'}"
                   + (f" from P{c.grid} on the grid" if c.grid else "") + ".",
                   "retirement", "high", ctx, [code])

    reason = (c.retirement_reason or "").strip()
    if not reason and c.status and not re.fullmatch(r"(?i)\s*(dnf|dns|dsq|retired)\s*", c.status):
        reason = re.sub(r"(?i)^\s*dnf\s*[—–-]\s*", "", c.status).strip()
    bits = [f"{c.name} retired"
            + (f" with {reason.lower()}" if reason and reason.lower() not in ("retired", "dnf") else "")
            + (f" after {c.laps_completed} laps" if c.laps_completed else "") + "."]
    win = next((w for w in ctx.session.track_status_windows
                if w.cause and (c.name in w.cause or code in w.cause)), None)
    if win:
        bits.append(f"Their stoppage brought out the {win.label} on lap {win.start_lap} — "
                    f"the cheap-stop window that reshaped the race behind them.")
    surname = c.name.split()[-1].upper() if c.name else code
    rc = [m for m in ctx.session.race_control
          if m.message and (surname in m.message.upper() or f"({code})" in m.message.upper())]
    if rc:
        bits.append(f"Race control logged: “{rc[-1].message[:90].strip()}”.")
    p = ctx.pace_by_driver.get(code)
    if p and p.pace_rank:
        bits.append(f"Until then their corrected pace was P{p.pace_rank} of the field.")
    if not reason:
        bits.append("The data sources don't give an official cause for this retirement.")
    return _qa(q, " ".join(bits), "retirement", "high" if reason else "medium", ctx, [code],
               follow_ups=["Show the position chart", "Who gained from it?"])


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


def _h_could_do_better(q, ctx, ents):
    """'what could X have done better to win?' / 'why didn't X win?' — tactical."""
    if ctx.is_practice:
        return None
    if not re.search(r"(what|how)\s+(could|should|might|would)\s+.*(better|won|win|different)|"
                     r"why\s+(didn'?t|couldn'?t|did\s?n'?t)\s+.*\bwin|done differently|"
                     r"deserved to win", q, re.I):
        return None
    winner = ctx.strategy.winner
    drivers = ents["drivers"]
    code = drivers[0] if drivers else None
    if not code:  # "who deserved to win" style → hidden-pace / runner-up
        code = ctx.strategy.hidden_pace_driver or next(
            (c.driver for c in ctx.session.classification if c.position == 2), None)
    if not code:
        return None
    c, p = ctx.class_by_driver.get(code), ctx.pace_by_driver.get(code)
    wc, wp = ctx.class_by_driver.get(winner), ctx.pace_by_driver.get(winner)
    if not c:
        return _missing(q, [f"race data for {code}"], ctx)
    if code == winner:
        return _qa(q, f"{code} did win — P{c.grid or '?'} to P1. They controlled track position and "
                   f"nailed the stops.", "could_better", "high", ctx, [code],
                   follow_ups=["What was the turning point?", "Explain simply"])

    where, options = [], []
    if c.position and wc and wc.position:
        where.append(f"finished P{c.position}, {max(0, c.position - wc.position)} place(s) behind {winner}")
    if p and wp and p.pace_rank and wp.pace_rank:
        if p.pace_rank <= wp.pace_rank:
            where.append(f"actually had comparable pace (P{p.pace_rank} clean-air vs {winner} P{wp.pace_rank})")
            options.append("track position — not speed — cost them, so a pit sequence that kept them ahead was the main lever")
        else:
            where.append(f"was ~{p.pace_rank - wp.pace_rank} pace positions off {winner}")
            options.append("raw pace was the ceiling; strategy alone likely wouldn't have won it")
    ref = _reference_stops(ctx.session, code)
    if c.pit_stops > ref:
        options.append(f"matching the {ref}-stop cars instead of {c.pit_stops} would have saved ~{20.5 * (c.pit_stops - ref):.0f}s of pit loss")
    victims = [u for u in ctx.strategy.undercuts if u.victim == code]
    if victims:
        options.append(f"covering {victims[0].attacker}'s lap-{victims[0].pit_lap} stop would have avoided the undercut")
    if p and p.traffic_laps >= 8:
        options.append(f"clearer air — they spent {p.traffic_laps} laps in traffic")

    ans = (f"To beat {winner}, {code} " + ("; ".join(where) if where else "needed more") + ". "
           + ("Their best options: " + "; ".join(options[:2]) + "."
              if options else f"There was no obvious path — {winner} had it covered on pace and strategy."))
    return _qa(q, ans, "could_better", "medium" if options else "low", ctx, [code, winner],
               follow_ups=["Compare their tyres", "Show the position chart", "Explain simply"])


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
    if ctx.is_practice or not re.search(r"\b(lose|lost|drop|dropped|fall|fell|slip|struggl|bad race|go wrong)\b", q, re.I):
        return None
    drivers = ents["drivers"]
    if not drivers:
        return None
    code = drivers[0]
    p, c = ctx.pace_by_driver.get(code), ctx.class_by_driver.get(code)
    if not c:
        return _missing(q, [f"race data for {code}"], ctx)
    if c.retired:
        return _qa(q, f"{code} didn't lose places on merit — they retired from the race ({c.status}) "
                   f"after starting P{c.grid or '?'}. Look at the lap they dropped out on the position chart.",
                   "why_lost", "high", ctx, [code], follow_ups=["Show the position chart", "Explain simply"])

    # --- mechanism: where and how they fell, from the position trace ---
    pos = {(pp.driver, pp.lap): pp.position for pp in ctx.session.positions}
    pit_laps = {ps.lap for ps in ctx.session.pit_stops if ps.driver == code}
    drops, prev = [], None
    for lap in range(1, ctx.session.total_laps + 1):
        cur = pos.get((code, lap))
        if cur is not None and prev is not None and cur > prev:
            drops.append((lap, prev, cur))
        if cur is not None:
            prev = cur

    def near_vsc(lap):
        return any(w.start_lap - 1 <= lap <= w.end_lap + 1 for w in ctx.session.track_status_windows)

    mech, laps_seen = [], []
    for lap, a, b in sorted(drops, key=lambda d: d[2] - d[1], reverse=True)[:2]:
        laps_seen.append(lap)
        if any(abs(lap - pl) <= 1 for pl in pit_laps):
            mech.append(f"in the pit cycle around lap {lap} (P{a}→P{b})")
        elif near_vsc(lap):
            mech.append(f"during the neutralization around lap {lap} (P{a}→P{b})")
        else:
            mech.append(f"on track around lap {lap} (P{a}→P{b})")

    # --- evidence ---
    ev = []
    if p and p.pace_rank and c.position and c.position > p.pace_rank:
        ev.append(f"their clean-air pace was worth about P{p.pace_rank}, so the result was "
                  f"{c.position - p.pace_rank} place(s) worse than their speed")
    ref = _reference_stops(ctx.session, code)
    if ctx.session.pit_data_reliable and c.pit_stops > ref:
        ev.append(f"an extra stop ({c.pit_stops} vs the {ref} most cars ran) cost roughly "
                  f"{20.5 * (c.pit_stops - ref):.0f}s of pit-lane time")
    victims = [u for u in ctx.strategy.undercuts if u.victim == code]
    if victims:
        ev.append(f"they were undercut by {victims[0].attacker} around lap {victims[0].pit_lap}")
    if p and p.traffic_laps >= 8:
        ev.append(f"they spent {p.traffic_laps} laps stuck in traffic (dirty air)")

    # --- assemble a non-circular explanation ---
    head = (f"{c.name} slipped from P{c.grid} to P{c.position}" if c.grid and c.position
            else f"{c.name} lost ground")
    if mech:
        cause = ("pit strategy / timing" if any("pit" in m for m in mech)
                 else "the neutralization window" if any("neutral" in m for m in mech)
                 else "on-track battles")
        head += f", and the trace shows the damage came {mech[0]}"
        if len(mech) > 1:
            head += f" and again {mech[1]}"
        head += f" — pointing to {cause} rather than a lack of pace."
    else:
        head += ", most likely through the pit cycle or traffic rather than raw pace."
    body = (" The strongest clues: " + "; ".join(ev) + "." if ev
            else " There isn't enough pit/gap detail to prove the exact cause, but the position "
                 "trace is where the loss shows up.")
    conf = "high" if (mech and ev) else "medium" if ev else "low"
    return _qa(q, head + body, "why_lost", conf, ctx, [code],
               supporting={"lap": laps_seen[0] if laps_seen else None},
               follow_ups=["Show the position chart", "Compare with teammate", "Compare their tyres", "Explain simply"])


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
    causes = "; ".join(f"{w.label} on lap {w.start_lap}" + (f" ({w.cause})" if w.cause else "")
                       for w in ctx.session.track_status_windows[:3])
    return _qa(q, f"There were neutralizations — {causes} — but no driver clearly converted "
               f"a cheap stop from them.", "vsc", "medium", ctx, [])


def _h_compare(q, ctx, ents):
    if not re.search(r"\b(compare|vs\.?|versus|against|difference|better|head.?to.?head)\b", q, re.I):
        return None
    if len(ents["teams"]) >= 2:
        return _compare_teams(q, ctx, ents["teams"][0], ents["teams"][1])
    if len(ents["drivers"]) >= 2:
        return _compare_drivers(q, ctx, ents["drivers"][0], ents["drivers"][1])
    # "the top 2" / "the leaders" / "first two" → P1 vs P2
    if not ctx.is_practice and re.search(r"\btop\s*(2|two)\b|\bleaders\b|\bfirst\s+two\b|\bpodium\s+fight\b", q, re.I):
        front = sorted((c for c in ctx.session.classification if c.position),
                       key=lambda c: c.position)[:2]
        if len(front) == 2:
            return _compare_drivers(q, ctx, front[0].driver, front[1].driver)
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
    # full statistics-backed breakdown, not just the one-line verdict
    answer = " ".join(cmp.get("verdict_points") or [cmp["verdict"]])
    return _qa(q, answer, "compare_drivers", "high", ctx, [a, b],
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
    if ctx.is_practice or not re.search(
            r"\b(gain|gained|climb|most places|biggest mover|loser|biggest\s+los\w*|"
            r"lost\s+the\s+most|most\s+(places|positions)\s+lost)\b", q, re.I):
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
    _h_could_do_better, _h_why_retired, _h_results, _h_overtake, _h_what_happened,
    _h_explain_race,
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
            res.confidence = "medium"
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
    ans = (f"Here's the headline from this {ctx.session.session_type}: " + ans
           + " Ask about any driver, lap or moment and I'll dig into it.")
    return _qa(q, ans, "overview", "medium", ctx, [],
               follow_ups=["Who was on the podium?",
                           "Who was fastest?" if ctx.is_practice else "Who had the best race pace?",
                           "Explain simply"])


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
    _enrich_structure(result, ctx, ents, simple)
    if simple:
        result = _make_simple(result, ctx)
    return _maybe_polish(result, ctx)


# --------------------------------------------------------------------------- #
# structured, analyst-style answer (derived from the computed answer + evidence)
# --------------------------------------------------------------------------- #
_TITLES = {
    "overtake": "How the pass happened", "what_happened": "What happened",
    "why_lost": "Why they lost ground", "best_pace": "Best race pace",
    "vsc": "Who benefited from the neutralization", "compare_drivers": "Head-to-head",
    "compare_teams": "Team-vs-team", "pit_loss": "Time lost in the pits",
    "undercut": "Undercut / overcut", "winner": "Race winner", "fastest": "Fastest",
    "tyre_strategy": "Tyre strategy", "weather": "Conditions", "explain": "Race summary",
    "practice_fastest": "Fastest in the session", "practice_longrun": "Best long-run pace",
    "practice_laps": "Most laps", "practice_team": "Team pace in practice",
    "could_better": "What could have gone better", "gainer": "Biggest mover",
    "loser": "Biggest loss", "alt_strategy": "Was there a better call?",
    "worst_team": "Who lost most vs pace", "overview": "Session overview",
    "retirement": "Why they retired", "results": "Final order",
}

_STEPS = {
    "overtake": ["Reading the position trace", "Checking pit windows around the move",
                 "Comparing tyre age & lap pace", "Looking for race-control events"],
    "why_lost": ["Comparing grid vs finish", "Checking clean-air pace vs result",
                 "Counting pit stops & losses", "Looking for undercuts & traffic"],
    "best_pace": ["Fuel- & tyre-correcting every lap", "Filtering out traffic laps",
                  "Ranking clean-air pace"],
    "vsc": ["Finding VSC / Safety Car windows", "Checking who pitted inside them",
            "Estimating the time saved"],
    "compare_drivers": ["Aligning both cars lap-by-lap", "Comparing pace, pits & tyres",
                        "Building the verdict"],
    "compare_teams": ["Pulling both teams' cars", "Comparing pace / results", "Building the verdict"],
}
_DEFAULT_STEPS = ["Reading the loaded session data", "Checking the relevant metrics",
                  "Building the explanation"]


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _analyst_deep_dive(ctx: QAContext, codes: list[str]) -> list[str]:
    """Dense per-driver appendix for the deep-analysis view: pace profile,
    stint-by-stint medians with degradation, and every stop with its cost.
    This is the 'you work on an F1 pit wall' rendition of the answer."""
    out: list[str] = []
    for code in codes[:2]:
        c = ctx.class_by_driver.get(code)
        if not c:
            continue
        p = ctx.pace_by_driver.get(code)
        bits: list[str] = []
        if p:
            pace_bits = []
            if p.clean_air_pace:
                pace_bits.append(f"clean-air {_fmt_time(p.clean_air_pace)}"
                                 + (f" (P{p.pace_rank} of field)" if p.pace_rank else ""))
            if p.best_lap:
                pace_bits.append(f"best {_fmt_time(p.best_lap)}")
            if p.median_lap:
                pace_bits.append(f"median {_fmt_time(p.median_lap)}")
            if p.consistency_score is not None:
                pace_bits.append(f"consistency {p.consistency_score:.0f}/100")
            if p.traffic_laps:
                pace_bits.append(f"{p.traffic_laps} laps in traffic")
            if pace_bits:
                bits.append(f"{code} pace profile: " + ", ".join(pace_bits) + ".")
        sts = sorted((s for s in ctx.session.stints if s.driver == code), key=lambda s: s.stint)
        if sts:
            seq = " → ".join(
                f"{s.compound.value.title()} L{s.start_lap}-{s.end_lap}"
                + ((f" (median {_fmt_time(s.median_lap)}"
                    + (f", deg {s.degradation:+.3f}s/lap" if s.degradation is not None else "")
                    + ")") if s.median_lap else "")
                for s in sts)
            bits.append(f"Stints: {seq}.")
        stops = [ps for ps in ctx.session.pit_stops if ps.driver == code]
        if stops and ctx.session.pit_data_reliable:
            stxt = ", ".join(
                f"L{ps.lap}"
                + (f" ({ps.best_stationary:.1f}s stationary)" if ps.best_stationary else "")
                + (" under VSC" if ps.under_vsc else " under SC" if ps.under_safety_car else "")
                for ps in stops)
            bits.append(f"Stops: {stxt}.")
        if bits:
            out.append(" ".join(bits))
    return out


def _enrich_structure(qa: QuestionAnswer, ctx: QAContext, ents: dict, simple: bool) -> None:
    sents = _sentences(qa.answer)
    qa.answer_title = _TITLES.get(qa.kind, "Analysis")
    qa.short_answer = sents[0] if sents else qa.answer
    qa.detailed_answer = _paragraphs(sents)
    qa.related_drivers = ents.get("drivers", [])
    qa.analysis_steps = _STEPS.get(qa.kind, _DEFAULT_STEPS)

    # the deep-analysis appendix: hard numbers for the drivers in question
    if qa.kind not in ("missing", "empty"):
        qa.detailed_answer = qa.detailed_answer + _analyst_deep_dive(ctx, qa.related_drivers)

    # evidence bullets from remaining sentences + structured supporting data
    ev: list[str] = [s for s in sents[1:] if len(s) > 3][:4]
    sup = qa.supporting or {}
    if sup.get("lap"):
        ev.append(f"Key lap: {sup['lap']} ({sup.get('kind', 'position change')}).")
        qa.related_laps = [int(sup["lap"])] if str(sup["lap"]).isdigit() else []
    if sup.get("source"):
        ev.append(f"Overtake data source: {sup['source']}.")
    qa.evidence = ev

    # beginner summary: a genuine plain-English rewrite of the core answer —
    # full names, no jargon, positions as words, and just two short sentences
    # (understanding beats completeness; the deep view carries the rest).
    qa.beginner_summary = _plain_language(" ".join(sents[:3]), ctx, max_sentences=2)

    # advanced notes: confidence, method, gaps, assumptions
    notes = [f"Confidence: {qa.confidence}."]
    if qa.missing_data:
        notes.append("Missing data: " + ", ".join(qa.missing_data) + ".")
    if qa.kind in ("best_pace", "why_lost"):
        notes.append("Pace figures are fuel- and tyre-corrected clean-air estimates; "
                     "stint medians exclude in/out, neutralized and outlier laps.")
    if qa.kind == "overtake" and sup.get("source") == "inferred":
        notes.append("Overtake inferred from the lap-by-lap position trace, not an explicit feed.")
    if ctx.session.pit_data_reliable and ctx.session.pit_stops:
        notes.append("Stationary times are wheels-stopped measurements where the source "
                     "provides them, otherwise derived estimates.")
    qa.advanced_notes = notes


def _paragraphs(sents: list[str]) -> list[str]:
    if len(sents) <= 2:
        return [" ".join(sents)] if sents else []
    mid = (len(sents) + 1) // 2
    return [" ".join(sents[:mid]), " ".join(sents[mid:])]


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
    (r"\bclean-air pace\b", "true speed"),
    (r"\bfuel(-| )and(-| )tyre(-| )corrected\b", "adjusted for fuel load and tyres"),
    (r"\bclean air\b", "clear track"),
    (r"\bundercut(ting|s)?\b", "pitting earlier than a rival to jump ahead of them"),
    (r"\bovercut(ting|s)?\b", "staying out longer than a rival to jump ahead of them"),
    (r"\bdegradation\b", "tyre wear"),
    (r"\bdirty air\b", "the turbulent air behind another car, which slows you down"),
    (r"\bdelta\b", "time difference"),
    (r"\bpit(-| )loss\b", "time lost in the pit lane"),
    (r"\bpit cycle\b", "round of pit stops"),
    (r"\bstint\b", "run on one set of tyres"),
    (r"\bout-?lap\b", "first lap on new tyres"),
    (r"\bin-?lap\b", "lap into the pits"),
    (r"\bVSC\b", "virtual safety car (everyone has to slow down)"),
    (r"\bneutrali[sz]ations?\b", "slow-down periods (safety car or virtual safety car)"),
    (r"\bneutrali[sz]ation window\b", "slow-down period"),
    (r"\binterval\b", "gap to the car ahead"),
    (r"\btyre age\b", "how many laps the tyres had done"),
    (r"\bthe grid\b", "the starting order"),
    (r"\bDRS train\b", "queue of cars stuck behind each other"),
    (r"\btrack position\b", "position on the road"),
]


def _ordinal_txt(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _plain_language(text: str, ctx: QAContext, max_sentences: int = 3) -> str:
    """A genuine beginner rewrite: driver codes become full names, jargon becomes
    everyday words, positions read as '4th', and the answer is kept short. This
    intentionally trades completeness for understanding."""
    # driver codes -> full names ("VER" -> "Max Verstappen")
    for d in ctx.session.drivers:
        if d.name and d.name != d.code:
            text = re.sub(rf"\b{re.escape(d.code)}\b", d.name, text)
    # jargon -> plain english
    for pat, repl in _JARGON:
        text = re.sub(pat, repl, text, flags=re.I)
    # notation cleanups: "P4" -> "4th", "~20s" -> "about 20s"
    text = re.sub(r"\bP(\d+)\b", lambda m: _ordinal_txt(int(m.group(1))), text)
    text = text.replace("~", "about ").replace("×", " times")
    sents = _sentences(text)
    return " ".join(sents[:max_sentences])


def _make_simple(qa: QuestionAnswer, ctx: QAContext) -> QuestionAnswer:
    qa.answer = _plain_language(qa.answer, ctx)
    sents = _sentences(qa.answer)
    qa.short_answer = sents[0] if sents else qa.answer
    qa.detailed_answer = _paragraphs(sents)
    qa.beginner_summary = qa.answer
    qa.simple = True
    return qa


def _maybe_polish(qa: QuestionAnswer, ctx: QAContext) -> QuestionAnswer:
    settings = get_settings()
    if not settings.llm_available or qa.kind in ("missing", "empty"):
        return qa
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.llm_api_key)
        style = ("for someone who has never watched Formula 1: at most three short sentences, "
                 "no jargon, and explain any technical idea in everyday words"
                 if qa.simple else "concisely for a fan")
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
