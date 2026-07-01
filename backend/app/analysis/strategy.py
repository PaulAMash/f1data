"""
Strategy analysis + deterministic insight generation.

This is the "explain the race" brain. It compares each driver's *result* to their
*pace* to attribute gains/losses to strategy, detects undercuts/overcuts from the
position trace, finds the decisive windows (VSC/SC stops, extra stops), and emits
human-readable RaceInsight objects built from templates + computed numbers.

No randomness, no LLM required. An optional LLM layer (qa.py) only ever *polishes*
language on top of these facts.
"""
from __future__ import annotations

from collections import defaultdict

from ..models import (
    Compound,
    DriverPaceSummary,
    PitStop,
    RaceControlEvent,
    RaceInsight,
    RaceSession,
    StrategySummary,
    TrackStatus,
    TrackStatusWindow,
    UndercutEvent,
)

PIT_LOSS_GREEN_EST = 20.5   # used to value VSC/SC cheap stops when lane time is unknown


# --------------------------------------------------------------------------- #
# small lookups
# --------------------------------------------------------------------------- #
def _position_index(session: RaceSession):
    idx: dict[tuple[str, int], int] = {}
    for p in session.positions:
        idx[(p.driver, p.lap)] = p.position
    return idx


def _pos(idx, code: str, lap: int, total: int) -> int | None:
    lap = max(1, min(lap, total))
    if (code, lap) in idx:
        return idx[(code, lap)]
    # nearest available lap
    for d in range(1, 6):
        for cand in (lap - d, lap + d):
            if (code, cand) in idx:
                return idx[(code, cand)]
    return None


def _driver_at(idx, position: int, lap: int) -> str | None:
    for (code, lp), pos in idx.items():
        if lp == lap and pos == position:
            return code
    return None


def _compound_seq(session: RaceSession, code: str) -> list[Compound]:
    sts = sorted([s for s in session.stints if s.driver == code], key=lambda s: s.stint)
    return [s.compound for s in sts]


