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


def test_winner_gap_never_absurd():
    """P1 shows no gap; a leaked cumulative-time gap is dropped, not displayed."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import fix_classification
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    # inject a garbage gap on the leader + an absurd gap on P2
    s.classification[0].gap = "+5197.979s"
    s.classification[1].gap = "+9999.0s"
    fix_classification(s)
    p1 = next(c for c in s.classification if c.position == 1)
    p2 = next(c for c in s.classification if c.position == 2)
    assert p1.gap is None                 # winner never shows a +seconds gap
    assert p2.gap is None                 # absurd value dropped


def test_no_zero_stop_claim_without_pit_data():
    """A race with no pit records must not be flagged reliable or claim 0 stops."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    s.pit_stops = []                      # simulate a source with no pit data
    strategy, _pace = analyze(s)          # runs normalize_session
    assert s.pit_data_reliable is False
    assert all(c.pit_stops == 0 for c in s.classification)
    assert not any("-stop race" in line for line in strategy.story)


def test_austrian_never_matches_australian():
    """Strict meeting matching: 'Austrian' must not resolve to the Australian GP."""
    from app.adapters.openf1_adapter import _name_tokens, is_testing_event
    want = _name_tokens("Austrian Grand Prix")
    australian_blob = _name_tokens("Australian Grand Prix Melbourne Australia Albert Park")
    austrian_blob = _name_tokens("Austrian Grand Prix Spielberg Austria Red Bull Ring")
    assert not (want <= australian_blob)     # the old fuzzy bug
    assert want <= austrian_blob
    # testing meetings are filtered from the calendar
    assert is_testing_event("Pre-Season Testing")
    assert is_testing_event("Pre Season Test")
    assert not is_testing_event("British Grand Prix")


def test_source_report_facets_never_duplicate():
    """Facet fallback replaces the row instead of appending a duplicate."""
    from app.adapters.data_source_manager import _set_facet
    from app.adapters.mock_adapter import get_mock_session
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert s.source_report is not None
    s.source_report.missing = ["results"]
    _set_facet(s, "results", "none", "low")
    _set_facet(s, "results", "jolpica", "high")   # fallback filled it
    rows = [f for f in s.source_report.facets if f.facet == "results"]
    assert len(rows) == 1 and rows[0].source == "jolpica"
    assert "results" not in s.source_report.missing


def test_headshot_enrich_fills_missing(monkeypatch):
    from app.adapters import headshots
    from app.adapters.mock_adapter import get_mock_session
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert all(not d.headshot_url for d in s.drivers)
    monkeypatch.setattr(headshots, "year_map",
                        lambda year: {d.code: f"https://img/{d.code}.png" for d in s.drivers})
    assert headshots.enrich(s) is True
    assert all(d.headshot_url for d in s.drivers)


def test_ask_why_lost_is_not_circular():
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix", "session": "Race",
                                      "question": "why did charles lose so many positions?", "mock": True}).json()
    a = (r["short_answer"] or "") + " ".join(r.get("evidence", []))
    # must explain a mechanism / evidence, not just restate the position drop
    assert any(k in a.lower() for k in ("pit", "traffic", "pace", "undercut", "neutral", "strategy"))


def test_team_colors_filled_from_official_map():
    """Generic grey team colours are replaced with official ones by name."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import fill_team_colors
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    fer = next(d for d in s.drivers if "ferrari" in d.team.lower())
    fer.team_color = "#888888"
    row = next(c for c in s.classification if "mclaren" in c.team.lower())
    row.team_color = "#888888"
    fill_team_colors(s)
    assert fer.team_color == "#E8002D"          # Ferrari red
    assert row.team_color == "#FF8000"          # McLaren papaya


def test_window_cause_attribution():
    """A VSC window is attributed to the driver named by race control, or to a
    retirement at the window start."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import attach_window_causes
    from app.models import RaceControlEvent

    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert s.track_status_windows, "mock race should have a VSC window"
    w = s.track_status_windows[0]
    victim = s.drivers[5]
    s.race_control.append(RaceControlEvent(
        lap=w.start_lap, category="Flag",
        message=f"FIA STEWARDS: CAR {victim.number} ({victim.code}) STOPPED ON TRACK"))
    attach_window_causes(s)
    assert w.cause and victim.name in w.cause and "stopped" in w.cause

    # fallback path: no message naming a car, but a retirement at the start
    s2 = get_mock_session(2026, "Austrian Grand Prix", "Race")
    w2 = s2.track_status_windows[0]
    s2.race_control = []
    ret = s2.classification[-1]
    ret.retired = True
    ret.retirement_reason = "Hydraulics"
    ret.laps_completed = w2.start_lap
    attach_window_causes(s2)
    assert w2.cause and ret.name in w2.cause and "hydraulics" in w2.cause


def test_qualifying_summary():
    """The Saturday experience: pole, margins, segments, and no race language."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.qualifying import compute_qualifying

    s = get_mock_session(2026, "Austrian Grand Prix", "Qualifying")
    assert s.category == "qualifying"
    q = compute_qualifying(s)

    assert q.pole_driver and q.pole_lap and q.pole_margin is not None
    assert q.closest_pair and q.closest_pair["delta"] >= 0
    assert q.segment_bests.get("Q1") and q.segment_bests.get("Q3")
    # knockout mapping: the last five classified went out in Q1
    field = len(q.rows)
    q1_out = [r for r in q.rows if r.knocked_out_in == "Q1"]
    assert len(q1_out) == 5 and all(r.position > field - 5 for r in q1_out)
    # the story is about Saturday, never a finished Grand Prix
    text = " ".join(q.story).lower()
    assert "pole" in text
    assert "won the race" not in text and "chequered flag" not in text
    assert any("nothing is won yet" in line.lower() for line in q.story)
