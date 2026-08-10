"""V85: what a season change costs upstream, and what a throttled source does to it.

Two failures shipped together and they had one shape between them: the backend
asked an external source the same question over and over, and the frontend was
handed a body whose type changed when that source said no.

  * Jolpica allows four requests a second and five hundred an hour, per IP —
    which on Render is per DEPLOYMENT. One season change on the Seasons page
    cost NINE requests, three of them the identical calendar URL.
  * When the source refused, `/api/historical/sessions` answered HTTP 200 with
    `available: false` where the caller's contract says `string[]`.

These tests pin both, plus the retry/coalescing behaviour that keeps a 429 from
becoming an outage.
"""
from __future__ import annotations

import threading
import time
from collections import Counter

import pytest
import requests
from fastapi.testclient import TestClient

from app import upstream
from app.adapters import history_adapter, jolpica_adapter
from app.main import app

client = TestClient(app)


# --------------------------------------------------------------------------- #
# A stand-in for api.jolpi.ca that counts, and can refuse.
# --------------------------------------------------------------------------- #
class FakeResponse:
    def __init__(self, payload, status=200, headers=None):
        self._payload = payload
        self.status_code = status
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.HTTPError(f"HTTP {self.status_code}")
            err.response = self
            raise err


#: Distinct enough that Jolpica's fuzzy round resolver cannot match the wrong
#: one — "Race 3" shares the token "race" with every other event in a season.
_EVENTS = ["Bahrain", "Monaco", "Silverstone", "Monza", "Suzuka"]


def _season_payload(year: int) -> dict:
    races = [{
        "season": str(year), "round": str(r), "raceName": f"{name} Grand Prix",
        "date": f"{year}-03-{r:02d}", "time": "14:00:00Z",
        "Circuit": {"circuitId": name.lower(), "circuitName": f"{name} Circuit",
                    "Location": {"locality": name, "country": name}},
    } for r, name in enumerate(_EVENTS, start=1)]
    return {"MRData": {"RaceTable": {"Races": races}}}


def _results_payload(year: int, rnd: int) -> dict:
    rows = [{
        "position": str(i), "number": str(i), "points": "10", "laps": "57",
        "status": "Finished", "grid": str(i),
        "Driver": {"driverId": f"d{i}", "code": f"D{i}", "givenName": "A",
                   "familyName": f"B{i}"},
        "Constructor": {"constructorId": "ferrari", "name": "Ferrari"},
        "Time": {"millis": "5400000", "time": "1:30:00.000"},
    } for i in range(1, 4)]
    return {"MRData": {"RaceTable": {"Races": [
        {"round": str(rnd), "raceName": f"{_EVENTS[rnd - 1]} Grand Prix",
         "Circuit": {"circuitId": "c1", "circuitName": "Circuit 1", "Location": {}},
         "Results": rows}]}}}


class FakeJolpica:
    """Records every URL. Optionally refuses the first `refuse_first` calls."""

    def __init__(self, refuse_first: int = 0, latency: float = 0.0):
        self.calls: list[str] = []
        self.refuse_first = refuse_first
        self.latency = latency
        self.lock = threading.Lock()

    def __call__(self, url, params=None, headers=None, timeout=None, **kw):
        with self.lock:
            self.calls.append(url)
            n = len(self.calls)
        if self.latency:
            time.sleep(self.latency)
        if n <= self.refuse_first:
            return FakeResponse({"detail": "Request was throttled."}, 429,
                                {"Retry-After": "0"})
        tail = url.rsplit("/ergast/f1/", 1)[-1]
        if tail.startswith("seasons"):
            return FakeResponse({"MRData": {"SeasonTable": {
                "Seasons": [{"season": str(y)} for y in (2020, 2021, 2022)]}}})
        if "Standings" in tail:
            return FakeResponse({"MRData": {"StandingsTable": {"StandingsLists": [
                {"DriverStandings": [{"position": "1", "points": "100", "wins": "5",
                                      "Driver": {"givenName": "A", "familyName": "B",
                                                 "code": "ABC"},
                                      "Constructors": [{"name": "Ferrari"}]}]}]}}})
        parts = tail.replace(".json", "").split("/")
        if len(parts) == 1:
            return FakeResponse(_season_payload(int(parts[0])))
        if len(parts) >= 3 and parts[2] == "results":
            return FakeResponse(_results_payload(int(parts[0]), int(parts[1])))
        return FakeResponse({"MRData": {"RaceTable": {"Races": [{}]}}})

    def urls(self) -> Counter:
        return Counter(u.rsplit("/ergast/f1/", 1)[-1] for u in self.calls)


