"""
The season is as long as the season.

THE BUG THESE TESTS EXIST FOR. The 2026 Schedule page ended at the São Paulo
Grand Prix. Las Vegas, Qatar and Abu Dhabi — three real rounds, published
months earlier — were simply not there, on a page whose entire job is to say
what is coming.

Nothing was broken and nothing threw. `get_grands_prix` asked OpenF1 first and
returned the first source that answered with anything at all, and OpenF1 is a
live-timing mirror: it creates a meeting when its timing system does, weeks
rather than months ahead. So it answered — correctly, for what it knows — with
a season that stopped where its knowledge stopped, and the second source, which
had the whole calendar, was never reached.

A calendar that silently ends early is the failure mode worth pinning down, so
these tests are written against the *shape* of that failure rather than against
three race names: a short detail source, a complete spine, and the requirement
that no event either of them knows can be lost.
"""
from datetime import datetime, timedelta, timezone

from app.adapters import calendar_merge
from app.models import Circuit, GrandPrix


UTC = timezone.utc
FULL = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]


def jolpica(rnd: int, name: str, country: str, sunday: str) -> GrandPrix:
    """A round as the calendar publisher gives it: numbered, race-day dated,
    with the sessions it has published times for."""
    day = datetime.fromisoformat(sunday).replace(tzinfo=UTC)
    return GrandPrix(
        round=rnd, name=name, country=country, date=sunday,
        circuit=Circuit(id=name.lower().replace(" ", "_"), name=f"{country} Circuit"),
        sessions=FULL,
        session_times={
            "Practice 1": (day - timedelta(days=2, hours=3)).isoformat(),
            "Practice 2": (day - timedelta(days=2)).isoformat(),
            "Practice 3": (day - timedelta(days=1, hours=3)).isoformat(),
            "Qualifying": (day - timedelta(days=1)).isoformat(),
            "Race": day.isoformat(),
        })


def openf1(name: str, country: str, sunday: str, sessions=None) -> GrandPrix:
    """The same weekend as the live-timing mirror gives it: no round number
    (its `round` was the meeting key), Friday-dated, exact session instants."""
    day = datetime.fromisoformat(sunday).replace(tzinfo=UTC)
    names = sessions or FULL
    return GrandPrix(
        name=name, country=country, location=country,
        date=(day - timedelta(days=2)).isoformat(),
        sessions=names,
        session_times={n: (day - timedelta(days=2 - i * 0.4)).isoformat()
                       for i, n in enumerate(names)})


def season(n: int) -> list[GrandPrix]:
    """A synthetic `n`-round season, one round a fortnight."""
    start = datetime(2026, 3, 8, 14, 0, tzinfo=UTC)
    return [jolpica(i + 1, f"Round {i + 1} Grand Prix", f"Country{i + 1}",
                    (start + timedelta(days=14 * i)).isoformat())
            for i in range(n)]


# --------------------------------------------------------------------------- #
# 1. The reported failure: a detail source that stops early
# --------------------------------------------------------------------------- #
def test_a_short_detail_source_never_shortens_the_season():
    """THE HEADLINE GUARANTEE. OpenF1 knowing twenty of twenty-three rounds
    must not turn a twenty-three round season into a twenty round one."""
    spine = season(23)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine[:20]]

    merged = calendar_merge.merge(spine, detail)

    assert len(merged) == 23
    assert [g.name for g in merged] == [g.name for g in spine]
    assert merged[-1].round == 23


def test_the_rounds_the_detail_source_lacks_keep_their_own_schedule():
    """An event OpenF1 has never heard of is not a blank: it still carries the
    sessions and times the publisher gave for it."""
    spine = season(23)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine[:20]]

    tail = calendar_merge.merge(spine, detail)[20:]

    assert len(tail) == 3
    for g in tail:
        assert g.sessions == FULL
        assert g.session_times.get("Race")


def test_rounds_are_numbered_in_calendar_order_with_no_gaps_or_repeats():
    merged = calendar_merge.merge(season(23), [])
    assert [g.round for g in merged] == list(range(1, 24))


