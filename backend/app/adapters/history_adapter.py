"""
Historical mode adapter — championship standings, race winners, head-to-head.

Real data comes from Jolpica/Ergast (1950-present) via pitwall's ``JOLPICA``
endpoint. When that host is unreachable we fall back to a small, clearly-labelled
sample so the Historical section still renders.
"""
from __future__ import annotations

import requests

from ..config import get_settings
from ..models import DataSource


def _jolpica(path: str) -> dict:
    import pitwall
    url = f"{pitwall.JOLPICA}/{path}"
    resp = requests.get(url, timeout=get_settings().fetch_timeout)
    resp.raise_for_status()
    return resp.json()


# --------------------------------------------------------------------------- #
# standings
# --------------------------------------------------------------------------- #
def get_standings(year: int, standings_type: str = "driver") -> tuple[list[dict], DataSource]:
    settings = get_settings()
    if not settings.mock_mode and settings.enable_live_fetch:
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
    return _mock_standings(year, standings_type), DataSource.MOCK


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
            import pitwall
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
_MOCK_CONSTRUCTORS = [
    ("McLaren", 581, 9), ("Red Bull Racing", 421, 6), ("Ferrari", 485, 4),
    ("Mercedes", 312, 2), ("Williams", 182, 0), ("Aston Martin", 96, 0),
    ("Racing Bulls", 58, 0), ("Alpine", 41, 0), ("Haas F1 Team", 35, 0),
    ("Kick Sauber", 22, 0),
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
