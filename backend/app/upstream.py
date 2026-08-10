"""
The one door every outbound archive request goes through.

WHY THIS EXISTS.

Nothing in this backend used to remember an upstream answer. Only a finished
*session bundle* was cached (see app/cache.py); the calendar, the season list,
the standings and the historical results were re-fetched from Jolpica on every
single request, and several of them were re-fetched twice inside one request.
Measured against the real endpoints, ONE season change on the Seasons page cost
nine Jolpica requests:

    3x  {year}.json                 (the calendar, asked by events, by sessions
                                     and again by the round resolver)
    2x  {year}/{round}/results.json (the driver-id map and the classification —
                                     literally the same URL, back to back)
    2x  {year}/driverStandings.json (the table fetched it, and the page fetched
                                     it again just to read the source label)
    1x  seasons.json
    1x  the next season's calendar

Jolpica publishes its limits: **4 requests per second, 500 per hour, and a 429
"Request was throttled." when you exceed either** — per IP, which on Render means
per DEPLOYMENT, shared by every reader at once. Nine requests per season change
puts a single reader over the burst limit on their own, and `raise_for_status()`
turned the 429 into an exception that surfaced as "the historical source was
unreachable". The source was not unreachable. We were asking it the same
question nine times.

So three things happen here, in this order, and nowhere else:

  REMEMBER.  A finished season cannot change, so its answer is kept for a week
             and written to disk; the season in progress gets five minutes.
             This is what protects the 500/hour budget.

  COALESCE.  Two requests for the same URL that arrive while the first is still
             in flight wait for that one instead of starting their own. This is
             what the duplicated standings fetch and a burst of readers on the
             same page both look like from here.

  PACE.      What is left is spaced out so we never exceed the burst limit, and
             a 429 is treated as the instruction it is — wait the interval the
             server names, then try again — rather than as an outage.

None of this is a rewrite of the adapters: they keep their own shapes, their own
fallbacks and their own error types. They just stopped talking to the network
directly.
"""
from __future__ import annotations

import hashlib
import json
import logging
import random
import threading
import time
from datetime import date
from pathlib import Path
from typing import Any

import requests

from .config import get_settings

log = logging.getLogger("pitwall_iq")

# --------------------------------------------------------------------------- #
# How long an answer stays good for.
# --------------------------------------------------------------------------- #
#: A season that has finished is a historical record. It is not going to change.
TTL_IMMUTABLE = 7 * 24 * 3600
#: The season being raced can gain a race, a penalty or a re-classification.
TTL_LIVE = 300
#: The list of seasons gains one entry a year.
TTL_SEASON_LIST = 24 * 3600
#: Only answers kept at least this long are worth a disk write.
_DISK_MIN_TTL = 3600


def ttl_for_year(year: int | None) -> int:
    """The right TTL for an answer about `year` — long if it is history."""
    if year is None:
        return TTL_LIVE
    return TTL_IMMUTABLE if year < date.today().year else TTL_LIVE


# --------------------------------------------------------------------------- #
# Per-host pacing.
# --------------------------------------------------------------------------- #
class _Pacer:
    """A token bucket, so a burst of work cannot outrun a host's published rate.

    Deliberately a touch under the documented limit: the limit is what earns a
    429, not what is safe to sit on, and this process is not the only thing
    behind our egress IP.
    """

    def __init__(self, per_second: float, burst: int) -> None:
        self._interval = 1.0 / per_second
        self._burst = burst
        self._tokens = float(burst)
        self._at = time.monotonic()
        self._lock = threading.Lock()

    def take(self, max_wait: float = 8.0) -> float:
        """Block until a token is free. Returns how long it waited.

        Bounded: if the queue is deep enough that waiting would cost more than
        the request itself, we go anyway and let the 429 handling deal with it.
        A reader waiting on a page is not served by a perfectly polite backend.
        """
        with self._lock:
            now = time.monotonic()
            self._tokens = min(self._burst, self._tokens + (now - self._at) / self._interval)
            self._at = now
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return 0.0
            wait = min(max_wait, (1.0 - self._tokens) * self._interval)
            self._tokens = 0.0
            self._at = now + wait
        time.sleep(wait)
        return wait


#: Jolpica documents 4 requests/second for unauthenticated clients. We pace at
#: three, because the fourth is the one that gets refused.
_PACERS: dict[str, _Pacer] = {
    "api.jolpi.ca": _Pacer(per_second=3.0, burst=3),
    "api.openf1.org": _Pacer(per_second=4.0, burst=4),
}
_DEFAULT_PACER = _Pacer(per_second=8.0, burst=8)


def _pacer_for(url: str) -> _Pacer:
    for host, pacer in _PACERS.items():
        if host in url:
            return pacer
    return _DEFAULT_PACER


# --------------------------------------------------------------------------- #
# The cache itself: memory, then disk, then the network.
# --------------------------------------------------------------------------- #
_MEM: dict[str, tuple[float, Any]] = {}
_MEM_LOCK = threading.Lock()

#: One entry per URL currently being fetched. Everyone else waits on its Event.
_INFLIGHT: dict[str, "_Flight"] = {}
_INFLIGHT_LOCK = threading.Lock()


class _Flight:
    __slots__ = ("done", "value", "error")

    def __init__(self) -> None:
        self.done = threading.Event()
        self.value: Any = None
        self.error: BaseException | None = None


