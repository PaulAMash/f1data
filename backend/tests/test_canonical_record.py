"""V108 — the canonical record is whole, not merely official.

THE FAILURE THESE TESTS REPRODUCE. After V107 the Italian Grand Prix settled —
margin, finishers, retirements, points all right — and the page read "Kimi
ANTONELLI won from P? by +3.857s", with "no notable movers" under it and every
surname on every page shouted. Nothing about the classification was
provisional any more; two fields of it had simply never arrived, from a source
that never carries one of them, and the pipeline had stopped asking the
moment the record settled.

Two root causes, neither about Monza:

  1. OpenF1's `full_name` is "Kimi ANTONELLI". The adapter copied it verbatim,
     and the day V107 made OpenF1 the primary for 2023+ (it had crashed on
     every session before), every record rebuilt through it carried the
     shouted surname. Not a fallback path — the provider's own string.
  2. OpenF1's `session_result` has no starting grid; the grid is a separate
     feed, and when it is empty every row is built with `grid=None`. The
     results archive has the grid for every race since 1950 and was being
     asked anyway, for retirement reasons — but only reasons and times were
     copied off the answer.

And two more found on the way, both the provider's semantics misread: the
pit-lane duration (OpenF1 `pit_duration`, Ergast `duration`) was also written
as the STOP duration and drawn as a stationary time; and a red flag, which
parks every car in the pit lane for twenty minutes, averaged into "pit loss".

What is pinned here: names in the sport's own case from every source and for
every record already cached; the grid reconciled field by field from whichever
source has it, on the first fetch and on later reads of a settled record that
is still owed it, at one request per window; blank values never overwriting
known ones; sentences that do not say where a driver started when nobody
knows; a stoppage that is not a stop cost; the same JSON for every client.

Nothing here is about Monza. The Grand Prix is a parameter.
"""
from __future__ import annotations

import math

import pytest

from app import cache
from app.adapters import data_source_manager as dsm
from app.adapters import jolpica_adapter, openf1_adapter, pitstop_service
from app.adapters import pitwall_adapter as fastf1
from app.analysis import normalize
from app.analysis.engine import analyze
from app.analysis.text import from_grid
from app.models import (
    ClassificationRow, Compound, DataSource, Driver, FacetSource, Lap, PitStop, PositionPoint,
    RaceControlEvent, RaceSession, SourceReport, Stint, WeatherPoint,
)
from tests.test_completed_record import (  # noqa: F401 — the fixture and its world
    FIELD, LAPS, LAP_S, OFFICIAL, RUNNING_ORDER, YEAR, age_cache, assert_official, by_code,
    client, facet, load, official_rows, world,
)

GRID = {code: g for _n, code, _nm, _t, _c, g in FIELD}
NAMES = {code: nm for _n, code, nm, _t, _c, _g in FIELD}
#: the results adapter's real functions, captured before any test stubs them
_REAL_JOLPICA = {name: getattr(jolpica_adapter, name)
                 for name in ("fetch_classification", "fetch_pitstops", "fetch_laps")}


def story_text(session: RaceSession) -> str:
    strategy, _pace = analyze(session)
    return " ".join(strategy.story + strategy.story_advanced)


