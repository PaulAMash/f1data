"""Natural-language Q&A + API surface (all in mock mode, no network)."""
import os

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


def test_qa_reports_missing_data():
    ctx = _ctx()
    a = answer_question("What was the tyre pressure for ZZZ?", ctx)
    assert a.kind in ("fallback", "missing")
    assert a.missing_data


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
