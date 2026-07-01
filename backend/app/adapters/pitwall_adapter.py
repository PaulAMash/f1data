"""
Real F1 data adapter — the production data path.

This is the ONLY place that talks to pitwall / FastF1 / Jolpica. Everything above
it speaks the normalized models in ``app.models``. Two real backends are wired,
tried in order of richness:

  1. FastF1  — pitwall's "full" engine. Clean lap-by-lap DataFrames (compound,
     tyre life, stint, position, sector times) plus results, weather and race
     control. Preferred when installed (``f1pitwall[full]``).
  2. pitwall static helpers — the F1 live-timing archive feeds (2018+) accessed
     through pitwall's own ``_find_session`` / ``_get_keyframe`` helpers, which
     know the feed layout and (de)compression. Used when FastF1 is unavailable.

Jolpica/Ergast (via pitwall's ``JOLPICA`` constant) supplies the starting grid,
historical results and championship standings (1950+).

NETWORK NOTE: every real source above resolves to ``livetiming.formula1.com`` or
``api.jolpi.ca``. If the environment's egress policy blocks those hosts the
fetch raises :class:`FetchError` and the service layer falls back to cache/mock.
No secret or token is ever required for this open data.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from ..config import get_settings
from ..models import (
    Circuit,
    ClassificationRow,
    Compound,
    DataSource,
    Driver,
    GrandPrix,
    Lap,
    PitStop,
    PositionPoint,
    RaceControlEvent,
    RaceSession,
    Season,
    Stint,
    TrackStatus,
    TrackStatusWindow,
    WeatherPoint,
    session_category,
)


class FetchError(RuntimeError):
    """Raised when real data cannot be fetched (blocked host, missing session…)."""


# --------------------------------------------------------------------------- #
# Compound / track-status normalization
# --------------------------------------------------------------------------- #
_COMPOUND_MAP = {
    "SOFT": Compound.SOFT, "MEDIUM": Compound.MEDIUM, "HARD": Compound.HARD,
    "INTERMEDIATE": Compound.INTERMEDIATE, "WET": Compound.WET,
    "S": Compound.SOFT, "M": Compound.MEDIUM, "H": Compound.HARD,
    "I": Compound.INTERMEDIATE, "W": Compound.WET,
}


def _compound(value) -> Compound:
    if value is None:
        return Compound.UNKNOWN
    return _COMPOUND_MAP.get(str(value).strip().upper(), Compound.UNKNOWN)


# FastF1 / F1 numeric track-status codes.
_TRACK_STATUS = {
    "1": TrackStatus.GREEN, "2": TrackStatus.YELLOW, "4": TrackStatus.SAFETY_CAR,
    "5": TrackStatus.RED, "6": TrackStatus.VSC, "7": TrackStatus.VSC,
}


def _track_status_from_codes(codes) -> TrackStatus:
    """A FastF1 lap TrackStatus is a concatenation of codes seen during the lap.
    Pick the most severe non-green status present."""
    if codes is None:
        return TrackStatus.GREEN
    s = str(codes)
    for code, status in (("5", TrackStatus.RED), ("4", TrackStatus.SAFETY_CAR),
                         ("6", TrackStatus.VSC), ("7", TrackStatus.VSC),
                         ("2", TrackStatus.YELLOW)):
        if code in s:
            return status
    return TrackStatus.GREEN


def _sec(td) -> float | None:
    """pandas Timedelta / NaT -> float seconds or None."""
    if td is None:
        return None
    try:
        if hasattr(td, "total_seconds"):
            v = td.total_seconds()
            return None if (v is None or math.isnan(v)) else round(v, 3)
        v = float(td)
        return None if math.isnan(v) else round(v, 3)
    except (ValueError, TypeError):
        return None


# --------------------------------------------------------------------------- #
# Calendar / browsing (pitwall static + Jolpica)
# --------------------------------------------------------------------------- #
def list_seasons() -> list[Season]:
    import pitwall
    seasons: list[Season] = []
    for year in range(2018, datetime.now().year + 1):
        try:
            n = len(pitwall._get_json(f"{year}/Index.json").get("Meetings", []))
            seasons.append(Season(year=year, events=n))
        except Exception:
            continue
    if not seasons:
        raise FetchError("Could not reach the F1 season index (host blocked?).")
    return seasons


def list_grands_prix(year: int) -> list[GrandPrix]:
    import pitwall
    try:
        meetings = pitwall._get_json(f"{year}/Index.json").get("Meetings", [])
    except Exception as exc:  # noqa: BLE001
        raise FetchError(f"Could not fetch {year} calendar: {exc}") from exc
    out: list[GrandPrix] = []
    for m in meetings:
        out.append(GrandPrix(
            round=m.get("Number"),
            name=m.get("Name", "?"),
            official_name=m.get("OfficialName"),
            location=m.get("Location"),
            country=(m.get("Country") or {}).get("Name"),
            sessions=[s.get("Name", "?") for s in m.get("Sessions", [])],
        ))
    return out


# --------------------------------------------------------------------------- #
# Starting grid via Jolpica (works even when FastF1 grid is missing)
# --------------------------------------------------------------------------- #
def _jolpica_grid(year: int, gp_name: str) -> dict[str, int]:
    """Return {driver_code: grid_position} from Jolpica qualifying/grid, best-effort."""
    import pitwall
    try:
        circuit = pitwall._resolve_circuit_id(gp_name) if gp_name else None
        url = (f"{pitwall.JOLPICA}/{year}/circuits/{circuit}/results.json?limit=40"
               if circuit else f"{pitwall.JOLPICA}/{year}/results.json?limit=40")
        import requests
        data = requests.get(url, timeout=get_settings().fetch_timeout).json()
        races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
        grid: dict[str, int] = {}
        for r in races:
            for res in r.get("Results", []):
                code = (res.get("Driver", {}).get("code") or "").upper()
                g = res.get("grid")
                if code and g is not None:
                    grid[code] = int(g)
        return grid
    except Exception:
        return {}


# --------------------------------------------------------------------------- #
# FastF1 path (preferred)
# --------------------------------------------------------------------------- #
def _fetch_via_fastf1(year: int, gp: str, session_type: str) -> RaceSession:
    import fastf1  # noqa: PLC0415

    try:
        session = fastf1.get_session(year, gp, session_type)
        session.load(laps=True, telemetry=False, weather=True, messages=True)
    except Exception as exc:  # noqa: BLE001
        raise FetchError(f"FastF1 could not load {gp} {year} {session_type}: {exc}") from exc

    ev = session.event
    results = session.results
    laps_df = session.laps
    notes: list[str] = []

    # --- drivers + classification --- #
    drivers: list[Driver] = []
    classification: list[ClassificationRow] = []
    grid_lookup = _jolpica_grid(year, str(ev.get("EventName", gp)))
    team_colors: dict[str, str] = {}

    for _, row in results.iterrows():
        code = str(row.get("Abbreviation") or row.get("BroadcastName") or "?")
        team = str(row.get("TeamName") or "?")
        color = row.get("TeamColor")
        color = f"#{color}" if color and not str(color).startswith("#") else (color or "#888888")
        team_colors[team] = color
        grid = row.get("GridPosition")
        grid = int(grid) if grid and not math.isnan(grid) else grid_lookup.get(code)
        pos = row.get("Position")
        pos = int(pos) if pos and not math.isnan(pos) else None
        status = str(row.get("Status") or "Finished")
        retired = bool(status and "Finished" not in status and "Lap" not in status)
        drivers.append(Driver(
            number=str(row.get("DriverNumber") or ""), code=code,
            name=str(row.get("FullName") or code), team=team, team_color=color,
            grid=grid, country=row.get("CountryCode"),
        ))
        classification.append(ClassificationRow(
            position=pos, driver=code, name=str(row.get("FullName") or code), team=team,
            team_color=color, grid=grid, status=status,
            gap=_result_gap(row), points=_num(row.get("Points")),
            retired=retired,
        ))

    # --- laps --- #
    laps: list[Lap] = []
    positions: list[PositionPoint] = []
    for _, lp in laps_df.iterrows():
        code = str(lp.get("Driver") or "?")
        lap_no = _num(lp.get("LapNumber"))
        if lap_no is None:
            continue
        lap_no = int(lap_no)
        pos = _num(lp.get("Position"))
        pit_in = lp.get("PitInTime") is not None and not _isna(lp.get("PitInTime"))
        pit_out = lp.get("PitOutTime") is not None and not _isna(lp.get("PitOutTime"))
        laps.append(Lap(
            driver=code, lap=lap_no, lap_time=_sec(lp.get("LapTime")),
            position=int(pos) if pos else None, compound=_compound(lp.get("Compound")),
            tyre_age=_int(lp.get("TyreLife")), stint=_int(lp.get("Stint")),
            pit_in=pit_in, pit_out=pit_out,
            track_status=_track_status_from_codes(lp.get("TrackStatus")),
            is_outlier=(not bool(lp.get("IsAccurate", True))) or pit_in or pit_out or lap_no == 1,
            sector1=_sec(lp.get("Sector1Time")), sector2=_sec(lp.get("Sector2Time")),
            sector3=_sec(lp.get("Sector3Time")),
        ))
        if pos:
            positions.append(PositionPoint(driver=code, lap=lap_no, position=int(pos)))

    _fill_gaps(laps)

    # --- stints --- #
    stints = _stints_from_laps(laps, drivers)

    # --- pit stops --- #
    pit_stops: list[PitStop] = []
    for _, lp in laps_df.iterrows():
        if lp.get("PitInTime") is not None and not _isna(lp.get("PitInTime")):
            code = str(lp.get("Driver") or "?")
            lap_no = _int(lp.get("LapNumber"))
            if lap_no is None:
                continue
            # FastF1 gives no stop duration; pit-lane time is enriched later
            # (Jolpica) or estimated by PitStopDataService — no scary note needed.
            pit_stops.append(PitStop(
                driver=code, lap=lap_no, source="fastf1", confidence="low",
                compound_before=_compound_before(stints, code, lap_no),
                compound_after=_compound_after(stints, code, lap_no)))

    # --- race control + windows --- #
    race_control, windows = _race_control_from_fastf1(session)

    # --- weather --- #
    weather = _weather_from_fastf1(session)

    total_laps = int(getattr(session, "total_laps", 0) or (max((l.lap for l in laps), default=0)))

    circuit = Circuit(
        id=str(ev.get("Location", "")).lower().replace(" ", "_"),
        name=str(ev.get("Location") or ev.get("EventName") or gp),
        locality=ev.get("Location"), country=ev.get("Country"), laps=total_laps,
    )

    constructors = _constructors(team_colors)
    cat = session_category(session_type)
    report = _fastf1_report(laps, stints, pit_stops, weather, race_control)

    return RaceSession(
        year=year, grand_prix=str(ev.get("EventName") or gp),
        official_name=str(ev.get("OfficialEventName") or ""),
        session_type=session_type, category=cat, circuit=circuit, total_laps=total_laps,
        data_source=DataSource.LIVE, fetched_at=_now(), notes=notes, source_report=report,
        drivers=drivers, constructors=constructors, classification=_sort_classification(classification),
        laps=laps, stints=stints, pit_stops=pit_stops, race_control=race_control,
        weather=weather, positions=positions, track_status_windows=windows,
    )


def _compound_before(stints, code, lap):
    prev = [s for s in stints if s.driver == code and s.end_lap <= lap]
    return max(prev, key=lambda s: s.end_lap).compound if prev else Compound.UNKNOWN


def _compound_after(stints, code, lap):
    nxt = [s for s in stints if s.driver == code and s.start_lap > lap]
    return min(nxt, key=lambda s: s.start_lap).compound if nxt else Compound.UNKNOWN


def _fastf1_report(laps, stints, pit_stops, weather, race_control):
    from ..models import FacetSource, SourceReport
    def f(name, present, conf="high", detail=None):
        return FacetSource(facet=name, source="fastf1" if present else "none",
                           confidence=conf if present else "low", detail=detail)
    facets = [
        f("laps", bool(laps)), f("tyres", bool(stints)),
        f("pit_stops", bool(pit_stops), conf="low",
          detail="FastF1 has no stop duration; enriched from Jolpica / estimated."),
        f("weather", bool(weather)), f("race_control", bool(race_control)),
    ]
    missing = [x.facet for x in facets if x.source == "none"]
    return SourceReport(data_source=DataSource.LIVE, fetched_at=_now(), facets=facets, missing=missing)


def _race_control_from_fastf1(session) -> tuple[list[RaceControlEvent], list[TrackStatusWindow]]:
    events: list[RaceControlEvent] = []
    try:
        rcm = session.race_control_messages
    except Exception:
        return events, []
    for _, m in rcm.iterrows():
        status = None
        msg = str(m.get("Message") or "")
        upper = msg.upper()
        if "VIRTUAL SAFETY CAR" in upper or "VSC" in upper:
            status = TrackStatus.VSC
        elif "SAFETY CAR" in upper:
            status = TrackStatus.SAFETY_CAR
        elif "RED FLAG" in upper:
            status = TrackStatus.RED
        events.append(RaceControlEvent(
            lap=_int(m.get("Lap")), category=str(m.get("Category") or ""),
            flag=(str(m.get("Flag")) if m.get("Flag") is not None else None),
            scope=(str(m.get("Scope")) if m.get("Scope") is not None else None),
            status=status, message=msg,
        ))
    windows = _windows_from_track_status(session)
    return events, windows


def _windows_from_track_status(session) -> list[TrackStatusWindow]:
    """Derive VSC/SC/red windows from FastF1's per-lap track status column."""
    windows: list[TrackStatusWindow] = []
    try:
        laps_df = session.laps
    except Exception:
        return windows
    # collapse to one status per lap number across the field
    per_lap: dict[int, TrackStatus] = {}
    for _, lp in laps_df.iterrows():
        ln = _int(lp.get("LapNumber"))
        if ln is None:
            continue
        st = _track_status_from_codes(lp.get("TrackStatus"))
        if st != TrackStatus.GREEN:
            # keep the most severe seen on that lap
            per_lap[ln] = st if ln not in per_lap else _more_severe(per_lap[ln], st)
    # group contiguous laps of same status
    labels = {TrackStatus.VSC: "Virtual Safety Car", TrackStatus.SAFETY_CAR: "Safety Car",
              TrackStatus.RED: "Red Flag", TrackStatus.YELLOW: "Yellow"}
    cur = None
    for ln in sorted(per_lap):
        st = per_lap[ln]
        if cur and st == cur["status"] and ln == cur["end"] + 1:
            cur["end"] = ln
        else:
            if cur:
                windows.append(TrackStatusWindow(status=cur["status"], start_lap=cur["start"],
                                                 end_lap=cur["end"], label=labels.get(cur["status"], "")))
            cur = {"status": st, "start": ln, "end": ln}
    if cur:
        windows.append(TrackStatusWindow(status=cur["status"], start_lap=cur["start"],
                                         end_lap=cur["end"], label=labels.get(cur["status"], "")))
    return [w for w in windows if w.status in (TrackStatus.VSC, TrackStatus.SAFETY_CAR, TrackStatus.RED)]


