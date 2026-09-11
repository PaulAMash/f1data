"""A long run is consecutive flying laps; a cool-down lap is not part of it.

The timing feeds flag only pit laps and missing laps as outliers, so a Friday
stint that alternates push laps with cool-down laps arrives looking like a long
run. Its median then depends on which kind of lap sits in the middle — Leclerc's
Madrid FP2 "long run" was 1:35.5 from four qualifying laps interleaved with
three 2:25s, ranked ahead of everyone's real race simulations, on the website's
Long-run board and the iPhone app's Pace tab alike.
"""
import json
import os
import statistics
from pathlib import Path

os.environ["PITWALL_IQ_MOCK_MODE"] = "true"

from app.analysis.practice import (  # noqa: E402
    MIN_LONG_RUN, RUN_RHYTHM, _long_run, _longest_consecutive, compute_practice,
)
from app.models import Compound, Lap, RaceSession, Stint  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"

# Leclerc, Madrid FP2 2026, as OpenF1 served it: stint 1 on the medium alternated
# push laps with cool-downs; stint 4 on the soft was the eleven-lap race run.
LEC_STINT_1 = [None, 95.557, 146.928, 95.242, 144.522, 94.429, 149.656, 94.48, None]
LEC_STINT_4 = [None, 98.613, 102.973, 103.79, 102.047, 99.411, 102.182, 101.784, None, None, None]


def _stint(driver, n, first_lap, times, compound=Compound.MEDIUM):
    laps = [Lap(driver=driver, lap=first_lap + i, lap_time=t, stint=n, is_outlier=t is None)
            for i, t in enumerate(times)]
    stint = Stint(driver=driver, stint=n, compound=compound, start_lap=first_lap,
                  end_lap=first_lap + len(times) - 1, laps=len(times))
    return stint, laps


def _session(fixture: str) -> RaceSession:
    return RaceSession.model_validate(json.loads((FIXTURES / fixture).read_text()))


# --- the rule ---------------------------------------------------------------

def test_alternating_push_and_cool_down_laps_are_not_a_long_run():
    stint, laps = _stint("LEC", 1, 1, LEC_STINT_1)
    assert _long_run([stint], laps) == (None, 0)


def test_the_race_simulation_beats_the_qualifying_programme():
    s1, l1 = _stint("LEC", 1, 1, LEC_STINT_1)
    s4, l4 = _stint("LEC", 4, 16, LEC_STINT_4, Compound.SOFT)
    pace, laps = _long_run([s1, s4], l1 + l4)
    assert (pace, laps) == (102.047, 7)


def test_fuel_burn_drift_is_still_one_run():
    # nine laps drifting from 94.0 to 100.6 — 7% — is a race run, kept whole
    times = [None, 94.0, 94.8, 95.5, 96.3, 97.1, 98.0, 98.9, 99.7, 100.6]
    stint, laps = _stint("VER", 1, 1, times)
    assert _long_run([stint], laps) == (97.1, 9)


def test_a_slow_lap_splits_the_run_and_the_longer_half_counts():
    times = [None, 94.0, 94.3, 94.1, 94.4, 94.2, 118.0, 94.5, 94.6]
    stint, laps = _stint("NOR", 1, 1, times)
    assert _long_run([stint], laps) == (94.2, 5)


def test_a_missing_lap_time_splits_the_run_too():
    times = [None, 94.0, 94.3, None, 94.1, 94.4, 94.2, 94.6]
    stint, laps = _stint("NOR", 1, 1, times)
    assert _long_run([stint], laps) == (94.3, 4)


def test_fewer_than_four_consecutive_flying_laps_is_not_a_long_run():
    stint, laps = _stint("HUL", 1, 1, [None, 95.7, 96.5, 95.9, None, None])
    assert _long_run([stint], laps) == (None, 0)
    short, short_laps = _stint("HUL", 2, 7, [None, 95.0, 95.1, 95.2])   # stint under MIN_LONG_RUN
    assert short.laps < MIN_LONG_RUN
    assert _long_run([short], short_laps) == (None, 0)


