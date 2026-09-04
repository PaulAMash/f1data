"""
A season does not get shorter because a source had a bad minute.

WHY THIS IS TESTED SEPARATELY. Two releases in a row shipped a season that was
quietly missing its last three rounds, each time by a different mechanism, and
each time the failure was invisible: nothing errored, nothing logged, and the
page was confidently wrong. The merge (adapters/calendar_merge) closes the case
where one source is short and the other is not. This closes the one underneath
it — where the source that knows the whole calendar is the one having the bad
minute, and the answer that reaches the reader is short with nothing to
compare it against.

The rule is that a calendar we have already assembled is not un-assembled by a
later, worse fetch.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.adapters import season_memory
from app.models import GrandPrix


UTC = timezone.utc
FIRST = datetime(2026, 3, 8, 14, 0, tzinfo=UTC)


def season(rounds: int) -> list[GrandPrix]:
    out = []
    for i in range(rounds):
        sunday = FIRST + timedelta(days=13 * i)
        out.append(GrandPrix(
            round=i + 1, name=f"Round {i + 1} Grand Prix",
            country=f"Country {i + 1}", location=f"Place {i + 1}",
            date=sunday.isoformat(),
            sessions=["Practice 1", "Race"],
            session_times={"Practice 1": (sunday - timedelta(days=2)).isoformat(),
                           "Race": sunday.isoformat()}))
    return out


@pytest.fixture(autouse=True)
def clean():
    season_memory.forget()
    yield
    season_memory.forget()


# --------------------------------------------------------------------------- #
# The guarantee
# --------------------------------------------------------------------------- #
def test_a_later_short_fetch_does_not_shorten_a_known_season():
    """THE HEADLINE GUARANTEE. Twenty-three rounds were assembled once; a
    fetch that can only see twenty does not delete three Grands Prix."""
    season_memory.widest(2026, season(23))

    degraded = season_memory.widest(2026, season(20))

    assert len(degraded) == 23
    assert [g.round for g in degraded] == list(range(1, 24))
    assert degraded[-1].name == "Round 23 Grand Prix"


def test_the_ordinary_case_returns_the_fetch_untouched():
    full = season(23)
    season_memory.widest(2026, full)
    again = season_memory.widest(2026, season(23))
    assert [g.name for g in again] == [g.name for g in full]


def test_a_season_that_grows_is_remembered_at_its_new_length():
    """A calendar gaining a round — a late addition, or the other source
    catching up — is the normal direction of travel and must stick."""
    season_memory.widest(2026, season(20))
    assert len(season_memory.widest(2026, season(23))) == 23
    assert season_memory.remembered(2026) == 23
    # and it holds on the next degraded fetch
    assert len(season_memory.widest(2026, season(20))) == 23


def test_fresh_detail_wins_over_what_was_remembered():
    """Retention fills gaps; it never overrides. A round the sources returned
    keeps the times they gave it, not the ones we saw last week."""
    season_memory.widest(2026, season(23))

    moved = season(23)
    moved[0] = moved[0].model_copy(update={
        "session_times": {**moved[0].session_times,
                          "Race": "2026-03-09T09:00:00+00:00"}})
    out = season_memory.widest(2026, moved)

    assert out[0].session_times["Race"] == "2026-03-09T09:00:00+00:00"


def test_seasons_are_remembered_apart():
    season_memory.widest(2026, season(23))
    assert len(season_memory.widest(2025, season(20))) == 20, \
        "one season's length must never be lent to another"


def test_a_total_failure_is_not_papered_over():
    """Nothing fetched is a different fact from a short season, and answering
    it from memory would turn 'the calendar is unreachable' into 'the calendar
    is fine' — a lie the caller cannot see through. Its own fallback (demo
    data, plainly labelled) is the honest answer."""
    season_memory.widest(2026, season(23))
    assert season_memory.widest(2026, []) == []


def test_nothing_is_invented_before_anything_has_been_seen():
    assert len(season_memory.widest(2026, season(20))) == 20


def test_a_restored_round_is_not_a_duplicate_of_itself():
    """The retained rounds go back through the same matching the two live
    sources are merged with, so a round that reappears under a slightly
    different name or date does not arrive twice."""
    season_memory.widest(2026, season(23))

    renamed = season(23)[:20]
    renamed[19] = renamed[19].model_copy(update={"name": "Round 20 Grand Prix (Night)"})
    out = season_memory.widest(2026, renamed)

    assert len(out) == 23
    assert len({g.round for g in out}) == 23
    anchors = [g.session_times["Race"] for g in out]
    assert anchors == sorted(anchors)


def test_the_memory_does_not_grow_without_bound():
    for year in range(2010, 2010 + season_memory.MAX_SEASONS + 4):
        season_memory.widest(year, season(3))
    assert season_memory.remembered(2010) == 0, "the oldest are dropped"
    assert season_memory.remembered(2010 + season_memory.MAX_SEASONS + 3) == 3


def test_forget_clears_a_single_season_and_leaves_the_rest():
    season_memory.widest(2026, season(23))
    season_memory.widest(2025, season(22))
    season_memory.forget(2026)
    assert season_memory.remembered(2026) == 0
    assert season_memory.remembered(2025) == 22
