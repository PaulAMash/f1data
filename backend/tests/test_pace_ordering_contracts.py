"""What each session type's pace data is ordered by — the contract both clients read.

The website sorts nothing it does not have to: the practice timesheet is the
payload order (best lap), the qualifying board is classification position, and
race pace is `pace_rank`. The iPhone app decodes the same payload, so these
orders must hold in the data itself.
"""
import json
import os
from pathlib import Path

os.environ["PITWALL_IQ_MOCK_MODE"] = "true"

from app.adapters.mock_adapter import get_mock_session  # noqa: E402
from app.analysis.pace import compute_pace  # noqa: E402
from app.analysis.practice import compute_practice  # noqa: E402
from app.analysis.qualifying import compute_qualifying  # noqa: E402
from app.models import RaceSession  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def _practice_sessions():
    yield get_mock_session(2026, "Austrian Grand Prix", "Practice 1")
    yield get_mock_session(2026, "British Grand Prix", "Practice 3")
    for fixture in ("practice_2026_spanish_fp2.json", "practice_2026_hungarian_fp2.json"):
        yield RaceSession.model_validate(json.loads((FIXTURES / fixture).read_text()))


def test_practice_rows_are_served_fastest_lap_first_with_untimed_drivers_last():
    for session in _practice_sessions():
        rows = compute_practice(session).rows
        timed = [r for r in rows if r.best_lap]
        assert [r.best_lap_rank for r in timed] == list(range(1, len(timed) + 1))
        assert [r.best_lap for r in timed] == sorted(r.best_lap for r in timed)
        assert all(r.best_lap is None for r in rows[len(timed):])
        assert all(r.gap_to_fastest == 0.0 for r in timed[:1])
        assert all((r.gap_to_fastest or 0) >= 0 for r in timed)


def test_practice_long_run_is_a_separate_order_and_a_driver_without_one_is_unranked():
    for session in _practice_sessions():
        summary = compute_practice(session)
        longs = [r for r in summary.rows if r.long_run_pace]
        if not longs:
            continue
        best = min(longs, key=lambda r: r.long_run_pace)
        assert summary.best_long_run_driver == best.driver
        assert all(r.long_run_laps > 0 for r in longs)
        assert all(r.long_run_laps == 0 for r in summary.rows if r.long_run_pace is None)


def test_qualifying_rows_are_served_by_classification_position():
    for gp in ("Austrian Grand Prix", "British Grand Prix"):
        rows = compute_qualifying(get_mock_session(2026, gp, "Qualifying")).rows
        placed = [r for r in rows if r.position]
        assert [r.position for r in placed] == sorted(r.position for r in placed)
        assert all(r.position is None for r in rows[len(placed):])


def test_race_pace_rank_follows_clean_air_pace_and_skips_unevaluated_drivers():
    for gp, name in (("Austrian Grand Prix", "Race"), ("British Grand Prix", "Race")):
        pace = compute_pace(get_mock_session(2026, gp, name))
        ranked = [p for p in pace if p.pace_rank]
        assert ranked and all(p.pace_evaluated and p.clean_air_pace for p in ranked)
        by_rank = sorted(ranked, key=lambda p: p.pace_rank)
        assert [p.pace_rank for p in by_rank] == list(range(1, len(by_rank) + 1))
        assert [p.clean_air_pace for p in by_rank] == sorted(p.clean_air_pace for p in by_rank)
        assert all(p.pace_rank is None for p in pace if not p.pace_evaluated)
