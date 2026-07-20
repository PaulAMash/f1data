"""
Driver portraits — one provider, one source: Formula1.com.

WHERE PORTRAIT URLs COME FROM (traced end to end):

  * OpenF1's per-session driver record carries a ``headshot_url`` and that URL
    is ALREADY a Formula1.com media URL — OpenF1 relays F1's own CDN link, it
    does not host portraits itself. So "OpenF1 vs Formula1.com" was never two
    different portraits; it is F1's asset either way.

  * That relayed URL is a Cloudinary link of the shape
        https://media.formula1.com/d_driver_fallback_image.png/content/dam/
        fom-website/drivers/2025Drivers/<slug>.png
    The leading ``d_driver_fallback_image.png`` segment is a Cloudinary
    *default-image* directive: "if <slug>.png is missing, serve the generic
    grey silhouette instead — with a normal HTTP 200". That directive is the
    entire reason a driver whose asset F1 hasn't published at that exact slug
    (a rookie like Arvid Lindblad) renders the silhouette rather than initials
    or a real photo: the URL is alive and image-typed, it just isn't him.

THIS PROVIDER, top to bottom, uses only Formula1.com:

  1. Formula1.com's official driver-listing content API — the exact data the
     public Drivers page renders — mapped by normalized full name. This is the
     authoritative portrait for every driver F1 publishes, rookies and
     mid-season replacements included, and it needs no per-driver code: when
     F1 adds a driver, they appear here automatically; a team change never
     matters because the portrait is keyed to the person, not the car.

  2. If (1) is unavailable, the driver's own relayed F1 media URL, normalized:
     the silent ``d_..._fallback_..._image.png`` directive is stripped so a
     genuinely-missing asset returns a real 404 and the UI shows a clean
     team-coloured initials avatar — never a silhouette masquerading as a
     portrait. When F1 later publishes the asset it appears automatically.

There is no Wikipedia, no image hashing, no placeholder detection, no liveness
probing, no per-driver override, and no hardcoded portrait URL anywhere. The
only constants are Formula1.com's own API endpoint and its public site key
(shipped to every visitor's browser), both env-overridable.
"""
from __future__ import annotations

import json
import logging
import re
import time
import unicodedata

from ..config import get_settings
from ..models import RaceSession
from .openf1_adapter import _get  # reuse the shared OpenF1 HTTP helper

log = logging.getLogger("pitwall_iq")

_SEASON_TTL_S = 7 * 24 * 3600
_MAX_MEETINGS = 24   # walk a whole season of OpenF1 meetings if needed

# Cloudinary "default image" directive that silently swaps in F1's grey
# silhouette for any unpublished asset. Matched generically (any d_… segment
# that names a fallback), never a specific driver or filename.
_FALLBACK_DIRECTIVE = re.compile(r"/d_[^/]*fallback[^/]*", re.IGNORECASE)


def _norm(text: str | None) -> str:
    """Lowercase, accent-stripped ('Hülkenberg' → 'hulkenberg')."""
    if not text:
        return ""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip()


def _surname(full_name: str | None) -> str:
    parts = _norm(full_name).split()
    return parts[-1] if parts else ""


# --------------------------------------------------------------------------- #
# The one transform every candidate URL goes through.
# --------------------------------------------------------------------------- #
def official_portrait_url(raw: str | None) -> str | None:
    """Normalize a Formula1.com media URL to its direct-asset form.

    Removes the Cloudinary silent-fallback directive so a missing asset 404s
    (→ clean initials avatar) instead of returning F1's silhouette with a 200.
    Non-F1 URLs pass through unchanged; empty input yields None. Idempotent."""
    if not raw:
        return None
    url = raw.strip()
    if not url:
        return None
    if "formula1.com" in url.lower():
        url = _FALLBACK_DIRECTIVE.sub("", url, count=1)
    return url or None


# --------------------------------------------------------------------------- #
# Source 1 — Formula1.com's official driver-listing (the Drivers page data).
# --------------------------------------------------------------------------- #
def _listing_cache_path(year: int):
    return get_settings().cache_dir / f"portraits_f1_listing_{year}.json"


def _iter_driver_records(node):
    """Walk arbitrary JSON, yielding dicts that look like a driver entry: a
    name plus a formula1.com image URL somewhere inside. Deliberately schema-
    tolerant so a change to F1's response shape degrades to 'no match' rather
    than a crash."""
    if isinstance(node, dict):
        blob = " ".join(str(k).lower() for k in node.keys())
        has_name = any(k in blob for k in ("firstname", "lastname", "name", "driver"))
        img = _find_f1_image(node)
        name = _find_name(node)
        if has_name and img and name:
            yield name, img
        for v in node.values():
            yield from _iter_driver_records(v)
    elif isinstance(node, list):
        for v in node:
            yield from _iter_driver_records(v)


def _find_f1_image(d: dict) -> str | None:
    for k, v in d.items():
        if isinstance(v, str) and "formula1.com" in v.lower() and v.lower().endswith(
                (".png", ".jpg", ".jpeg", ".webp")):
            if any(t in k.lower() for t in ("image", "headshot", "photo", "portrait", "url")):
                return v
    # some payloads nest the URL one level down under an image object
    for v in d.values():
        if isinstance(v, dict):
            u = _find_f1_image(v)
            if u:
                return u
    return None


