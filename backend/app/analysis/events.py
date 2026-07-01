"""
Derived race events — overtakes inferred from the lap-by-lap position trace.

Used when a source (e.g. OpenF1's overtakes endpoint) doesn't provide overtakes,
and as evidence for the Ask engine's "how did X pass Y" questions. Each inferred
overtake is classified as pit-cycle vs on-track using nearby pit laps.
"""
from __future__ import annotations

from ..models import Overtake, RaceSession


def infer_overtakes(session: RaceSession) -> list[Overtake]:
    # position[(driver, lap)]
    pos: dict[tuple[str, int], int] = {(p.driver, p.lap): p.position for p in session.positions}
    if not pos:
        return []
    drivers = {d.code for d in session.drivers}
    pit_laps: dict[str, set] = {}
    for ps in session.pit_stops:
        pit_laps.setdefault(ps.driver, set()).add(ps.lap)

    overtakes: list[Overtake] = []
    for lap in range(2, session.total_laps + 1):
        for a in drivers:
            pa, pa_prev = pos.get((a, lap)), pos.get((a, lap - 1))
            if pa is None or pa_prev is None or pa >= pa_prev:
                continue  # a didn't gain a place this lap
            # who did a pass? whoever was directly ahead last lap and is now behind
            for b in drivers:
                if b == a:
                    continue
                pb, pb_prev = pos.get((b, lap)), pos.get((b, lap - 1))
                if pb is None or pb_prev is None:
                    continue
                # a was behind b, now a is ahead of b, and they swapped by ~1
                if pa_prev == pb_prev + 1 and pa < pb:
                    kind = "pit_cycle" if _near_pit(pit_laps, a, lap) or _near_pit(pit_laps, b, lap) else "on_track"
                    overtakes.append(Overtake(
                        lap=lap, overtaker=a, overtaken=b, position_after=pa,
                        kind=kind, source="inferred",
                        detail=f"{a} P{pa_prev}→P{pa}, {b} P{pb_prev}→P{pb}"))
                    break
    return overtakes


def _near_pit(pit_laps: dict, code: str, lap: int) -> bool:
    laps = pit_laps.get(code, set())
    return any(abs(lap - pl) <= 2 for pl in laps)


def overtakes_between(session: RaceSession, a: str, b: str) -> list[Overtake]:
    """All overtakes (either direction) between two drivers."""
    src = session.overtakes or infer_overtakes(session)
    return [o for o in src if {o.overtaker, o.overtaken} == {a, b}]
