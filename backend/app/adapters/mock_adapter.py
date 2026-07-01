"""
Mock adapter — the realistic fallback / demo data path.

Serves the deterministic simulated race from ``app.mock.simulator``. It is used
when (a) mock mode is explicitly enabled, or (b) a real fetch fails (e.g. the F1
data hosts are blocked by network policy). Everything it returns is flagged
``DataSource.MOCK`` and carries a human-readable note so the UI can label it.
"""
from __future__ import annotations

import copy

from ..mock.simulator import simulate
from ..models import DataSource, GrandPrix, RaceSession, Season

# A curated, realistic calendar so the selector feels like the real product even
# offline. Only the Austrian GP is fully modelled; any pick returns the demo race
# relabelled to the selection, clearly noted as sample data.
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

# Cache the expensive simulation once.
_BASE: RaceSession | None = None


def _base_session() -> RaceSession:
    global _BASE
    if _BASE is None:
        _BASE = simulate()
    return _BASE


def mock_seasons() -> list[Season]:
    return [Season(year=y, events=len(_CALENDAR)) for y in _MOCK_YEARS]


def mock_grands_prix(year: int) -> list[GrandPrix]:
    return [
        GrandPrix(round=e["round"], name=e["name"], location=e["location"],
                  country=e["country"], sessions=["Race"])
        for e in _CALENDAR
    ]


def get_mock_session(year: int = 2026, gp: str = "Austrian Grand Prix",
                     session_type: str = "Race") -> RaceSession:
    """Return the simulated demo race, relabelled to the requested selection."""
    base = _base_session()
    session = base.model_copy(deep=True)
    session.data_source = DataSource.MOCK

    is_austria = "austria" in gp.lower() or "spielberg" in gp.lower() or gp == "Austrian Grand Prix"
    session.year = year
    session.session_type = session_type or "Race"
    if is_austria:
        session.grand_prix = "Austrian Grand Prix"
        session.notes = ["Demo mode: realistic simulated race (real F1 feeds were unreachable)."]
    else:
        session.grand_prix = gp
        session.notes = [
            f"Demo mode: sample data modelled on a Red Bull Ring race, shown for "
            f"'{gp}'. Real F1 timing feeds were unreachable in this environment.",
        ]
    return session
