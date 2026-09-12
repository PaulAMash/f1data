"""THE WHOLE 2026 SEASON THROUGH THE REAL PIPELINE — the class, not the example.

Bahrain was the weekend that was noticed. The defect behind it (the OpenF1
adapter raising on every lap table — tests/test_openf1_primary.py) affected
every session of every weekend, and the fallbacks that quietly stood in for the
primary had wrong-session holes of their own. So the guarantee is stated for the
season: every session of every weekend format loads from the primary under its
own name; an event the sources do not carry is refused, never answered with a
neighbour's data; and a session type a source cannot represent is not served
from it under a borrowed title.

Runs over tests/world_2026.py: 24 rounds in both weekend formats, three
pre-season tests, OpenF1's duplicate "Bahrain Grand Prix" placeholder and two
rounds in one country, with the real adapters, merge, chain and API.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.adapters import jolpica_adapter
from app.main import app
from tests.world_2026 import NORMAL, ROUNDS, SPRINT, YEAR, world_2026  # noqa: F401  (fixture)

client = TestClient(app)
ROUND_NAMES = {r[1] for r in ROUNDS}
SPRINT_ROUNDS = {r[1] for r in ROUNDS if r[8] is SPRINT}


def _session(gp: str, name: str):
    return client.get("/api/session", params={"year": YEAR, "gp": gp, "session": name})


# --------------------------------------------------------------------------- #
# 1. Every weekend, every format, from the primary
# --------------------------------------------------------------------------- #
def test_the_calendar_names_every_event_once_and_keeps_the_real_bahrain_plain(world_2026):
    races = client.get(f"/api/seasons/{YEAR}/races").json()["races"]
    names = [g["name"] for g in races]
    assert len(names) == len(set(names)), [n for n in names if names.count(n) > 1]
    assert ROUND_NAMES <= set(names)
    april = next(g for g in races if g["name"] == "Bahrain Grand Prix")
    assert april["round"] == 4 and april["location"] == "Sakhir"
    # the placeholder that shares the short name is a separate event under its own
    assert "Bahrain Grand Prix in Malaysia" in names
    # pre-season tests at Sakhir and Barcelona are not rounds
    assert not any("Testing" in n for n in names)


def test_every_session_of_every_2026_weekend_loads_from_the_primary_under_its_own_name(world_2026):
    races = client.get(f"/api/seasons/{YEAR}/races").json()["races"]
    loaded = 0
    for g in races:
        if g["name"] not in ROUND_NAMES:
            continue
        offered = client.get("/api/sessions/available", params={"year": YEAR, "gp": g["name"]}).json()
        expected = SPRINT if g["name"] in SPRINT_ROUNDS else NORMAL
        assert offered["sessions"] == expected, (g["name"], offered["sessions"])
        for name in offered["sessions"]:
            r = _session(g["name"], name)
            assert r.status_code == 200, (g["name"], name, r.text[:300])
            body = r.json()
            s = body["session"]
            assert (s["year"], s["grand_prix"], s["session_type"]) == (YEAR, g["name"], name)
            assert s["complete"] is True and body["source"] == "live", (g["name"], name, s["source_report"]["missing"])
            sources = {f["facet"]: f["source"] for f in s["source_report"]["facets"]}
            assert sources["drivers"] == "openf1" and sources["results"] == "openf1", (g["name"], name, sources)
            if s["category"] in ("race", "sprint"):
                assert sources["laps"] == "openf1" and sources["positions"] == "openf1"
            loaded += 1
    assert loaded == len(ROUNDS) * 5


# --------------------------------------------------------------------------- #
# 2. Wrong-session protection: refused, never redirected
# --------------------------------------------------------------------------- #
def test_the_placeholder_meeting_is_never_answered_with_another_rounds_data(world_2026):
    """OpenF1 carries a second "Bahrain Grand Prix" — a placeholder with sessions
    and no data. Before V108 its Race came back complete, wearing April's laps
    and classification from the results archive's best-word-score fallback."""
    for name in ("Practice 1", "Qualifying", "Race"):
        r = _session("Bahrain Grand Prix in Malaysia", name)
        assert r.status_code in (200, 503), r.text[:300]
        if r.status_code == 200:
            s = r.json()["session"]
            assert s["grand_prix"] == "Bahrain Grand Prix in Malaysia"
            assert s["complete"] is False and s["laps"] == [] and s["classification"] == [], name


