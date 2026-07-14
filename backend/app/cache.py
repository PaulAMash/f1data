"""Local cache for normalized real sessions.

Real F1 data for a *completed* session never changes, so once we successfully
fetch and normalize a session we persist it as JSON keyed by (year, gp, session).
Subsequent loads are served instantly from disk and labelled `cache`.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from .config import get_settings
from .models import DataSource, RaceSession


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# Bump when the normalized schema changes meaningfully (e.g. driver headshots,
# gap normalization) so stale caches refetch instead of serving old shapes.
CACHE_VERSION = "v2"


def cache_key(year: int, gp: str, session_type: str) -> str:
    return f"{CACHE_VERSION}__{year}__{_slug(gp)}__{_slug(session_type)}"


def _path(year: int, gp: str, session_type: str) -> Path:
    return get_settings().cache_dir / f"{cache_key(year, gp, session_type)}.json"


def load(year: int, gp: str, session_type: str) -> RaceSession | None:
    """Return a cached session if present and not expired, else None."""
    p = _path(year, gp, session_type)
    if not p.exists():
        return None
    ttl = get_settings().cache_ttl_hours * 3600
    if ttl > 0 and (time.time() - p.stat().st_mtime) > ttl:
        return None
    try:
        session = RaceSession.model_validate_json(p.read_text())
    except Exception:
        return None
    # A cached session is, by definition, real data served from disk.
    session.data_source = DataSource.CACHE
    return session


def save(session: RaceSession) -> Path:
    p = _path(session.year, session.grand_prix, session.session_type)
    p.write_text(session.model_dump_json(indent=2))
    return p


def has(year: int, gp: str, session_type: str) -> bool:
    return _path(year, gp, session_type).exists()