def test_the_longest_run_wins_and_ties_go_to_the_later_stint():
    early, el = _stint("PIA", 1, 1, [None, 95.0, 95.1, 95.2, 95.3, None])
    late, ll = _stint("PIA", 3, 20, [None, 99.0, 99.1, 99.2, 99.3, None])
    assert _long_run([early, late], el + ll) == (99.15, 4)
    longer, lg = _stint("PIA", 2, 10, [None, 97.0, 97.1, 97.2, 97.3, 97.4, None])
    assert _long_run([early, longer, late], el + lg + ll) == (97.2, 5)


def test_the_run_ceiling_is_relative_to_the_stint_not_the_session():
    # a heavy-fuel run at a slow track: 8% off the driver's own session best is fine
    quali, ql = _stint("HAM", 1, 1, [None, 90.0, None])
    race, rl = _stint("HAM", 2, 4, [None, 97.0, 97.3, 97.6, 97.9, 98.2, None])
    assert _long_run([quali, race], ql + rl) == (97.6, 5)
    assert RUN_RHYTHM * 97.0 > 98.2


def test_longest_consecutive_counts_lap_numbers_not_list_positions():
    laps = [Lap(driver="X", lap=n, lap_time=90.0) for n in (2, 3, 5, 6, 7, 9)]
    assert [l.lap for l in _longest_consecutive(laps)] == [5, 6, 7]
    assert _longest_consecutive([]) == []


# --- real sessions ------------------------------------------------------------

def _run_is_clean(session: RaceSession, driver: str, pace: float, n: int) -> bool:
    """Some stint of this driver has n consecutive flying laps, within RUN_RHYTHM of
    the stint's quickest lap, whose median is the published long-run pace."""
    for stint in (s for s in session.stints if s.driver == driver):
        flying = sorted((l for l in session.laps
                         if l.driver == driver and l.stint == stint.stint
                         and l.lap_time and not l.is_outlier), key=lambda l: l.lap)
        if not flying:
            continue
        ceiling = min(l.lap_time for l in flying) * RUN_RHYTHM
        run = _longest_consecutive([l for l in flying if l.lap_time <= ceiling])
        if len(run) == n and round(statistics.median(l.lap_time for l in run), 3) == pace:
            return max(l.lap_time for l in run) / min(l.lap_time for l in run) <= RUN_RHYTHM
    return False


def test_spanish_fp2_long_runs_are_race_runs():
    session = _session("practice_2026_spanish_fp2.json")
    summary = compute_practice(session)
    rows = {r.driver: r for r in summary.rows}
    # the race run, not the four qualifying laps between cool-downs
    assert (rows["LEC"].long_run_pace, rows["LEC"].long_run_laps) == (102.047, 7)
    assert (rows["ANT"].long_run_pace, rows["ANT"].long_run_laps) == (100.328, 6)
    # a driver whose only long stint alternated push and cool-down has no long run
    for code in ("PIA", "HUL", "ALO"):
        assert rows[code].long_run_pace is None and rows[code].long_run_laps == 0
    assert summary.best_long_run_driver == "RUS"
    for r in summary.rows:
        if r.long_run_pace is not None:
            assert _run_is_clean(session, r.driver, r.long_run_pace, r.long_run_laps), r.driver
    # the one-lap order is untouched by any of this
    assert summary.fastest_driver == "ANT"
    assert [r.best_lap_rank for r in summary.rows if r.best_lap_rank] == list(range(1, 22))


def test_hungarian_fp2_long_runs_are_race_runs():
    session = _session("practice_2026_hungarian_fp2.json")
    summary = compute_practice(session)
    rows = {r.driver: r for r in summary.rows}
    assert (rows["HUL"].long_run_pace, rows["HUL"].long_run_laps) == (85.374, 7)
    assert rows["BOT"].long_run_pace < 90 and rows["COL"].long_run_pace is None
    assert summary.best_long_run_driver == "ANT"
    for r in summary.rows:
        if r.long_run_pace is not None:
            assert _run_is_clean(session, r.driver, r.long_run_pace, r.long_run_laps), r.driver


def test_long_run_order_is_a_race_pace_order_on_both_sessions():
    """Every published long run sits within a race-pace band of the quickest one —
    no 1:35 'long run' beside 1:40 race simulations, no 1:46 beside 1:25s."""
    for fixture in ("practice_2026_spanish_fp2.json", "practice_2026_hungarian_fp2.json"):
        summary = compute_practice(_session(fixture))
        paces = sorted(r.long_run_pace for r in summary.rows if r.long_run_pace)
        assert paces and paces[-1] / paces[0] < 1.10, fixture
