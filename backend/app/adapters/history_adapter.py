"""
Historical mode adapter — championship standings, race winners, head-to-head.

Real data comes from Jolpica/Ergast (1950-present) via pitwall's ``JOLPICA``
endpoint. When that host is unreachable we fall back to a small, clearly-labelled
sample so the Historical section still renders.
"""
from __future__ import annotations

from ..config import get_settings
from ..models import DataSource
from .. import upstream
from . import jolpica_adapter
from .pitwall_runtime import load_pitwall


def _jolpica(path: str) -> dict:
    """One Jolpica document, cached and paced — see app/upstream.

    THIS USED TO IMPORT PANDAS TO READ A STRING. It asked `load_pitwall()` for
    `pitwall.JOLPICA`, which is the constant `jolpica_adapter.BASE` already
    holds — and `load_pitwall()` pulls in fastf1, pandas and matplotlib, three
    seconds of import on a warm machine and more on a cold Render instance. So
    the Seasons page was the one surface left that paid V84's cold-start cost,
    and it paid it for a base URL. Same source, same URL, no import.

    The module is referenced rather than the name imported from it, so there is
    exactly one Jolpica base URL at runtime instead of a second copy frozen at
    import time — which is the difference between "these two agree" and "these
    two agreed once".
    """
    return upstream.fetch_json(f"{jolpica_adapter.BASE}/{path}",
                               timeout=get_settings().fetch_timeout,
                               ttl=jolpica_adapter._ttl_for(path))  # noqa: SLF001


# --------------------------------------------------------------------------- #
# standings
# --------------------------------------------------------------------------- #
def get_standings(year: int, standings_type: str = "driver") -> tuple[list[dict], DataSource]:
    """The championship table for a season, or nothing — never a stand-in.

    A FAILED FETCH USED TO RETURN THE DEMO GRID. `except: pass` fell through to
    `_mock_standings`, which is the 2025 top ten with real names on it, and the
    caller had no way to tell that apart from an answer. So whenever Jolpica
    throttled us — which rapid season switching did reliably, nine requests a
    change against a four-per-second limit — the card headed "1998 championship"
    filled with Verstappen, Norris and Leclerc. Plausible, confident and
    completely false, which is worse than the blank page it was protecting
    against, and the exact opposite of the rule the rest of this backend follows
    (see test_no_silent_mock_when_live_disabled).

    Demo data now belongs to demo mode and to nothing else. A source that will
    not answer produces no rows, and the UI says so and offers Retry.
    """
    settings = get_settings()
    if settings.mock_mode:
        return _mock_standings(year, standings_type), DataSource.MOCK
    if settings.enable_live_fetch:
        try:
            season = str(year)
            key = "constructorStandings" if standings_type == "constructor" else "driverStandings"
            data = _jolpica(f"{season}/{key}.json")
            lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
            if lists:
                rows = _parse_standings(lists[0], standings_type)
                if rows:
                    return rows, DataSource.LIVE
        except Exception:  # noqa: BLE001
            pass
    return [], DataSource.LIVE


def _parse_standings(block: dict, standings_type: str) -> list[dict]:
    rows = []
    if standings_type == "constructor":
        for e in block.get("ConstructorStandings", []):
            c = e.get("Constructor", {})
            rows.append({"position": _int(e.get("position")), "name": c.get("name"),
                         "points": _num(e.get("points")), "wins": _int(e.get("wins"))})
    else:
        for e in block.get("DriverStandings", []):
            d = e.get("Driver", {})
            cons = (e.get("Constructors") or [{}])[-1]
            rows.append({"position": _int(e.get("position")),
                         "name": f"{d.get('givenName','')} {d.get('familyName','')}".strip(),
                         "code": d.get("code"), "team": cons.get("name"),
                         "points": _num(e.get("points")), "wins": _int(e.get("wins"))})
    return rows