# --------------------------------------------------------------------------- #
# THE RECORD ACTUALLY SITTING IN PRODUCTION
# --------------------------------------------------------------------------- #
def production_record(gp: str) -> RaceSession:
    """What V107 cached for every 2026 race rebuilt through OpenF1: official,
    settled, every name shouted, and a grid on no row and no driver."""
    order = sorted(FIELD, key=lambda f: RUNNING_ORDER.index(f[1]))
    rows, drivers = [], []
    for n, code, name, team, col, _g in order:
        pos, gap, pts, laps, dnf = OFFICIAL[code]
        first, last = name.split(" ", 1)
        shouted = f"{first} {last.upper()}"
        drivers.append(Driver(number=str(n), code=code, name=shouted, team=team, team_color=col))
        rows.append(ClassificationRow(
            position=pos, driver=code, name=shouted, team=team, team_color=col,
            laps_completed=laps, status="DNF" if dnf else "Finished",
            gap=None if dnf else ("LEADER" if gap == 0 else f"+{gap:.3f}s"),
            points=float(pts), retired=dnf, best_lap=LAP_S,
            race_time=(LAPS * LAP_S + (gap or 0.0)) if not dnf else None,
            retirement_reason="Hydraulics" if dnf else None,
            retirement_source="jolpica" if dnf else None))
    laps = [Lap(driver=code, lap=k, lap_time=LAP_S + i * 0.4, position=RUNNING_ORDER.index(code) + 1,
                stint=1 if k < 3 else 2, compound=Compound.MEDIUM if k < 3 else Compound.HARD)
            for i, (_n, code, *_r) in enumerate(FIELD) for k in range(1, OFFICIAL[code][3] + 1)]
    stints = [Stint(driver=c, stint=1, compound=Compound.MEDIUM, start_lap=1, end_lap=2, laps=2)
              for _n, c, *_r in FIELD if c != "LEC"] + \
             [Stint(driver=c, stint=2, compound=Compound.HARD, start_lap=3, end_lap=3, laps=1)
              for _n, c, *_r in FIELD if c != "LEC"] + \
             [Stint(driver="LEC", stint=1, compound=Compound.MEDIUM, start_lap=1, end_lap=1, laps=1)]
    return RaceSession(
        year=YEAR, grand_prix=gp, session_type="Race", category="race", total_laps=LAPS,
        complete=True, settled=True, data_source=DataSource.LIVE,
        source_report=SourceReport(complete=True, settled=True, facets=[
            FacetSource(facet="results", source="openf1", confidence="high"),
            FacetSource(facet="drivers", source="openf1"), FacetSource(facet="laps", source="openf1"),
            FacetSource(facet="stints", source="openf1"), FacetSource(facet="pit_stops", source="openf1"),
            FacetSource(facet="weather", source="openf1"), FacetSource(facet="race_control", source="openf1")]),
        drivers=drivers, classification=rows, laps=laps, stints=stints,
        pit_stops=[PitStop(driver=c, lap=2, stop_duration=22.4, pit_lane_time=22.4, source="openf1",
                           confidence="high") for _n, c, *_r in FIELD if c != "LEC"],
        positions=[PositionPoint(driver=l.driver, lap=l.lap, position=l.position) for l in laps],
        weather=[WeatherPoint(lap=1, air_temp=27.0, track_temp=41.0)],
        race_control=[RaceControlEvent(lap=1, category="Flag", flag="GREEN", message="GREEN LIGHT")])


def test_the_italian_grand_prix_as_cached_by_v107_heals_into_a_whole_record(world):
    """Read by this build, inside the revalidation window: the names are right
    at once and for free. On the first read after the window: one request to
    the results archive fills the grid on every row and every driver, the
    file is rewritten, and the next read costs nothing."""
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    src.openf1_grid = False                       # the feed that was empty in production
    cache.save(production_record("Italian Grand Prix"))

    inside = load()                               # written seconds ago
    assert [c.name for c in inside.classification][:3] == ["Kimi Antonelli", "Lando Norris", "Max Verstappen"]
    assert all(d.name == NAMES[d.code] for d in inside.drivers)
    assert not src.calls, "the names cost no round trip"
    assert inside.settled is True and inside.source_report.awaiting == ["grid"]
    assert "P?" not in story_text(inside) and "from pole" not in story_text(inside)
    on_disk = cache.load(YEAR, "Italian Grand Prix", "Race")
    assert on_disk.classification[0].name == "Kimi Antonelli", "healed on disk too"

    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    healed = load()
    assert src.calls == {"jolpica.results": 1}, "one request, for the one field owed"
    assert_official(healed, source="openf1")
    assert healed.source_report.awaiting == []
    assert facet(healed, "starting_grid").source == "jolpica"
    assert "won from P1" in story_text(healed)

    before = dict(src.calls)
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER * 10)
    load()
    assert src.calls == before, "whole now — never asked again"


# --------------------------------------------------------------------------- #
# 1-3. A completed race carries its grid, and the sentence names it
# --------------------------------------------------------------------------- #
def test_a_completed_race_carries_every_starting_position(world):
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    s = load()
    assert_official(s, source="openf1")
    assert facet(s, "starting_grid").source == "openf1"
    assert all(p.grid == GRID[p.driver] for p in analyze(s)[1]), "the pace table knows it too"


def test_the_winner_sentence_names_the_grid_slot_when_the_grid_is_known(world):
    src = world()
    src.openf1_result = src.jolpica = True
    text = story_text(load())
    assert "won the Italian Grand Prix from pole" in text and "won from P1" in text
    assert "P?" not in text


