"""The analysis engine must recover the strategy story from the data alone."""
from app.analysis.engine import analyze, compare_drivers
from app.mock.simulator import simulate


def _analyzed():
    s = simulate()
    strategy, pace = analyze(s)
    return s, strategy, pace


def test_pace_ranking_surfaces_true_speed():
    _, _, pace = _analyzed()
    by_code = {p.driver: p for p in pace}
    # VER (fastest base pace) should rank top after fuel/tyre correction
    assert by_code["VER"].pace_rank == 1
    # LEC has front-running pace but finished behind it -> "hidden pace"
    assert by_code["LEC"].pace_rank <= 3
    assert by_code["LEC"].finish > by_code["LEC"].pace_rank


def test_strategy_identifies_the_mistake():
    _, strategy, _ = _analyzed()
    assert strategy.winner == "VER"
    assert strategy.hidden_pace_driver == "LEC"
    assert strategy.worst_strategy and strategy.worst_strategy["driver"] == "LEC"
    # the extra-stop turning point must be attributed to LEC
    titles = " ".join(i.title for i in strategy.insights)
    assert "LEC" in titles


def test_vsc_cheap_stop_detected():
    _, strategy, _ = _analyzed()
    bpt = strategy.best_pit_timing
    assert bpt and "VSC" in bpt["kind"]
    assert bpt["saved_s"] > 5


def test_consistency_scores_bounded():
    _, _, pace = _analyzed()
    scores = [p.consistency_score for p in pace if p.consistency_score is not None]
    assert scores and all(0 <= x <= 100 for x in scores)


def test_compare_drivers():
    s = simulate()
    cmp = compare_drivers(s, "LEC", "NOR")
    assert "error" not in cmp
    assert cmp["lap_delta"] and "verdict" in cmp
    assert set(cmp["compound_sequence"]) == {"LEC", "NOR"}
