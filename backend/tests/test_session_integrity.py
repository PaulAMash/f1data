"""V75 — the session has to be trustworthy, or say plainly that it is not.

Three failures shipped together and each had a different cause. A Grand Prix
rendered as a column of car numbers because the entry list was only ever
backfilled as a side effect of backfilling the results. A finisher sat between
two retirements because each adapter ordered rows by its own provider's
convention and the merge mixed them. And "partial" could not tell a missing
weather trace from a missing entry list, so one page said partial and another,
missing just as much, said nothing at all.
"""
from __future__ import annotations

from app.adapters import data_source_manager as dsm
from app.analysis.normalize import order_classification
from app.models import ClassificationRow, Driver, Lap, RaceSession, SourceReport


def _race(**kw) -> RaceSession:
    base = dict(year=2026, grand_prix="Monaco Grand Prix", session_type="Race",
                category="race", total_laps=78, source_report=SourceReport())
    base.update(kw)
    return RaceSession(**base)


def _row(driver, name="", team="Williams", position=None, retired=False, laps=78):
    return ClassificationRow(position=position, driver=driver, name=name or driver,
                             team=team, laps_completed=laps, retired=retired,
                             status="DNF" if retired else "Finished")


# --------------------------------------------------------------------------- #
# 1. the entry list
# --------------------------------------------------------------------------- #
def test_entry_list_is_rebuilt_from_the_classification():
    """Results without a driver feed used to render as car numbers."""
    s = _race(classification=[
        _row("VER", "Max Verstappen", "Red Bull Racing", position=1),
        _row("NOR", "Lando Norris", "McLaren", position=2),
    ])
    assert not s.drivers
    dsm._backfill_drivers(s, primary="openf1")
    assert [d.code for d in s.drivers] == ["VER", "NOR"]
    assert [d.name for d in s.drivers] == ["Max Verstappen", "Lando Norris"]
    assert [d.team for d in s.drivers] == ["Red Bull Racing", "McLaren"]


def test_entry_list_rebuild_says_where_it_came_from():
    s = _race(classification=[_row("VER", "Max Verstappen")])
    dsm._backfill_drivers(s, primary="openf1")
    facet = next(f for f in s.source_report.facets if f.facet == "drivers")
    assert facet.source == "derived"
    assert "classification" in (facet.detail or "")


def test_entry_list_left_alone_when_a_real_feed_answered():
    s = _race(drivers=[Driver(number="1", code="VER", name="Max Verstappen",
                              team="Red Bull Racing")],
              classification=[_row("NOR", "Lando Norris", "McLaren")])
    dsm._backfill_drivers(s, primary="openf1")
    assert [d.code for d in s.drivers] == ["VER"]


def test_entry_list_dedupes_repeated_codes():
    s = _race(classification=[_row("VER", "Max Verstappen"), _row("VER", "Max Verstappen")])
    dsm._backfill_drivers(s, primary="openf1")
    assert len(s.drivers) == 1


# --------------------------------------------------------------------------- #
# 2. FIA ordering
# --------------------------------------------------------------------------- #
def test_a_finisher_is_never_below_a_retirement():
    """The Barcelona shape: the archive numbers retirements in among finishers."""
    s = _race(classification=[
        _row("BEA", position=17, retired=True, laps=40),
        _row("ALB", position=18, retired=False, laps=66),
        _row("ALO", position=19, retired=True, laps=30),
    ])
    order_classification(s)
    order = [c.driver for c in s.classification]
    assert order[0] == "ALB"
    assert set(order[1:]) == {"BEA", "ALO"}


def test_finishers_are_renumbered_contiguously_and_retirements_are_not_classified():
    s = _race(classification=[
        _row("VER", position=1), _row("HAM", position=2, retired=True, laps=20),
        _row("NOR", position=3), _row("LEC", position=4),
    ])
    order_classification(s)
    finishers = [c for c in s.classification if not c.retired]
    assert [c.position for c in finishers] == [1, 2, 3]
    assert all(c.position is None for c in s.classification if c.retired)


def test_retirements_are_ordered_by_how_far_they_got():
    s = _race(classification=[
        _row("A", retired=True, laps=10), _row("B", retired=True, laps=55),
        _row("C", retired=True, laps=32),
    ])
    order_classification(s)
    assert [c.driver for c in s.classification] == ["B", "C", "A"]


def test_ordering_is_idempotent():
    s = _race(classification=[
        _row("VER", position=1), _row("HAM", position=2, retired=True, laps=20),
        _row("NOR", position=3),
    ])
    order_classification(s)
    once = [(c.driver, c.position) for c in s.classification]
    order_classification(s)
    assert [(c.driver, c.position) for c in s.classification] == once