def _find_name(d: dict) -> str | None:
    first = next((str(v) for k, v in d.items()
                  if "firstname" in k.lower().replace("_", "") and isinstance(v, str)), None)
    last = next((str(v) for k, v in d.items()
                 if "lastname" in k.lower().replace("_", "") and isinstance(v, str)), None)
    if first and last:
        return f"{first} {last}"
    return next((str(v) for k, v in d.items()
                 if k.lower() in ("name", "drivername", "fullname") and isinstance(v, str)), None)


def f1_listing_map(year: int) -> dict[str, str]:
    """normalized full name → official portrait URL, from Formula1.com's own
    driver-listing API. Disk-cached per season. Any failure (offline, non-200,
    unexpected shape, no key) returns {} so resolution safely falls through."""
    path = _listing_cache_path(year)
    try:
        if path.exists() and time.time() - path.stat().st_mtime < _SEASON_TTL_S:
            data = json.loads(path.read_text())
            if data:
                return data
    except Exception:  # noqa: BLE001
        pass

    settings = get_settings()
    base = settings.f1_content_api_base
    key = settings.f1_content_api_key
    if not base or not key:
        return {}

    out: dict[str, str] = {}
    try:
        import requests
        resp = requests.get(base, params={"year": year},
                            headers={"apikey": key, "locale": "en",
                                     "User-Agent": "PitwallIQ/1.0 (F1 analysis app)"},
                            timeout=settings.fetch_timeout)
        resp.raise_for_status()
        records = list(_iter_driver_records(resp.json()))
        for name, img in records:
            k = _norm(name)
            url = official_portrait_url(img)
            if k and url and k not in out:
                out[k] = url
        # Robustness: also key by surname, but ONLY for surnames unique in the
        # listing (no collision risk). This is what lets a driver still match
        # when the two sources spell the full name slightly differently — the
        # realistic way a single rookie can miss the exact-name lookup while
        # every established driver matches. Generic, no per-driver code.
        surname_counts: dict[str, int] = {}
        for name, _img in records:
            surname_counts[_surname(name)] = surname_counts.get(_surname(name), 0) + 1
        for name, img in records:
            sn = _surname(name)
            url = official_portrait_url(img)
            key_sn = f"surname:{sn}"
            if sn and url and surname_counts[sn] == 1 and key_sn not in out:
                out[key_sn] = url
    except Exception as exc:  # noqa: BLE001
        log.info("F1 driver-listing fetch failed for %s: %s", year, exc)
        return {}

    if out:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(out))
        except Exception:  # noqa: BLE001
            pass
    return out


# --------------------------------------------------------------------------- #
# Source 2 — the driver's own relayed F1 media URL, gathered across the season
# from OpenF1 (still Formula1.com assets), used only to fill gaps.
# --------------------------------------------------------------------------- #
def season_media_map(year: int) -> dict[str, str]:
    """identity key (acronym / #number / surname) → normalized F1 media URL,
    built from OpenF1's season meetings. Disk-cached; empty on any failure."""
    path = get_settings().cache_dir / f"portraits_media_{year}.json"
    try:
        if path.exists() and time.time() - path.stat().st_mtime < _SEASON_TTL_S:
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
                url = official_portrait_url(d.get("headshot_url"))
                if not url:
                    continue
                for k in (d.get("name_acronym"),
                          f"#{d.get('driver_number')}" if d.get("driver_number") else None,
                          _surname(d.get("full_name")) or None):
                    if k and k not in out:
                        out[k] = url
    except Exception as exc:  # noqa: BLE001
        log.info("season media map fetch failed for %s: %s", year, exc)

    if out:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(out))
        except Exception:  # noqa: BLE001
            pass
    return out


# --------------------------------------------------------------------------- #
# Resolution + enrichment
# --------------------------------------------------------------------------- #
def resolve(session: RaceSession) -> list[dict]:
    """Per-driver portrait trace (what /api/debug/headshots serves and what
    enrich() applies). Order, all Formula1.com: official listing by name →
    the driver's own normalized media URL → season media map."""
    listing = f1_listing_map(session.year)
    media = season_media_map(session.year)
    out = []
    for d in session.drivers:
        number = str(d.number) if d.number else None
        surname = _surname(d.name)
        url, via = None, "unresolved"

        cand = listing.get(_norm(d.name)) or listing.get(f"surname:{surname}")
        if cand:
            url, via = cand, "f1-listing"
        if not url:
            cand = official_portrait_url(d.headshot_url)
            if cand:
                url, via = cand, "session-media"
        if not url:
            cand = (media.get(d.code) or (media.get(f"#{number}") if number else None)
                    or (media.get(surname) if surname else None))
            if cand:
                url, via = cand, "season-media"

        out.append({"code": d.code, "number": d.number, "name": d.name,
                    "resolved_via": via, "url": url})
    return out


def enrich(session: RaceSession) -> bool:
    """Set every driver's headshot_url from resolve(). Returns True if anything
    changed, so the caller can refresh the cached session."""
    if session.year < 2023:  # OpenF1 coverage starts 2023
        # still normalize any URL the session already carries
        changed = False
        for d in session.drivers:
            norm = official_portrait_url(d.headshot_url)
            if norm != d.headshot_url:
                d.headshot_url = norm
                changed = True
        return changed

    changed = False
    by_code = {r["code"]: r for r in resolve(session)}
    for d in session.drivers:
        r = by_code.get(d.code)
        url = r.get("url") if r else None
        if url != d.headshot_url:
            d.headshot_url = url
            changed = True
    return changed