# --------------------------------------------------------------------------- #
# undercut / overcut detection
# --------------------------------------------------------------------------- #
def detect_undercuts(session: RaceSession) -> list[UndercutEvent]:
    idx = _position_index(session)
    total = session.total_laps
    pits_by_driver: dict[str, list[int]] = defaultdict(list)
    for ps in session.pit_stops:
        pits_by_driver[ps.driver].append(ps.lap)

    events: list[UndercutEvent] = []
    seen: set[tuple[str, str, int]] = set()

    for code, laps in pits_by_driver.items():
        for pit_lap in laps:
            before = pit_lap - 1
            my_pos_before = _pos(idx, code, before, total)
            if not my_pos_before or my_pos_before == 1:
                continue
            rival = _driver_at(idx, my_pos_before - 1, before)  # the car directly ahead
            if not rival or rival == code:
                continue
            rival_pits = [l for l in pits_by_driver.get(rival, []) if pit_lap - 2 <= l <= pit_lap + 5]
            settle = min(total, max(pit_lap, rival_pits[0] if rival_pits else pit_lap) + 2)
            my_pos_after = _pos(idx, code, settle, total)
            rival_pos_after = _pos(idx, rival, settle, total)
            if not my_pos_after or not rival_pos_after:
                continue
            key = (code, rival, pit_lap)
            if key in seen:
                continue
            gained = my_pos_after < rival_pos_after            # now ahead of the rival
            was_behind = my_pos_before > _pos(idx, rival, before, total or 1) if _pos(idx, rival, before, total) else True
            if gained and was_behind:
                kind = "undercut" if (not rival_pits or rival_pits[0] >= pit_lap) else "overcut"
                seen.add(key)
                events.append(UndercutEvent(
                    attacker=code, victim=rival, pit_lap=pit_lap, gained=True,
                    positions_gained=max(1, rival_pos_after - my_pos_after), kind=kind,
                ))
    # keep the most decisive, de-duplicated by attacker/victim
    best: dict[tuple[str, str], UndercutEvent] = {}
    for e in events:
        k = (e.attacker, e.victim)
        if k not in best or e.positions_gained > best[k].positions_gained:
            best[k] = e
    return sorted(best.values(), key=lambda e: -e.positions_gained)[:6]


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def compute_strategy(session: RaceSession, pace: list[DriverPaceSummary]) -> StrategySummary:
    pace_by_driver = {p.driver: p for p in pace}
    classified = [c for c in session.classification if not c.retired and c.position]
    total = session.total_laps

    # gainers / losers
    def net(c):
        return (c.grid - c.position) if (c.grid and c.position) else 0
    ranked_by_net = sorted(classified, key=lambda c: net(c), reverse=True)
    gainers = [_mv(c, net(c)) for c in ranked_by_net if net(c) > 0][:4]
    losers = [_mv(c, net(c)) for c in sorted(classified, key=net) if net(c) < 0][:4]

    # pit counts / avg pit loss — prefer measured pit-lane time, then OpenF1 stop
    # duration, then derived estimate; label which so the UI can be honest.
    pit_counts = {c.driver: c.pit_stops for c in session.classification}
    lane_times = [ps.pit_lane_time or ps.stop_duration for ps in session.pit_stops
                  if (ps.pit_lane_time or ps.stop_duration)]
    est_times = [ps.estimated_stationary_time for ps in session.pit_stops
                 if ps.estimated_stationary_time]
    if lane_times:
        avg_pit_loss = round(sum(lane_times) / len(lane_times), 2)
        avg_pit_loss_kind = "measured"
    elif est_times:
        avg_pit_loss = round(sum(est_times) / len(est_times), 2)
        avg_pit_loss_kind = "estimated"
    else:
        avg_pit_loss, avg_pit_loss_kind = None, None

    # tyre summary
    tyre_summary = []
    for c in session.classification:
        seq = _compound_seq(session, c.driver)
        tyre_summary.append({
            "driver": c.driver, "team": c.team, "position": c.position,
            "sequence": [comp.value for comp in seq], "stops": c.pit_stops,
        })

    # strategy vs pace: strategy_gain = pace_rank - finish (positive => strategy helped)
    def strat_gain(c):
        p = pace_by_driver.get(c.driver)
        if not p or not p.pace_rank or not c.position:
            return None
        return p.pace_rank - c.position
    helped = max((c for c in classified if strat_gain(c) is not None),
                 key=lambda c: strat_gain(c), default=None)
    hurt = min((c for c in classified if strat_gain(c) is not None),
               key=lambda c: strat_gain(c), default=None)

    best_strategy = worst_strategy = None
    strategy_helped_driver = hidden_pace_driver = None
    if helped and (strat_gain(helped) or 0) >= 1:
        strategy_helped_driver = helped.driver
        best_strategy = {
            "driver": helped.driver, "team": helped.team, "finish": helped.position,
            "pace_rank": pace_by_driver[helped.driver].pace_rank,
            "detail": (f"{helped.driver} finished P{helped.position} from "
                       f"P{pace_by_driver[helped.driver].pace_rank} on raw pace — a "
                       f"{strat_gain(helped)}-place strategy gain."),
        }
    if hurt and (strat_gain(hurt) or 0) <= -1:
        hidden_pace_driver = hurt.driver
        worst_strategy = {
            "driver": hurt.driver, "team": hurt.team, "finish": hurt.position,
            "pace_rank": pace_by_driver[hurt.driver].pace_rank, "stops": hurt.pit_stops,
            "detail": (f"{hurt.driver} had P{pace_by_driver[hurt.driver].pace_rank} pace but "
                       f"finished P{hurt.position} — {abs(strat_gain(hurt))} places lost, "
                       f"running {hurt.pit_stops} stops."),
        }

    # best pit timing: prefer the biggest cheap-stop under VSC/SC, else fastest stop
    best_pit_timing = _best_pit_timing(session)

    # undercuts
    undercuts = detect_undercuts(session)

    # weather
    weather_summary = _weather_summary(session)

    # driver of the day
    dotd, dotd_reason = _driver_of_the_day(session, pace_by_driver)

    # insights + turning points
    turning_points = _turning_points(session, pace_by_driver)
    insights = _all_insights(session, pace_by_driver, undercuts, best_strategy,
                             worst_strategy, best_pit_timing, turning_points)

    winner = classified[0].driver if classified else None
    story = _story(session, classified, winner, gainers, losers, best_strategy,
                   worst_strategy, hidden_pace_driver, best_pit_timing, weather_summary)

    return StrategySummary(
        winner=winner,
        driver_of_the_day=dotd, dotd_reason=dotd_reason,
        biggest_gainers=gainers, biggest_losers=losers,
        best_strategy=best_strategy, worst_strategy=worst_strategy,
        best_pit_timing=best_pit_timing, avg_pit_loss=avg_pit_loss,
        avg_pit_loss_kind=avg_pit_loss_kind,
        pit_counts=pit_counts, tyre_summary=tyre_summary,
        turning_points=turning_points, undercuts=undercuts,
        hidden_pace_driver=hidden_pace_driver, strategy_helped_driver=strategy_helped_driver,
        weather_summary=weather_summary, insights=insights, story=story,
    )


