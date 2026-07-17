"""
OpenF1 adapter — https://openf1.org (free, no key).

OpenF1 is the richest single source for *modern* sessions (2023+). Unlike FastF1
it also cleanly exposes pit-stop durations, overtakes, intervals and — crucially —
useful **practice** data. So for recent sessions this is our preferred primary.

Everything is normalized into ``app.models`` here; nothing above the adapter sees
OpenF1's raw shapes. All calls are best-effort and guarded: a missing endpoint
degrades the session to `partial` rather than failing the whole fetch.
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
    Overtake,
    PitStop,
    PositionPoint,
    RaceControlEvent,
    RaceSession,
    Season,
    SourceReport,
    Stint,
    TrackStatus,
    TrackStatusWindow,
    WeatherPoint,
    session_category,
)

BASE = "https://api.openf1.org/v1"

_COMPOUND = {
    "SOFT": Compound.SOFT, "MEDIUM": Compound.MEDIUM, "HARD": Compound.HARD,
    "INTERMEDIATE": Compound.INTERMEDIATE, "WET": Compound.WET,
}


class OpenF1Error(RuntimeError):
    pass


def _get(path: str, **params) -> list[dict]:
    url = f"{BASE}/{path}"
    resp = requests.get(url, params=params, timeout=get_settings().fetch_timeout)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):  # error payloads come back as objects
        raise OpenF1Error(str(data)[:200])
    return data


def probe() -> tuple[bool, str]:
    try:
        _get("sessions", year=2024, session_name="Race", country_name="Bahrain")
        return True, "reachable"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:160]


# --------------------------------------------------------------------------- #
# calendar
# --------------------------------------------------------------------------- #
def list_grands_prix(year: int) -> list[GrandPrix]:
    meetings = _get("meetings", year=year)
    sessions = _get("sessions", year=year)
    by_meeting: dict[int, list[str]] = {}
    times: dict[int, dict[str, str]] = {}
    for s in sorted(sessions, key=lambda x: x.get("date_start", "")):
        mk = s.get("meeting_key")
        name = s.get("session_name", "?")
        by_meeting.setdefault(mk, []).append(name)
        if s.get("date_start"):
            times.setdefault(mk, {})[name] = str(s["date_start"])
    out: list[GrandPrix] = []
    for m in sorted(meetings, key=lambda x: x.get("date_start", "")):
        # Pre-season testing isn't a Grand Prix — keep it out of the calendar.
        if is_testing_event(m.get("meeting_name", "")):
            continue
        mk = m.get("meeting_key")
        out.append(GrandPrix(
            round=mk, name=m.get("meeting_name", "?"),
            official_name=m.get("meeting_official_name"), location=m.get("location"),
            country=m.get("country_name"), date=m.get("date_start"),
            sessions=by_meeting.get(mk, []),
            session_times=times.get(mk, {}),
        ))
    return out


def list_seasons() -> list[Season]:
    # OpenF1 covers 2023+; probe a couple of years cheaply.
    out: list[Season] = []
    for year in range(2023, datetime.now().year + 1):
        try:
            n = len(_get("meetings", year=year))
            if n:
                out.append(Season(year=year, events=n))
        except Exception:  # noqa: BLE001
            continue
    return out


# --------------------------------------------------------------------------- #
# session resolution
# --------------------------------------------------------------------------- #
_GENERIC_TOKENS = {"grand", "prix", "gp", "the", "formula", "1", "f1"}


def _name_tokens(text: str) -> set[str]:
    import re
    return {t for t in re.sub(r"[^a-z0-9 ]", " ", (text or "").lower()).split()
            if t and t not in _GENERIC_TOKENS}


def is_testing_event(name: str) -> bool:
    import re
    return bool(re.search(r"\btest(ing)?\b|pre-?season", name or "", re.I))


def _resolve_session(year: int, gp: str, session_type: str) -> dict | None:
    sessions = _get("sessions", year=year)
    st_l = session_type.lower()
    want = _name_tokens(gp)

    def blob_tokens(s: dict) -> set[str]:
        return _name_tokens(" ".join(str(s.get(k, "")) for k in
                            ("meeting_name", "location", "country_name", "circuit_short_name")))

    # Exact meeting-name match first, then a strict whole-token subset match
    # ("austrian" can never match "Australian Grand Prix"). Crucially, if the
    # Grand Prix doesn't match any meeting we return None so the source chain
    # moves on — we NEVER fall back to an unrelated meeting's sessions (that
    # bug used to serve Melbourne data under an "Austrian Grand Prix" title).
    exact = [s for s in sessions if str(s.get("meeting_name", "")).lower() == gp.lower()]
    cands = exact or [s for s in sessions if want and want <= blob_tokens(s)]
    if not cands:
        return None
    # exact session-name match first, then type, then contains
    for pred in (
        lambda s: s.get("session_name", "").lower() == st_l,
        lambda s: s.get("session_type", "").lower() == st_l,
        lambda s: st_l in s.get("session_name", "").lower(),
    ):
        for s in cands:
            if pred(s):
                return s
    return None


# --------------------------------------------------------------------------- #
# main fetch
# --------------------------------------------------------------------------- #
def fetch_session(year: int, gp: str, session_type: str) -> RaceSession:
    meta = _resolve_session(year, gp, session_type)
    if not meta:
        raise OpenF1Error(f"No OpenF1 session for {gp} {year} {session_type}")
    sk = meta["session_key"]
    facets: list[FacetSource] = []
    missing: list[str] = []

    def facet(name, ok, conf="high", detail=None):
        facets.append(FacetSource(facet=name, source="openf1" if ok else "none",
                                  confidence=conf if ok else "low", detail=detail))
        if not ok:
            missing.append(name)

    # Fetch all endpoints concurrently — this is the dominant cost of a first
    # load, so parallelizing cuts it from ~11 round-trips to ~2.
    from concurrent.futures import ThreadPoolExecutor
    endpoints = ["drivers", "laps", "stints", "pit", "position", "intervals",
                 "weather", "race_control", "overtakes", "starting_grid", "session_result"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {ep: pool.submit(lambda e=ep: _get(e, session_key=sk)) for ep in endpoints}
        raw = {ep: _safe(f.result, []) for ep, f in futures.items()}
    drivers_raw, laps_raw, stints_raw = raw["drivers"], raw["laps"], raw["stints"]
    pit_raw, pos_raw, interval_raw = raw["pit"], raw["position"], raw["intervals"]
    weather_raw, rc_raw, overtake_raw = raw["weather"], raw["race_control"], raw["overtakes"]
    grid_raw, result_raw = raw["starting_grid"], raw["session_result"]

    # --- drivers ---
    dmap: dict[int, dict] = {}
    drivers: list[Driver] = []
    team_colors: dict[str, str] = {}
    grid_by_num = {g.get("driver_number"): g.get("position") for g in grid_raw}
    for d in drivers_raw:
        num = d.get("driver_number")
        code = d.get("name_acronym") or str(num)
        team = d.get("team_name") or "?"
        color = d.get("team_colour")
        color = f"#{color}" if color and not str(color).startswith("#") else (color or "#888888")
        team_colors[team] = color
        dmap[num] = {"code": code, "team": team, "color": color,
                     "name": d.get("full_name") or code}
        drivers.append(Driver(number=str(num), code=code, name=dmap[num]["name"], team=team,
                              team_color=color, grid=grid_by_num.get(num),
                              country=d.get("country_code"), headshot_url=d.get("headshot_url")))
    facet("drivers", bool(drivers))

    def code_of(num) -> str:
        return dmap.get(num, {}).get("code", str(num))

    # --- compound per lap from stints ---
    stints: list[Stint] = []
    compound_at: dict[tuple[str, int], Compound] = {}
    age_at: dict[tuple[str, int], int] = {}
    stint_idx_at: dict[tuple[str, int], int] = {}
    for s in stints_raw:
        code = code_of(s.get("driver_number"))
        comp = _COMPOUND.get(str(s.get("compound") or "").upper(), Compound.UNKNOWN)
        ls, le = s.get("lap_start"), s.get("lap_end")
        if not ls:
            continue
        le = le or ls
        age0 = s.get("tyre_age_at_start") or 0
        for lp in range(ls, le + 1):
            compound_at[(code, lp)] = comp
            age_at[(code, lp)] = age0 + (lp - ls) + 1
            stint_idx_at[(code, lp)] = s.get("stint_number", 1)
        stints.append(Stint(driver=code, stint=s.get("stint_number", 1), compound=comp,
                            start_lap=ls, end_lap=le, laps=le - ls + 1,
                            is_new_tyre=(age0 <= 1)))
    facet("stints", bool(stints))

    # --- per-lap position + gap mapping from time series ---
    lap_windows = _lap_windows(laps_raw, code_of)
    pos_by_lap = _timeseries_to_lap(pos_raw, "position", lap_windows, code_of)
    gap_by_lap = _timeseries_to_lap(interval_raw, "gap_to_leader", lap_windows, code_of)

    # --- laps ---
    laps: list[Lap] = []
    positions: list[PositionPoint] = []
    for lp in laps_raw:
        code = code_of(lp.get("driver_number"))
        n = lp.get("lap_number")
        if not n:
            continue
        pos = pos_by_lap.get((code, n))
        gap = gap_by_lap.get((code, n))
        pit_out = bool(lp.get("is_pit_out_lap"))
        laps.append(Lap(
            driver=code, lap=n, lap_time=_num(lp.get("lap_duration")),
            position=pos, compound=compound_at.get((code, n), Compound.UNKNOWN),
            tyre_age=age_at.get((code, n)), stint=stint_idx_at.get((code, n)),
            pit_out=pit_out, gap_to_leader=_num(gap),
            sector1=_num(lp.get("duration_sector_1")), sector2=_num(lp.get("duration_sector_2")),
            sector3=_num(lp.get("duration_sector_3")),
            is_outlier=pit_out or n == 1 or _num(lp.get("lap_duration")) is None,
        ))
        if pos:
            positions.append(PositionPoint(driver=code, lap=n, position=pos))
    facet("laps", bool(laps))
    facet("positions", bool(positions), conf="medium" if positions else "low")

    # mark in-laps (lap before a pit lap) and fill intervals
    pit_laps_by_driver: dict[str, set] = {}
    for p in pit_raw:
        pit_laps_by_driver.setdefault(code_of(p.get("driver_number")), set()).add(p.get("lap_number"))
    for l in laps:
        if l.lap in pit_laps_by_driver.get(l.driver, set()):
            l.pit_in = True
            l.is_outlier = True
    _fill_intervals(laps)

    # --- pit stops (pit_duration = time in pit lane; OpenF1's best stop proxy) ---
    pit_stops: list[PitStop] = []
    for p in pit_raw:
        code = code_of(p.get("driver_number"))
        lap_no = p.get("lap_number") or 0
        dur = _num(p.get("pit_duration"))
        pit_stops.append(PitStop(
            driver=code, lap=lap_no, stop_duration=dur, pit_lane_time=dur,
            compound_before=_compound_before(stints, code, lap_no),
            compound_after=_compound_after(stints, code, lap_no),
            source="openf1", confidence="high" if dur else "low",
            explanation="OpenF1 pit_duration (time stationary + pit-lane).",
        ))
    facet("pit_stops", bool(pit_stops))

    # --- enrich stint pace from laps ---
    _enrich_stints(stints, laps)

    # --- weather ---
    weather = _weather(weather_raw, lap_windows)
    facet("weather", bool(weather))

    # --- race control + windows ---
    race_control, windows = _race_control(rc_raw)
    facet("race_control", bool(race_control))

    # --- overtakes (real if endpoint exists) ---
    overtakes: list[Overtake] = []
    for o in overtake_raw:
        lap_no = _lap_for_time(o.get("date"), lap_windows) or 0
        overtakes.append(Overtake(
            lap=lap_no, overtaker=code_of(o.get("overtaking_driver_number")),
            overtaken=code_of(o.get("overtaken_driver_number")),
            position_after=o.get("position"), kind="on_track", source="openf1",
        ))
    facet("overtakes", bool(overtakes), conf="high" if overtakes else "low",
          detail=None if overtakes else "OpenF1 overtakes endpoint empty; inferred from trace")

    # --- classification ---
    classification = _classification(result_raw, dmap, laps, grid_by_num, positions)
    facet("results", bool(classification), conf="high" if result_raw else "medium")

    total_laps = max((l.lap for l in laps), default=0)
    circuit = Circuit(id=str(meta.get("circuit_short_name", "")).lower().replace(" ", "_"),
                      name=meta.get("circuit_short_name") or meta.get("location") or gp,
                      locality=meta.get("location"), country=meta.get("country_name"),
                      laps=total_laps)

    report = SourceReport(
        data_source=DataSource.LIVE, fetched_at=_now(), facets=facets, missing=missing,
        partial=bool(missing), probes=[])

    return RaceSession(
        year=year, grand_prix=meta.get("meeting_name") or gp,
        official_name=meta.get("meeting_official_name"),
        session_type=meta.get("session_name") or session_type,
        category=session_category(meta.get("session_name") or session_type),
        circuit=circuit, total_laps=total_laps, data_source=DataSource.LIVE,
        fetched_at=_now(), partial=bool(missing), source_report=report,
        notes=[], drivers=drivers,
        constructors=[Constructor(id=t.lower().replace(" ", "_"), name=t, color=c)
                      for t, c in team_colors.items() if t and t != "?"],
        classification=classification, laps=laps, stints=stints, pit_stops=pit_stops,
        overtakes=overtakes, race_control=race_control, weather=weather,
        positions=positions, track_status_windows=windows,
    )


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _safe(fn, default):
    try:
        return fn()
    except Exception:  # noqa: BLE001
        return default


def _lap_windows(laps_raw, code_of):
    """Per-driver [(lap, start_dt, end_dt)] windows from lap date_start + duration."""
    by_driver: dict[str, list] = {}
    for lp in laps_raw:
        code = code_of(lp.get("driver_number"))
        ds = _dt(lp.get("date_start"))
        if ds is None or not lp.get("lap_number"):
            continue
        by_driver.setdefault(code, []).append([lp["lap_number"], ds, lp.get("lap_duration")])
    windows: dict[str, list] = {}
    for code, rows in by_driver.items():
        rows.sort(key=lambda r: r[1])
        out = []
        for i, (n, ds, dur) in enumerate(rows):
            end = rows[i + 1][1] if i + 1 < len(rows) else (ds + (dur or 100))
            out.append((n, ds, end))
        windows[code] = out
    return windows


def _timeseries_to_lap(rows, field, lap_windows, code_of) -> dict:
    """Map a time-series (position/intervals) to the lap active at each sample,
    keeping the last value seen within each lap window."""
    out: dict[tuple[str, int], object] = {}
    for r in rows:
        code = code_of(r.get("driver_number"))
        t = _dt(r.get("date"))
        val = r.get(field)
        if t is None or val is None:
            continue
        for n, start, end in lap_windows.get(code, []):
            if start <= t < end:
                out[(code, n)] = val
                break
    return out


def _lap_for_time(date_str, lap_windows) -> int | None:
    t = _dt(date_str)
    if t is None:
        return None
    best = None
    for windows in lap_windows.values():
        for n, start, end in windows:
            if start <= t < end:
                return n
    return best


def _fill_intervals(laps: list[Lap]) -> None:
    by_lap: dict[int, list[Lap]] = {}
    for l in laps:
        by_lap.setdefault(l.lap, []).append(l)
    for group in by_lap.values():
        wg = [g for g in group if g.gap_to_leader is not None]
        wg.sort(key=lambda x: x.gap_to_leader)
        for i, g in enumerate(wg):
            g.interval = 0.0 if i == 0 else round(g.gap_to_leader - wg[i - 1].gap_to_leader, 3)


def _enrich_stints(stints, laps):
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
            st.degradation = round((sum(times[-third:]) / third - sum(times[:third]) / third) / max(1, st.laps), 3)


def _compound_before(stints, code, lap):
    prev = [s for s in stints if s.driver == code and s.end_lap <= lap]
    return max(prev, key=lambda s: s.end_lap).compound if prev else Compound.UNKNOWN


def _compound_after(stints, code, lap):
    nxt = [s for s in stints if s.driver == code and s.start_lap > lap]
    return min(nxt, key=lambda s: s.start_lap).compound if nxt else Compound.UNKNOWN


def _weather(rows, lap_windows):
    out: list[WeatherPoint] = []
    for w in rows:
        out.append(WeatherPoint(
            lap=_lap_for_time(w.get("date"), lap_windows),
            air_temp=_num(w.get("air_temperature")), track_temp=_num(w.get("track_temperature")),
            humidity=_num(w.get("humidity")), rainfall=bool(w.get("rainfall")),
            wind_speed=_num(w.get("wind_speed")), wind_direction=_num(w.get("wind_direction")),
        ))
    return out


def _race_control(rows):
    events: list[RaceControlEvent] = []
    for m in rows:
        msg = str(m.get("message") or "")
        up = msg.upper()
        status = (TrackStatus.VSC if "VIRTUAL SAFETY CAR" in up else
                  TrackStatus.SAFETY_CAR if "SAFETY CAR" in up else
                  TrackStatus.RED if "RED FLAG" in up else None)
        events.append(RaceControlEvent(
            lap=m.get("lap_number"), category=str(m.get("category") or ""),
            flag=(str(m.get("flag")) if m.get("flag") else None),
            scope=(str(m.get("scope")) if m.get("scope") else None),
            status=status, message=msg))
    windows = _windows_from_rc(events)
    return events, windows


def _windows_from_rc(events):
    windows: list[TrackStatusWindow] = []
    open_status: dict = {}
    for e in sorted(events, key=lambda x: (x.lap or 0)):
        up = e.message.upper()
        lap = e.lap or 0
        if e.status in (TrackStatus.VSC, TrackStatus.SAFETY_CAR) and "END" not in up and "CLEAR" not in up:
            open_status.setdefault(e.status, lap)
        if ("ENDING" in up or "CLEAR" in up or "IN THIS LAP" in up) and open_status:
            for st, start in list(open_status.items()):
                windows.append(TrackStatusWindow(status=st, start_lap=start, end_lap=lap,
                               label="Virtual Safety Car" if st == TrackStatus.VSC else "Safety Car"))
                del open_status[st]
    return windows


def _classification(result_raw, dmap, laps, grid_by_num, positions):
    rows: list[ClassificationRow] = []
    if result_raw:
        for r in result_raw:
            num = r.get("driver_number")
            d = dmap.get(num, {"code": str(num), "team": "?", "color": "#888888", "name": str(num)})
            dnf = bool(r.get("dnf") or r.get("dns") or r.get("dsq"))
            best = min((l.lap_time for l in laps if l.driver == d["code"] and l.lap_time and not l.pit_in),
                       default=None)
            rows.append(ClassificationRow(
                position=(None if dnf else _int(r.get("position"))), driver=d["code"], name=d["name"],
                team=d["team"], team_color=d["color"], grid=grid_by_num.get(num),
                laps_completed=_int(r.get("number_of_laps")),
                status=("DNF" if r.get("dnf") else "DNS" if r.get("dns") else "DSQ" if r.get("dsq") else "Finished"),
                gap=_gap_str(r.get("gap_to_leader")), best_lap=best,
                points=_num(r.get("points")), retired=dnf))
        rows.sort(key=lambda r: (r.position is None, r.position or 999))
        return rows
    # derive from final lap positions
    final = {}
    for p in positions:
        final[p.driver] = p  # last wins (positions are appended in lap order)
    order = sorted(final.values(), key=lambda p: p.position)
    for p in order:
        code = p.driver
        d = next((dd for dd in dmap.values() if dd["code"] == code), None) or {"team": "?", "color": "#888888", "name": code}
        best = min((l.lap_time for l in laps if l.driver == code and l.lap_time and not l.pit_in), default=None)
        rows.append(ClassificationRow(position=p.position, driver=code, name=d["name"], team=d["team"],
                    team_color=d["color"], laps_completed=max((l.lap for l in laps if l.driver == code), default=0),
                    best_lap=best, status="Finished"))
    return rows


def _gap_str(v):
    if v is None:
        return None
    try:
        f = float(v)
        return "LEADER" if f == 0 else f"+{f:.3f}s"
    except (ValueError, TypeError):
        return str(v)


def _dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _num(v):
    try:
        return None if v is None else round(float(v), 3)
    except (ValueError, TypeError):
        return None


def _int(v):
    n = _num(v)
    return int(n) if n is not None else None


def _now():
    return datetime.now(timezone.utc).isoformat()