_SEVERITY = {TrackStatus.GREEN: 0, TrackStatus.YELLOW: 1, TrackStatus.VSC: 2,
             TrackStatus.SAFETY_CAR: 3, TrackStatus.RED: 4}


def _more_severe(a: TrackStatus, b: TrackStatus) -> TrackStatus:
    return a if _SEVERITY[a] >= _SEVERITY[b] else b


def _weather_from_fastf1(session) -> list[WeatherPoint]:
    out: list[WeatherPoint] = []
    try:
        wdf = session.weather_data
    except Exception:
        return out
    for _, w in wdf.iterrows():
        t = w.get("Time")
        out.append(WeatherPoint(
            time_min=round(t.total_seconds() / 60, 1) if hasattr(t, "total_seconds") else None,
            air_temp=_num(w.get("AirTemp")), track_temp=_num(w.get("TrackTemp")),
            humidity=_num(w.get("Humidity")), rainfall=bool(w.get("Rainfall")),
            wind_speed=_num(w.get("WindSpeed")), wind_direction=_num(w.get("WindDirection")),
        ))
    return out


# --------------------------------------------------------------------------- #
# pitwall static-API path (fallback when FastF1 unavailable)
# --------------------------------------------------------------------------- #
def _fetch_via_static(year: int, gp: str, session_type: str) -> RaceSession:
    import pitwall
    path, race_name = pitwall._find_session(year, gp, session_type)
    if not path:
        raise FetchError(f"No '{session_type}' session found for '{gp}' in {year}.")

    try:
        dm = pitwall._driver_map(path)          # {num: {name, team, tla}}
        timing = pitwall._get_keyframe(path, "TimingData").get("Lines", {})
    except Exception as exc:  # noqa: BLE001
        raise FetchError(f"Could not fetch core feeds for {gp} {year}: {exc}") from exc

    notes: list[str] = []
    grid_lookup = _jolpica_grid(year, race_name or gp)

    # tyres / pits / rc / weather — each optional
    def _safe_keyframe(feed):
        try:
            return pitwall._get_keyframe(path, feed)
        except Exception as exc:  # noqa: BLE001
            notes.append(f"{feed} feed unavailable ({exc}).")
            return {}

    tyres = _safe_keyframe("TyreStintSeries").get("Stints", {})
    pit_series = _safe_keyframe("PitStopSeries").get("PitTimes", {})
    rc_raw = _safe_keyframe("RaceControlMessages").get("Messages", [])
    weather_raw = _safe_keyframe("WeatherData")

    # drivers + classification from final TimingData
    drivers: list[Driver] = []
    classification: list[ClassificationRow] = []
    team_colors: dict[str, str] = {}
    for num, info in dm.items():
        tla = info.get("tla", num)
        team = info.get("team", "?")
        data = timing.get(num, {})
        grid = grid_lookup.get(tla.upper())
        pos = _int(data.get("Position")) if isinstance(data, dict) else None
        retired = bool(isinstance(data, dict) and data.get("Retired"))
        drivers.append(Driver(number=num, code=tla, name=info.get("name", tla),
                              team=team, grid=grid))
        classification.append(ClassificationRow(
            position=pos, driver=tla, name=info.get("name", tla), team=team,
            grid=grid, status="DNF" if retired else "Finished",
            gap=(data.get("GapToLeader") if isinstance(data, dict) else None),
            best_lap=_time_str_to_sec(_nested(data, "BestLapTime", "Value")),
            pit_stops=_int(data.get("NumberOfPitStops")) or 0 if isinstance(data, dict) else 0,
            laps_completed=_int(data.get("NumberOfLaps")) if isinstance(data, dict) else None,
            retired=retired,
        ))

    # lap-by-lap via TimingData stream (mirrors pitwall.get_lap_times)
    laps, positions = _stream_laps(pitwall, path, dm)
    _fill_gaps(laps)

    # stints
    stints: list[Stint] = []
    for num, stint_list in tyres.items():
        tla = dm.get(num, {}).get("tla", num)
        start = 1
        for i, s in enumerate([s for s in stint_list if isinstance(s, dict)], start=1):
            length = _int(s.get("TotalLaps")) or 0
            end = start + length - 1
            stints.append(Stint(
                driver=tla, stint=i, compound=_compound(s.get("Compound")),
                start_lap=start, end_lap=end, laps=length,
                is_new_tyre=(str(s.get("New")).lower() == "true"),
            ))
            start = end + 1
    _enrich_stints(stints, laps)

    # pit stops
    pit_stops: list[PitStop] = []
    if pit_series:
        for num, entries in pit_series.items():
            tla = dm.get(num, {}).get("tla", num)
            for e in entries:
                ps = e.get("PitStop", {}) if isinstance(e, dict) else {}
                pit_stops.append(PitStop(
                    driver=tla, lap=_int(ps.get("Lap")) or 0,
                    stationary_time=_num(ps.get("PitStopTime")),
                    pit_lane_time=_num(ps.get("PitLaneTime")),
                ))
    else:
        notes.append("PitStopSeries feed only covers 2025+; deriving stops from stints.")
        for st in stints:
            if st.stint > 1:
                pit_stops.append(PitStop(driver=st.driver, lap=st.start_lap - 1))

    # race control + windows
    race_control: list[RaceControlEvent] = []
    ml = rc_raw if isinstance(rc_raw, list) else list(rc_raw.values())
    for m in ml:
        if not isinstance(m, dict):
            continue
        msg = str(m.get("Message") or "")
        status = None
        if "VIRTUAL SAFETY CAR" in msg.upper():
            status = TrackStatus.VSC
        elif "SAFETY CAR" in msg.upper():
            status = TrackStatus.SAFETY_CAR
        elif "RED" in msg.upper() and "FLAG" in msg.upper():
            status = TrackStatus.RED
        race_control.append(RaceControlEvent(
            lap=_int(m.get("Lap")), category=str(m.get("Category") or ""),
            flag=(str(m.get("Flag")) if m.get("Flag") else None),
            scope=(str(m.get("Scope")) if m.get("Scope") else None),
            status=status, message=msg,
        ))
    windows = _windows_from_rc(race_control)

    # weather (keyframe is a snapshot; stream would give a series)
    weather: list[WeatherPoint] = []
    if weather_raw:
        weather.append(WeatherPoint(
            air_temp=_num(weather_raw.get("AirTemp")), track_temp=_num(weather_raw.get("TrackTemp")),
            humidity=_num(weather_raw.get("Humidity")),
            rainfall=str(weather_raw.get("Rainfall", "0")) not in ("0", "", "None"),
            wind_speed=_num(weather_raw.get("WindSpeed")),
            wind_direction=_num(weather_raw.get("WindDirection")),
        ))

    total_laps = max((l.lap for l in laps), default=0)
    return RaceSession(
        year=year, grand_prix=race_name or gp, session_type=session_type,
        category=session_category(session_type),
        total_laps=total_laps, data_source=DataSource.LIVE, fetched_at=_now(), notes=notes,
        source_report=_fastf1_report(laps, stints, pit_stops, weather, race_control),
        drivers=drivers, constructors=_constructors(team_colors),
        classification=_sort_classification(classification), laps=laps, stints=stints,
        pit_stops=pit_stops, race_control=race_control, weather=weather,
        positions=positions, track_status_windows=windows,
    )