def test_the_results_archive_refuses_a_name_it_does_not_carry(monkeypatch):
    races = [
        {"round": "4", "raceName": "Bahrain Grand Prix",
         "Circuit": {"circuitName": "Bahrain International Circuit",
                     "Location": {"locality": "Sakhir", "country": "Bahrain"}}},
        {"round": "18", "raceName": "Singapore Grand Prix",
         "Circuit": {"circuitName": "Marina Bay Street Circuit",
                     "Location": {"locality": "Marina Bay", "country": "Singapore"}}},
        {"round": "21", "raceName": "São Paulo Grand Prix",
         "Circuit": {"circuitName": "Autódromo José Carlos Pace",
                     "Location": {"locality": "São Paulo", "country": "Brazil"}}},
    ]
    monkeypatch.setattr(jolpica_adapter, "_races", lambda *a, **k: races)
    resolve = jolpica_adapter._resolve_round
    assert resolve(YEAR, "Bahrain Grand Prix")[0] == 4
    assert resolve(YEAR, "Bahrain Grand Prix (Sakhir)")[0] == 4, "a location suffix names the same round"
    assert resolve(YEAR, "Sakhir")[0] == 4
    assert resolve(YEAR, "Sao Paulo Grand Prix")[0] == 21, "accents never tell two events apart"
    assert resolve(YEAR, "Bahrain Grand Prix in Malaysia") == (None, None), \
        "one shared word is not a round: April must not answer for Sepang"
    assert resolve(YEAR, "Malaysian Grand Prix") == (None, None)


def test_a_bahrain_no_source_can_answer_is_refused_not_redirected_and_not_cached(world_2026):
    world_2026.openf1_missing_meetings = {"Bahrain Grand Prix"}
    world_2026.jolpica_missing_rounds = {4}
    from app.config import get_settings
    for name in ("Practice 1", "Qualifying", "Race"):
        r = _session("Bahrain Grand Prix", name)
        assert r.status_code == 503, (name, r.text[:300])
        body = r.json()
        assert body["error"] == "data_unavailable" and body["reason"] == "no_source_coverage"
        assert "Bahrain Grand Prix 2026" in body["message"]
        assert {a["source"] for a in body["attempts"]} == {"openf1", "f1-archive", "jolpica"}
        assert all(a["category"] == "not_available" for a in body["attempts"]), body["attempts"]
    assert not list(get_settings().cache_dir.glob("*bahrain*")), "a refusal leaves nothing in the cache"
    # the neighbouring round is untouched by Bahrain's absence
    assert _session("Saudi Arabian Grand Prix", "Race").json()["session"]["grand_prix"] == "Saudi Arabian Grand Prix"


@pytest.mark.parametrize("name", ["Sprint", "Sprint Qualifying"])
def test_a_session_the_weekend_does_not_have_is_not_answered_with_the_race(world_2026, name):
    """Bahrain has no sprint. Before V108, once the primary had nothing, the
    results archive served the Grand Prix's classification and laps under the
    sprint's title."""
    r = _session("Bahrain Grand Prix", name)
    assert r.status_code == 503, r.text[:300]
    assert r.json()["reason"] == "no_source_coverage"


def test_the_results_archive_never_serves_a_practice_or_sprint_as_the_race(world_2026):
    """The fallback that covered for the dead primary answered "Practice 1" with
    the race's results. With OpenF1 out for one weekend, that is what a reader
    would have been shown — labelled as practice."""
    world_2026.openf1_missing_meetings = {"Bahrain Grand Prix"}
    r = _session("Bahrain Grand Prix", "Practice 1")
    assert r.status_code == 503 and r.json()["reason"] == "no_source_coverage"
    # the race itself is still covered by the archive, honestly labelled partial
    race = _session("Bahrain Grand Prix", "Race")
    assert race.status_code == 200
    s = race.json()["session"]
    assert s["grand_prix"] == "Bahrain Grand Prix" and s["complete"] is True
    assert {f["facet"]: f["source"] for f in s["source_report"]["facets"]}["results"] == "jolpica"
