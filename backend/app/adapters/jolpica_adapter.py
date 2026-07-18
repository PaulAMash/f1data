"""
Jolpica-F1 adapter — https://api.jolpi.ca (Ergast-compatible, free, no key).

The authority for the *calendar, results and standings* (1950-present) and a solid
fallback for classification, per-lap position/time and pit-stop durations when the
richer live-timing sources are unreachable or the season predates them.

Jolpica does NOT carry tyre compounds, sectors, weather or race control — for older
seasons those facets are marked unavailable rather than faked.
"""
from __future__ import annotations

from datetime import datetime, timezone

import requests

from ..config import get_settings
from ..models import (
    Circuit,
    ClassificationRow,
    Compound,
    Constructor,
    DataSource,
    Driver,
    FacetSource,
    GrandPrix,
    Lap,
    PitStop,
    PositionPoint,
    RaceSession,
    Season,
    SourceReport,
    session_category,
)

BASE = "https://api.jolpi.ca/ergast/f1"

# team → broadcast colour (Ergast has no colours)
TEAM_COLORS = {
    "red_bull": "#3671C6", "ferrari": "#E8002D", "mclaren": "#FF8000",
    "mercedes": "#27F4D2", "aston_martin": "#229971", "williams": "#64C4FF",
    "alpine": "#FF87BC", "haas": "#B6BABD", "sauber": "#52E252", "rb": "#6692FF",
}


class JolpicaError(RuntimeError):
    pass


def _get(path: str, **params) -> dict:
    resp = requests.get(f"{BASE}/{path}", params=params, timeout=get_settings().fetch_timeout)
    resp.raise_for_status()
    return resp.json()


def probe() -> tuple[bool, str]:
    try:
        _get("2024/1/results.json", limit=1)
        return True, "reachable"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:160]


def _races(path: str, **params):
    return _get(path, **params).get("MRData", {}).get("RaceTable", {}).get("Races", [])


# --------------------------------------------------------------------------- #
# calendar / seasons
# --------------------------------------------------------------------------- #
def list_seasons() -> list[Season]:
    try:
        data = _get("seasons.json", limit=100)
        seasons = data.get("MRData", {}).get("SeasonTable", {}).get("Seasons", [])
        years = sorted({int(s["season"]) for s in seasons}, reverse=True)
        return [Season(year=y, events=0) for y in years]
    except Exception as exc:  # noqa: BLE001
        raise JolpicaError(str(exc)) from exc


def _session_schedule(r: dict, year: int) -> tuple[list[str], dict[str, str]]:
    """Session names + ISO start times from the race's schedule sub-objects.
    Practices are only offered where a live-timing source can serve them (2023+)."""
    def iso(block: dict | None) -> str | None:
        if not block or not block.get("date"):
            return None
        return f"{block['date']}T{block.get('time', '00:00:00Z')}"

    names: list[str] = []
    times: dict[str, str] = {}

    def add(name: str, when: str | None):
        names.append(name)
        if when:
            times[name] = when

    if year >= 2023:
        for key, label in (("FirstPractice", "Practice 1"), ("SecondPractice", "Practice 2"),
                           ("ThirdPractice", "Practice 3")):
            if r.get(key):
                add(label, iso(r[key]))
    if r.get("SprintQualifying") or r.get("SprintShootout"):
        add("Sprint Qualifying", iso(r.get("SprintQualifying") or r.get("SprintShootout")))
    if r.get("Sprint"):
        add("Sprint", iso(r["Sprint"]))
    # Qualifying: use the published time, else assume the day before the race
    q_when = iso(r.get("Qualifying"))
    if not q_when and r.get("date"):
        try:
            from datetime import date as _date, timedelta
            q_when = (_date.fromisoformat(r["date"]) - timedelta(days=1)).isoformat()
        except ValueError:
            q_when = None
    add("Qualifying", q_when)
    add("Race", iso({"date": r.get("date"), "time": r.get("time", "00:00:00Z")})
        if r.get("date") else None)
    return names, times


def list_grands_prix(year: int) -> list[GrandPrix]:
    races = _races(f"{year}.json", limit=40)
    out: list[GrandPrix] = []
    for r in races:
        c = r.get("Circuit", {})
        loc = c.get("Location", {})
        sessions, session_times = _session_schedule(r, year)
        out.append(GrandPrix(
            round=int(r.get("round", 0)), name=r.get("raceName", "?"),
            location=loc.get("locality"), country=loc.get("country"),
            circuit=Circuit(id=c.get("circuitId", ""), name=c.get("circuitName", ""),
                            locality=loc.get("locality"), country=loc.get("country")),
            date=r.get("date"),
            sessions=sessions, session_times=session_times,
        ))
    return out