@pytest.fixture()
def jolpica(monkeypatch, tmp_path):
    """A counting Jolpica, and a cache that starts empty for every test."""
    from app.config import get_settings
    settings = get_settings()
    # `get_settings` is lru_cached and another test module sets
    # PITWALL_IQ_MOCK_MODE at import time, so whether the standings route even
    # reaches the network depends on collection order. These tests are about
    # the network path, so they state that they want it.
    saved = (settings.cache_dir, settings.mock_mode, settings.enable_live_fetch)
    settings.cache_dir = tmp_path
    settings.mock_mode = False
    settings.enable_live_fetch = True
    upstream.cache_clear()
    fake = FakeJolpica()
    monkeypatch.setattr(upstream.requests, "get", fake)
    # Pacing is real behaviour but it is not what these tests are about, and a
    # per-second budget would make them slow for no extra confidence.
    monkeypatch.setattr(upstream, "_PACERS", {})
    monkeypatch.setattr(upstream, "_DEFAULT_PACER",
                        upstream._Pacer(per_second=1000.0, burst=1000))
    yield fake
    settings.cache_dir, settings.mock_mode, settings.enable_live_fetch = saved
    upstream.cache_clear()


# --------------------------------------------------------------------------- #
# The duplicate requests.
# --------------------------------------------------------------------------- #
def test_one_season_view_asks_each_url_once(jolpica):
    """Events + sessions + results is one calendar and one results document.

    It used to be five requests: the calendar three times (events, sessions and
    the round resolver each fetched it) and the round's results twice (the
    driver-id map, then the classification, same URL back to back).
    """
    year, event = 2021, "Silverstone Grand Prix"     # round 3
    assert client.get("/api/historical/events", params={"year": year}).status_code == 200
    assert client.get("/api/historical/sessions",
                      params={"year": year, "event": event}).status_code == 200
    assert client.get("/api/historical/results",
                      params={"year": year, "event": event, "session": "Race"}).status_code == 200

    counts = jolpica.urls()
    assert counts[f"{year}.json"] == 1, f"calendar fetched {counts[f'{year}.json']}x"
    assert counts[f"{year}/3/results.json"] == 1, f"results fetched more than once: {counts}"
    assert sum(counts.values()) == 2, f"a season view should cost 2 requests, got {counts}"


def test_standings_are_fetched_once_per_season(jolpica):
    for _ in range(3):
        r = client.get("/api/history/standings", params={"year": 2021, "type": "driver"})
        assert r.status_code == 200
        assert r.json()["standings"]
    assert jolpica.urls()["2021/driverStandings.json"] == 1


def test_a_finished_season_is_not_refetched(jolpica):
    for _ in range(4):
        client.get("/api/historical/events", params={"year": 2020})
    assert sum(jolpica.urls().values()) == 1