def _stream_laps(pitwall, path, dm) -> tuple[list[Lap], list[PositionPoint]]:
    """Replay the TimingData stream to reconstruct per-lap times & positions.

    Mirrors pitwall.get_lap_times' merge strategy but keeps position too.
    """
    import copy
    import json

    feeds = pitwall._get_json(f"{path}Index.json").get("Feeds", {})
    sp = feeds.get("TimingData", {}).get("StreamPath", "")
    laps: list[Lap] = []
    positions: list[PositionPoint] = []
    if not sp:
        return laps, positions
    resp = pitwall._http.get(f"{pitwall.STATIC_BASE}/{path}{sp}",
                             timeout=get_settings().fetch_timeout)
    resp.raise_for_status()
    resp.encoding = "utf-8-sig"
    state = pitwall._get_keyframe(path, "TimingData")
    prev_lap: dict[str, int] = {}
    for line in resp.text.strip().split("\n"):
        _, ds = pitwall._parse_stream_line(line)
        if not ds:
            continue
        try:
            state = pitwall._deep_merge(state, json.loads(ds))
        except json.JSONDecodeError:
            continue
        for num, info in state.get("Lines", {}).items():
            if not isinstance(info, dict):
                continue
            lap_num = info.get("NumberOfLaps")
            lt = info.get("LastLapTime", {})
            val = lt.get("Value", "") if isinstance(lt, dict) else ""
            if not lap_num:
                continue
            if lap_num != prev_lap.get(num):
                prev_lap[num] = lap_num
                tla = dm.get(num, {}).get("tla", num)
                pos = _int(info.get("Position"))
                laps.append(Lap(driver=tla, lap=int(lap_num),
                                lap_time=_time_str_to_sec(val), position=pos,
                                gap_to_leader=_time_str_to_sec(info.get("GapToLeader"))))
                if pos:
                    positions.append(PositionPoint(driver=tla, lap=int(lap_num), position=pos))
    return laps, positions


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
def _stints_from_laps(laps: list[Lap], drivers: list[Driver]) -> list[Stint]:
    by_driver: dict[str, list[Lap]] = {}
    for l in laps:
        by_driver.setdefault(l.driver, []).append(l)
    stints: list[Stint] = []
    for code, dl in by_driver.items():
        dl.sort(key=lambda x: x.lap)
        groups: dict[int, list[Lap]] = {}
        for l in dl:
            groups.setdefault(l.stint or 1, []).append(l)
        for idx in sorted(groups):
            g = groups[idx]
            stints.append(Stint(
                driver=code, stint=idx, compound=g[0].compound,
                start_lap=g[0].lap, end_lap=g[-1].lap, laps=len(g),
                is_new_tyre=g[0].pit_out or idx == 1,
            ))
    _enrich_stints(stints, laps)
    return stints