@pytest.mark.parametrize("grid_feed", [False, "error"])
def test_no_placeholder_when_the_grid_feed_is_empty_but_the_archive_has_it(world, grid_feed):
    """THE P? BUG. OpenF1's result is official and its grid feed answers with
    nothing (or fails). The results archive has the grid; it is reconciled in
    on the first fetch, and the sentence, the movers and the standout drive
    all have their input back."""
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    src.openf1_grid = grid_feed
    s = load()
    assert_official(s, source="openf1")
    assert facet(s, "starting_grid").source == "jolpica"
    strategy, pace = analyze(s)
    assert "P?" not in " ".join(strategy.story + strategy.story_advanced)
    assert [m["driver"] for m in strategy.biggest_gainers] == ["HAM"]
    assert strategy.driver_of_the_day
    assert {p.driver: p.net_positions for p in pace}["HAM"] == 1


def test_an_unknown_grid_is_said_to_be_unknown_not_pole(world):
    """Every source that has the grid is down. The record is served without
    one — and the story neither prints "P?" nor promotes the winner to pole."""
    src = world()
    src.openf1_result = True
    src.openf1_grid = False                       # and Jolpica has no round yet
    s = load()
    assert s.settled is True and all(c.grid is None for c in s.classification)
    assert s.source_report.awaiting == ["grid", "race_time", "retirement_reason", "pit_timing"]
    text = story_text(s)
    assert "P?" not in text and "from pole" not in text and "from P" not in text
    assert "won the Italian Grand Prix" in text and "won by +11.536s" in text
    strategy, _ = analyze(s)
    assert strategy.biggest_gainers == [] and strategy.biggest_losers == []


def test_from_grid_reads_a_pit_lane_start_as_one():
    assert from_grid(None) == "" and from_grid(1) == " from pole" and from_grid(1, analyst=True) == " from P1"
    assert from_grid(0) == " from the pit lane" and from_grid(7) == " from P7"


# --------------------------------------------------------------------------- #
# 4-5. Names, from every source, for every record
# --------------------------------------------------------------------------- #
def test_names_are_written_the_way_the_sport_writes_them(world):
    """OpenF1's driver rows: `full_name` shouted, `first_name`/`last_name`
    cased. The record carries the cased name — from the parts when the row
    has them, re-cased from the shouted form when it does not."""
    src = world()
    src.openf1_result = True
    s = load()
    assert [d.name for d in s.drivers][:2] == ["Kimi Antonelli", "Lando Norris"]

    src = world("Dutch Grand Prix")
    src.openf1_result = True
    src.openf1_name_parts = False                 # older rows: full_name only
    s = load("Dutch Grand Prix")
    assert [d.name for d in s.drivers][:2] == ["Kimi Antonelli", "Lando Norris"]
    assert [c.name for c in s.classification][:2] == ["Kimi Antonelli", "Lando Norris"]


@pytest.mark.parametrize("raw, want", [
    ("Kimi ANTONELLI", "Kimi Antonelli"),
    ("Nico HÜLKENBERG", "Nico Hülkenberg"),
    ("Nyck DE VRIES", "Nyck de Vries"),
    ("Giedo VAN DER GARDE", "Giedo van der Garde"),
    ("Pato O'WARD", "Pato O'Ward"),
    ("Jean-Eric VERGNE", "Jean-Eric Vergne"),
    ("ZHOU Guanyu", "Zhou Guanyu"),
    ("JJ Lehto", "JJ Lehto"),
    ("Max Verstappen", "Max Verstappen"),
    ("VER", "VER"),                               # a code standing in for a name
    ("", ""),
])
def test_canonical_name(raw, want):
    assert normalize.canonical_name(raw) == want


def test_a_driver_feed_without_a_name_does_not_corrupt_the_result(world):
    """A driver row with no name at all: the code stands in, the result is
    still official and complete, and the archive supplies the name with the
    fields it is asked for anyway."""
    src = world()
    src.openf1_result = src.jolpica = True
    base = src._ep_drivers
    src._ep_drivers = lambda: [{k: v for k, v in d.items()
                                if k not in ("full_name", "first_name", "last_name", "broadcast_name")}
                               for d in base()]
    s = load()
    assert_official(s, source="openf1")
    assert by_code(s)["ANT"].name == "Kimi Antonelli"