def test_concurrent_identical_requests_collapse_to_one(monkeypatch, jolpica):
    """Eight readers opening the same season is one upstream request, not eight.

    This is the case the rate limit actually punishes: everything arrives at
    once, so a plain TTL cache is still cold for all of them.
    """
    jolpica.latency = 0.15
    out: list[int] = []

    def hit():
        out.append(client.get("/api/historical/events",
                              params={"year": 2020}).status_code)

    threads = [threading.Thread(target=hit) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert out == [200] * 8
    assert sum(jolpica.urls().values()) == 1


# --------------------------------------------------------------------------- #
# HTTP 429.
# --------------------------------------------------------------------------- #
def test_429_is_retried_rather_than_reported_as_an_outage(jolpica):
    """A throttled request is an instruction to wait, not a dead source."""
    jolpica.refuse_first = 2
    r = client.get("/api/historical/events", params={"year": 2021}).json()
    assert r.get("error") is None, "a retryable 429 surfaced as source_unavailable"
    assert len(r["events"]) == 5
    assert len(jolpica.calls) == 3       # two refusals, then the answer


def test_a_source_that_stays_down_still_answers_honestly(jolpica):
    jolpica.refuse_first = 99
    r = client.get("/api/historical/events", params={"year": 2021}).json()
    assert r["error"] == "source_unavailable"
    assert r["retryable"] is True
    assert r["events"] == []


# --------------------------------------------------------------------------- #
# The crash: a 200 whose body changes type when the source fails.
# --------------------------------------------------------------------------- #
def test_sessions_available_is_always_a_list(jolpica):
    """`available` is a list of session names on this route — in both outcomes.

    The generic failure shape used to stamp `available: False` over it, so the
    browser called `.includes()` on a boolean and the Seasons page went blank.
    """
    good = client.get("/api/historical/sessions",
                      params={"year": 2021, "event": "Bahrain Grand Prix"}).json()
    assert isinstance(good["available"], list) and good["available"]

    jolpica.refuse_first = 99
    upstream.cache_clear()
    bad = client.get("/api/historical/sessions",
                     params={"year": 1998, "event": "Nope Grand Prix"}).json()
    assert bad["error"] == "source_unavailable"
    assert isinstance(bad["available"], list), (
        f"available must stay a list; got {type(bad['available']).__name__}")
    assert isinstance(bad["unavailable"], list)


def test_other_historical_routes_keep_the_boolean_available(jolpica):
    """`available` is a boolean everywhere else, and that has to stay true too."""
    jolpica.refuse_first = 99
    for route, params in (
        ("/api/historical/results", {"year": 2021, "event": "X", "session": "Race"}),
        ("/api/historical/events", {"year": 2021}),
    ):
        body = client.get(route, params=params).json()
        assert body["available"] is False


# --------------------------------------------------------------------------- #
# The cold-start import the Seasons page was still paying.
# --------------------------------------------------------------------------- #
def test_standings_do_not_import_the_archive_runtime(monkeypatch, jolpica):
    """Reading a base URL must not drag in fastf1, pandas and matplotlib.

    `history_adapter` called `load_pitwall()` for `pitwall.JOLPICA`, which is
    the same string `jolpica_adapter.BASE` already holds — three seconds of
    imports on a warm machine, and the last surviving instance of the cold-start
    cost V84 removed everywhere else.
    """
    called = []
    monkeypatch.setattr(history_adapter, "load_pitwall",
                        lambda: called.append(1) or (_ for _ in ()).throw(
                            AssertionError("load_pitwall() on the standings path")))
    r = client.get("/api/history/standings", params={"year": 2021, "type": "driver"})
    assert r.status_code == 200
    assert r.json()["source"] == "live"
    assert not called


def test_standings_follow_the_one_jolpica_base_url(monkeypatch, jolpica):
    """There is one base URL at runtime, not a copy frozen at import.

    `from .jolpica_adapter import BASE` bound the value once, so pointing the
    adapter at a different host (a test rig, a mirror) moved the historical
    routes and left the standings talking to the original — two modules that
    agreed exactly until the moment it mattered.
    """
    monkeypatch.setattr(jolpica_adapter, "BASE", "https://mirror.example/ergast/f1")
    client.get("/api/history/standings", params={"year": 2021, "type": "driver"})
    # (the portrait join reaches formula1.com as well; only the archive moves)
    archive = [u for u in jolpica.calls if "ergast" in u]
    assert archive, jolpica.calls
    assert all(u.startswith("https://mirror.example/") for u in archive), archive


# --------------------------------------------------------------------------- #
# A refused archive must not become a confident wrong answer.
# --------------------------------------------------------------------------- #
def test_a_failed_standings_fetch_is_not_the_demo_grid(jolpica):
    """The 2025 top ten under a 1998 heading is worse than an empty table.

    `get_standings` used to `except: pass` into `_mock_standings`, so a 429 —
    which rapid season switching produced reliably — filled the card with real
    driver names for the wrong season, with nothing to mark it.
    """
    jolpica.refuse_first = 99
    body = client.get("/api/history/standings",
                      params={"year": 1998, "type": "driver"}).json()
    assert body["standings"] == [], "a failed fetch produced rows"
    assert body["error"] == "source_unavailable"
    assert body["retryable"] is True
    names = " ".join(str(r.get("name")) for r in body["standings"])
    assert "Verstappen" not in names


def test_demo_mode_still_gets_its_demo_table(monkeypatch, jolpica):
    """The change above must not take demo mode's table away with it."""
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "mock_mode", True)
    body = client.get("/api/history/standings",
                      params={"year": 2026, "type": "driver"}).json()
    assert body["source"] == "mock"
    assert body["standings"], "demo mode lost its championship table"
    assert "error" not in body


# --------------------------------------------------------------------------- #
# TTL policy.
# --------------------------------------------------------------------------- #
def test_ttl_policy_splits_history_from_the_live_season():
    from datetime import date
    now = date.today().year
    assert jolpica_adapter._ttl_for(f"{now - 3}.json") == upstream.TTL_IMMUTABLE
    assert jolpica_adapter._ttl_for(f"{now}.json") == upstream.TTL_LIVE
    assert jolpica_adapter._ttl_for(f"{now}/4/results.json") == upstream.TTL_LIVE
    assert jolpica_adapter._ttl_for("seasons.json") == upstream.TTL_SEASON_LIST


def test_a_probe_is_never_served_from_cache(jolpica):
    jolpica_adapter.probe()
    jolpica_adapter.probe()
    assert len(jolpica.calls) == 2, "a probe answered from cache has probed nothing"