def _key(url: str, params: dict | None) -> str:
    items = sorted((str(k), str(v)) for k, v in (params or {}).items())
    return url + "?" + "&".join(f"{k}={v}" for k, v in items)


def _disk_path(key: str) -> Path:
    digest = hashlib.sha1(key.encode()).hexdigest()[:20]
    return get_settings().cache_dir / "upstream" / f"{digest}.json"


def _disk_read(key: str, ttl: int) -> Any:
    path = _disk_path(key)
    try:
        if not path.exists() or (time.time() - path.stat().st_mtime) > ttl:
            return None
        blob = json.loads(path.read_text())
        # The key is stored alongside the value: a hash prefix is short enough
        # to collide in principle, and serving one season's calendar as another
        # is a worse failure than a cache miss.
        return blob["v"] if blob.get("k") == key else None
    except Exception:  # noqa: BLE001
        return None


def _disk_write(key: str, value: Any) -> None:
    try:
        path = _disk_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"k": key, "v": value}))
        tmp.replace(path)          # atomic: a reader never sees half a file
    except Exception:  # noqa: BLE001
        pass


def cache_clear() -> int:
    """Forget everything. Used by tests and by the cache-clear endpoint."""
    with _MEM_LOCK:
        n = len(_MEM)
        _MEM.clear()
    try:
        for f in (get_settings().cache_dir / "upstream").glob("*.json"):
            f.unlink()
            n += 1
    except Exception:  # noqa: BLE001
        pass
    return n


def cache_stats() -> dict:
    with _MEM_LOCK:
        return {"entries": len(_MEM), "inflight": len(_INFLIGHT)}


# --------------------------------------------------------------------------- #
# The fetch.
# --------------------------------------------------------------------------- #
#: 429 and the transient 5xx family are "ask again", not "this failed".
_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3
_MAX_BACKOFF = 4.0


def _sleep_for(attempt: int, resp: requests.Response | None) -> float:
    """How long to wait before asking again.

    A server that says Retry-After has told us the answer; anything else gets
    exponential backoff with jitter, so a burst of readers that were all
    throttled together do not all come back at the same instant.
    """
    if resp is not None:
        raw = resp.headers.get("Retry-After")
        if raw:
            try:
                return min(_MAX_BACKOFF, max(0.0, float(raw)))
            except ValueError:
                pass
    return min(_MAX_BACKOFF, (0.5 * (2 ** attempt)) * (0.7 + random.random() * 0.6))


def _fetch(url: str, params: dict | None, headers: dict | None, timeout: float) -> Any:
    pacer = _pacer_for(url)
    last: BaseException | None = None
    for attempt in range(_MAX_ATTEMPTS):
        pacer.take()
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            last = exc
            if attempt + 1 >= _MAX_ATTEMPTS:
                raise
            time.sleep(_sleep_for(attempt, None))
            continue
        if resp.status_code in _RETRY_STATUS and attempt + 1 < _MAX_ATTEMPTS:
            wait = _sleep_for(attempt, resp)
            log.info("upstream %s -> HTTP %s, retrying in %.2fs",
                     url, resp.status_code, wait)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    if last:
        raise last
    raise requests.RequestException(f"gave up on {url}")


def fetch_json(url: str, *, params: dict | None = None, headers: dict | None = None,
               timeout: float | None = None, ttl: int = 0) -> Any:
    """A JSON answer from `url`, remembered, coalesced and paced.

    `ttl=0` means "do not cache" — for probes and anything genuinely live.
    Raises whatever `requests` raises when there is no answer to be had; every
    caller here already has its own fallback for that.
    """
    timeout = timeout or get_settings().fetch_timeout
    key = _key(url, params)

    if ttl > 0:
        now = time.time()
        with _MEM_LOCK:
            hit = _MEM.get(key)
            if hit and hit[0] > now:
                return hit[1]
        if ttl >= _DISK_MIN_TTL:
            found = _disk_read(key, ttl)
            if found is not None:
                with _MEM_LOCK:
                    _MEM[key] = (now + ttl, found)
                return found

    # ONE REQUEST PER URL AT A TIME. Two readers opening the same season at the
    # same moment is the ordinary case, not the exotic one, and it used to be
    # two identical requests against a four-per-second budget.
    if ttl <= 0:
        return _fetch(url, params, headers, timeout)

    with _INFLIGHT_LOCK:
        flight = _INFLIGHT.get(key)
        leader = flight is None
        if leader:
            flight = _Flight()
            _INFLIGHT[key] = flight

    if not leader:
        assert flight is not None
        flight.done.wait(timeout=timeout + _MAX_BACKOFF * _MAX_ATTEMPTS)
        if flight.error is not None:
            raise flight.error
        return flight.value

    assert flight is not None
    try:
        value = _fetch(url, params, headers, timeout)
    except BaseException as exc:      # noqa: BLE001 — handed to every waiter
        flight.error = exc
        raise
    else:
        flight.value = value
        with _MEM_LOCK:
            _MEM[key] = (time.time() + ttl, value)
        if ttl >= _DISK_MIN_TTL:
            _disk_write(key, value)
        return value
    finally:
        with _INFLIGHT_LOCK:
            _INFLIGHT.pop(key, None)
        flight.done.set()