# --------------------------------------------------------------------------- #
# 6-7. Retirements and margins
# --------------------------------------------------------------------------- #
def test_retirements_carry_status_reason_and_laps(world):
    src = world()
    src.openf1_result = src.jolpica = True
    lec = by_code(load())["LEC"]
    assert lec.retired and lec.status == "DNF" and lec.position is None
    assert lec.retirement_reason == "Hydraulics" and lec.retirement_source == "jolpica"
    assert lec.laps_completed == 1 and lec.grid == 4


def test_margins_are_present_and_in_one_format(world):
    src = world()
    src.openf1_result = True
    gaps = [c.gap for c in load().classification]
    assert gaps == [None, "+11.536s", "+15.204s", "+20.900s", None]
    assert normalize.canonical_gap("+17.878") == "+17.878s"
    assert normalize.canonical_gap("+1 Lap") == "+1 Lap" and normalize.canonical_gap("LEADER") == "LEADER"
    assert normalize.canonical_gap("+11.536s") == "+11.536s" and normalize.canonical_gap("") is None


# --------------------------------------------------------------------------- #
# 8-10. Field-level reconciliation, in both directions, never with a blank
# --------------------------------------------------------------------------- #
def test_the_results_archive_supplies_what_the_result_feed_lacks(world):
    """Provider A (OpenF1) has the official positions, gaps and points and
    nothing else; provider B (the results archive) has the grid, the
    classified times and the reasons. One record, from both."""
    src = world()
    src.openf1_result = src.jolpica = True
    src.openf1_grid = False
    rows = by_code(load())
    assert rows["ANT"].gap is None and rows["NOR"].gap == "+11.536s"           # A
    assert rows["ANT"].grid == 1 and rows["ANT"].race_time == pytest.approx(LAPS * LAP_S)   # B
    assert rows["LEC"].retirement_reason == "Hydraulics"                       # B


def test_the_grid_feed_supplies_what_the_results_archive_lacks(world):
    """The other way round: the archive's rows carry no grid (its round is
    fresh), OpenF1's grid feed does. Nothing already known is overwritten."""
    src = world()
    src.openf1_result = src.jolpica = True
    base = src.jolpica_classification

    def gridless(year, gp):
        drivers, rows, meta = base(year, gp)
        for r in rows:
            r.grid = None
        return drivers, rows, meta
    src.jolpica_classification = gridless
    import app.adapters.jolpica_adapter as ja
    ja.fetch_classification = gridless
    s = load()
    assert [c.grid for c in s.classification] == [1, 2, 3, 5, 4]
    assert facet(s, "starting_grid").source == "openf1"
    assert by_code(s)["ANT"].race_time == pytest.approx(LAPS * LAP_S), "still filled from the archive"


def test_blank_values_never_overwrite_a_known_one():
    """None, empty string and NaN from a second source leave a row alone; a
    field the row lacks is taken; a gap or points for a DIFFERENT position is
    refused, because a penalty may have moved the car between publications."""
    s = RaceSession(year=YEAR, grand_prix="Anywhere", session_type="Race", category="race",
                    source_report=SourceReport(), classification=[
                        ClassificationRow(position=2, driver="NOR", name="Lando Norris", team="McLaren",
                                          grid=2, gap="+11.536s", points=18.0, race_time=257.536),
                        ClassificationRow(position=3, driver="VER", name="Max Verstappen", team="Red Bull Racing"),
                        ClassificationRow(position=None, driver="LEC", name="Charles Leclerc", team="Ferrari",
                                          status="DNF", retired=True)])
    other = [
        ClassificationRow(position=2, driver="NOR", name="", team="", grid=None, gap="", points=None,
                          race_time=None),
        ClassificationRow(position=4, driver="VER", name="Max Verstappen", team="Red Bull Racing",
                          grid=3, gap="+15.204s", points=12.0, race_time=261.204),
        ClassificationRow(position=None, driver="LEC", name="Charles Leclerc", team="Ferrari", status="DNF",
                          retired=True, retirement_reason="Hydraulics", retirement_source="jolpica",
                          laps_completed=1),
    ]
    filled = dsm._fill_official_fields(s, other, "jolpica")
    nor, ver, lec = s.classification
    assert (nor.grid, nor.gap, nor.points, nor.race_time, nor.name) == (2, "+11.536s", 18.0, 257.536, "Lando Norris")
    assert ver.grid == 3 and ver.race_time == 261.204, "per-car facts fill"
    assert ver.gap is None and ver.points is None, "position-dependent facts do not, across a disagreement"
    assert lec.retirement_reason == "Hydraulics" and lec.laps_completed == 1
    assert filled == {"grid", "race_time", "retirement_reason", "laps_completed"}
    # the archive route's coercers: NaN and NaT are absences, not values
    assert fastf1._num(float("nan")) is None and fastf1._int(float("nan")) is None
    pd = pytest.importorskip("pandas")
    assert fastf1._sec(pd.NaT) is None and fastf1._isna(pd.NaT)
    assert math.isnan(float("nan"))


