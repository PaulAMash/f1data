"""Website-only hardening: no silent mock fallback, structured Ask, historical."""
import os

from fastapi.testclient import TestClient

from app.adapters.data_source_manager import DataUnavailableError, load_session
from app.main import app

client = TestClient(app)


class _RealOnlySettings:
    """Settings as a real, live-disabled deployment would see them."""
    mock_mode = False
    enable_live_fetch = False


def test_no_silent_mock_when_live_disabled(monkeypatch):
    """With live disabled and mock off, we raise an honest error — not demo data."""
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnlySettings())
    try:
        load_session(2024, "Bahrain", "Race")
        assert False, "expected DataUnavailableError, got a (probably mock) session"
    except DataUnavailableError as e:
        payload = e.to_payload()
        assert payload["error"] == "data_unavailable"
        assert payload["attempts"] and payload["retryable"] is False


def test_session_endpoint_returns_503_not_fake(monkeypatch):
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnlySettings())
    r = client.get("/api/session", params={"year": 2024, "gp": "Bahrain", "session": "Race"})
    assert r.status_code == 503
    assert r.json()["error"] == "data_unavailable"


def test_ask_has_structured_fields():
    # mock=True forces the demo fixture regardless of env — the backend keeps this
    # param for tests only; it is not a user-facing path.
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix", "session": "Race",
                                      "question": "who had the best race pace?", "mock": True}).json()
    assert r["answer_title"] and r["short_answer"]
    assert r["analysis_steps"]           # thinking steps for the UI
    assert r["beginner_summary"]
    assert isinstance(r["evidence"], list)


def test_historical_results_never_fabricates_practice():
    # practice is not offered by the historical source → honest unavailable, never fake rows
    r = client.get("/api/historical/results",
                   params={"year": 2023, "event": "Bahrain", "session": "Practice 1"}).json()
    assert r.get("available") is False
    assert not r.get("rows")
