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

import logging
from datetime import datetime, timedelta, timezone

import requests

from ..analysis.normalize import canonical_name
from ..config import get_settings
from .. import upstream
from . import probe_detail
from ..models import (
    PROVISIONAL_STATUS,
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
_HOST = "api.openf1.org"

log = logging.getLogger("pitwall_iq.openf1")

_COMPOUND = {
    "SOFT": Compound.SOFT, "MEDIUM": Compound.MEDIUM, "HARD": Compound.HARD,
    "INTERMEDIATE": Compound.INTERMEDIATE, "WET": Compound.WET,
}


class OpenF1Error(RuntimeError):
    pass


def _calendar_ttl(path: str, params: dict) -> int:
    """Only the CALENDAR is worth remembering here, and only by season.

    `meetings` and `sessions` for a given year are asked on every page load —
    `/api/current` is the first thing the Race Explorer does, and it is now on
    the critical path of the first paint. They are small, they repeat, and for
    a finished season they can never change. Everything else this adapter
    fetches is a session's own lap/telemetry data: large, asked once, and
    already persisted by app/cache.py as part of the normalized session. Caching
    those twice would double the memory for no second reader.
    """
    if path not in ("meetings", "sessions") or "year" not in params:
        return 0
    if any(k in params for k in ("session_key", "meeting_key")):
        return 0
    try:
        return upstream.ttl_for_year(int(params["year"]))
    except (TypeError, ValueError):
        return 0


def _get(path: str, *, _timeout: float | None = None, _ttl: int | None = None,
         **params) -> list[dict]:
    url = f"{BASE}/{path}"
    ttl = _ttl if _ttl is not None else _calendar_ttl(path, params)
    data = upstream.fetch_json(url, params=params, ttl=ttl,
                               timeout=_timeout or get_settings().fetch_timeout)
    if isinstance(data, dict):  # error payloads come back as objects
        raise OpenF1Error(str(data)[:200])
    return data


def probe() -> tuple[bool, str]:
    """Ask for one known-good session and report the answer in plain language."""
    import time as _time
    started = _time.monotonic()
    try:
        # a probe served from cache has probed nothing
        rows = _get("sessions", _timeout=get_settings().probe_timeout, _ttl=0,
                    year=2024, session_name="Race", country_name="Bahrain")
    except requests.HTTPError as exc:  # answered, just not with data
        code = exc.response.status_code if exc.response is not None else 0
        return False, probe_detail.http_detail(code, _HOST)
    except Exception as exc:  # noqa: BLE001
        return False, probe_detail.transport_detail(exc, _HOST)
    ms = int((_time.monotonic() - started) * 1000)
    if not rows:
        return False, f"{_HOST} answered but returned nothing for a session it should know"
    return True, f"reachable · answered in {ms} ms"


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
    # Pre-season testing isn't a Grand Prix — keep it out of the calendar.
    events = [m for m in sorted(meetings, key=lambda x: x.get("date_start", ""))
              if not is_testing_event(m.get("meeting_name", ""))]
    names = unique_event_names(events)
    for m in events:
        mk = m.get("meeting_key")
        # `round` is deliberately left unset. It used to carry `meeting_key` —
        # an internal identifier in the thousands, not a round number — and a
        # calendar that says the Las Vegas Grand Prix is round 1287 is worse
        # than one that admits it does not know. The merge numbers the season
        # from the source that publishes real rounds, or by position when it
        # cannot (adapters/calendar_merge).
        out.append(GrandPrix(
            name=names.get(mk) or m.get("meeting_name", "?"),
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


def names_agree(requested: str, resolved: str) -> bool:
    """Does a resolved event answer the requested one?

    Every identifying word of the request must appear in the resolved event's
    description — "Bahrain Grand Prix in Malaysia" is not answered by an event
    whose words are only "bahrain" and "sakhir". Used by the archive routes, whose
    lookups are fuzzy and would otherwise hand back the nearest name.
    """
    want = _name_tokens(requested) - _SMALL_TOKENS
    return not want or want <= _name_tokens(resolved)


_SMALL_TOKENS = {"in", "de", "du", "of", "da", "di", "del", "la", "le"}


def is_testing_event(name: str) -> bool:
    import re
    return bool(re.search(r"\btest(ing)?\b|pre-?season", name or "", re.I))


# --------------------------------------------------------------------------- #
# event names
# --------------------------------------------------------------------------- #
# Words that stay lower-case inside a title-cased event name.
_SMALL_WORDS = {"in", "de", "du", "of", "the", "da", "di", "del", "della", "la", "le", "y", "e", "a"}


def _titlecase(text: str) -> str:
    out = []
    for i, word in enumerate(text.split()):
        low = word.lower()
        if i > 0 and low in _SMALL_WORDS:
            out.append(low)
        else:
            out.append(low[:1].upper() + low[1:])
    return " ".join(out)


def name_from_official(meeting_name: str, official: str | None) -> str | None:
    """The event's own name, read out of its official title.

    OpenF1's `meeting_name` is the sponsor-free short form, and it is not always
    unique: 2026 has "Bahrain Grand Prix" twice, because the second is the
    "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026" at Sepang. The
    official title carries the distinguishing words, after the short name and
    before the year — so this returns "Bahrain Grand Prix in Malaysia", which is
    also the name the results archive (Jolpica) uses for the round.
    """
    import re
    if not meeting_name or not official:
        return None
    idx = official.lower().find(meeting_name.lower())
    if idx < 0:
        return None
    tail = re.sub(r"\s+(19|20)\d{2}\s*$", "", official[idx:]).strip()
    return _titlecase(tail) if tail else None


def unique_event_names(meetings: list[dict]) -> dict[int, str]:
    """ONE NAME PER MEETING, UNIQUE WITHIN THE SEASON.

    The name is the key every consumer uses — the website's selector, the app's
    picker, `/api/session?gp=` — so two events sharing one is two events sharing
    one identity: a list keyed on it drew round 4 in round 18's place. The first
    meeting to carry a name keeps it, in date order; a later one is renamed from
    its official title, and failing that by its location.
    """
    names: dict[int, str] = {}
    taken: set[str] = set()
    for m in sorted(meetings, key=lambda x: x.get("date_start", "")):
        mk = m.get("meeting_key")
        base = m.get("meeting_name") or "?"
        name = base
        if name.lower() in taken:
            derived = name_from_official(base, m.get("meeting_official_name"))
            if derived and derived.lower() not in taken:
                name = derived
            else:
                place = m.get("location") or m.get("circuit_short_name") or str(mk)
                name = f"{base} ({place})"
        taken.add(name.lower())
        names[mk] = name
    return names


def _season_names(year: int) -> dict[int, str]:
    """The season's unique names, or nothing when the meetings call fails — the
    resolver below then falls back to the raw meeting names."""
    try:
        meetings = [m for m in _get("meetings", year=year)
                    if not is_testing_event(m.get("meeting_name", ""))]
    except Exception:  # noqa: BLE001
        return {}
    return unique_event_names(meetings)


def _resolve_session(year: int, gp: str, session_type: str) -> dict | None:
    sessions = _get("sessions", year=year)
    st_l = session_type.lower()
    want = _name_tokens(gp)
    names = _season_names(year)
    official = {}
    try:
        official = {m.get("meeting_key"): str(m.get("meeting_official_name") or "")
                    for m in _get("meetings", year=year)}
    except Exception:  # noqa: BLE001
        pass

    def blob_tokens(s: dict) -> set[str]:
        # The official title is in the haystack: "in Malaysia" is what tells the
        # two Bahrain Grands Prix apart, and only the title carries it.
        return _name_tokens(" ".join(str(s.get(k, "")) for k in
                            ("meeting_name", "location", "country_name", "circuit_short_name"))
                            + " " + official.get(s.get("meeting_key"), ""))

    # The season's own unique name first, exactly — so "Bahrain Grand Prix" is the
    # April meeting and "Bahrain Grand Prix in Malaysia" the October one. Then the
    # raw meeting name, then a strict whole-token subset match ("austrian" can never
    # match "Australian Grand Prix"). Crucially, if the Grand Prix doesn't match any
    # meeting we return None so the source chain moves on — we NEVER fall back to an
    # unrelated meeting's sessions (that bug used to serve Melbourne data under an
    # "Austrian Grand Prix" title).
    keys = {mk for mk, n in names.items() if n.lower() == gp.lower()}
    cands = [s for s in sessions if s.get("meeting_key") in keys] if keys else []
    if not cands:
        exact = [s for s in sessions if str(s.get("meeting_name", "")).lower() == gp.lower()]
        cands = exact or [s for s in sessions if want and want <= blob_tokens(s)]
    if not cands:
        return None
    # The unique name travels with the answer, so the session is labelled the way
    # the calendar names it and a client comparing the two sees one identity.
    cands = [dict(c, _display_name=names[c["meeting_key"]],
                  _official_name=official.get(c["meeting_key"]) or None)
             if c.get("meeting_key") in names else c
             for c in cands]
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

    def facet(name, ok, conf="high", detail=None, provisional=False):
        facets.append(FacetSource(facet=name, source="openf1" if ok else "none",
                                  confidence=conf if ok else "low", detail=detail,
                                  provisional=bool(ok and provisional)))
        if not ok:
            missing.append(name)

    # Fetch all endpoints concurrently — this is the dominant cost of a first
    # load, so parallelizing cuts it from ~11 round-trips to ~2.
    from concurrent.futures import ThreadPoolExecutor
    endpoints = ["drivers", "laps", "stints", "pit", "position", "intervals",
                 "weather", "race_control", "overtakes", "starting_grid", "session_result"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {ep: pool.submit(lambda e=ep: _get(e, session_key=sk)) for ep in endpoints}
        raw = {ep: _safe(f.result, [], what=f"{ep} for session {sk}") for ep, f in futures.items()}
    drivers_raw, laps_raw, stints_raw = raw["drivers"], raw["laps"], raw["stints"]
    pit_raw, pos_raw, interval_raw = raw["pit"], raw["position"], raw["intervals"]
    weather_raw, rc_raw, overtake_raw = raw["weather"], raw["race_control"], raw["overtakes"]
    grid_raw, result_raw = raw["starting_grid"], raw["session_result"]

    # --- drivers ---
    dmap: dict[int, dict] = {}
    drivers: list[Driver] = []
    team_colors: dict[str, str] = {}
    grid_by_num = _grid_by_number(grid_raw)
    for d in drivers_raw:
        num = d.get("driver_number")
        code = d.get("name_acronym") or str(num)
        team = d.get("team_name") or "?"
        color = d.get("team_colour")
        color = f"#{color}" if color and not str(color).startswith("#") else (color or "#888888")
        team_colors[team] = color
        dmap[num] = {"code": code, "team": team, "color": color, "name": _driver_name(d, code)}
        drivers.append(Driver(number=str(num), code=code, name=dmap[num]["name"], team=team,
                              team_color=color, grid=grid_by_num.get(num),
                              country=d.get("country_code"), headshot_url=d.get("headshot_url")))
    facet("drivers", bool(drivers))
    # THE GRID IS ITS OWN FEED HERE, AND IT CAN BE EMPTY WHILE EVERYTHING ELSE
    # IS FULL. Say whether it answered, so the pipeline knows to ask the
    # results archive for the one field a result without it cannot supply —
    # rather than a "won from P?" that nothing ever explained.
    if grid_by_num:
        facets.append(FacetSource(facet="starting_grid", source="openf1", confidence="high",
                                  detail="Starting grid from OpenF1's starting_grid feed."))

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

    # --- pit stops (pit_duration = pit-lane entry to exit: the stop's COST) ---
    pit_stops: list[PitStop] = []
    for p in pit_raw:
        code = code_of(p.get("driver_number"))
        lap_no = p.get("lap_number") or 0
        pit_stops.append(_pit_stop(code, lap_no, _num(p.get("pit_duration")), stints))
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
    #
    # THE FACET THAT USED TO LIE BY OMISSION. `session_result` is the official
    # classification and it is published AFTER the session — for a race asked
    # about minutes after the flag it is empty, and the fallback below builds
    # a running order from the position feed instead. That order is real, and
    # it is not a result: it carries no gap, no time, no points and no
    # retirement for anyone, so every car in it reads as a finisher. Reporting
    # it with the same confidence as the official list is what let a race be
    # cached as complete with a "—" in every column the result fills.
    classification = _classification(result_raw, dmap, laps, grid_by_num, positions)
    facet("results", bool(classification),
          conf="high" if result_raw else "low",
          detail=None if result_raw else PROVISIONAL_RESULTS_NOTE,
          provisional=not result_raw)

    total_laps = max((l.lap for l in laps), default=0)
    circuit = Circuit(id=str(meta.get("circuit_short_name", "")).lower().replace(" ", "_"),
                      name=meta.get("circuit_short_name") or meta.get("location") or gp,
                      locality=meta.get("location"), country=meta.get("country_name"),
                      laps=total_laps)

    report = SourceReport(
        data_source=DataSource.LIVE, fetched_at=_now(), facets=facets, missing=missing,
        partial=bool(missing), probes=[])

    return RaceSession(
        year=year, grand_prix=meta.get("_display_name") or meta.get("meeting_name") or gp,
        official_name=meta.get("meeting_official_name") or meta.get("_official_name"),
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
def _safe(fn, default, what: str | None = None):
    """Best-effort, and SAID OUT LOUD when it fails. Eleven endpoints are asked
    at once and any one of them may 404, time out or be rate-limited; a feed
    that silently became an empty list was how the starting grid vanished
    from every record without a line in any log to say which feed had gone."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001
        if what:
            log.info("openf1 %s unavailable — %s: %s", what, type(exc).__name__, str(exc)[:160])
        return default


def _driver_name(d: dict, code: str) -> str:
    """The driver's name as the sport writes it.

    OpenF1's `full_name` is "Kimi ANTONELLI" — the timing screen's shouted
    surname — and it was copied onto every record verbatim. The same row
    carries `first_name` and `last_name` in ordinary case; those are the
    name. When a session's driver rows predate the split fields, the shouted
    form is re-cased instead, and the code is the last resort."""
    first = str(d.get("first_name") or "").strip()
    last = str(d.get("last_name") or "").strip()
    if first and last:
        return f"{first} {last}"
    full = str(d.get("full_name") or "").strip()
    if full:
        return canonical_name(full)
    return canonical_name(last or first) or code


def _grid_by_number(grid_raw) -> dict:
    """{driver_number: grid position} from the starting_grid feed — a real
    position only; a row without one carries nothing."""
    out: dict = {}
    for g in grid_raw or []:
        pos = _int(g.get("position"))
        if g.get("driver_number") is not None and pos is not None:
            out[g.get("driver_number")] = pos
    return out


def _pit_stop(code: str, lap_no: int, lane: float | None, stints: list[Stint]) -> PitStop:
    """One pit entry. `pit_duration` is the time between the pit-lane entry
    and exit lines — the loss a stop costs — and it is recorded as exactly
    that. It is NOT the stationary time and no longer pretends to be: the
    stationary estimate, when there is one, is derived and labelled later
    (analysis/normalize.finalize_pit_stop)."""
    return PitStop(
        driver=code, lap=lap_no, pit_lane_time=lane,
        compound_before=_compound_before(stints, code, lap_no),
        compound_after=_compound_after(stints, code, lap_no),
        source="openf1", confidence="medium" if lane else "low",
        explanation=("OpenF1 pit_duration — time in the pit lane from entry to exit, "
                     "not the stationary time." if lane else
                     "OpenF1 pit entry without a duration yet."),
    )


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
            # THE LINE THAT TOOK OPENF1 OUT OF THE SOURCE CHAIN. A driver's
            # last lap closed its window with `ds + (dur or 100)` — a datetime
            # plus a float, which raises — so every session with a lap table
            # failed here, was logged as "source openf1 failed (error)", and
            # fell through to the archive. The documented primary for 2023+
            # never once served a race; nothing exercised this function with
            # laps until V107 (see tests/test_completed_record.py).
            end = rows[i + 1][1] if i + 1 < len(rows) else (ds + timedelta(seconds=dur or 100))
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
    """The log as published, in the order published, and the neutralisation
    windows paired from the FIA's own deployment / ending lines.

    THE OLD BUILDER LIVED HERE AND READ SUBSTRINGS: any line containing
    "SAFETY CAR" opened a window (a stewards' penalty for a safety-car
    infringement deployed one), any line containing "CLEAR" closed every open
    window (a sector clear ended a Safety Car on its first lap), and a red
    flag opened nothing. The rules now live in analysis/neutralizations, and
    a line's `status` is what the line IS, not what it mentions."""
    from ..analysis.neutralizations import classify_line, windows_from_race_control
    events: list[RaceControlEvent] = []
    for m in rows:
        e = RaceControlEvent(
            lap=m.get("lap_number"), category=str(m.get("category") or ""),
            flag=(str(m.get("flag")) if m.get("flag") else None),
            scope=(str(m.get("scope")) if m.get("scope") else None),
            message=str(m.get("message") or ""))
        status, action = classify_line(e)
        e.status = status if action == "start" else None
        events.append(e)
    return events, windows_from_race_control(events)


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
    # derive from final lap positions — a PROVISIONAL running order, and it
    # says so on every row. It used to say "Finished", which is a claim the
    # position feed cannot make: a car that stopped on lap one still holds a
    # position in it, and nothing here knows who was classified, who retired,
    # or who scored. The official fields stay None until the official
    # classification is reconciled in (see data_source_manager).
    final = {}
    for p in positions:
        final[p.driver] = p  # last wins (positions are appended in lap order)
    order = sorted(final.values(), key=lambda p: p.position)
    for p in order:
        code = p.driver
        d = next((dd for dd in dmap.values() if dd["code"] == code), None) or {"team": "?", "color": "#888888", "name": code}
        best = min((l.lap_time for l in laps if l.driver == code and l.lap_time and not l.pit_in), default=None)
        rows.append(ClassificationRow(position=p.position, driver=code, name=d["name"], team=d["team"],
                    team_color=d["color"], grid=next(
                        (g for n, g in grid_by_num.items() if dmap.get(n, {}).get("code") == code), None),
                    laps_completed=max((l.lap for l in laps if l.driver == code), default=0),
                    best_lap=best, status=PROVISIONAL_STATUS))
    return rows


#: Why the results facet is weaker than the rest of the session, for the
#: sources panel. One sentence, and it must not promise a time.
PROVISIONAL_RESULTS_NOTE = ("Provisional running order from the timing feed's final "
                            "positions — the official classification has not been "
                            "published yet. Gaps, race times, points and retirements "
                            "arrive with it.")


def fetch_results(year: int, gp: str, session_type: str) -> list[ClassificationRow]:
    """The official classification alone, without the laps.

    THIS IS THE CHEAP QUESTION THE HEAL PATH ASKS. A session that was first
    fetched before OpenF1 published `session_result` is cached with a
    provisional running order, and the only thing it is waiting for is that
    one endpoint. Re-fetching the whole session to find out — eleven endpoints,
    tens of thousands of position samples — would make revalidation cost as
    much as the first load, so this asks for the result and the two small
    feeds needed to name the cars, and nothing else.

    Returns an empty list while the official classification is still
    unpublished. Never derives one: the caller already holds a provisional
    order and is asking specifically for something better.
    """
    meta = _resolve_session(year, gp, session_type)
    if not meta:
        raise OpenF1Error(f"No OpenF1 session for {gp} {year} {session_type}")
    sk = meta["session_key"]
    result_raw = _get("session_result", session_key=sk)
    if not result_raw:
        return []
    drivers_raw = _safe(lambda: _get("drivers", session_key=sk), [], what=f"drivers for session {sk}")
    grid_raw = _safe(lambda: _get("starting_grid", session_key=sk), [],
                     what=f"starting_grid for session {sk}")
    dmap: dict[int, dict] = {}
    for d in drivers_raw:
        num = d.get("driver_number")
        code = d.get("name_acronym") or str(num)
        color = d.get("team_colour")
        color = f"#{color}" if color and not str(color).startswith("#") else (color or "#888888")
        dmap[num] = {"code": code, "team": d.get("team_name") or "?",
                     "color": color, "name": _driver_name(d, code)}
    return _classification(result_raw, dmap, [], _grid_by_number(grid_raw), [])


def fetch_pit_stops(year: int, gp: str, session_type: str) -> list[PitStop]:
    """The pit-stop feed alone, for a record whose stops were asked for too early.

    The same question as `fetch_results`, for the other feed a just-finished
    session can be missing: `pit` answers during the session, but the
    `pit_duration` on each row is filled in afterwards, and a record built in
    between holds every stop with no duration on any of them. Three small
    feeds — the stops, the stints that name the compounds, the drivers that
    name the cars — and none of the laps.
    """
    meta = _resolve_session(year, gp, session_type)
    if not meta:
        raise OpenF1Error(f"No OpenF1 session for {gp} {year} {session_type}")
    sk = meta["session_key"]
    pit_raw = _get("pit", session_key=sk)
    if not pit_raw:
        return []
    drivers_raw = _safe(lambda: _get("drivers", session_key=sk), [], what=f"drivers for session {sk}")
    stints_raw = _safe(lambda: _get("stints", session_key=sk), [], what=f"stints for session {sk}")
    code_by_num = {d.get("driver_number"): d.get("name_acronym") or str(d.get("driver_number"))
                   for d in drivers_raw}

    def code_of(num) -> str:
        return code_by_num.get(num, str(num))

    stints: list[Stint] = []
    for s in stints_raw:
        ls, le = s.get("lap_start"), s.get("lap_end")
        if not ls:
            continue
        le = le or ls
        stints.append(Stint(driver=code_of(s.get("driver_number")), stint=s.get("stint_number", 1),
                            compound=_COMPOUND.get(str(s.get("compound") or "").upper(), Compound.UNKNOWN),
                            start_lap=ls, end_lap=le, laps=le - ls + 1))
    return [_pit_stop(code_of(p.get("driver_number")), p.get("lap_number") or 0,
                      _num(p.get("pit_duration")), stints) for p in pit_raw]


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
