"""
A season does not get shorter.

WHY THIS EXISTS. A published Formula 1 calendar is announced once and then
changes rarely and deliberately. The number of rounds we can *see*, on the
other hand, changes constantly and accidentally: Jolpica has a bad minute,
OpenF1 has not created the late-season meetings yet, a fetch times out behind
a cold cache. Each of those makes the season arrive short, and every one of
them is indistinguishable — from inside `get_grands_prix` — from a season that
genuinely is short.

Serving the short answer is the failure this module refuses. It has already
happened twice under different mechanisms, and both times it looked like a
working product with three races quietly missing, which is the worst shape a
bug can take: nothing errors, nothing logs, and the page is confidently wrong.

THE RULE. For a given season, remember the widest calendar we have ever
successfully assembled. When a later fetch comes back missing events we have
seen before, the remembered ones are merged back in rather than dropped —
using the same matching the two live sources are merged with, so an event
cannot come back as a duplicate of itself.

WHAT IT DELIBERATELY DOES NOT DO. It never invents an event, never resurrects
one from a *different* season, and never overrides fresher detail: a retained
round is only ever added where the fetch has nothing to say, and anything the
sources did return wins on every field. A calendar that legitimately loses a
round — a cancellation — therefore keeps showing it until the process restarts
or the retention is cleared, and that is the trade this makes knowingly. A
cancelled race on the schedule is a small, visible wrongness that a reader can
see through; a silently truncated season is an invisible one that they cannot.

It is memory, not a cache: it holds a shape, has no TTL, and is never served
on its own. If nothing has ever been fetched it contributes nothing.
"""
from __future__ import annotations

import threading

from ..models import GrandPrix
from . import calendar_merge

#: Seasons to remember at once. Small on purpose — the Explorer walks a few
#: years at most, and this is a safety net rather than a store.
MAX_SEASONS = 8

_lock = threading.Lock()
_seen: dict[int, list[GrandPrix]] = {}


def widest(year: int, fetched: list[GrandPrix]) -> list[GrandPrix]:
    """The fetched calendar, with any round we have seen before but did not
    get this time merged back in.

    Returns `fetched` unchanged in the ordinary case — when the sources
    answered with everything they have answered with before, which is almost
    always — so the safety net costs a length comparison and nothing else.
    """
    if not fetched:
        # Nothing was fetched at all. This is a total failure of both sources,
        # and answering it from memory would turn "the calendar is unreachable"
        # into "the calendar is fine", which is a lie the caller cannot see
        # through. The caller's own fallback (demo data, plainly labelled) is
        # the honest answer.
        return fetched

    with _lock:
        remembered = _seen.get(year) or []

    merged = fetched
    if remembered:
        missing = [g for g in remembered
                   if not any(calendar_merge.same_event(g, f) for f in fetched)]
        if missing:
            # THE FETCH IS THE SPINE, and the remembered rounds are handed in
            # as the other side of the ordinary merge. They are unmatched by
            # construction — that is what made them missing — so the merge
            # appends them, re-sorts the season and renumbers it, and anything
            # the sources did return wins on every field.
            merged = calendar_merge.merge(fetched, missing)

    with _lock:
        best = _seen.get(year) or []
        if len(merged) >= len(best):
            _seen[year] = merged
        if len(_seen) > MAX_SEASONS:
            for stale in sorted(_seen)[:len(_seen) - MAX_SEASONS]:
                _seen.pop(stale, None)
    return merged


def forget(year: int | None = None) -> None:
    """Drop the memory — for a season, or all of it. Tests, and the admin
    reset; nothing in the request path calls this."""
    with _lock:
        if year is None:
            _seen.clear()
        else:
            _seen.pop(year, None)


def remembered(year: int) -> int:
    """How many rounds we have ever seen for this season. Diagnostics only."""
    with _lock:
        return len(_seen.get(year) or [])