def _resolve_round(year: int, gp: str) -> tuple[int | None, dict | None]:
    gp_l = gp.lower().replace("grand prix", "").strip()
    for r in _races(f"{year}.json", limit=40):
        c = r.get("Circuit", {})
        loc = c.get("Location", {})
        blob = " ".join([r.get("raceName", ""), c.get("circuitName", ""),
                         loc.get("locality", ""), loc.get("country", "")]).lower()
        if gp_l in blob or any(tok in blob for tok in gp_l.split()):
            return int(r["round"]), r
    return None, None


# --------------------------------------------------------------------------- #
# results / standings (structured)
# --------------------------------------------------------------------------- #
def _driver_from(res: dict) -> tuple[Driver, ClassificationRow]:
    d = res.get("Driver", {})
    c = res.get("Constructor", {})
    code = (d.get("code") or d.get("driverId", "")[:3]).upper()
    team = c.get("name", "?")
    color = TEAM_COLORS.get(c.get("constructorId", ""), "#888888")
    status = res.get("status", "Finished")
    retired = status not in ("Finished",) and "Lap" not in status
    grid = _int(res.get("grid"))
    pos = _int(res.get("position"))
    fl = res.get("FastestLap", {}).get("Time", {}).get("time")
    driver = Driver(number=str(res.get("number", "")), code=code,
                    name=f"{d.get('givenName','')} {d.get('familyName','')}".strip(),
                    team=team, team_color=color, grid=grid, country=d.get("nationality"))
    row = ClassificationRow(
        position=(None if retired else pos), driver=code, name=driver.name, team=team,
        team_color=color, grid=grid, laps_completed=_int(res.get("laps")),
        status=("DNF" if retired else status), gap=None,
        best_lap=_time_to_sec(fl), points=_num(res.get("points")), retired=retired,
        # keep the official reason ("Hydraulics", "Collision", ...) for the DNF tooltip
        retirement_reason=(status if retired else None),
        retirement_source=("jolpica" if retired else None))
    return driver, row


def fetch_classification(year: int, gp: str) -> tuple[list[Driver], list[ClassificationRow], dict]:
    rnd, meta = _resolve_round(year, gp)
    if not rnd:
        raise JolpicaError(f"No {year} round matches '{gp}'")
    races = _races(f"{year}/{rnd}/results.json", limit=40)
    if not races:
        raise JolpicaError("No results")
    drivers, rows = [], []
    for res in races[0].get("Results", []):
        d, row = _driver_from(res)
        drivers.append(d)
        rows.append(row)
    return drivers, rows, meta or races[0]


def fetch_laps(year: int, gp: str) -> tuple[list, list]:
    """Public wrapper: per-lap times + positions for facet-level fallback when
    the primary source returned a session without laps."""
    rnd, _ = _resolve_round(year, gp)
    if not rnd:
        return [], []
    return _fetch_laps(year, rnd, _driver_id_map(year, rnd))


def fetch_pitstops(year: int, gp: str) -> list[PitStop]:
    rnd, _ = _resolve_round(year, gp)
    if not rnd:
        return []
    races = _races(f"{year}/{rnd}/pitstops.json", limit=200)
    if not races:
        return []
    stops = []
    # map driverId -> code from results
    id_to_code = _driver_id_map(year, rnd)
    for ps in races[0].get("PitStops", []):
        dur = _num(ps.get("duration"))
        code = id_to_code.get(ps.get("driverId"), (ps.get("driverId") or "")[:3].upper())
        stops.append(PitStop(
            driver=code, lap=_int(ps.get("lap")) or 0, stop_duration=dur, pit_lane_time=dur,
            source="jolpica", confidence="medium",
            explanation="Ergast/Jolpica pit-stop duration (total time in pit)."))
    return stops


def _driver_id_map(year: int, rnd: int) -> dict:
    races = _races(f"{year}/{rnd}/results.json", limit=40)
    out = {}
    for res in (races[0].get("Results", []) if races else []):
        d = res.get("Driver", {})
        out[d.get("driverId")] = (d.get("code") or d.get("driverId", "")[:3]).upper()
    return out


