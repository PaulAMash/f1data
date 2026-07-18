"""
Season-level driver portrait map, so photos show up consistently everywhere.

OpenF1's per-session driver records sometimes omit headshot_url, and the other
sources (FastF1, Jolpica) never provide portraits at all. This service builds
one identity→URL map per season from that season's meetings, caches it on disk
for a week, and fills the gaps on any loaded session — regardless of which
source served it.

Identity matching is deliberately redundant: a driver is looked up by TLA
acronym, by car number, and by surname, because the sources don't always agree
on acronyms for rookies (the exact failure that left one driver permanently on
the initials fallback while the rest of the field loaded fine).
"""
from __future__ import annotations

import json
import logging
import time
import unicodedata

from ..config import get_settings
from ..models import RaceSession
from .openf1_adapter import _get  # reuse the shared HTTP helper

log = logging.getLogger("pitwall_iq")

_TTL_S = 7 * 24 * 3600
_MAX_MEETINGS = 24      # a whole season if needed — never stop one driver short

# Last-resort curated portraits for drivers the live sources are missing.
# Keyed by normalized full name; the UI falls back to initials if a URL 404s,
# so a stale entry degrades gracefully instead of breaking anything.
_OVERRIDES: dict[str, str] = {
    "arvid lindblad":
        "https://media.formula1.com/content/dam/fom-website/drivers/A/"
        "ARVLIN01_Arvid_Lindblad/arvlin01.png",
}


def _norm(text: str | None) -> str:
    """Lowercase, accent-stripped ('Hülkenberg' → 'hulkenberg')."""
    if not text:
        return ""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip()


def _surname(full_name: str | None) -> str:
    parts = _norm(full_name).split()
    return parts[-1] if parts else ""


def year_map(year: int) -> dict[str, str]:
    """identity-key -> headshot URL for a season, disk-cached.

    Keys per driver: the TLA acronym ("LIN"), the car number ("#41"), and the
    normalized surname ("lindblad")."""
    path = get_settings().cache_dir / f"headshots_v3_{year}.json"
    try:
        if path.exists() and time.time() - path.stat().st_mtime < _TTL_S:
            data = json.loads(path.read_text())
            if data:
                return data
    except Exception:  # noqa: BLE001
        pass

    out: dict[str, str] = {}
    try:
        meetings = sorted(_get("meetings", year=year),
                          key=lambda m: m.get("date_start", ""), reverse=True)
        for m in meetings[:_MAX_MEETINGS]:
            for d in _get("drivers", meeting_key=m.get("meeting_key")):
                url = d.get("headshot_url")
                if not url:
                    continue
                for key in (d.get("name_acronym"),
                            f"#{d.get('driver_number')}" if d.get("driver_number") else None,
                            _surname(d.get("full_name")) or None):
                    if key and key not in out:
                        out[key] = url
    except Exception as exc:  # noqa: BLE001
        log.info("headshot map fetch failed for %s: %s", year, exc)

    if out:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(out))
        except Exception:  # noqa: BLE001
            pass
    return out


def _lookup(mapping: dict[str, str], code: str, number: str | None, surname: str) -> tuple[str | None, str]:
    """Try every identity key in order; report which one hit."""
    if mapping.get(code):
        return mapping[code], "acronym"
    if number and mapping.get(f"#{number}"):
        return mapping[f"#{number}"], "car-number"
    if surname and mapping.get(surname):
        return mapping[surname], "surname"
    return None, "none"


def resolve(session: RaceSession) -> list[dict]:
    """Full per-driver resolution trace — what /api/debug/headshots serves, and
    the exact logic enrich() applies. One place, so the debug view can't lie."""
    mapping = year_map(session.year)
    prev = (year_map(session.year - 1) if session.year - 1 >= 2023 else {})
    out = []
    for d in session.drivers:
        entry = {"code": d.code, "number": d.number, "name": d.name,
                 "in_session_record": bool(d.headshot_url)}
        if d.headshot_url:
            entry.update(resolved_via="session", url=d.headshot_url)
            out.append(entry)
            continue
        surname = _surname(d.name)
        url, via = _lookup(mapping, d.code, str(d.number) if d.number else None, surname)
        if not url and prev:
            url, via = _lookup(prev, d.code, str(d.number) if d.number else None, surname)
            via = f"prev-year-{via}" if url else via
        if not url:
            url = _OVERRIDES.get(_norm(d.name))
            if url:
                via = "override"
        entry.update(resolved_via=via if url else "unresolved", url=url)
        out.append(entry)
    return out


def enrich(session: RaceSession) -> bool:
    """Fill missing driver portraits using resolve(). Returns True if any
    driver was updated (so the caller can refresh the session cache)."""
    if session.year < 2023:  # OpenF1 coverage starts 2023
        return False
    if all(d.headshot_url for d in session.drivers):
        return False
    changed = False
    by_code = {r["code"]: r for r in resolve(session)}
    unresolved = []
    for d in session.drivers:
        if d.headshot_url:
            continue
        r = by_code.get(d.code)
        if r and r.get("url"):
            d.headshot_url = r["url"]
            changed = True
        else:
            unresolved.append(d.code)
    if unresolved:
        log.info("headshots unresolved for %s %s: %s — check /api/debug/headshots",
                 session.year, session.session_type, ", ".join(unresolved))
    return changed