def _story(session, classified, winner, gainers, losers, best_strategy, worst_strategy,
           hidden_pace_driver, best_pit_timing, weather_summary) -> list[str]:
    """3-5 plain-English sentences summarizing the race for the Race Story view."""
    s: list[str] = []
    win = next((c for c in classified if c.driver == winner), None)
    if win:
        from_grid = f" from P{win.grid}" if win.grid and win.grid > 1 else " from pole"
        s.append(f"{win.name} won the {session.grand_prix}{from_grid}, running a "
                 f"{win.pit_stops}-stop race.")
    if best_strategy:
        s.append(best_strategy["detail"])
    if worst_strategy:
        s.append(worst_strategy["detail"])
    elif hidden_pace_driver:
        s.append(f"{hidden_pace_driver} had strong underlying pace that their result didn't show.")
    if gainers:
        g = gainers[0]
        s.append(f"{g['driver']} was the day's biggest mover, up {g['net']} places to P{g['finish']}.")
    if best_pit_timing and "VSC" in best_pit_timing.get("kind", ""):
        s.append(best_pit_timing["detail"])
    if weather_summary:
        s.append(f"Conditions: {weather_summary}.")
    return s[:5]


# --------------------------------------------------------------------------- #
# insight builders
# --------------------------------------------------------------------------- #
def _best_pit_timing(session: RaceSession) -> dict | None:
    cheap = [ps for ps in session.pit_stops if ps.under_vsc or ps.under_safety_car]
    if cheap:
        # value = green pit loss - the (reduced) lane time actually paid
        def saving(ps: PitStop):
            paid = ps.pit_lane_time or (PIT_LOSS_GREEN_EST - 10)
            return round(PIT_LOSS_GREEN_EST - paid, 1)
        best = max(cheap, key=saving)
        window = "VSC" if best.under_vsc else "safety car"
        return {
            "driver": best.driver, "lap": best.lap, "kind": f"{window} stop",
            "saved_s": saving(best),
            "detail": (f"{best.driver} pitted on lap {best.lap} under {window}, saving "
                       f"~{saving(best)}s versus a green-flag stop."),
        }
    with_time = [ps for ps in session.pit_stops if ps.stationary_time]
    if with_time:
        best = min(with_time, key=lambda ps: ps.stationary_time)
        return {
            "driver": best.driver, "lap": best.lap, "kind": "fastest stop",
            "stationary_s": best.stationary_time,
            "detail": f"{best.driver} had the fastest stop: {best.stationary_time:.2f}s stationary on lap {best.lap}.",
        }
    return None


