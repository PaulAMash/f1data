"""Natural-language Q&A + API surface (all in mock mode, no network)."""
import os
import re

os.environ["PITWALL_IQ_MOCK_MODE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.analysis.engine import analyze  # noqa: E402
from app.analysis.qa import QAContext, answer_question  # noqa: E402
from app.adapters.pitwall_adapter import _time_str_to_sec, _compound  # noqa: E402
from app.main import app  # noqa: E402
from app.mock.simulator import simulate  # noqa: E402
from app.models import Compound  # noqa: E402

client = TestClient(app)


def _ctx():
    s = simulate()
    strategy, pace = analyze(s)
    return QAContext(session=s, strategy=strategy, pace=pace)


def test_normalization_helpers():
    assert _time_str_to_sec("1:07.234") == 67.234
    assert _time_str_to_sec("63.5") == 63.5
    assert _time_str_to_sec("") is None
    assert _compound("soft") == Compound.SOFT
    assert _compound("S") == Compound.SOFT
    assert _compound(None) == Compound.UNKNOWN


def test_qa_intents():
    ctx = _ctx()
    assert answer_question("Why did LEC lose so many places?", ctx).kind == "why_lost"
    assert answer_question("Who had the best race pace?", ctx).kind == "best_pace"
    assert answer_question("Who benefited most from the VSC?", ctx).kind == "vsc"
    assert answer_question("Which driver lost the most time in the pits?", ctx).kind == "pit_loss"
    assert answer_question("Compare Ferrari and Red Bull strategy", ctx).kind == "compare_teams"
    assert answer_question("Who won?", ctx).kind == "winner"


def test_qa_never_dead_ends():
    """Even an unanswerable question gets a best-effort answer, not a dead-end."""
    ctx = _ctx()
    a = answer_question("What was the tyre pressure for ZZZ?", ctx)
    assert a.answer and len(a.answer) > 20        # always says something useful
    assert a.kind in ("overview", "missing")      # best-effort, not a hard fail
    assert a.follow_ups                            # always offers next steps


def test_qa_overtake_and_practice():
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    # overtake question resolves fuzzy names and answers
    ctx = _ctx()
    a = answer_question("how did george overtake verstappen last minute", ctx)
    assert a.kind == "overtake"
    assert "RUS" in a.entities.get("drivers", []) and "VER" in a.entities.get("drivers", [])
    # practice question routes to practice logic
    fp = get_mock_session(2026, "Austrian Grand Prix", "Practice 2")
    strat, pace = analyze(fp)
    pctx = QAContext(session=fp, strategy=strat, pace=pace)
    ans = answer_question("who was fastest in practice?", pctx)
    assert ans.kind in ("practice_fastest", "fastest")


def test_qa_simple_mode():
    ctx = _ctx()
    a = answer_question("why did leclerc lose places?", ctx, simple=True)
    assert a.simple
    # a genuine rewrite: full name instead of the TLA, no "P4"-style notation,
    # and short (understanding over completeness)
    assert "Leclerc" in a.answer and "LEC" not in a.answer
    assert not re.search(r"\bP\d+\b", a.answer)
    assert len(re.split(r"(?<=[.!?])\s+", a.answer.strip())) <= 3
    assert a.beginner_summary


def test_api_session_and_ask():
    r = client.get("/api/session", params={"year": 2026, "gp": "Austrian Grand Prix", "mock": True})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "mock"
    assert body["strategy"]["winner"] == "VER"
    assert len(body["pace"]) == 16

    a = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix",
                                      "question": "who had the best race pace?", "mock": True})
    assert a.status_code == 200
    assert "VER" in a.json()["answer"]


def test_api_simulate_and_compare():
    sim = client.post("/api/simulate", json={"year": 2026, "gp": "Austrian Grand Prix",
                                             "driver": "LEC", "num_stops": 2, "mock": True})
    assert sim.status_code == 200
    assert sim.json()["is_estimate"] is True

    cmp = client.get("/api/compare", params={"year": 2026, "gp": "Austrian Grand Prix",
                                             "a": "VER", "b": "LEC", "mock": True})
    assert cmp.status_code == 200
    assert "verdict" in cmp.json()


def test_qa_answers_everyday_questions():
    """Podium / top-N / position / biggest-loss questions get direct answers."""
    ctx = _ctx()
    a = answer_question("who was on the podium?", ctx)
    assert a.kind == "results" and a.confidence == "high"
    assert "P1" in a.answer and "P3" in a.answer

    a = answer_question("who was top 5?", ctx)
    assert a.kind == "results" and "P5" in a.answer

    a = answer_question("who came 4th?", ctx)
    assert a.kind == "results" and "P4" in a.answer

    a = answer_question("what were the results?", ctx)
    assert a.kind == "results"

    # "had" must not resolve to a driver code (HAD = Hadjar-style collisions)
    a = answer_question("who had the biggest loss?", ctx)
    assert a.kind == "loser"
    # and no fallback should ever demand "a more specific question"
    assert "more specific question" not in " ".join(a.missing_data)