def test_no_event_is_duplicated_when_both_sources_know_it():
    spine = season(6)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine]

    merged = calendar_merge.merge(spine, detail)

    assert len(merged) == 6
    assert len({g.name for g in merged}) == 6


# --------------------------------------------------------------------------- #
# 2. What each source is trusted for
# --------------------------------------------------------------------------- #
def test_the_detail_source_supplies_the_session_schedule_it_knows_better():
    """A sprint weekend has no third practice. Where the mirror knows the
    weekend it knows the whole shape of it, so its schedule replaces rather
    than tops up — interleaving the two would put a session on the page that
    nobody is running."""
    spine = season(1)
    sprint = ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"]
    detail = [openf1(spine[0].name, spine[0].country or "",
                     spine[0].session_times["Race"], sessions=sprint)]

    merged = calendar_merge.merge(spine, detail)

    assert merged[0].sessions == sprint
    assert "Practice 3" not in merged[0].session_times


def test_the_spine_supplies_identity_and_number():
    spine = season(3)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine]

    merged = calendar_merge.merge(spine, detail)

    assert [g.round for g in merged] == [1, 2, 3]
    assert all(g.circuit is not None for g in merged), \
        "the circuit is the publisher's, and the mirror does not carry one"


# --------------------------------------------------------------------------- #
# 3. Either source failing costs detail, never an event
# --------------------------------------------------------------------------- #
def test_the_publisher_alone_is_a_complete_season():
    spine = season(23)
    assert len(calendar_merge.merge(spine, [])) == 23


def test_the_mirror_alone_is_still_a_calendar_and_gets_real_round_numbers():
    """OpenF1 has no round field — it used to carry the meeting key, an
    identifier in the thousands. Position stands in, which is what a round is."""
    spine = season(5)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine]

    merged = calendar_merge.merge([], detail)

    assert [g.round for g in merged] == [1, 2, 3, 4, 5]


def test_both_sources_empty_is_empty_rather_than_an_error():
    assert calendar_merge.merge([], []) == []


def test_an_event_only_the_mirror_knows_is_carried_not_dropped():
    """The mistake this module exists to correct, from the other side: a
    calendar must not lose an event whichever source happens to know it."""
    spine = season(3)
    extra_day = datetime(2026, 3, 8, 14, 0, tzinfo=UTC) + timedelta(days=14 * 3)
    detail = [openf1("Round 4 Grand Prix", "Country4", extra_day.isoformat())]

    merged = calendar_merge.merge(spine, detail)

    assert [g.name for g in merged][-1] == "Round 4 Grand Prix"
    assert len(merged) == 4


# --------------------------------------------------------------------------- #
# 4. Matching: the pairings that must happen, and the ones that must not
# --------------------------------------------------------------------------- #
def test_the_same_weekend_is_matched_across_the_two_date_conventions():
    """`date` is the Friday to one source and the Sunday to the other — the
    ambiguity the whole lifecycle module exists to route around. Two days
    apart is a match, not two events."""
    spine = [jolpica(1, "Italian Grand Prix", "Italy", "2026-09-06T13:00:00")]
    detail = [openf1("Italian Grand Prix", "Italy", "2026-09-06T13:00:00")]

    assert len(calendar_merge.merge(spine, detail)) == 1


def test_accents_and_spelling_do_not_split_one_race_into_two():
    spine = [jolpica(1, "São Paulo Grand Prix", "Brazil", "2026-11-08T17:00:00")]
    detail = [openf1("Sao Paulo Grand Prix", "Brazil", "2026-11-08T17:00:00")]

    assert len(calendar_merge.merge(spine, detail)) == 1


def test_two_rounds_in_the_same_country_are_not_collapsed_into_one():
    """Miami and Las Vegas are both the United States. A shared country in a
    different month is not the same weekend."""
    spine = [jolpica(1, "Miami Grand Prix", "United States", "2026-05-03T20:00:00"),
             jolpica(2, "Las Vegas Grand Prix", "United States", "2026-11-21T06:00:00")]
    detail = [openf1("Miami Grand Prix", "United States", "2026-05-03T20:00:00")]

    merged = calendar_merge.merge(spine, detail)

    assert [g.name for g in merged] == ["Miami Grand Prix", "Las Vegas Grand Prix"]
    assert merged[1].sessions == FULL, "Las Vegas must not inherit Miami's schedule"


