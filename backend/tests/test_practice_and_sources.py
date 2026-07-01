"""Practice analysis, pit-stop service, and source reporting."""
import os

os.environ["PITWALL_IQ_MOCK_MODE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.adapters import pitstop_service  # noqa: E402
from app.adapters.mock_adapter import get_mock_session  # noqa: E402
from app.analysis.practice import compute_practice  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PitStop  # noqa: E402

client = TestClient(app)


def test_practice_session_is_not_a_race():
    s = get_mock_session(2026, "Austrian Grand Prix", "Practice 2")
    assert s.category == "practice"
    # practice has NO fake DNFs and no race finishing positions logic
    assert not any(c.retired for c in s.classification)
    pr = compute_practice(s)
    assert pr.fastest_driver and pr.fastest_lap
    assert pr.rows and pr.rows[0].best_lap_rank == 1
    # at least one driver should have a readable long run
    assert any(r.long_run_pace for r in pr.rows)


def test_pitstop_service_labels():
    # measured stationary -> "Stop x.xs"
    p1 = PitStop(driver="VER", lap=25, stationary_time=2.4)
    pitstop_service._finalize(p1)
    assert pitstop_service.label(p1)["kind"] == "measured"
    # only lane time -> derives an estimate, labelled low confidence
    p2 = PitStop(driver="NOR", lap=24, pit_lane_time=21.5)
    pitstop_service._finalize(p2)
    assert p2.estimated_stationary_time and p2.confidence == "low"
    assert pitstop_service.label(p2)["kind"] == "estimated"
    # nothing -> unknown, but no crash / no scary text
    p3 = PitStop(driver="HAM", lap=30)
    pitstop_service._finalize(p3)
    assert pitstop_service.label(p3)["kind"] == "unknown"


def test_source_report_present_and_labelled():
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert s.source_report is not None
    assert s.source_report.data_source.value == "mock"
    r = client.get("/api/session/source-report",
                   params={"year": 2026, "gp": "Austrian Grand Prix", "session": "Race", "mock": True})
    assert r.status_code == 200
    body = r.json()
    assert body["report"] and body["counts"]["laps"] > 0


def test_practice_bundle_endpoint():
    r = client.get("/api/session", params={"year": 2026, "gp": "Austrian Grand Prix",
                                           "session": "Practice 1", "mock": True})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "practice"
    assert body["practice"] and body["practice"]["fastest_driver"]


def test_data_sources_health_endpoint():
    r = client.get("/api/health/data-sources")
    assert r.status_code == 200
    names = {p["name"] for p in r.json()["probes"]}
    assert {"openf1", "jolpica", "fastf1", "cache"} <= names
