"""
EVERY EVENT IN A SEASON HAS ITS OWN NAME.

The name is the key every consumer uses — the website's selector, the app's
picker, `/api/session?gp=` — so two events sharing one is two events sharing
one identity. 2026 has "Bahrain Grand Prix" twice in OpenF1's short names: the
April round at Sakhir and the "BAHRAIN GRAND PRIX IN MALAYSIA" at Sepang in
October. These pin the rule that the second is named from its official title,
that a session request for either lands on the right meeting, and that the
results archive resolves both names to the right round.
"""
from __future__ import annotations

import pytest

from app.adapters import jolpica_adapter, openf1_adapter

MEETINGS = [
    {"meeting_key": 1304, "meeting_name": "Pre-Season Testing",
     "meeting_official_name": "FORMULA 1 ARAMCO PRE-SEASON TESTING 1 2026",
     "location": "Sakhir", "country_name": "Bahrain", "circuit_short_name": "Sakhir",
     "date_start": "2026-02-11T07:00:00+00:00"},
    {"meeting_key": 1282, "meeting_name": "Bahrain Grand Prix",
     "meeting_official_name": "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026",
     "location": "Sakhir", "country_name": "Bahrain", "circuit_short_name": "Sakhir",
     "date_start": "2026-04-10T11:30:00+00:00"},
    {"meeting_key": 1293, "meeting_name": "Italian Grand Prix",
     "meeting_official_name": "FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026",
     "location": "Monza", "country_name": "Italy", "circuit_short_name": "Monza",
     "date_start": "2026-09-04T10:30:00+00:00"},
    {"meeting_key": 1308, "meeting_name": "Bahrain Grand Prix",
     "meeting_official_name": "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026",
     "location": "Kuala Lumpur", "country_name": "Bahrain", "circuit_short_name": "Kuala Lumpur",
     "date_start": "2026-10-02T07:00:00+00:00"},
]


def _session(key, meeting, name, start):
    m = next(x for x in MEETINGS if x["meeting_key"] == meeting)
    return {"session_key": key, "meeting_key": meeting, "session_name": name,
            "session_type": name if name == "Race" else "Practice",
            "meeting_name": m["meeting_name"], "location": m["location"],
            "country_name": m["country_name"], "circuit_short_name": m["circuit_short_name"],
            "date_start": start}


SESSIONS = [
    _session(9001, 1282, "Race", "2026-04-12T15:00:00+00:00"),
    _session(9004, 1293, "Race", "2026-09-06T13:00:00+00:00"),
    _session(9003, 1308, "Practice 1", "2026-10-02T07:00:00+00:00"),
    _session(9002, 1308, "Race", "2026-10-04T07:00:00+00:00"),
]


@pytest.fixture()
def openf1(monkeypatch):
    def fake_get(path, **params):
        if path == "meetings":
            return MEETINGS
        if path == "sessions":
            return SESSIONS
        return []
    monkeypatch.setattr(openf1_adapter, "_get", fake_get)


def test_calendar_names_are_unique_within_a_season(openf1):
    gps = openf1_adapter.list_grands_prix(2026)
    names = [g.name for g in gps]
    assert len(names) == len(set(names)), names
    assert names == ["Bahrain Grand Prix", "Italian Grand Prix", "Bahrain Grand Prix in Malaysia"]
    # `round` is unset here on purpose. It used to carry the meeting key —
    # 1282, 1293, 1308 — an internal identifier in the thousands rather than a
    # round number, and a calendar claiming Las Vegas is round 1287 is worse
    # than one admitting it does not know. The real numbers come from the
    # source that publishes them, or from position; see adapters/calendar_merge.
    assert [g.round for g in gps] == [None, None, None]


def test_the_earlier_round_keeps_the_plain_name_and_the_later_is_read_from_its_title():
    names = openf1_adapter.unique_event_names(MEETINGS)
    assert names[1282] == "Bahrain Grand Prix"
    assert names[1308] == "Bahrain Grand Prix in Malaysia"
    assert names[1293] == "Italian Grand Prix"


def test_a_name_is_read_out_of_the_official_title():
    f = openf1_adapter.name_from_official
    assert f("Bahrain Grand Prix", "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026") \
        == "Bahrain Grand Prix in Malaysia"
    assert f("Bahrain Grand Prix", "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026") == "Bahrain Grand Prix"
    assert f("Italian Grand Prix", "FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026") is None, \
        "A localised title that does not contain the short name yields nothing rather than a guess"
    assert f("Bahrain Grand Prix", None) is None
    assert f("", "FORMULA 1 X 2026") is None