def test_a_double_header_is_two_events_even_a_week_apart():
    spine = [jolpica(1, "Austrian Grand Prix", "Austria", "2026-07-05T13:00:00"),
             jolpica(2, "British Grand Prix", "United Kingdom", "2026-07-12T14:00:00")]
    detail = [openf1("British Grand Prix", "United Kingdom", "2026-07-12T14:00:00")]

    merged = calendar_merge.merge(spine, detail)

    assert len(merged) == 2
    assert merged[0].name == "Austrian Grand Prix"


# --------------------------------------------------------------------------- #
# 5. Order, and the seasons that came before
# --------------------------------------------------------------------------- #
def test_the_calendar_comes_back_in_chronological_order():
    spine = list(reversed(season(8)))
    merged = calendar_merge.merge(spine, [])
    starts = [calendar_merge.anchor(g) for g in merged]
    assert starts == sorted(starts)


def test_a_historical_season_is_returned_exactly_as_the_publisher_gave_it():
    """Pre-2023 has no second source. Nothing about it may change — not the
    order, not the numbering, not a session time."""
    spine = season(20)
    merged = calendar_merge.merge(spine, [])
    assert [(g.round, g.name, g.session_times) for g in merged] \
        == [(g.round, g.name, g.session_times) for g in spine]


def test_an_undated_archive_entry_does_not_sort_to_the_front():
    """Some old records carry no schedule at all. A missing date must not be
    read as the beginning of time."""
    spine = season(3) + [GrandPrix(round=4, name="Undated Grand Prix", sessions=["Race"])]
    merged = calendar_merge.merge(spine, [])
    assert merged[-1].name == "Undated Grand Prix"


# --------------------------------------------------------------------------- #
# 6. The name is an identity, and the merge must not hand out two of one
# --------------------------------------------------------------------------- #
def test_a_repeated_name_is_disambiguated_from_the_official_title():
    """2026 carries "Bahrain Grand Prix" twice — Sakhir in April, Sepang in
    October. The name is the key every consumer uses, so the merge cannot pass
    two of them on: it takes names from the spine, which is exactly where a
    duplicate would walk past a fix applied downstream."""
    spine = [
        jolpica(4, "Bahrain Grand Prix", "Bahrain", "2026-04-12T15:00:00"),
        jolpica(18, "Bahrain Grand Prix", "Malaysia", "2026-10-11T07:00:00"),
    ]
    spine[1] = spine[1].model_copy(update={
        "official_name": "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026",
        "location": "Sepang"})

    merged = calendar_merge.merge(spine, [])

    assert [g.name for g in merged] == [
        "Bahrain Grand Prix", "Bahrain Grand Prix in Malaysia"]


def test_a_repeated_name_falls_back_to_where_it_is_held():
    """No official title to read: the place still tells them apart, and two
    events sharing an identity is the one outcome that is not allowed."""
    spine = [
        jolpica(4, "Bahrain Grand Prix", "Bahrain", "2026-04-12T15:00:00"),
        jolpica(18, "Bahrain Grand Prix", "Malaysia", "2026-10-11T07:00:00"),
    ]
    merged = calendar_merge.merge(spine, [])
    assert len({g.name for g in merged}) == 2


def test_every_name_in_a_merged_season_is_unique():
    spine = season(23)
    detail = [openf1(g.name, g.country or "", g.session_times["Race"]) for g in spine[:20]]
    merged = calendar_merge.merge(spine, detail)
    assert len({g.name for g in merged}) == len(merged)


def test_a_season_with_no_repeats_keeps_every_name_exactly():
    spine = season(23)
    merged = calendar_merge.merge(spine, [])
    assert [g.name for g in merged] == [g.name for g in spine]