def _enrich_stints(stints: list[Stint], laps: list[Lap]) -> None:
    idx: dict[tuple[str, int], list[float]] = {}
    for l in laps:
        if l.lap_time and not l.is_outlier:
            idx.setdefault((l.driver, l.stint or 1), []).append(l.lap_time)
    for st in stints:
        times = sorted(idx.get((st.driver, st.stint), []))
        if not times:
            continue
        st.avg_lap = round(sum(times) / len(times), 3)
        st.median_lap = round(times[len(times) // 2], 3)
        st.best_lap = round(min(times), 3)
        if len(times) >= 4:
            third = max(1, len(times) // 3)
            first = sum(times[:third]) / third
            last = sum(times[-third:]) / third
            st.degradation = round((last - first) / max(1, st.laps), 3)


def _fill_gaps(laps: list[Lap]) -> None:
    """Ensure interval-to-car-ahead is populated from gap-to-leader per lap."""
    by_lap: dict[int, list[Lap]] = {}
    for l in laps:
        by_lap.setdefault(l.lap, []).append(l)
    for lap_no, group in by_lap.items():
        with_gap = [g for g in group if g.gap_to_leader is not None]
        with_gap.sort(key=lambda x: (x.position if x.position else 999))
        for i, g in enumerate(with_gap):
            if i == 0:
                g.interval = 0.0
            elif with_gap[i - 1].gap_to_leader is not None and g.gap_to_leader is not None:
                g.interval = round(g.gap_to_leader - with_gap[i - 1].gap_to_leader, 3)


def _windows_from_rc(events: list[RaceControlEvent]) -> list[TrackStatusWindow]:
    """Pair deploy/clear race-control messages into track-status windows."""
    windows: list[TrackStatusWindow] = []
    open_status: dict[TrackStatus, int] = {}
    for e in sorted(events, key=lambda x: (x.lap or 0)):
        up = e.message.upper()
        lap = e.lap or 0
        if e.status in (TrackStatus.VSC, TrackStatus.SAFETY_CAR) and "END" not in up and "CLEAR" not in up:
            open_status.setdefault(e.status, lap)
        if ("ENDING" in up or "CLEAR" in up) and open_status:
            for st, start in list(open_status.items()):
                windows.append(TrackStatusWindow(
                    status=st, start_lap=start, end_lap=lap,
                    label="Virtual Safety Car" if st == TrackStatus.VSC else "Safety Car"))
                del open_status[st]
    return windows


def _constructors(team_colors: dict[str, str]):
    from ..models import Constructor
    return [Constructor(id=name.lower().replace(" ", "_"), name=name, color=color)
            for name, color in team_colors.items() if name and name != "?"]


def _sort_classification(rows: list[ClassificationRow]) -> list[ClassificationRow]:
    return sorted(rows, key=lambda r: (r.position is None, r.position or 999, r.retired))


# --- tiny value coercers --------------------------------------------------- #
def _result_gap(row) -> str | None:
    t = row.get("Time")
    if t is None or _isna(t):
        return None
    try:
        return f"+{t.total_seconds():.3f}s" if hasattr(t, "total_seconds") else str(t)
    except Exception:
        return None


def _time_str_to_sec(value) -> float | None:
    """'1:07.234' or '67.234' -> 67.234."""
    if not value:
        return None
    s = str(value).strip()
    try:
        if ":" in s:
            m, rest = s.split(":", 1)
            return round(int(m) * 60 + float(rest), 3)
        return round(float(s), 3)
    except (ValueError, TypeError):
        return None


def _nested(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def _num(v) -> float | None:
    if v is None or _isna(v):
        return None
    try:
        return round(float(v), 3)
    except (ValueError, TypeError):
        return None


def _int(v) -> int | None:
    n = _num(v)
    return int(n) if n is not None else None


def _isna(v) -> bool:
    try:
        return bool(v != v)  # NaN check without importing pandas here
    except Exception:
        return False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def fetch_session(year: int, gp: str, session_type: str) -> RaceSession:
    """Fetch and normalize a real session. Raises FetchError on any failure."""
    settings = get_settings()
    errors: list[str] = []

    if settings.use_fastf1:
        try:
            import fastf1  # noqa: F401
            return _fetch_via_fastf1(year, gp, session_type)
        except FetchError as exc:
            errors.append(f"FastF1: {exc}")
        except ImportError:
            errors.append("FastF1 not installed (pip install 'f1pitwall[full]').")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"FastF1 unexpected: {exc}")

    try:
        return _fetch_via_static(year, gp, session_type)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"static-API: {exc}")

    raise FetchError(" | ".join(errors) or "unknown fetch failure")