def test_reconciling_the_official_result_keeps_what_the_row_measured(world):
    """The official rows say nothing about the best lap or the pit count the
    timing feed measured; reconciliation leaves them, and fills the grid."""
    src = world()
    load()                                        # provisional, grid known from the feed
    src.openf1_grid = False
    src.jolpica = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    s = load()
    assert_official(s, source="jolpica")
    assert by_code(s)["ANT"].best_lap is not None
    strategy, _ = analyze(s)
    assert strategy.pit_counts["ANT"] == 1


# --------------------------------------------------------------------------- #
# 11-13. Healing, and not re-fetching
# --------------------------------------------------------------------------- #
def test_a_provisional_record_settles_with_its_grid(world):
    """First fetch minutes after the flag, grid feed empty too. When the
    sources publish, the record settles AND is whole."""
    src = world()
    src.openf1_grid = False
    first = load()
    assert first.settled is False and all(c.grid is None for c in first.classification)
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    assert_official(load(), source="openf1")


def test_a_settled_record_owed_only_its_grid_asks_only_for_its_grid(world):
    """Not the F1 archive's whole session again, not the pit feed — the one
    request to the source that has the one field."""
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    src.openf1_grid = False
    rec = production_record("Italian Grand Prix")
    cache.save(rec)
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    load()
    assert src.calls == {"jolpica.results": 1}


def test_a_settled_and_whole_record_is_never_re_fetched(world):
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    load()
    before = dict(src.calls)
    for _ in range(3):
        age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER * 5)
        load()
    assert src.calls == before


def test_a_record_still_owed_a_field_is_asked_once_per_window(world):
    """The archive has no round yet. One request per window, never per read;
    the record is touched, not rewritten, when nothing is gained."""
    src = world()
    src.openf1_result = True
    src.openf1_grid = False
    load()
    asked = src.calls.get("jolpica.results", 0)
    load(); load()
    assert src.calls.get("jolpica.results", 0) == asked, "inside the window"
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    text = cache._path(YEAR, "Italian Grand Prix", "Race").read_text()  # noqa: SLF001
    load()
    assert src.calls.get("jolpica.results", 0) == asked + 1
    assert cache._path(YEAR, "Italian Grand Prix", "Race").read_text() == text, "no gain, no rewrite"  # noqa: SLF001
    assert cache.age_seconds(YEAR, "Italian Grand Prix", "Race") < 5, "…but marked as checked"
    load()
    assert src.calls.get("jolpica.results", 0) == asked + 1


