"""
Season-level driver portrait map, so photos show up consistently everywhere.

OpenF1's per-session driver records sometimes omit headshot_url, and the other
sources (FastF1, Jolpica) never provide portraits at all. This service builds
one code→URL map per season from that season's most recent meetings (walking
back until the grid is covered), caches it on disk for a week, and fills the
gaps on any loaded session — regardless of which source served it.
"""
from __future__ import annotations

import json
import logging
import time

from ..config import get_settings
from ..models import RaceSession
from .openf1_adapter import _get  # reuse the shared HTTP helper

log = logging.getLogger("pitwall_iq")

_TTL_S = 7 * 24 * 3600
_MAX_MEETINGS = 3       # walk back at most this many meetings per season
_FULL_GRID = 18         # stop early once we have most of the field


def year_map(year: int) -> dict[str, str]:
    """code -> headshot URL for a season, disk-cached."""
    path = get_settings().cache_dir / f"headshots_{year}.json"
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
                code, url = d.get("name_acronym"), d.get("headshot_url")
                if code and url and code not in out:
                    out[code] = url
            if len(out) >= _FULL_GRID:
                break
    except Exception as exc:  # noqa: BLE001
        log.info("headshot map fetch failed for %s: %s", year, exc)

    if out:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(out))
        except Exception:  # noqa: BLE001
            pass
    return out


def enrich(session: RaceSession) -> bool:
    """Fill missing driver portraits from the season map. Returns True if any
    driver was updated (so the caller can refresh the session cache)."""
    if session.year < 2023:  # OpenF1 coverage starts 2023
        return False
    missing = [d for d in session.drivers if not d.headshot_url]
    if not missing:
        return False
    mapping = year_map(session.year)
    changed = False
    for d in missing:
        url = mapping.get(d.code)
        if url:
            d.headshot_url = url
            changed = True
    return changed
