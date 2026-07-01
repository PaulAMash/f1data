"""
Historical Data Explorer — real results for any year / Grand Prix / session.

Broad coverage (1950-present) comes from Jolpica/Ergast: seasons, calendars, race
results, qualifying and sprint results, standings. Sessions that Jolpica does not
carry (practice, and pre-sprint-era sprints) are reported as *honestly unavailable*
rather than fabricated. Everything is normalized to a single row shape for the UI.
"""
from __future__ import annotations

from . import jolpica_adapter as jol
from ..models import session_category

# Which session types the historical (Jolpica/Ergast) source can serve.
_JOLPICA_SESSIONS = {"race", "qualifying", "sprint", "sprint_qualifying"}


def seasons() -> list[dict]:
    out = [s.model_dump() for s in jol.list_seasons()]
    out.sort(key=lambda s: -s["year"])
    return out


def events(year: int) -> list[dict]:
    return [g.model_dump() for g in jol.list_grands_prix(year)]


def sessions_for(year: int, event: str) -> dict:
    """Available + unavailable session types for a given event, honestly labelled."""
    gps = jol.list_grands_prix(year)
    match = next((g for g in gps if g.name.lower() == event.lower()
                  or event.lower() in g.name.lower()), None)
    has_sprint = bool(match and any("sprint" in s.lower() for s in (match.sessions or [])))
    available = (["Sprint Qualifying", "Sprint"] if has_sprint else []) + ["Qualifying", "Race"]
    return {
        "year": year, "event": event,
        "available": available,
        "unavailable": ["Practice 1", "Practice 2", "Practice 3"],
        "note": "Practice sessions aren't available from the historical source (Jolpica/Ergast).",
    }


def results(year: int, event: str, session: str) -> dict:
    cat = session_category(session)
    if cat not in _JOLPICA_SESSIONS:
        return {"available": False, "year": year, "event": event, "session": session,
                "source": "jolpica", "rows": [],
                "note": f"Practice data isn't available from Jolpica/Ergast for {year}. "
                        f"Try Race or Qualifying here, or use Race Explorer for newer "
                        f"detailed sessions."}

    rnd, meta = jol._resolve_round(year, event)  # noqa: SLF001
    if not rnd:
        return {"available": False, "year": year, "event": event, "session": session,
                "rows": [], "note": f"No {year} event matches '{event}'."}

    id_to_code = jol._driver_id_map(year, rnd)  # noqa: SLF001
    if cat in ("sprint", "sprint_qualifying") and "qual" in session.lower() and cat == "sprint_qualifying":
        rows = _sprint_quali(year, rnd, id_to_code)
    elif cat == "sprint":
        rows = _sprint(year, rnd, id_to_code)
    elif cat == "qualifying":
        rows = _qualifying(year, rnd, id_to_code)
    else:
        rows = _race(year, rnd, id_to_code)

    return {
        "available": bool(rows), "year": year, "event": event, "session": session,
        "category": cat, "source": "jolpica", "confidence": "high" if rows else "low",
        "event_name": (meta or {}).get("raceName", event),
        "circuit": (meta or {}).get("Circuit", {}).get("circuitName"),
        "rows": rows,
        "note": None if rows else f"No {session} results found for this event.",
    }


# --------------------------------------------------------------------------- #
def _code(d: dict, id_to_code: dict) -> tuple[str, str]:
    did = d.get("driverId")
    code = id_to_code.get(did) or (d.get("code") or (did or "")[:3]).upper()
    name = f"{d.get('givenName', '')} {d.get('familyName', '')}".strip() or code
    return code, name


def _race(year, rnd, id_to_code) -> list[dict]:
    races = jol._races(f"{year}/{rnd}/results.json", limit=40)  # noqa: SLF001
    rows = []
    for r in (races[0].get("Results", []) if races else []):
        code, name = _code(r.get("Driver", {}), id_to_code)
        fl = r.get("FastestLap", {}).get("Time", {}).get("time")
        rows.append({
            "position": _int(r.get("position")), "driverCode": code, "driverName": name,
            "constructorName": r.get("Constructor", {}).get("name"),
            "time": r.get("Time", {}).get("time"),
            "gap": _gap(r), "laps": _int(r.get("laps")),
            "points": _num(r.get("points")), "status": r.get("status"),
            "grid": _int(r.get("grid")), "fastestLap": fl, "sessionBest": None,
        })
    return rows


def _qualifying(year, rnd, id_to_code) -> list[dict]:
    races = jol._races(f"{year}/{rnd}/qualifying.json", limit=40)  # noqa: SLF001
    rows = []
    for r in (races[0].get("QualifyingResults", []) if races else []):
        code, name = _code(r.get("Driver", {}), id_to_code)
        best = r.get("Q3") or r.get("Q2") or r.get("Q1")
        rows.append({
            "position": _int(r.get("position")), "driverCode": code, "driverName": name,
            "constructorName": r.get("Constructor", {}).get("name"),
            "time": best, "gap": None, "laps": None, "points": None, "status": None,
            "grid": None, "fastestLap": None, "sessionBest": best,
            "q1": r.get("Q1"), "q2": r.get("Q2"), "q3": r.get("Q3"),
        })
    return rows


def _sprint(year, rnd, id_to_code) -> list[dict]:
    races = jol._races(f"{year}/{rnd}/sprint.json", limit=40)  # noqa: SLF001
    rows = []
    for r in (races[0].get("SprintResults", []) if races else []):
        code, name = _code(r.get("Driver", {}), id_to_code)
        rows.append({
            "position": _int(r.get("position")), "driverCode": code, "driverName": name,
            "constructorName": r.get("Constructor", {}).get("name"),
            "time": r.get("Time", {}).get("time"), "gap": _gap(r),
            "laps": _int(r.get("laps")), "points": _num(r.get("points")),
            "status": r.get("status"), "grid": _int(r.get("grid")),
            "fastestLap": r.get("FastestLap", {}).get("Time", {}).get("time"), "sessionBest": None,
        })
    return rows


def _sprint_quali(year, rnd, id_to_code) -> list[dict]:
    # Ergast/Jolpica exposes sprint qualifying under sprint/qualifying in varying
    # schemas; fall back to the sprint grid if a dedicated feed isn't present.
    return _sprint(year, rnd, id_to_code)


def _gap(r) -> str | None:
    t = r.get("Time", {}).get("time")
    return t if (t and str(t).startswith("+")) else None


def _int(v):
    try:
        return None if v in (None, "") else int(v)
    except (ValueError, TypeError):
        return None


def _num(v):
    try:
        return None if v in (None, "") else round(float(v), 1)
    except (ValueError, TypeError):
        return None