# --------------------------------------------------------------------------- #
# 14-15. Historical races and sprints
# --------------------------------------------------------------------------- #
ERGAST_1995 = {
    "1995.json": {"MRData": {"RaceTable": {"Races": [
        {"season": "1995", "round": "12", "raceName": "Italian Grand Prix", "date": "1995-09-10",
         "Circuit": {"circuitId": "monza", "circuitName": "Autodromo Nazionale di Monza",
                     "Location": {"locality": "Monza", "country": "Italy"}}}]}}},
    "1995/12/results.json": {"MRData": {"RaceTable": {"Races": [
        {"season": "1995", "round": "12", "raceName": "Italian Grand Prix",
         "Circuit": {"circuitId": "monza", "circuitName": "Autodromo Nazionale di Monza",
                     "Location": {"locality": "Monza", "country": "Italy"}},
         "Results": [
            {"number": "27", "position": "1", "points": "10", "grid": "3", "laps": "53", "status": "Finished",
             "Driver": {"driverId": "herbert", "givenName": "Johnny", "familyName": "Herbert"},
             "Constructor": {"constructorId": "benetton", "name": "Benetton"},
             "Time": {"millis": "5019556", "time": "1:23:39.556"}},
            {"number": "5", "position": "2", "points": "6", "grid": "2", "laps": "53", "status": "Finished",
             "Driver": {"driverId": "hakkinen", "givenName": "Mika", "familyName": "Häkkinen"},
             "Constructor": {"constructorId": "mclaren", "name": "McLaren"},
             "Time": {"millis": "5037434", "time": "+17.878"}},
            {"number": "1", "position": "16", "points": "0", "grid": "1", "laps": "23", "status": "Collision",
             "Driver": {"driverId": "michael_schumacher", "givenName": "Michael", "familyName": "Schumacher"},
             "Constructor": {"constructorId": "benetton", "name": "Benetton"}},
         ]}]}}},
    "1995/12/laps.json": {"MRData": {"RaceTable": {"Races": []}}},
    "1995/12/pitstops.json": {"MRData": {"RaceTable": {"Races": []}}},
}


def test_a_historical_race_from_the_results_archive_is_whole_on_arrival(world, monkeypatch):
    """1995, Ergast the only source: names as given, grid on every row, the
    margin in the shared format, nothing owed, no round trips after the first."""
    world()
    calls: list[str] = []
    for name, fn in _REAL_JOLPICA.items():                      # the adapter itself, not a stub
        monkeypatch.setattr(jolpica_adapter, name, fn)
    monkeypatch.setattr(jolpica_adapter, "_get",
                        lambda path, **kw: calls.append(path) or ERGAST_1995[path])
    s = dsm.load_session(1995, "Italian Grand Prix", "Race")
    assert s.settled is True and s.source_report.awaiting == []
    assert [c.name for c in s.classification] == ["Johnny Herbert", "Mika Häkkinen", "Michael Schumacher"]
    assert [c.grid for c in s.classification] == [3, 2, 1]
    assert [c.gap for c in s.classification] == [None, "+17.878s", None]
    msc = next(c for c in s.classification if c.name == "Michael Schumacher")
    assert msc.retired and msc.retirement_reason == "Collision" and msc.laps_completed == 23
    assert "won the Italian Grand Prix from P3" in story_text(s)
    n = len(calls)
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER * 5, year=1995)
    dsm.load_session(1995, "Italian Grand Prix", "Race")
    assert len(calls) == n, "a whole historical record is never re-asked"


def test_a_sprint_keeps_its_own_record(world):
    """A sprint is settled by OpenF1's result with the grid from its feed; the
    results archive describes the Grand Prix, not the sprint, and is not asked
    to complete it — nothing is owed that it could supply."""
    src = world()
    src.openf1_result = src.openf1_pit_time = True
    meta = src.meta
    src.meta = lambda y, g, st: (dict(meta(y, g, "Race"), session_name="Sprint", session_type="Race")
                                 if st == "Sprint" else None)
    openf1_adapter._resolve_session = src.meta
    s = dsm.load_session(YEAR, "Italian Grand Prix", "Sprint")
    assert s.category == "sprint" and s.settled is True
    assert [c.grid for c in s.classification] == [1, 2, 3, 5, 4]
    assert s.source_report.awaiting == [] and "jolpica.results" not in src.calls


# --------------------------------------------------------------------------- #
# Pit stops: a lane time is a lane time; a stoppage is not a stop
# --------------------------------------------------------------------------- #
def test_a_lane_time_is_recorded_as_the_lane_time_not_the_stop(world):
    src = world()
    src.openf1_result = src.openf1_pit_time = True
    s = load()
    for p in s.pit_stops:
        assert p.pit_lane_time and p.stop_duration is None
        assert p.estimated_stationary_time and p.estimated_stationary_time < 6
    strategy, _ = analyze(s)
    assert strategy.avg_pit_loss == pytest.approx(22.85) and strategy.avg_pit_loss_kind == "measured"
    assert strategy.best_pit_timing["lane_s"] == 22.4 and strategy.best_pit_timing["stationary_s"] is None
    assert "in the pit lane" in strategy.best_pit_timing["detail"]