def _turning_points(session: RaceSession, pace_by_driver) -> list[RaceInsight]:
    out: list[RaceInsight] = []

    # 1. any VSC/SC/red window is a turning point, especially if cars pitted in it
    for w in session.track_status_windows:
        pitted = sorted({ps.driver for ps in session.pit_stops
                         if w.start_lap <= ps.lap <= w.end_lap})
        detail = (f"{w.label} from lap {w.start_lap} to {w.end_lap}. "
                  + (f"Cheap-stop window taken by {', '.join(pitted)}." if pitted
                     else "No cars converted a stop here."))
        out.append(RaceInsight(
            kind="turning_point", title=f"{w.label} (laps {w.start_lap}-{w.end_lap})",
            detail=detail, drivers=pitted, lap_range=[w.start_lap, w.end_lap],
            severity="key", confidence="high",
        ))

    # 2. extra-stop cost among front-runners
    front = [c for c in session.classification if c.position and c.position <= 8 and not c.retired]
    if front:
        max_stops = max(c.pit_stops for c in front)
        min_stops = min(c.pit_stops for c in front)
        if max_stops > min_stops:
            extra = [c for c in front if c.pit_stops == max_stops]
            for c in extra:
                p = pace_by_driver.get(c.driver)
                if p and p.pace_rank and p.pace_rank < c.position:
                    out.append(RaceInsight(
                        kind="turning_point",
                        title=f"{c.driver}'s extra stop cost track position",
                        detail=(f"{c.driver} ran {c.pit_stops} stops vs {min_stops} for rivals and "
                                f"finished P{c.position} despite P{p.pace_rank} pace — the extra pit "
                                f"loss (~{PIT_LOSS_GREEN_EST:.0f}s) dropped them behind two-stoppers."),
                        drivers=[c.driver], severity="key", confidence="medium",
                    ))
    return out[:5]


