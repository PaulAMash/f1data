"""
Mock adapter — the realistic fallback / demo data path.

Serves the deterministic simulated sessions from ``app.mock.simulator``. Used when
(a) demo mode is explicitly enabled, or (b) every real source fails. Everything it
returns is flagged ``DataSource.MOCK`` with a human-readable note and a source
report, so the UI can always label it honestly as demo data.
"""
from __future__ import annotations

from ..analysis.events import infer_overtakes
from ..mock.simulator import simulate, simulate_practice, simulate_qualifying
from ..models import (
    DataSource,
    FacetSource,
    GrandPrix,
    RaceSession,
    Season,
    SourceProbe,
    SourceReport,
    session_category,
)

# A curated, realistic calendar so the selector feels like the real product even
# offline. Sessions include practice so the practice UI is demonstrable in demo mode.
_SESSIONS = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]
_CALENDAR: list[dict] = [
    {"round": 1, "name": "Bahrain Grand Prix", "location": "Sakhir", "country": "Bahrain"},
    {"round": 4, "name": "Japanese Grand Prix", "location": "Suzuka", "country": "Japan"},
    {"round": 6, "name": "Miami Grand Prix", "location": "Miami", "country": "United States"},
    {"round": 8, "name": "Monaco Grand Prix", "location": "Monte Carlo", "country": "Monaco"},
    {"round": 11, "name": "Austrian Grand Prix", "location": "Spielberg", "country": "Austria"},
    {"round": 12, "name": "British Grand Prix", "location": "Silverstone", "country": "United Kingdom"},
    {"round": 16, "name": "Italian Grand Prix", "location": "Monza", "country": "Italy"},
    {"round": 21, "name": "Brazilian Grand Prix", "location": "Sao Paulo", "country": "Brazil"},
]

_MOCK_YEARS = [2026, 2025, 2024]

_BASE_RACE: RaceSession | None = None
_BASE_PRACTICE: RaceSession | None = None


def _base_race() -> RaceSession:
    global _BASE_RACE
    if _BASE_RACE is None:
        _BASE_RACE = simulate()
        _BASE_RACE.overtakes = infer_overtakes(_BASE_RACE)
    return _BASE_RACE


def _base_practice() -> RaceSession:
    global _BASE_PRACTICE
    if _BASE_PRACTICE is None:
        _BASE_PRACTICE = simulate_practice()
    return _BASE_PRACTICE


_BASE_QUALI: RaceSession | None = None


def _base_quali() -> RaceSession:
    global _BASE_QUALI
    if _BASE_QUALI is None:
        _BASE_QUALI = simulate_qualifying()
    return _BASE_QUALI


def mock_seasons() -> list[Season]:
    return [Season(year=y, events=len(_CALENDAR)) for y in _MOCK_YEARS]


def _mock_date(year: int, rnd: int) -> str:
    """A plausible date for a demo round.

    THE DEMO HAS TO OBEY THE SAME RULE AS THE PRODUCT. Without dates every mock
    event counted as run, so demo mode offered the Brazilian Grand Prix in
    August and then reported no results for it — a real bug wearing the costume
    of a data problem. Rounds are spread eleven days apart from early March,
    which puts the back half of the calendar in the future for most of the year
    exactly as a real season does.
    """
    from datetime import date, timedelta
    return (date(year, 3, 8) + timedelta(days=(rnd - 1) * 11)).isoformat()


def _mock_session_times(race_day: str) -> dict[str, str]:
    """A real weekend's shape around a demo round's race date.

    THE DEMO HAS TO OBEY THE SAME RULE AS THE PRODUCT — and after V101 that
    rule reads `session_times`, not `date`. Without these a demo event offered
    only its race (every other session has no instant to have passed), which
    would have quietly taken Practice and Qualifying out of offline review and
    left the countdown with nothing to count. Friday practice, Saturday
    practice and qualifying, Sunday race: the layout of almost every Grand
    Prix, hung off the date the round already had.
    """
    from datetime import date, datetime, time, timedelta, timezone

    sunday = date.fromisoformat(race_day)
    friday, saturday = sunday - timedelta(days=2), sunday - timedelta(days=1)

    def at(day: date, hh: int, mm: int) -> str:
        return datetime.combine(day, time(hh, mm), tzinfo=timezone.utc).isoformat()

    return {
        "Practice 1": at(friday, 11, 30),
        "Practice 2": at(friday, 15, 0),
        "Practice 3": at(saturday, 10, 30),
        "Qualifying": at(saturday, 14, 0),
        "Race": at(sunday, 13, 0),
    }


def mock_grands_prix(year: int) -> list[GrandPrix]:
    out = []
    for e in _CALENDAR:
        race_day = _mock_date(year, e["round"])
        out.append(GrandPrix(
            round=e["round"], name=e["name"], location=e["location"],
            country=e["country"], sessions=list(_SESSIONS),
            date=race_day, session_times=_mock_session_times(race_day)))
    return out


def _mock_report() -> SourceReport:
    facets = [FacetSource(facet=f, source="mock", confidence="high")
              for f in ("results", "laps", "pit_stops", "tyres", "weather", "race_control", "overtakes")]
    return SourceReport(data_source=DataSource.MOCK, facets=facets,
                        probes=[SourceProbe(name="mock", reachable=True, detail="deterministic demo data")])


def get_mock_session(year: int = 2026, gp: str = "Austrian Grand Prix",
                     session_type: str = "Race") -> RaceSession:
    """Return the appropriate simulated demo session, relabelled to the selection."""
    cat = session_category(session_type)
    base = (_base_practice() if cat == "practice"
            else _base_quali() if cat in ("qualifying", "sprint_qualifying")
            else _base_race())
    session = base.model_copy(deep=True)
    session.data_source = DataSource.MOCK
    session.year = year
    session.session_type = session_type or "Race"
    session.category = cat
    session.source_report = _mock_report()

    is_austria = "austria" in gp.lower() or "spielberg" in gp.lower() or gp == "Austrian Grand Prix"
    session.grand_prix = "Austrian Grand Prix" if is_austria else gp
    if is_austria:
        session.notes = ["Demo data: a realistic simulated session (no live F1 fetch)."]
    else:
        session.notes = [f"Demo data: sample session modelled on the Red Bull Ring, shown for '{gp}'."]
    return session