def get_circuit_winners(circuit: str) -> tuple[list[dict], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
        try:
            pitwall = load_pitwall()
            cid = pitwall._resolve_circuit_id(circuit)
            if cid:
                data = _jolpica(f"circuits/{cid}/results/1.json?limit=30")
                races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
                rows = []
                for r in races:
                    res = (r.get("Results") or [{}])[0]
                    d = res.get("Driver", {})
                    rows.append({"season": r.get("season"), "race": r.get("raceName"),
                                 "winner": f"{d.get('givenName','')} {d.get('familyName','')}".strip(),
                                 "team": res.get("Constructor", {}).get("name")})
                if rows:
                    return rows, DataSource.LIVE
        except Exception:  # noqa: BLE001
            pass
    return _mock_winners(circuit), DataSource.MOCK


# --------------------------------------------------------------------------- #
# mock fallbacks (clearly labelled demo data)
# --------------------------------------------------------------------------- #
_MOCK_DRIVERS = [
    ("Max Verstappen", "VER", "Red Bull Racing", 331, 6),
    ("Lando Norris", "NOR", "McLaren", 305, 5),
    ("Charles Leclerc", "LEC", "Ferrari", 288, 3),
    ("Oscar Piastri", "PIA", "McLaren", 276, 4),
    ("George Russell", "RUS", "Mercedes", 214, 2),
    ("Lewis Hamilton", "HAM", "Ferrari", 197, 1),
    ("Carlos Sainz", "SAI", "Williams", 121, 0),
    ("Andrea Kimi Antonelli", "ANT", "Mercedes", 98, 0),
    ("Fernando Alonso", "ALO", "Aston Martin", 74, 0),
    ("Alexander Albon", "ALB", "Williams", 61, 0),
]
# SPELLED THE WAY THE REAL PROVIDER SPELLS THEM, on purpose.
#
# Jolpica does not answer with the names a session does: it says "RB F1 Team"
# where live timing says "Racing Bulls", "Red Bull" where the session says "Red
# Bull Racing", and hangs "F1 Team" off half the grid. Those strings used to
# reach the interface untouched, so the same constructor rendered as a branded
# badge on one page and a grey placeholder on another. The frontend resolves
# every spelling to one identity now (see lib/constructors), and demo mode uses
# the awkward spellings deliberately so that anything which regresses that
# resolution is visible on the first screen a developer opens.
_MOCK_CONSTRUCTORS = [
    ("McLaren", 581, 9), ("Red Bull", 421, 6), ("Ferrari", 485, 4),
    ("Mercedes", 312, 2), ("Williams", 182, 0), ("Aston Martin", 96, 0),
    ("RB F1 Team", 58, 0), ("Alpine F1 Team", 41, 0), ("Haas F1 Team", 35, 0),
    ("Audi", 22, 0), ("Cadillac F1 Team", 0, 0),
]


def _mock_standings(year: int, standings_type: str) -> list[dict]:
    if standings_type == "constructor":
        return [{"position": i, "name": n, "points": p, "wins": w}
                for i, (n, p, w) in enumerate(_MOCK_CONSTRUCTORS, start=1)]
    return [{"position": i, "name": n, "code": c, "team": t, "points": p, "wins": w}
            for i, (n, c, t, p, w) in enumerate(_MOCK_DRIVERS, start=1)]


def _mock_winners(circuit: str) -> list[dict]:
    base = [
        (2025, "Max Verstappen", "Red Bull Racing"), (2024, "George Russell", "Mercedes"),
        (2023, "Max Verstappen", "Red Bull Racing"), (2022, "Charles Leclerc", "Ferrari"),
        (2021, "Max Verstappen", "Red Bull Racing"), (2020, "Valtteri Bottas", "Mercedes"),
        (2019, "Max Verstappen", "Red Bull Racing"), (2018, "Max Verstappen", "Red Bull Racing"),
    ]
    return [{"season": s, "race": f"{circuit.title()} Grand Prix", "winner": w, "team": t}
            for s, w, t in base]


def _int(v):
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _num(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
