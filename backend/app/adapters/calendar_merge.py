"""
One season calendar, assembled from two sources that each know half of it.

THE BUG THIS EXISTS TO CLOSE. `get_grands_prix` asked OpenF1 first and returned
the first source that answered with anything at all:

    sources = [openf1.list_grands_prix, jolpica.list_grands_prix]
    for fn in sources:
        gps = fn(year)
        if gps:
            return gps          # <- Jolpica was never reached

OpenF1 is a live-timing mirror, not a calendar publisher: a meeting appears in
its `meetings` feed when the timing system creates it, which is weeks — not
months — before the cars run. So mid-season it answers with the rounds that
have happened plus the few that are imminent, and the tail of the year simply
is not there yet. The season looked complete because the list was long, and it
ended wherever OpenF1's knowledge ended. In 2026 that was São Paulo, and Las
Vegas, Qatar and Abu Dhabi were missing from a page whose entire job is to say
what is coming.

Jolpica publishes the full published calendar the day it is announced, with the
real round numbers. OpenF1 publishes the exact per-session start instants,
including the sprint formats, for the events it does know. Neither is complete
on its own and neither is wrong — so the calendar is the *merge*, not a race
between two lists:

    SPINE    Jolpica     which Grands Prix exist, in what order, numbered
    DETAIL   OpenF1      when each session of a known weekend actually starts

An event OpenF1 has never heard of keeps Jolpica's schedule and appears in its
proper place. An event Jolpica somehow lacks is still carried, appended in date
order, rather than dropped — a calendar that hides an event is the failure this
module was written for, and it must not reintroduce it from the other side.

Nothing here names a circuit, a country or a season. A calendar that grows,
loses a race, or moves one is merged by the same rules next year.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from ..models import GrandPrix

#: How far apart two sources' idea of the same weekend may be and still be
#: that weekend. `date` means the Friday to OpenF1 and the Sunday to Jolpica
#: (the ambiguity app/schedule.py exists to route around), so a real pairing
#: is already two days apart before anything moves. Four days admits that and
#: still cannot reach the next round, which is a week away at the closest.
MATCH_WINDOW = timedelta(days=4)

#: Words that appear in most event names and therefore identify none of them.
_GENERIC = {"grand", "prix", "gp", "the", "formula", "one", "1", "f1", "of",
            "and", "de", "du", "da", "di", "grande", "premio", "gran"}


def _tokens(*parts: str | None) -> set[str]:
    """The words of a name that could distinguish one event from another."""
    blob = " ".join(p for p in parts if p).lower()
    blob = re.sub(r"[^a-z0-9]+", " ", _fold(blob))
    return {t for t in blob.split() if t and t not in _GENERIC and len(t) > 2}


def _fold(text: str) -> str:
    """São Paulo and Sao Paulo are one place; Emilia-Romagna and Emilia Romagna
    are one race. Accents and punctuation differ between sources and never
    carry meaning here."""
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", text)
                   if not unicodedata.combining(c))


def _instant(value: str | None) -> datetime | None:
    """A comparable instant from any shape the adapters emit, or None."""
    if not value:
        return None
    text = str(value).strip()
    for candidate in (text.replace("Z", "+00:00"), text[:10]):
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    return None


def anchor(gp: GrandPrix) -> datetime | None:
    """When this weekend happens, from whatever the source actually gave.

    The earliest session start if there is one — the only instant both sources
    agree on the meaning of — and the event date otherwise.
    """
    starts = [t for t in (_instant(v) for v in (gp.session_times or {}).values())
              if t is not None]
    return min(starts) if starts else _instant(gp.date)


def same_event(a: GrandPrix, b: GrandPrix) -> bool:
    """Are these two records the same Grand Prix?

    Two independent signals, both required, because either alone produces a
    wrong pairing that is worse than no pairing: a shared date pairs two events
    of a double-header weekend, and a shared token pairs the two United States
    rounds with each other.
    """
    ta, tb = anchor(a), anchor(b)
    if ta is None or tb is None or abs(ta - tb) > MATCH_WINDOW:
        return False
    return bool(_tokens(a.name, a.location, a.country)
                & _tokens(b.name, b.location, b.country))


def _enrich(spine: GrandPrix, detail: GrandPrix) -> GrandPrix:
    """The spine event, told what the detail source knows about its sessions.

    THE SESSION TIMES ARE TAKEN WHOLE, never merged key by key. A weekend has
    one shape — a sprint weekend has no third practice — and interleaving two
    sources' views of it invents a schedule neither published: Jolpica's
    Practice 3 surviving next to OpenF1's Sprint would put a session on the
    page that nobody is running. Where OpenF1 knows the weekend it knows all
    of it, so its schedule replaces rather than tops up.
    """
    if not detail.session_times:
        return spine
    return spine.model_copy(update={
        "sessions": list(detail.sessions or spine.sessions),
        "session_times": dict(detail.session_times),
        "official_name": spine.official_name or detail.official_name,
        "location": spine.location or detail.location,
        "country": spine.country or detail.country,
    })


def merge(spine: list[GrandPrix], detail: list[GrandPrix]) -> list[GrandPrix]:
    """The season, complete: every event either source knows, each with the
    best schedule available for it, in chronological order and numbered.

    Either list may be empty — a source that failed contributes nothing rather
    than emptying the calendar.
    """
    if not spine:
        return _ordered(list(detail))
    if not detail:
        return _ordered(list(spine))

    pool = list(detail)
    merged: list[GrandPrix] = []
    for event in spine:
        match = next((d for d in pool if same_event(event, d)), None)
        if match is not None:
            pool.remove(match)
            merged.append(_enrich(event, match))
        else:
            merged.append(event)

    # Anything the spine did not account for is still a real weekend. It is
    # carried rather than discarded — this module exists because a calendar
    # quietly lost its tail once already.
    merged.extend(pool)
    return _ordered(merged)


def _ordered(events: list[GrandPrix]) -> list[GrandPrix]:
    """Chronological, and numbered where the source did not number them.

    Undated events (archive records that carry no schedule at all) keep their
    given order at the end rather than being sorted to the front by a missing
    date.
    """
    far = datetime.max.replace(tzinfo=timezone.utc)
    ordered = sorted(events, key=lambda g: anchor(g) or far)

    # The calendar's own round numbers are kept when they are actually a
    # numbering of this calendar: one each, 1..n, ascending in time. Jolpica's
    # always are, so a historical season is returned exactly as it was.
    # Anything else — OpenF1 alone, whose `round` was the meeting key (an
    # internal identifier in the thousands), or a merge that turned up an
    # event the spine did not number — is numbered by position, which is what
    # a round is. All or nothing: patching individual gaps is how a calendar
    # ends up with two round 21s.
    rounds = [g.round for g in ordered]
    if rounds != list(range(1, len(ordered) + 1)):
        ordered = [g if g.round == n else g.model_copy(update={"round": n})
                   for n, g in enumerate(ordered, start=1)]
    return _disambiguate(ordered)


def _disambiguate(events: list[GrandPrix]) -> list[GrandPrix]:
    """ONE NAME PER EVENT, UNIQUE WITHIN THE SEASON — after the merge, too.

    The name is the key every consumer uses: the Explorer's selector, the app's
    picker, `/api/session?gp=`. Two events sharing one is two events sharing an
    identity, and a list keyed on it draws one round in another's place — 2026
    carries "Bahrain Grand Prix" twice, the April round at Sakhir and the
    October one at Sepang.

    The adapters each guarantee this for their own calendar. The merge is where
    that guarantee could be lost and therefore where it has to be restated:
    this module takes names from the spine, so a duplicate arriving from there
    would walk straight past a fix applied downstream of it.

    Same ladder the OpenF1 adapter uses, so the two speak one vocabulary: the
    first event to carry a name keeps it, in date order; a later one is renamed
    from its official title ("Bahrain Grand Prix in Malaysia"), and failing that
    by where it is held.
    """
    from .openf1_adapter import name_from_official

    taken: set[str] = set()
    out: list[GrandPrix] = []
    for event in events:
        name = event.name or "?"
        if name.lower() in taken:
            derived = name_from_official(event.name, event.official_name)
            if derived and derived.lower() not in taken:
                name = derived
            else:
                place = event.location or event.country or str(event.round)
                name = f"{event.name} ({place})"
        taken.add(name.lower())
        out.append(event if name == event.name else event.model_copy(update={"name": name}))
    return out