def test_a_red_flag_stay_is_not_a_pit_stop_cost(world):
    """Every car into the pit lane for twenty minutes under a red flag. The
    entries stay; the average pit loss does not become 1,298 seconds."""
    src = world()
    src.openf1_result = src.openf1_pit_time = True
    base = src._ep_pit
    from tests.test_completed_record import START, _iso
    from datetime import timedelta
    src._ep_pit = lambda: [{"driver_number": n, "lap_number": 1, "pit_duration": 1290.0 + i,
                            "date": _iso(START + timedelta(seconds=30))}
                           for i, (n, *_r) in enumerate(FIELD)] + base()
    s = load()
    strategy, _ = analyze(s)
    assert strategy.avg_pit_loss == pytest.approx(22.85)
    stays = [p for p in s.pit_stops if p.lap == 1]
    assert stays and all(p.pit_lane_time is None and "stoppage" in (p.explanation or "") for p in stays)


def test_a_cached_stop_written_with_the_lane_time_as_its_duration_is_read_right():
    p = PitStop(driver="ANT", lap=2, stop_duration=24.2, pit_lane_time=24.2, source="openf1")
    assert normalize.finalize_pit_stop(p) is True
    assert p.stop_duration is None and p.pit_lane_time == 24.2 and p.estimated_stationary_time == 5.7
    assert normalize.finalize_pit_stop(p) is False, "idempotent"
    q = PitStop(driver="VER", lap=25, stationary_time=2.4, pit_lane_time=21.0)
    normalize.finalize_pit_stop(q)
    assert pitstop_service.label(q) == {"text": "Stop 2.4s", "kind": "measured"}


# --------------------------------------------------------------------------- #
# 16-17. One JSON for every client, and nothing for a client to compensate
# --------------------------------------------------------------------------- #
def test_both_clients_receive_the_same_canonical_record(world, monkeypatch):
    from app import main, service
    monkeypatch.setattr(main.service, "get_grands_prix",
                        lambda year: (_ for _ in ()).throw(RuntimeError("no calendar")))
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    src.openf1_grid = False
    body = client.get("/api/session", params={"year": YEAR, "gp": "Italian Grand Prix",
                                              "session": "Race"}).json()
    rows = body["session"]["classification"]
    assert [r["name"] for r in rows][:2] == ["Kimi Antonelli", "Lando Norris"]
    assert [r["grid"] for r in rows] == [1, 2, 3, 5, 4]
    assert [d["grid"] for d in body["session"]["drivers"]] == [1, 2, 3, 5, 4]
    assert body["session"]["settled"] is True
    assert body["session"]["source_report"]["awaiting"] == []
    assert "P?" not in " ".join(body["strategy"]["story"] + body["strategy"]["story_advanced"])
    assert body["strategy"]["biggest_gainers"][0]["driver"] == "HAM"
    assert body["strategy"]["best_pit_timing"]["lane_s"] == 22.4
    assert all(p["stop_duration"] is None and p["pit_lane_time"] for p in body["session"]["pit_stops"])

    session = service.get_session(YEAR, "Italian Grand Prix", "Race")
    monkeypatch.setattr(service, "get_current",
                        lambda: {"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"})
    monkeypatch.setattr(service, "get_session", lambda *a, **kw: session)
    feat = client.get("/api/featured").json()
    assert feat["winner"] == {"code": "ANT", "name": "Kimi Antonelli", "team": "Mercedes",
                              "team_color": "#27F4D2", "grid": 1}
    assert feat["margin"] == "+11.536s" and feat["finishers"] == 4 and feat["settled"] is True


def test_the_sources_panel_names_what_a_record_is_still_owed(world):
    src = world()
    src.openf1_result = True
    src.openf1_grid = False
    load()
    rep = client.get("/api/session/source-report",
                     params={"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"}).json()["report"]
    assert rep["settled"] is True
    assert rep["awaiting"] == ["grid", "race_time", "retirement_reason", "pit_timing"]


# --------------------------------------------------------------------------- #
# The archive route reads its grid through the paced adapter
# --------------------------------------------------------------------------- #
def test_the_archive_route_takes_its_grid_from_the_results_adapter(world):
    src = world()
    src.jolpica = True
    assert fastf1._jolpica_grid(YEAR, "Italian Grand Prix") == GRID
    assert src.calls == {"jolpica.results": 1}
    src.jolpica = False
    assert fastf1._jolpica_grid(YEAR, "Italian Grand Prix") == {}