def test_ordering_survives_a_source_that_gave_no_positions_at_all():
    s = _race(classification=[
        _row("A", laps=78), _row("B", laps=78, retired=True), _row("C", laps=78),
    ])
    order_classification(s)
    assert [c.driver for c in s.classification][:2] == ["A", "C"]


def test_ordering_on_an_empty_classification_does_nothing():
    s = _race(classification=[])
    order_classification(s)
    assert s.classification == []


# --------------------------------------------------------------------------- #
# 3. one verdict
# --------------------------------------------------------------------------- #
def test_missing_entry_list_makes_a_race_incomplete():
    s = _race(classification=[_row("VER", position=1)], drivers=[], laps=[])
    dsm._audit_report(s)
    assert "drivers" in s.source_report.essential_missing
    assert s.source_report.complete is False
    assert s.complete is False


def test_a_real_absence_makes_a_session_unavailable_even_when_it_is_enriching():
    """V76 made the gate strict: `missing` is empty or the page is not shown.

    V75 gated on the essential facets only, which left a session that was
    genuinely missing something still rendering with a chip on it asking the
    reader how much to believe. The product rule is that a page we are not
    certain of is a page we do not show.
    """
    s = _race(classification=[_row("VER", position=1)],
              drivers=[Driver(number="1", code="VER", name="Max", team="Red Bull Racing")],
              laps=[Lap(driver="VER", lap=1)], weather=[])
    dsm._audit_report(s)
    assert "weather" in s.source_report.missing
    assert s.source_report.essential_missing == []   # still diagnosed as enriching
    assert s.source_report.complete is False         # and still not rendered


def test_a_question_answered_none_is_not_a_missing_facet():
    """THE MONACO CASE, and the reason strict is fair.

    A derivation that runs over a complete position trace and finds no on-track
    passes has told us something true about the race. Recomputing presence from
    `bool(list)` threw that away, turned a clean street race into a gap, and put
    a partial-data chip on a session holding every fact it needed.
    """
    from app.models import Compound, PositionPoint, Stint, WeatherPoint
    s = _race(classification=[_row("VER", position=1)],
              drivers=[Driver(number="1", code="VER", name="Max", team="Red Bull Racing")],
              laps=[Lap(driver="VER", lap=1)],
              positions=[PositionPoint(driver="VER", lap=1, position=1)],
              stints=[Stint(driver="VER", stint=1, compound=Compound.SOFT,
                            start_lap=1, end_lap=78, laps=78)],
              weather=[WeatherPoint(lap=1, air_temp=23.0)],
              overtakes=[], race_control=[], pit_stops=[])
    # the three that can legitimately count zero were asked, and answered "none"
    dsm._set_facet(s, "overtakes", "inferred", "medium",
                   "no on-track passes were detected in this session.")
    dsm._set_facet(s, "race_control", "f1-archive", "high", "green flag throughout.")
    dsm._set_facet(s, "pit_stops", "openf1", "high", "no stops recorded.")
    dsm._audit_report(s)
    assert "overtakes" not in s.source_report.missing
    assert s.source_report.complete is True


def test_a_facet_nothing_answered_for_is_still_missing():
    """The other half of the same rule — silence is not zero."""
    s = _race(classification=[_row("VER", position=1)],
              drivers=[Driver(number="1", code="VER", name="Max", team="Red Bull Racing")],
              laps=[Lap(driver="VER", lap=1)], overtakes=[])
    dsm._audit_report(s)
    assert "overtakes" in s.source_report.missing
    assert s.source_report.complete is False


def test_an_era_that_never_recorded_laps_is_not_incomplete():
    """1975 has no lap times and never will — that is not our gap."""
    s = _race(year=1975, classification=[_row("LAU", position=1)],
              drivers=[Driver(number="12", code="LAU", name="Niki Lauda", team="Ferrari")],
              laps=[])
    dsm._audit_report(s)
    assert s.source_report.essential_missing == []
    assert s.source_report.complete is True


def test_practice_with_nothing_but_an_entry_list_is_not_rendered():
    """Strict applies to every category, not only to races."""
    s = _race(session_type="Practice 1", category="practice",
              drivers=[Driver(number="1", code="VER", name="Max", team="Red Bull Racing")],
              classification=[])
    dsm._audit_report(s)
    assert s.source_report.complete is False


def test_the_verdict_is_the_same_object_every_page_reads():
    """One gate: the session mirrors the report, so no caller can disagree."""
    s = _race(classification=[_row("VER", position=1)], drivers=[], laps=[])
    dsm._audit_report(s)
    assert s.complete is s.source_report.complete
    assert s.partial is s.source_report.partial
