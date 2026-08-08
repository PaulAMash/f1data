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


# --------------------------------------------------------------------------- #
# Pace ranking is contiguous for the drivers who actually show one (V81)
# --------------------------------------------------------------------------- #
def test_pace_rank_is_contiguous_for_every_driver_that_displays_one():
    """A retirement used to take a number out of the sequence and then render
    as "—", so the leaderboard read 1, 2, 4, 5 with 3 shown nowhere."""
    from app.analysis.pace import _mark_unevaluable, _rank_and_score
    from app.models import ClassificationRow, DriverPaceSummary

    def summary(code, pace, laps=20):
        return DriverPaceSummary(driver=code, name=code, team="T", team_color="#fff",
                                 clean_air_pace=pace, representative_laps=laps)

    def row(code, retired=False, status="Finished"):
        return ClassificationRow(driver=code, name=code, team="T",
                                 retired=retired, status=status)

    summaries = [summary("VER", 90.0), summary("LEC", 90.5),
                 summary("HAM", 91.0), summary("SAI", 91.5)]
    cls = {"VER": row("VER"), "LEC": row("LEC", retired=True, status="DNF"),
           "HAM": row("HAM"), "SAI": row("SAI")}

    _mark_unevaluable(summaries, cls)
    _rank_and_score(summaries)

    shown = sorted(s.pace_rank for s in summaries if s.pace_evaluated and s.pace_rank)
    assert shown == list(range(1, len(shown) + 1)), f"sequence has holes: {shown}"
    # the retirement is unranked rather than holding a hidden number
    lec = next(s for s in summaries if s.driver == "LEC")
    assert lec.pace_evaluated is False and lec.pace_rank is None


def test_pace_rank_still_orders_by_clean_air_pace():
    """The methodology must not change: it is still true car speed, not
    finishing order, for everyone who is ranked."""
    from app.analysis.pace import _mark_unevaluable, _rank_and_score
    from app.models import ClassificationRow, DriverPaceSummary

    summaries = [
        DriverPaceSummary(driver="SLOW", name="SLOW", team="T", team_color="#fff",
                          clean_air_pace=92.0, representative_laps=20),
        DriverPaceSummary(driver="FAST", name="FAST", team="T", team_color="#fff",
                          clean_air_pace=90.0, representative_laps=20),
    ]
    cls = {c: ClassificationRow(driver=c, name=c, team="T", retired=False,
                                status="Finished") for c in ("SLOW", "FAST")}
    _mark_unevaluable(summaries, cls)
    _rank_and_score(summaries)
    assert next(s for s in summaries if s.driver == "FAST").pace_rank == 1
    assert next(s for s in summaries if s.driver == "SLOW").pace_rank == 2


def test_too_few_clean_laps_is_unranked_rather_than_holding_a_number():
    from app.analysis.pace import _mark_unevaluable, _rank_and_score, MIN_REPRESENTATIVE_LAPS
    from app.models import ClassificationRow, DriverPaceSummary

    summaries = [
        DriverPaceSummary(driver="OK", name="OK", team="T", team_color="#fff",
                          clean_air_pace=90.0, representative_laps=20),
        DriverPaceSummary(driver="THIN", name="THIN", team="T", team_color="#fff",
                          clean_air_pace=89.0,
                          representative_laps=max(0, MIN_REPRESENTATIVE_LAPS - 1)),
    ]
    cls = {c: ClassificationRow(driver=c, name=c, team="T", retired=False,
                                status="Finished") for c in ("OK", "THIN")}
    _mark_unevaluable(summaries, cls)
    _rank_and_score(summaries)
    assert next(s for s in summaries if s.driver == "OK").pace_rank == 1
    assert next(s for s in summaries if s.driver == "THIN").pace_rank is None