# --------------------------------------------------------------------------- #
# Archive coverage — the landing page's statistics
# --------------------------------------------------------------------------- #
def test_archive_scale_is_derived_not_asserted():
    """Every figure on the landing band has to come out of the table."""
    from datetime import date
    from app.archive_scale import archive_scale, RACES_PER_SEASON

    s = archive_scale(date(2026, 8, 1))
    assert s["first_season"] == 1950
    assert s["season"] == 2026
    # inclusive of the season in progress
    assert s["seasons"] == 77
    # and the race count must stop at the last COMPLETE season, so the page can
    # never claim a Grand Prix that has not been run
    assert s["races"] == sum(n for y, n in RACES_PER_SEASON.items() if y <= 2025)
    assert s["through"] == 2025
    assert s["season_races"] == RACES_PER_SEASON[2026]


def test_archive_scale_rolls_over_with_the_calendar():
    """The whole point is that it is not a literal — it has to move on its own."""
    from datetime import date
    from app.archive_scale import archive_scale

    a = archive_scale(date(2026, 12, 31))
    b = archive_scale(date(2027, 1, 1))
    assert b["seasons"] == a["seasons"] + 1
    assert b["races"] > a["races"]


def test_archive_scale_route():
    r = client.get("/api/archive/scale")
    assert r.status_code == 200
    body = r.json()
    assert body["first_season"] == 1950
    assert body["races"] > 1000


# --------------------------------------------------------------------------- #
# A race that has not been run is never offered
# --------------------------------------------------------------------------- #
def test_calendar_completion_follows_the_schedule_not_the_calendar_day():
    """`completed` means the event has been RUN — its final scheduled session
    started long enough ago to have finished. It must never mean "the first
    session's day has arrived", which is what stamped a Friday-morning Grand
    Prix as done and sent every client on to the following race."""
    from datetime import date, datetime, timezone
    from app.service import EVENT_RUN_WINDOW, get_grands_prix, last_session_start

    gps, _ = get_grands_prix(date.today().year)
    assert gps, "the current season should have a calendar"
    now = datetime.now(timezone.utc)
    for g in gps:
        last = last_session_start(g)
        if last is not None:
            assert g.completed == (now >= last + EVENT_RUN_WINDOW), g.name
    assert any(g.completed for g in gps)


def _event(**overrides):
    from app.models import GrandPrix
    base = dict(
        name="Italian Grand Prix", location="Monza",
        date="2026-09-04T10:30:00+00:00",
        sessions=["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"],
        session_times={
            "Practice 1": "2026-09-04T10:30:00+00:00",
            "Practice 2": "2026-09-04T14:00:00+00:00",
            "Practice 3": "2026-09-05T10:30:00+00:00",
            "Qualifying": "2026-09-05T14:00:00+00:00",
            "Race": "2026-09-06T13:00:00+00:00",
        })
    base.update(overrides)
    return GrandPrix(**base)


def _at(iso: str):
    from datetime import datetime
    return datetime.fromisoformat(iso)


def test_a_grand_prix_is_not_completed_on_the_morning_of_its_first_session():
    """THE REGRESSION. 00:56 UTC on Practice 1's day: nothing has run."""
    from app.service import event_completed
    assert event_completed(_event(), now=_at("2026-09-04T00:56:00+00:00")) is False


def test_a_weekend_in_progress_is_not_completed():
    from app.service import event_completed
    g = _event()
    assert event_completed(g, now=_at("2026-09-04T12:00:00+00:00")) is False, "after P1"
    assert event_completed(g, now=_at("2026-09-05T15:30:00+00:00")) is False, "after quali"
    assert event_completed(g, now=_at("2026-09-06T12:59:59+00:00")) is False, "before the race"


def test_a_race_that_has_started_is_in_progress_not_completed():
    from app.service import event_completed
    g = _event()
    assert event_completed(g, now=_at("2026-09-06T13:00:01+00:00")) is False
    assert event_completed(g, now=_at("2026-09-06T15:59:59+00:00")) is False


def test_a_grand_prix_is_completed_once_its_last_session_has_had_time_to_finish():
    from app.service import event_completed
    g = _event()
    assert event_completed(g, now=_at("2026-09-06T16:00:00+00:00")) is True
    assert event_completed(g, now=_at("2026-09-07T09:00:00+00:00")) is True