def _all_insights(session, pace_by_driver, undercuts, best_strategy, worst_strategy,
                  best_pit_timing, turning_points) -> list[RaceInsight]:
    insights: list[RaceInsight] = list(turning_points)

    if best_strategy:
        insights.append(RaceInsight(
            kind="best_strategy", title=f"Best strategy: {best_strategy['driver']}",
            detail=best_strategy["detail"], drivers=[best_strategy["driver"]],
            severity="good", confidence="high"))
    if worst_strategy:
        insights.append(RaceInsight(
            kind="worst_strategy", title=f"Costliest strategy: {worst_strategy['driver']}",
            detail=worst_strategy["detail"], drivers=[worst_strategy["driver"]],
            severity="bad", confidence="high"))
    if best_pit_timing:
        insights.append(RaceInsight(
            kind="pit_timing", title=f"Best pit timing: {best_pit_timing['driver']}",
            detail=best_pit_timing["detail"], drivers=[best_pit_timing["driver"]],
            severity="good", confidence="medium"))

    for u in undercuts[:3]:
        insights.append(RaceInsight(
            kind=u.kind, title=f"{u.attacker} {u.kind} on {u.victim}",
            detail=(f"{u.attacker} pitted lap {u.pit_lap} and emerged ahead of {u.victim}, "
                    f"gaining {u.positions_gained} place(s) through the pit cycle."),
            drivers=[u.attacker, u.victim], lap_range=[u.pit_lap], severity="info",
            confidence="medium"))

    # missed cheap-stop opportunities: front-runners who did NOT pit in a VSC/SC window
    for w in session.track_status_windows:
        pitted = {ps.driver for ps in session.pit_stops if w.start_lap <= ps.lap <= w.end_lap}
        for c in session.classification:
            if c.retired or not c.position or c.position > 8:
                continue
            # Only a genuine mistake if the driver actually finished BELOW their pace —
            # a winner who stayed out on an optimal strategy didn't "miss" anything.
            p = pace_by_driver.get(c.driver)
            if not p or not p.pace_rank or c.position <= p.pace_rank:
                continue
            # did they stop shortly AFTER the window on green? that's a missed cheap stop
            stops_after = [ps for ps in session.pit_stops
                           if ps.driver == c.driver and w.end_lap < ps.lap <= w.end_lap + 12]
            if c.driver not in pitted and stops_after:
                insights.append(RaceInsight(
                    kind="missed_stop",
                    title=f"{c.driver} missed the {w.label} cheap-stop window",
                    detail=(f"{c.driver} stayed out during the {w.label} (laps {w.start_lap}-{w.end_lap}) "
                            f"then stopped on lap {stops_after[0].lap} under green — paying the full "
                            f"~{PIT_LOSS_GREEN_EST:.0f}s instead of ~{PIT_LOSS_GREEN_EST-10:.0f}s."),
                    drivers=[c.driver], lap_range=[w.start_lap, stops_after[0].lap],
                    severity="bad", confidence="low"))
                break

    # risky tyre stints (long stint on soft, or high degradation)
    for st in session.stints:
        if st.compound == Compound.SOFT and st.laps >= 22:
            insights.append(RaceInsight(
                kind="tyre_risk", title=f"{st.driver} long soft stint",
                detail=(f"{st.driver} ran {st.laps} laps on softs (laps {st.start_lap}-{st.end_lap}) — "
                        f"an aggressive stint with high degradation risk."),
                drivers=[st.driver], lap_range=[st.start_lap, st.end_lap],
                severity="info", confidence="low"))

    # hidden pace
    hp = [p for p in pace_by_driver.values() if p.finish and p.pace_rank and p.finish - p.pace_rank >= 2]
    for p in sorted(hp, key=lambda x: x.finish - x.pace_rank, reverse=True)[:1]:
        insights.append(RaceInsight(
            kind="hidden_pace", title=f"{p.driver}: pace hidden by track position",
            detail=(f"{p.driver} had the {_ordinal(p.pace_rank)}-fastest clean-air pace but finished "
                    f"P{p.finish}. Their result under-represents how quick the car actually was."),
            drivers=[p.driver], severity="info", confidence="medium"))

    return insights


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _driver_of_the_day(session: RaceSession, pace_by_driver) -> tuple[str | None, str | None]:
    best = None
    best_score = -1e9
    for c in session.classification:
        if c.retired or not c.position:
            continue
        net = (c.grid - c.position) if c.grid else 0
        p = pace_by_driver.get(c.driver)
        pace_bonus = max(0, 8 - (p.pace_rank or 20)) * 0.25 if p else 0
        win_bonus = 1.0 if (c.position == 1 and (c.grid or 1) > 1) else 0
        score = net + pace_bonus + win_bonus
        if score > best_score:
            best_score, best = score, c
    if not best:
        return None, None
    net = (best.grid - best.position) if best.grid else 0
    reason_bits = []
    if net > 0:
        reason_bits.append(f"gained {net} places (P{best.grid} → P{best.position})")
    p = pace_by_driver.get(best.driver)
    if p and p.pace_rank and p.pace_rank <= 3:
        reason_bits.append(f"top-{p.pace_rank} race pace")
    if best.pit_stops:
        reason_bits.append(f"{best.pit_stops}-stop execution")
    return best.driver, ("; ".join(reason_bits) or "strong all-round drive")


def _weather_summary(session: RaceSession) -> str | None:
    if not session.weather:
        return None
    airs = [w.air_temp for w in session.weather if w.air_temp is not None]
    tracks = [w.track_temp for w in session.weather if w.track_temp is not None]
    wet = any(w.rainfall for w in session.weather)
    bits = []
    if airs:
        bits.append(f"air {min(airs):.0f}-{max(airs):.0f}°C")
    if tracks:
        bits.append(f"track {min(tracks):.0f}-{max(tracks):.0f}°C")
    bits.append("wet running" if wet else "dry throughout")
    return ", ".join(bits)


def _mv(c, net: int) -> dict:
    return {"driver": c.driver, "team": c.team, "grid": c.grid, "finish": c.position,
            "net": net, "team_color": c.team_color}


def _ordinal(n: int | None) -> str:
    if not n:
        return "?"
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1:'st',2:'nd',3:'rd'}.get(n % 10, 'th')}"