def test_without_a_usable_title_the_location_tells_them_apart():
    twins = [
        {"meeting_key": 1, "meeting_name": "Twin Grand Prix", "meeting_official_name": "GRAN PREMIO 2026",
         "location": "First", "date_start": "2026-01-01"},
        {"meeting_key": 2, "meeting_name": "Twin Grand Prix", "meeting_official_name": "GRAN PREMIO 2026",
         "location": "Second", "date_start": "2026-02-01"},
        {"meeting_key": 3, "meeting_name": "Twin Grand Prix", "meeting_official_name": None,
         "location": None, "circuit_short_name": "Third", "date_start": "2026-03-01"},
    ]
    names = openf1_adapter.unique_event_names(twins)
    assert names == {1: "Twin Grand Prix", 2: "Twin Grand Prix (Second)", 3: "Twin Grand Prix (Third)"}


def test_a_session_request_lands_on_the_right_bahrain(openf1):
    resolve = openf1_adapter._resolve_session
    assert resolve(2026, "Bahrain Grand Prix", "Race")["session_key"] == 9001
    assert resolve(2026, "Bahrain Grand Prix in Malaysia", "Race")["session_key"] == 9002
    assert resolve(2026, "Bahrain Grand Prix in Malaysia", "Practice 1")["session_key"] == 9003
    assert resolve(2026, "Italian Grand Prix", "Race")["session_key"] == 9004
    assert resolve(2026, "Austrian Grand Prix", "Race") is None, \
        "An unknown Grand Prix must never be answered with someone else's sessions"


def test_the_served_session_carries_the_unique_name(openf1):
    session = openf1_adapter.fetch_session(2026, "Bahrain Grand Prix in Malaysia", "Race")
    assert session.grand_prix == "Bahrain Grand Prix in Malaysia"
    assert session.official_name == "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026"
    april = openf1_adapter.fetch_session(2026, "Bahrain Grand Prix", "Race")
    assert april.grand_prix == "Bahrain Grand Prix"


def test_the_results_archive_resolves_both_names_to_their_rounds(monkeypatch):
    races = [
        {"round": "4", "raceName": "Bahrain Grand Prix",
         "Circuit": {"circuitName": "Bahrain International Circuit",
                     "Location": {"locality": "Sakhir", "country": "Bahrain"}}},
        {"round": "16", "raceName": "Bahrain Grand Prix in Malaysia",
         "Circuit": {"circuitName": "Sepang International Circuit",
                     "Location": {"locality": "Kuala Lumpur", "country": "Malaysia"}}},
        {"round": "20", "raceName": "Brazilian Grand Prix",
         "Circuit": {"circuitName": "Autódromo José Carlos Pace",
                     "Location": {"locality": "São Paulo", "country": "Brazil"}}},
    ]
    monkeypatch.setattr(jolpica_adapter, "_races", lambda *a, **k: races)
    resolve = jolpica_adapter._resolve_round
    assert resolve(2026, "Bahrain Grand Prix")[0] == 4
    assert resolve(2026, "Bahrain Grand Prix in Malaysia")[0] == 16
    assert resolve(2026, "São Paulo Grand Prix")[0] == 20, "A different name for the same round still lands"
    assert resolve(2026, "Sepang")[0] == 16
    assert resolve(2026, "Zzz Grand Prix") == (None, None)


def test_the_calendar_the_api_serves_has_no_duplicate_names():
    from datetime import date
    from app.service import get_grands_prix

    gps, _ = get_grands_prix(date.today().year)
    names = [g.name for g in gps]
    assert len(names) == len(set(names)), [n for n in names if names.count(n) > 1]


def test_the_archive_routes_refuse_a_neighbouring_event():
    agree = openf1_adapter.names_agree
    assert agree("Bahrain Grand Prix in Malaysia", "Bahrain Grand Prix in Malaysia Kuala Lumpur Malaysia")
    assert agree("Bahrain Grand Prix in Malaysia", "Bahrain Grand Prix Kuala Lumpur Malaysia"), \
        "The country carries the distinguishing word even when the archive's name does not"
    assert not agree("Bahrain Grand Prix in Malaysia", "Bahrain Grand Prix Sakhir Bahrain")
    assert agree("Bahrain Grand Prix", "Bahrain Grand Prix Sakhir Bahrain")
    assert agree("Monaco", "Monaco Grand Prix Monte Carlo Monaco")
    assert not agree("Austrian Grand Prix", "Australian Grand Prix Melbourne Australia")
