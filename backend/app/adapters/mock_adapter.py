"""
Mock adapter — the realistic fallback / demo data path.

Serves the deterministic simulated sessions from ``app.mock.simulator``. Used when
(a) demo mode is explicitly enabled, or (b) every real source fails. Everything it
returns is flagged ``DataSource.MOCK`` with a human-readable note and a source
report, so the UI can always label it honestly as demo data.
"""
from __future__ import annotations

from ..analysis.events import infer_overtakes
from ..mock.simulator import simulate, simulate_practice
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


def mock_seasons() -> list[Season]:
    return [Season(year=y, events=len(_CALENDAR)) for y in _MOCK_YEARS]


def mock_grands_prix(year: int) -> list[GrandPrix]:
    return [GrandPrix(round=e["round"], name=e["name"], location=e["location"],
                      country=e["country"], sessions=list(_SESSIONS)) for e in _CALENDAR]


def _mock_report() -> SourceReport:
    facets = [FacetSource(facet=f, source="mock", confidence="high")
              for f in ("results", "laps", "pit_stops", "tyres", "weather", "race_control", "overtakes")]
    return SourceReport(data_source=DataSource.MOCK, facets=facets,
                        probes=[SourceProbe(name="mock", reachable=True, detail="deterministic demo data")])


def get_mock_session(year: int = 2026, gp: str = "Austrian Grand Prix",
                     session_type: str = "Race") -> RaceSession:
    """Return the appropriate simulated demo session, relabelled to the selection."""
    cat = session_category(session_type)
    base = _base_practice() if cat == "practice" else _base_race()
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