def test_completion_is_decided_on_instants_not_local_days():
    """The same instant expressed in another zone gives the same answer, and a
    session that crosses a UTC midnight is judged by its time, not its day."""
    from app.service import event_completed
    g = _event(session_times={"Race": "2026-09-06T23:30:00+00:00"},
               date="2026-09-06T23:30:00+00:00")
    # 01:00 UTC on the 7th — 21:00 the evening before in New York; race 1.5h old.
    assert event_completed(g, now=_at("2026-09-07T01:00:00+00:00")) is False
    assert event_completed(g, now=_at("2026-09-06T21:00:00-04:00")) is False
    assert event_completed(g, now=_at("2026-09-07T02:30:00+00:00")) is True
    assert event_completed(g, now=_at("2026-09-07T11:30:00+09:00")) is True


def test_a_naive_schedule_time_is_read_as_utc():
    from app.service import event_completed
    g = _event(session_times={"Race": "2026-09-06T13:00:00"})
    assert event_completed(g, now=_at("2026-09-06T15:59:00+00:00")) is False
    assert event_completed(g, now=_at("2026-09-06T16:01:00+00:00")) is True


def test_without_a_schedule_a_race_day_is_run_once_the_day_is_over():
    """Historical sources give the race *day* and nothing else."""
    from app.service import event_completed
    g = _event(date="1988-04-03", session_times={}, sessions=["Race"])
    assert event_completed(g, now=_at("1988-04-03T23:00:00+00:00")) is False
    assert event_completed(g, now=_at("1988-04-04T00:00:01+00:00")) is True


def test_without_a_schedule_a_start_instant_spans_the_weekend():
    from app.service import event_completed
    g = _event(session_times={})
    assert event_completed(g, now=_at("2026-09-06T14:00:00+00:00")) is False
    assert event_completed(g, now=_at("2026-09-07T10:30:00+00:00")) is True


def test_an_undated_event_is_history():
    from app.service import event_completed
    assert event_completed(_event(date=None, session_times={})) is True


def test_current_opens_on_the_last_event_that_has_actually_been_run(monkeypatch):
    """On the morning of Italian Practice 1 the pointer must be the Dutch race —
    never Italy, and never Spain. And once the Italian race is run, Italy."""
    from app import service
    from app.models import DataSource

    def calendar():
        return [
            _event(name="Dutch Grand Prix", date="2026-08-21T10:30:00+00:00",
                   session_times={"Practice 1": "2026-08-21T10:30:00+00:00",
                                  "Race": "2026-08-23T13:00:00+00:00"}),
            _event(),
            _event(name="Spanish Grand Prix", date="2026-09-11T11:30:00+00:00",
                   session_times={"Practice 1": "2026-09-11T11:30:00+00:00",
                                  "Race": "2026-09-13T13:00:00+00:00"}),
        ]

    monkeypatch.setattr(service.dsm, "get_grands_prix",
                        lambda year: (calendar(), DataSource.LIVE) if year == 2026
                        else ([], DataSource.LIVE))

    cur = service.get_current(now=_at("2026-09-04T00:56:00+00:00"))
    assert (cur["year"], cur["gp"], cur["session"]) == (2026, "Dutch Grand Prix", "Race")

    cur = service.get_current(now=_at("2026-09-06T14:00:00+00:00"))
    assert cur["gp"] == "Dutch Grand Prix", "a race in progress is not yet the latest run race"

    cur = service.get_current(now=_at("2026-09-06T16:30:00+00:00"))
    assert cur["gp"] == "Italian Grand Prix"


def test_finished_seasons_are_entirely_complete():
    from datetime import date
    from app.service import get_grands_prix

    gps, _ = get_grands_prix(date.today().year - 1)
    assert gps and all(g.completed for g in gps)


def test_races_route_exposes_completion():
    from datetime import date

    r = client.get(f"/api/seasons/{date.today().year}/races")
    assert r.status_code == 200
    races = r.json()["races"]
    assert races and all("completed" in g for g in races)


def test_current_never_opens_on_an_unrun_race():
    from app.service import get_current, get_grands_prix

    cur = get_current()
    gps, _ = get_grands_prix(cur["year"])
    match = next((g for g in gps if g.name == cur["gp"]), None)
    assert match is not None and match.completed


# --------------------------------------------------------------------------- #
# The featured race — one true fact for the landing page
# --------------------------------------------------------------------------- #
def test_featured_returns_a_headline_not_a_payload():
    r = client.get("/api/featured")
    assert r.status_code == 200
    d = r.json()
    assert d["available"] is True
    assert d["winner"]["code"] and d["winner"]["team_color"].startswith("#")
    assert d["story"], "the landing card is built around this sentence"
    assert d["laps"] > 0 and d["entries"] >= d["finishers"]
    # it is a summary: no laps array, no classification, no telemetry
    assert not any(k in d for k in ("laps_data", "classification", "session"))


def test_featured_is_never_a_race_that_has_not_run():
    from app.service import get_grands_prix

    d = client.get("/api/featured").json()
    gps, _ = get_grands_prix(d["year"])
    match = next((g for g in gps if g.name == d["gp"]), None)
    assert match is not None and match.completed