# --------------------------------------------------------------------------- #
# full session (fallback primary)
# --------------------------------------------------------------------------- #
def fetch_quali_segments(year: int, gp: str) -> dict[str, dict]:
    """code -> {q1, q2, q3 (seconds), position} from the archive's qualifying
    results — used to enrich sessions served by sources without segment times."""
    rnd, _meta = _resolve_round(year, gp)
    if not rnd:
        return {}
    races = _races(f"{year}/{rnd}/qualifying.json", limit=40)
    out: dict[str, dict] = {}
    for r in (races[0].get("QualifyingResults", []) if races else []):
        d = r.get("Driver", {})
        code = (d.get("code") or d.get("familyName", "")[:3]).upper()
        out[code] = {
            "q1": _time_to_sec(r.get("Q1")), "q2": _time_to_sec(r.get("Q2")),
            "q3": _time_to_sec(r.get("Q3")), "position": _int(r.get("position")),
        }
    return out


def fetch_session(year: int, gp: str, session_type: str) -> RaceSession:
    cat = session_category(session_type)
    drivers, classification, meta = fetch_classification(year, gp)
    rnd = _int(meta.get("round"))
    code_by_id = {}
    for res in _races(f"{year}/{rnd}/results.json", limit=40)[0].get("Results", []):
        d = res.get("Driver", {})
        code_by_id[d.get("driverId")] = (d.get("code") or d.get("driverId", "")[:3]).upper()

    facets = [FacetSource(facet="results", source="jolpica", confidence="high"),
              FacetSource(facet="drivers", source="jolpica", confidence="high")]
    missing = ["tyres/compounds", "weather", "sectors", "race_control"]

    laps: list[Lap] = []
    positions: list[PositionPoint] = []
    if cat in ("race", "sprint"):
        laps, positions = _fetch_laps(year, rnd, code_by_id)
        facets.append(FacetSource(facet="laps", source="jolpica",
                                  confidence="medium" if laps else "low",
                                  detail=None if laps else "No lap data (pre-1996 or unavailable)"))
    pit_stops = fetch_pitstops(year, gp) if cat in ("race",) else []
    if pit_stops:
        facets.append(FacetSource(facet="pit_stops", source="jolpica", confidence="medium"))
    else:
        missing.append("pit_stops")

    c = meta.get("Circuit", {})
    loc = c.get("Location", {})
    total = max((l.lap for l in laps), default=max((r.laps_completed or 0 for r in classification), default=0))
    report = SourceReport(data_source=DataSource.LIVE, fetched_at=_now(), facets=facets,
                          missing=missing, partial=True)
    return RaceSession(
        year=year, grand_prix=meta.get("raceName", gp), session_type=session_type, category=cat,
        circuit=Circuit(id=c.get("circuitId", ""), name=c.get("circuitName", gp),
                        locality=loc.get("locality"), country=loc.get("country"), laps=total),
        total_laps=total, data_source=DataSource.LIVE, fetched_at=_now(), partial=True,
        source_report=report,
        notes=["Historical source: tyre, weather, sector and race-control data are not available."],
        drivers=drivers,
        constructors=_constructors(drivers), classification=classification, laps=laps,
        pit_stops=pit_stops, positions=positions,
    )


def _fetch_laps(year, rnd, code_by_id):
    laps: list[Lap] = []
    positions: list[PositionPoint] = []
    try:
        races = _races(f"{year}/{rnd}/laps.json", limit=2000)
    except Exception:  # noqa: BLE001
        return laps, positions
    if not races:
        return laps, positions
    for lap in races[0].get("Laps", []):
        n = _int(lap.get("number"))
        if not n:
            continue
        for t in lap.get("Timings", []):
            code = code_by_id.get(t.get("driverId"), (t.get("driverId") or "")[:3].upper())
            pos = _int(t.get("position"))
            laps.append(Lap(driver=code, lap=n, lap_time=_time_to_sec(t.get("time")),
                            position=pos, is_outlier=(n == 1)))
            if pos:
                positions.append(PositionPoint(driver=code, lap=n, position=pos))
    return laps, positions


def _constructors(drivers):
    seen = {}
    for d in drivers:
        seen[d.team] = d.team_color
    return [Constructor(id=t.lower().replace(" ", "_"), name=t, color=c) for t, c in seen.items()]


def _time_to_sec(v):
    if not v:
        return None
    s = str(v).strip()
    try:
        if ":" in s:
            m, rest = s.split(":", 1)
            return round(int(m) * 60 + float(rest), 3)
        return round(float(s), 3)
    except (ValueError, TypeError):
        return None


def _num(v):
    try:
        return None if v is None else round(float(v), 3)
    except (ValueError, TypeError):
        return None


def _int(v):
    try:
        return None if v is None else int(v)
    except (ValueError, TypeError):
        return None


def _now():
    return datetime.now(timezone.utc).isoformat()
