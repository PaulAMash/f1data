"""V107 — a completed session's record is assembled, not frozen.

THE FAILURE THESE TESTS REPRODUCE. Two Grands Prix, both over, both cached,
both rendered by the same code — and one of them had a margin, sixteen
finishers, six retirements and a full classification while the other had a
"—" in every column, "22/22 still running at the flag", no retirements card,
no points and no pit timing. The difference was not the race. It was WHEN the
first request for each arrived.

The Italian Grand Prix was asked for minutes after the flag, before OpenF1 had
published its `session_result` and before the results archive had the round.
OpenF1 still answered — every lap, stint and position — and, finding no
official result, its adapter built a running order from the final positions:
every car "Finished", no gap, no time, no points, no retirement. That list was
non-empty, so the facet merge never asked the archive for the real one; the
audit counted `results` as present and called the session complete; and the
cache froze it for thirty days. The Dutch Grand Prix was asked for later, after
both sources had published, and was fine.

What is pinned here, in order: that a running order is now known for what it
is (`settled` false, never `complete` false — the session is readable); that
the official record is reconciled in from whichever source publishes it, on
the first fetch or on a later read of the cached record; that the cache cannot
be poisoned by an early first request; that the derived facts the clients
show — margin, finishers, retirements — are unknown rather than wrong while
the record is provisional; that nothing is ever estimated; and that a race
whose record was already official is not touched at all.

Nothing here is about Monza. The Grand Prix is a parameter.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import cache, upstream
from app.adapters import data_source_manager as dsm
from app.adapters import headshots, jolpica_adapter, openf1_adapter
from app.adapters import pitwall_adapter as fastf1
from app.adapters.jolpica_adapter import JolpicaError
from app.adapters.pitwall_adapter import FetchError
from app.analysis.engine import analyze
from app.main import app
from app.models import (
    ClassificationRow, Driver, FacetSource, Lap, PositionPoint, RaceSession, SourceReport,
)

client = TestClient(app)
UTC = timezone.utc
YEAR = 2026


# --------------------------------------------------------------------------- #
# A race weekend as the sources see it, at a moment of our choosing.
# --------------------------------------------------------------------------- #
#: (number, code, full name, team, colour, grid). A small field, but the shapes
#: that matter are all in it: a winner, a runner-up, a lapped-or-not finisher,
#: and a car that stopped on lap one and still holds a position in the feed.
FIELD = [
    (12, "ANT", "Kimi Antonelli", "Mercedes", "#27F4D2", 1),
    (4, "NOR", "Lando Norris", "McLaren", "#FF8000", 2),
    (1, "VER", "Max Verstappen", "Red Bull Racing", "#3671C6", 3),
    (44, "HAM", "Lewis Hamilton", "Ferrari", "#E80020", 5),
    (16, "LEC", "Charles Leclerc", "Ferrari", "#E80020", 4),
]
LAPS = 3
START = datetime(YEAR, 9, 6, 13, 3, tzinfo=UTC)
LAP_S = 82.0

#: The official result, as the sources publish it once they have it.
OFFICIAL = {
    # code: (position, gap seconds, points, laps, dnf)
    "ANT": (1, 0.0, 25, LAPS, False),
    "NOR": (2, 11.536, 18, LAPS, False),
    "VER": (3, 15.204, 15, LAPS, False),
    "HAM": (4, 20.9, 12, LAPS, False),
    "LEC": (None, None, 0, 1, True),
}
#: The order the position feed shows at the flag — LEC parked, last.
RUNNING_ORDER = ["ANT", "NOR", "VER", "HAM", "LEC"]


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


class Sources:
    """Every provider, with a switch for what each has published.

    `openf1_result`   — OpenF1's `session_result` endpoint has the classification.
    `openf1_pit_time` — its `pit` rows carry `pit_duration` (they land late).
    `jolpica`         — the results archive has the round (results + pit stops).
    `archive`         — the F1 live-timing archive answers, with what shape.
    Counters say what was actually asked, which is how pacing is checked.
    """

    def __init__(self, gp: str):
        self.gp = gp
        self.openf1_result = False
        self.openf1_pit_time = False
        # OpenF1's starting grid is its own feed: True answers, False is empty,
        # "error" fails the request (V108 — the feed that vanished in production)
        self.openf1_grid: bool | str = True
        self.openf1_name_parts = True      # first_name / last_name on the driver rows
        self.jolpica = False
        self.jolpica_reason = "Hydraulics"
        self.archive: RaceSession | None = None
        self.archive_error: Exception = FetchError(f"No 'Race' session found for '{gp}'.")
        self.jolpica_error: Exception = JolpicaError("No results")
        self.openf1_error: Exception | None = None
        self.calls: dict[str, int] = {}

    def _count(self, what: str) -> None:
        self.calls[what] = self.calls.get(what, 0) + 1

    # ---- OpenF1, endpoint by endpoint ---------------------------------------
    def meta(self, year, gp, session_type):
        if year != YEAR or gp.lower() != self.gp.lower():
            return None
        return {"session_key": 9000 + len(self.gp), "meeting_key": 1, "session_name": "Race",
                "session_type": "Race", "meeting_name": self.gp, "_display_name": self.gp,
                "location": "Somewhere", "country_name": "Country", "circuit_short_name": "Circuit"}

    def openf1_get(self, path, **params):
        self._count(f"openf1.{path}")
        if self.openf1_error is not None:
            raise self.openf1_error
        return getattr(self, f"_ep_{path}")()

    def _ep_drivers(self):
        # THE SHAPE OPENF1 ACTUALLY ANSWERS WITH. `full_name` is "Kimi ANTONELLI"
        # — the timing screen's shouted surname — and the cased name lives in
        # `first_name` / `last_name`. V107's stub answered "Kimi Antonelli"
        # here, which is why the shouting reached production unseen.
        rows = []
        for n, c, name, team, col, _g in FIELD:
            first, last = name.split(" ", 1)
            row = {"driver_number": n, "name_acronym": c,
                   "full_name": f"{first} {last.upper()}",
                   "broadcast_name": f"{first[0]} {last.upper()}",
                   "team_name": team, "team_colour": col.lstrip("#"),
                   "country_code": "XX", "headshot_url": None}
            if self.openf1_name_parts:
                row["first_name"], row["last_name"] = first, last
            rows.append(row)
        return rows

    def _ep_starting_grid(self):
        if self.openf1_grid == "error":
            import requests
            raise requests.HTTPError("404 Client Error: Not Found for url: .../starting_grid")
        if not self.openf1_grid:
            return []
        return [{"driver_number": n, "position": g} for n, _c, _n, _t, _col, g in FIELD]

    def _ep_laps(self):
        rows = []
        for n, code, *_rest in FIELD:
            done = OFFICIAL[code][3]
            for k in range(1, done + 1):
                at = START + timedelta(seconds=(k - 1) * LAP_S)
                # a car that stopped mid-lap has a lap row with no duration
                dur = None if (code == "LEC" and k == done) else LAP_S + FIELD.index(
                    next(f for f in FIELD if f[1] == code)) * 0.4
                rows.append({"driver_number": n, "lap_number": k, "date_start": _iso(at),
                             "lap_duration": dur, "is_pit_out_lap": k == 3,
                             "duration_sector_1": None, "duration_sector_2": None,
                             "duration_sector_3": None})
        return rows

    def _ep_position(self):
        rows = []
        for n, code, *_rest in FIELD:
            done = OFFICIAL[code][3]
            for k in range(1, done + 1):
                at = START + timedelta(seconds=(k - 1) * LAP_S + 40)
                rows.append({"driver_number": n, "date": _iso(at),
                             "position": RUNNING_ORDER.index(code) + 1})
        return rows

    def _ep_intervals(self):
        return []

    def _ep_stints(self):
        rows = []
        for n, code, *_rest in FIELD:
            if code == "LEC":
                rows.append({"driver_number": n, "stint_number": 1, "compound": "MEDIUM",
                             "lap_start": 1, "lap_end": 1, "tyre_age_at_start": 0})
                continue
            rows.append({"driver_number": n, "stint_number": 1, "compound": "MEDIUM",
                         "lap_start": 1, "lap_end": 2, "tyre_age_at_start": 0})
            rows.append({"driver_number": n, "stint_number": 2, "compound": "HARD",
                         "lap_start": 3, "lap_end": 3, "tyre_age_at_start": 0})
        return rows

    def _ep_pit(self):
        return [{"driver_number": n, "lap_number": 2, "date": _iso(START + timedelta(seconds=LAP_S + 60)),
                 "pit_duration": (22.4 + i * 0.3) if self.openf1_pit_time else None}
                for i, (n, code, *_rest) in enumerate(FIELD) if code != "LEC"]

    def _ep_weather(self):
        return [{"date": _iso(START), "air_temperature": 27.0, "track_temperature": 41.0,
                 "humidity": 40, "rainfall": 0, "wind_speed": 1.2, "wind_direction": 90}]

    def _ep_race_control(self):
        return [{"lap_number": 1, "category": "Flag", "flag": "GREEN", "scope": "Track",
                 "message": "GREEN LIGHT - PIT EXIT OPEN"}]

    def _ep_overtakes(self):
        return []

    def _ep_session_result(self):
        if not self.openf1_result:
            return []
        out = []
        for n, code, *_rest in FIELD:
            pos, gap, pts, laps, dnf = OFFICIAL[code]
            out.append({"driver_number": n, "position": pos, "dnf": dnf, "dns": False,
                        "dsq": False, "gap_to_leader": gap, "number_of_laps": laps,
                        "points": pts})
        return out

    # ---- the results archive ----------------------------------------------
    def jolpica_classification(self, year, gp):
        self._count("jolpica.results")
        if not self.jolpica or gp.lower() != self.gp.lower():
            raise self.jolpica_error
        drivers, rows = [], []
        for n, code, name, team, col, grid in FIELD:
            pos, gap, pts, laps, dnf = OFFICIAL[code]
            drivers.append(Driver(number=str(n), code=code, name=name, team=team,
                                  team_color=col, grid=grid))
            rows.append(ClassificationRow(
                position=pos, driver=code, name=name, team=team, team_color=col, grid=grid,
                laps_completed=laps, status="DNF" if dnf else "Finished",
                # the archive carries the classified time for lead-lap finishers,
                # and the margin to the winner for everyone but the winner
                race_time=(LAPS * LAP_S + (gap or 0.0)) if not dnf else None,
                gap=(f"+{gap:.3f}" if gap else None),
                points=float(pts), retired=dnf,
                retirement_reason=self.jolpica_reason if dnf else None,
                retirement_source="jolpica" if dnf else None))
        return drivers, rows, {"round": 16, "raceName": self.gp}

    def jolpica_pitstops(self, year, gp):
        self._count("jolpica.pitstops")
        if not self.jolpica:
            return []
        from app.models import PitStop
        return [PitStop(driver=code, lap=2, pit_lane_time=23.1,
                        source="jolpica", confidence="medium",
                        explanation="Ergast/Jolpica pit-stop duration — time in the pit lane.")
                for _n, code, *_rest in FIELD if code != "LEC"]

    # ---- the F1 live-timing archive ------------------------------------------
    def archive_session(self, year, gp, session_type):
        self._count("archive")
        if self.archive is None:
            raise self.archive_error
        return self.archive


def official_rows(source: str = "f1-archive") -> list[ClassificationRow]:
    """The official classification in the normalized shape any adapter emits."""
    rows = []
    for _n, code, name, team, col, grid in FIELD:
        pos, gap, pts, laps, dnf = OFFICIAL[code]
        rows.append(ClassificationRow(
            position=pos, driver=code, name=name, team=team, team_color=col, grid=grid,
            laps_completed=laps, status="DNF" if dnf else "Finished",
            gap=None if dnf else ("LEADER" if gap == 0 else f"+{gap:.3f}s"),
            points=float(pts), retired=dnf))
    return rows


def archive_record(gp: str, provisional: bool = False) -> RaceSession:
    """What the F1 archive answers with: its official results, or — via the
    static route — a running order from the last timing frame."""
    rows = official_rows() if not provisional else [
        ClassificationRow(position=i + 1, driver=code, name=code, team="?",
                          status="Finished")
        for i, code in enumerate(RUNNING_ORDER)]
    report = SourceReport(facets=[
        FacetSource(facet="results", source="f1-archive",
                    confidence="low" if provisional else "high", provisional=provisional)])
    return RaceSession(year=YEAR, grand_prix=gp, session_type="Race", category="race",
                       total_laps=LAPS, source_report=report, classification=rows)


@pytest.fixture()
def world(monkeypatch, tmp_path):
    """Live fetching on, an empty cache, every provider stubbed and counted."""
    from app.config import get_settings
    settings = get_settings()
    saved = (settings.cache_dir, settings.mock_mode, settings.enable_live_fetch)
    settings.cache_dir = tmp_path
    settings.mock_mode = False
    settings.enable_live_fetch = True
    upstream.cache_clear()
    monkeypatch.setattr(dsm, "_archive_breaker", dsm._Breaker(threshold=2, cooldown=600.0))
    monkeypatch.setattr(headshots, "enrich", lambda s: False)

    def make(gp: str = "Italian Grand Prix") -> Sources:
        src = Sources(gp)
        monkeypatch.setattr(openf1_adapter, "_resolve_session", src.meta)
        monkeypatch.setattr(openf1_adapter, "_get", src.openf1_get)
        monkeypatch.setattr(jolpica_adapter, "fetch_classification", src.jolpica_classification)
        monkeypatch.setattr(jolpica_adapter, "fetch_pitstops", src.jolpica_pitstops)
        monkeypatch.setattr(jolpica_adapter, "fetch_laps", lambda y, g: ([], []))
        monkeypatch.setattr(fastf1, "fetch_session", src.archive_session)
        return src

    yield make
    settings.cache_dir, settings.mock_mode, settings.enable_live_fetch = saved
    upstream.cache_clear()


def load(gp: str = "Italian Grand Prix", **kw) -> RaceSession:
    return dsm.load_session(YEAR, gp, "Race", **kw)


def age_cache(gp: str, seconds: float, year: int = YEAR) -> None:
    """Let the cached entry be `seconds` old, the way a later reader finds it."""
    p = cache._path(year, gp, "Race")  # noqa: SLF001
    t = time.time() - seconds
    os.utime(p, (t, t))


def by_code(session: RaceSession) -> dict[str, ClassificationRow]:
    return {c.driver: c for c in session.classification}


def facet(session: RaceSession, name: str) -> FacetSource:
    return next(f for f in session.source_report.facets if f.facet == name)


def assert_official(session: RaceSession, source: str | None = None) -> None:
    """Every fact the official classification supplies is on the record."""
    rows = by_code(session)
    assert session.settled is True and session.complete is True
    assert session.source_report.settled is True
    assert session.source_report.provisional == []
    assert facet(session, "results").provisional is False
    if source:
        assert facet(session, "results").source == source
    assert rows["ANT"].position == 1 and rows["NOR"].position == 2
    assert rows["NOR"].gap and "11.536" in rows["NOR"].gap, "the race margin"
    assert rows["LEC"].retired is True and rows["LEC"].position is None
    assert rows["LEC"].laps_completed == 1
    assert [c.points for c in session.classification if c.driver != "LEC"] == [25, 18, 15, 12]
    assert sum(1 for c in session.classification if not c.retired) == 4, "finishers"
    assert sum(1 for c in session.classification if c.retired) == 1, "retirements"
    # FIA order: finishers first, the retirement last and unnumbered
    assert [c.driver for c in session.classification] == ["ANT", "NOR", "VER", "HAM", "LEC"]
    # V108: the record is whole as well as official — every car has a grid
    # slot, on both copies of the entry, and a name in the sport's own case
    assert [c.grid for c in session.classification] == [1, 2, 3, 5, 4], "the starting grid"
    assert {d.code: d.grid for d in session.drivers} == {c.driver: c.grid for c in session.classification}
    assert rows["ANT"].name == "Kimi Antonelli" and rows["VER"].name == "Max Verstappen"


def assert_provisional(session: RaceSession) -> None:
    """Readable, labelled, and claiming nothing it does not know."""
    assert session.complete is True, "a late result must not blank the whole page"
    assert session.settled is False
    assert session.source_report.provisional == ["results"]
    f = facet(session, "results")
    assert f.provisional is True and f.confidence == "low" and f.detail
    for c in session.classification:
        assert c.status == openf1_adapter.PROVISIONAL_STATUS
        assert c.retired is False and c.gap is None and c.points is None \
            and c.race_time is None, "nothing official was invented"
    # what the timing feed does know is kept
    assert [c.driver for c in session.classification] == RUNNING_ORDER
    assert by_code(session)["ANT"].best_lap is not None


# --------------------------------------------------------------------------- #
# 1. The record that was always right, and must stay right
# --------------------------------------------------------------------------- #
def test_a_race_fetched_after_the_sources_published_is_complete_and_settled(world):
    """The Dutch Grand Prix path: first asked for once every source had it."""
    src = world()
    src.openf1_result = src.openf1_pit_time = src.jolpica = True
    s = load()
    assert_official(s, source="openf1")
    assert by_code(s)["LEC"].retirement_reason == "Hydraulics", "reasons still enriched"
    assert by_code(s)["ANT"].race_time is not None, "classified times still enriched"
    assert all(p.pit_lane_time for p in s.pit_stops)


# --------------------------------------------------------------------------- #
# 2. THE ITALIAN GRAND PRIX FAILURE MODE
# --------------------------------------------------------------------------- #
def test_the_italian_grand_prix_failure_mode(world):
    """First request minutes after the flag: OpenF1 answers with every lap and
    no `session_result`; the results archive has no round yet. This is the
    exact record that shipped with a "—" in every column — reproduced, then
    read back once the sources have published, without a refresh."""
    src = world()                       # nothing official published anywhere
    first = load()

    # THE OLD SYMPTOMS, EACH ONE NAMED. It used to be: complete, every car
    # "Finished", 5/5 still running, no retirement, no margin — and cached so.
    assert_provisional(first)
    assert cache.has(YEAR, "Italian Grand Prix", "Race"), "served fast, but labelled"

    # the sources publish; a later reader arrives after the revalidation window
    src.openf1_result = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    second = load()
    assert second.data_source.value == "cache", "no refresh was needed"
    assert_official(second, source="openf1")
    assert src.calls.get("openf1.laps", 0) == 1, "the laps were not fetched twice"


def test_an_incomplete_first_fetch_does_not_poison_the_cache(world):
    """The record on disk settles too — the next process reads the right one."""
    src = world()
    load()
    src.openf1_result = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    load()
    on_disk = cache.load(YEAR, "Italian Grand Prix", "Race")
    assert on_disk is not None and on_disk.settled is True
    assert by_code(on_disk)["LEC"].retired is True
    # OpenF1's result settles the record and carries no classified time and no
    # retirement reason; the results archive is owed those (V108) — and the
    # pit feed its durations — and each is asked once per window until it has
    # them…
    assert on_disk.source_report.awaiting == ["race_time", "retirement_reason", "pit_timing"]
    src.jolpica = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    load()
    assert cache.load(YEAR, "Italian Grand Prix", "Race").source_report.awaiting == []
    # …and a settled record that is owed nothing is never re-asked
    before = dict(src.calls)
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER * 10)
    load()
    assert src.calls == before, "a whole record costs no round trips"


def test_a_hollow_record_cached_by_an_older_build_is_recognised(world):
    """THE RECORD ACTUALLY SITTING IN PRODUCTION. It was written by a build
    that flagged nothing: results facet "openf1", medium confidence, every
    row "Finished". Read out of the cache by this build it must be known for
    what it is — and settle the moment a source has the result."""
    src = world()
    stale = RaceSession(
        year=YEAR, grand_prix="Italian Grand Prix", session_type="Race", category="race",
        total_laps=LAPS, complete=True, settled=True,
        source_report=SourceReport(complete=True, settled=True, facets=[
            FacetSource(facet="results", source="openf1", confidence="medium"),
            FacetSource(facet="drivers", source="openf1"), FacetSource(facet="laps", source="openf1"),
        ]),
        drivers=[Driver(number=str(n), code=c, name=nm, team=t, team_color=col, grid=g)
                 for n, c, nm, t, col, g in FIELD],
        classification=[ClassificationRow(position=i + 1, driver=code, name=code, team="?",
                                          status="Finished", laps_completed=LAPS)
                        for i, code in enumerate(RUNNING_ORDER)],
        laps=[Lap(driver=code, lap=k, lap_time=LAP_S, position=RUNNING_ORDER.index(code) + 1)
              for code in RUNNING_ORDER for k in range(1, LAPS + 1)],
        positions=[PositionPoint(driver=code, lap=k, position=RUNNING_ORDER.index(code) + 1)
                   for code in RUNNING_ORDER for k in range(1, LAPS + 1)])
    cache.save(stale)

    read = load()
    assert read.settled is False and read.complete is True
    assert facet(read, "results").provisional is True
    assert read.source_report.provisional == ["results"]

    src.jolpica = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    healed = load()
    assert_official(healed, source="jolpica")


# --------------------------------------------------------------------------- #
# 3. Whichever source publishes first settles the record
# --------------------------------------------------------------------------- #
def test_provider_fallback_recovers_the_result_from_the_results_archive(world):
    """OpenF1 never publishes its result; Jolpica does. The classification is
    reconciled from it field by field — reasons and classified times too —
    and the locally measured best laps are kept."""
    src = world()
    load()
    src.jolpica = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    s = load()
    assert_official(s, source="jolpica")
    rows = by_code(s)
    assert rows["LEC"].retirement_reason == "Hydraulics"
    assert rows["ANT"].race_time == pytest.approx(LAPS * LAP_S)
    assert rows["ANT"].best_lap is not None, "measured locally, kept"


def test_the_f1_archive_can_settle_a_provisional_result(world):
    src = world()
    src.archive = archive_record("Italian Grand Prix")
    s = load()
    assert_official(s, source="f1-archive")


def test_the_archives_own_running_order_settles_nothing(world):
    """The archive's static route rebuilds a running order too. One provisional
    list laid over another is still provisional."""
    src = world()
    src.archive = archive_record("Italian Grand Prix", provisional=True)
    s = load()
    assert_provisional(s)


def test_the_result_is_reconciled_on_the_first_fetch_when_it_is_already_out(world):
    """Jolpica has the round; OpenF1 still has no result. No cache involved:
    the first fetch itself asks the archive because the list is provisional,
    where it used to be satisfied by the list being non-empty."""
    src = world()
    src.jolpica = True
    s = load()
    assert_official(s, source="jolpica")


# --------------------------------------------------------------------------- #
# 4. The derived facts the clients show
# --------------------------------------------------------------------------- #
def _featured(monkeypatch, session: RaceSession) -> dict:
    from app import main, service
    monkeypatch.setattr(service, "get_current",
                        lambda: {"year": YEAR, "gp": session.grand_prix, "session": "Race"})
    monkeypatch.setattr(service, "get_session", lambda *a, **kw: session)
    return client.get("/api/featured").json()


def test_race_margin_is_preserved(world, monkeypatch):
    src = world()
    src.openf1_result = True
    body = _featured(monkeypatch, load())
    assert body["margin"] == "+11.536s" and body["settled"] is True


def test_finishers_count_is_preserved(world, monkeypatch):
    src = world()
    src.openf1_result = True
    body = _featured(monkeypatch, load())
    assert body["finishers"] == 4 and body["entries"] == 5


def test_retirement_information_is_preserved(world, monkeypatch):
    src = world()
    src.openf1_result = src.jolpica = True
    s = load()
    lec = by_code(s)["LEC"]
    assert lec.retired and lec.status == "DNF" and lec.retirement_reason == "Hydraulics"
    strategy, _pace = analyze(s)
    assert "LEC" not in [m["driver"] for m in strategy.biggest_losers], \
        "a car that retired is not the race's biggest loser on places"


def test_a_provisional_record_reports_unknowns_not_wrong_numbers(world, monkeypatch):
    """The 22/22 bug at the API. Counting "not retired" over a running order
    says everyone finished; the payload says it does not know instead."""
    world()
    s = load()
    body = _featured(monkeypatch, s)
    assert body["available"] is True and body["winner"]["code"] == "ANT"
    assert body["settled"] is False
    assert body["margin"] is None and body["finishers"] is None
    assert body["entries"] == 5


def test_final_classification_is_complete_when_authoritative_data_exists(world):
    src = world()
    src.openf1_result = True
    s = load()
    for c in s.classification:
        assert c.status in ("Finished", "DNF")
        assert c.points is not None
        if not c.retired:
            assert c.position is not None
            # the winner has no gap — the record says so the same way for every
            # source (V108), rather than "LEADER" from one and nothing from another
            assert (c.gap is None) == (c.position == 1)
    assert_official(s)


def test_the_session_api_carries_the_readiness_flag(world, monkeypatch):
    """Both clients read one field. The website gates its finisher count and
    retirements card on it; the iOS app receives the same JSON."""
    from app import main
    monkeypatch.setattr(main.service, "get_grands_prix",
                        lambda year: (_ for _ in ()).throw(RuntimeError("no calendar")))
    src = world()
    r = client.get("/api/session", params={"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"})
    assert r.status_code == 200
    body = r.json()["session"]
    assert body["settled"] is False and body["complete"] is True
    assert body["source_report"]["provisional"] == ["results"]
    assert body["source_report"]["settled"] is False
    assert all(row["status"] == "Provisional" for row in body["classification"])

    src.openf1_result = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    body = client.get("/api/session", params={"year": YEAR, "gp": "Italian Grand Prix",
                                              "session": "Race"}).json()["session"]
    assert body["settled"] is True and body["source_report"]["provisional"] == []


def test_the_sources_panel_names_the_provisional_facet(world):
    world()
    load()
    r = client.get("/api/session/source-report",
                   params={"year": YEAR, "gp": "Italian Grand Prix", "session": "Race"})
    rep = r.json()["report"]
    results = next(f for f in rep["facets"] if f["facet"] == "results")
    assert results["provisional"] is True and "official classification" in results["detail"]
    assert rep["settled"] is False and rep["provisional"] == ["results"]


# --------------------------------------------------------------------------- #
# 5. Optional data does not decide readiness; genuine failures are honest
# --------------------------------------------------------------------------- #
def test_optional_missing_data_does_not_invalidate_the_session(world):
    """No pit durations anywhere, no weather trace — still complete AND
    settled, because those are enrichments and the result is official."""
    src = world()
    src.openf1_result = True
    src._ep_weather = lambda: []       # the trace never came
    s = load()
    assert_official(s, source="openf1")
    assert not any(p.pit_lane_time or p.stop_duration for p in s.pit_stops)
    assert "weather" in s.source_report.missing and s.settled is True


def test_a_genuine_provider_failure_is_represented_honestly(world):
    """Every source that could settle the record is down at revalidation. The
    record stays provisional — nothing is invented to fill the wait — and is
    not rewritten, only marked as checked."""
    src = world()
    load()
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    src.openf1_error = OSError("connection refused")
    src.jolpica_error = OSError("connection refused")
    src.archive_error = OSError("connection refused")
    before = cache._path(YEAR, "Italian Grand Prix", "Race").read_text()  # noqa: SLF001
    s = load()
    assert_provisional(s)
    after = cache._path(YEAR, "Italian Grand Prix", "Race")  # noqa: SLF001
    assert after.read_text() == before, "no gain, no rewrite"
    assert cache.age_seconds(YEAR, "Italian Grand Prix", "Race") < 5, "…but marked as checked"


def test_reconciliation_never_estimates(world):
    """A field the official source leaves blank stays blank; a car the official
    list does not name keeps its provisional row; a car only the official list
    names (a non-starter) is added."""
    src = world()
    load()
    rows = official_rows()
    rows = [r for r in rows if r.driver != "HAM"]                  # official list omits HAM
    rows.append(ClassificationRow(position=None, driver="BOR", name="Gabriel Bortoleto",
                                  team="Sauber", status="DNS", retired=True, points=0.0))
    for r in rows:
        r.gap = None                                                # no gaps published at all
    src.archive = RaceSession(year=YEAR, grand_prix="Italian Grand Prix", session_type="Race",
                              category="race", total_laps=LAPS, classification=rows,
                              source_report=SourceReport(facets=[
                                  FacetSource(facet="results", source="f1-archive")]))
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    s = load()
    got = by_code(s)
    assert got["NOR"].gap is None and got["NOR"].points == 18, "blank stays blank"
    assert got["HAM"].status == openf1_adapter.PROVISIONAL_STATUS, "unnamed car keeps its row"
    assert got["BOR"].retired is True and got["BOR"].status == "DNS", "non-starter added"
    assert s.settled is True


def test_pit_durations_that_landed_late_are_adopted(world):
    """"Avg pit loss: unavailable — not provided by source" was the pit feed
    asked before its durations were filled in, then frozen. Revalidation asks
    the same feed again."""
    src = world()
    s = load()
    strategy, _pace = analyze(s)
    assert strategy.avg_pit_loss is None and s.pit_stops, "stops known, durations not"
    src.openf1_pit_time = True
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    s = load()
    assert all(p.pit_lane_time for p in s.pit_stops)
    strategy, _pace = analyze(s)
    assert strategy.avg_pit_loss and strategy.avg_pit_loss_kind == "measured"


# --------------------------------------------------------------------------- #
# 6. Records that were already official are not touched
# --------------------------------------------------------------------------- #
def test_older_races_keep_their_complete_data(world):
    """A record cached by an older build with a real classification in it:
    read back settled and untouched. Its result sources are not re-asked; the
    one thing it is asked about is the field it lacks — the results archive
    is owed its grid and classified time (V108), one request per window."""
    src = world()
    old = RaceSession(
        year=2024, grand_prix="Bahrain Grand Prix", session_type="Race", category="race",
        total_laps=57, complete=True,
        source_report=SourceReport(complete=True, facets=[
            FacetSource(facet="results", source="openf1", confidence="high"),
            FacetSource(facet="drivers", source="openf1"), FacetSource(facet="laps", source="openf1")]),
        drivers=[Driver(number="1", code="VER", name="Max Verstappen", team="Red Bull Racing")],
        classification=[
            ClassificationRow(position=1, driver="VER", name="Max Verstappen", team="Red Bull Racing",
                              status="Finished", gap="LEADER", points=26.0, laps_completed=57),
            ClassificationRow(position=None, driver="STR", name="Lance Stroll", team="Aston Martin",
                              status="DNF", retired=True, points=0.0, laps_completed=3)],
        laps=[Lap(driver="VER", lap=1, lap_time=95.0, position=1)])
    cache.save(old)
    age_cache("Bahrain Grand Prix", dsm._REVALIDATE_AFTER * 100, year=2024)
    s = dsm.load_session(2024, "Bahrain Grand Prix", "Race")
    assert s.settled is True and facet(s, "results").provisional is False
    assert [c.driver for c in s.classification] == ["VER", "STR"]
    assert s.classification[0].points == 26.0
    # the result sources were not asked — the archive was, for the tyre /
    # weather / race-control facets this fixture lacks, which is the heal
    # that predates V107 and is bounded by its breaker
    assert not {k for k in src.calls if k in ("openf1.session_result", "openf1.pit",
                                              "jolpica.pitstops")}
    # the results archive was asked exactly once, for the grid and the
    # classified time this record has on no row; it had nothing (the stub
    # knows another race), so the record is unchanged and marked as checked
    assert src.calls.get("jolpica.results") == 1
    assert s.source_report.awaiting == ["grid", "race_time", "retirement_reason"]
    dsm.load_session(2024, "Bahrain Grand Prix", "Race")
    assert src.calls.get("jolpica.results") == 1, "not inside the same window"


def test_the_results_archive_supplies_the_margin_it_publishes():
    """Ergast/Jolpica gives every lead-lap finisher's gap as `Time.time`;
    the adapter read only `Time.millis`, so an archive-reconciled record
    had a classified time on every row and a margin on none."""
    res = {"position": "2", "points": "18", "status": "Finished", "laps": "53", "grid": "2",
           "Driver": {"code": "NOR", "driverId": "norris", "givenName": "Lando",
                      "familyName": "Norris", "nationality": "British"},
           "Constructor": {"constructorId": "mclaren", "name": "McLaren"},
           "Time": {"millis": "4823456", "time": "+11.536"}}
    _driver, row = jolpica_adapter._driver_from(res)
    # in the one format every source's gap uses (V108), not Ergast's bare string
    assert row.gap == "+11.536s" and row.race_time == pytest.approx(4823.456)
    winner = dict(res, position="1", Time={"millis": "4811920", "time": "1:20:11.920"})
    assert jolpica_adapter._driver_from(winner)[1].gap is None, "a total is not a gap"
    lapped = dict(res, position="15", status="+1 Lap")
    lapped.pop("Time")
    assert jolpica_adapter._driver_from(lapped)[1].gap is None
    assert jolpica_adapter._driver_from(lapped)[1].status == "+1 Lap"


def test_a_race_from_before_lap_timing_is_settled_on_its_results(world):
    """1975: results and points, nothing else ever recorded. Official, settled."""
    world()
    s = RaceSession(
        year=1975, grand_prix="Italian Grand Prix", session_type="Race", category="race",
        source_report=SourceReport(facets=[FacetSource(facet="results", source="jolpica"),
                                           FacetSource(facet="drivers", source="jolpica")]),
        drivers=[Driver(number="12", code="REG", name="Clay Regazzoni", team="Ferrari")],
        classification=[ClassificationRow(position=1, driver="REG", name="Clay Regazzoni",
                                          team="Ferrari", gap="LEADER", points=9.0)])
    dsm._finalize_session(s)
    assert s.complete is True and s.settled is True


# --------------------------------------------------------------------------- #
# 7. Pacing: the sources are re-asked at their own cadence, never per read
# --------------------------------------------------------------------------- #
def test_revalidation_is_paced_by_the_upstream_window(world):
    src = world()
    load()
    asked = src.calls.get("openf1.session_result", 0)
    load(); load()
    assert src.calls.get("openf1.session_result", 0) == asked, \
        "inside the window every read is served from the record as it is"
    age_cache("Italian Grand Prix", dsm._REVALIDATE_AFTER + 1)
    load()
    assert src.calls.get("openf1.session_result", 0) == asked + 1, "one check per window"
    load()
    assert src.calls.get("openf1.session_result", 0) == asked + 1, \
        "a check that gained nothing is remembered, so the next read does not repeat it"


def test_a_manual_refresh_reassembles_through_the_same_path(world):
    """The Explorer's Re-run control bypasses the cache; a fresh fetch after
    the sources published settles exactly like a revalidation does."""
    src = world()
    load()
    src.openf1_result = True
    s = load(refresh=True)
    assert_official(s, source="openf1")


# --------------------------------------------------------------------------- #
# 8. Nothing here knows which Grand Prix it is
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("gp", ["Dutch Grand Prix", "Las Vegas Grand Prix", "Abu Dhabi Grand Prix"])
def test_future_completed_races_use_the_same_assembly_path(world, gp):
    src = world(gp)
    first = load(gp)
    assert_provisional(first)
    src.openf1_result = True
    age_cache(gp, dsm._REVALIDATE_AFTER + 1)
    assert_official(load(gp), source="openf1")


def test_openf1_laps_inherit_the_track_status_of_their_window():
    """OpenF1 knows neutralisations as race-control windows, not per lap; the
    pace model reads per lap. With the OpenF1 adapter actually serving
    sessions now, the two shapes have to meet — offline, from data held."""
    from app.models import TrackStatus, TrackStatusWindow
    s = RaceSession(
        year=YEAR, grand_prix="Anywhere", session_type="Race", category="race", total_laps=10,
        laps=[Lap(driver="VER", lap=k, lap_time=90.0, position=1) for k in range(1, 11)],
        track_status_windows=[TrackStatusWindow(status=TrackStatus.SAFETY_CAR,
                                                start_lap=5, end_lap=7, label="Safety Car")])
    dsm._finalize_session(s)
    assert [lp.track_status for lp in s.laps if 5 <= lp.lap <= 7] == [TrackStatus.SAFETY_CAR] * 3
    assert all(lp.track_status == TrackStatus.GREEN for lp in s.laps if not 5 <= lp.lap <= 7)
    # a source that stamped its own laps is not second-guessed
    t = RaceSession(
        year=YEAR, grand_prix="Anywhere", session_type="Race", category="race", total_laps=10,
        laps=[Lap(driver="VER", lap=k, lap_time=90.0, position=1,
                  track_status=TrackStatus.YELLOW if k == 2 else TrackStatus.GREEN)
              for k in range(1, 11)],
        track_status_windows=[TrackStatusWindow(status=TrackStatus.SAFETY_CAR,
                                                start_lap=5, end_lap=7, label="Safety Car")])
    dsm._finalize_session(t)
    assert t.laps[5].track_status == TrackStatus.GREEN


def test_the_readiness_verdict_is_the_same_object_every_page_reads():
    """`settled` travels on the session AND in the report, and they cannot
    disagree — the audit writes both from one decision."""
    s = RaceSession(
        year=YEAR, grand_prix="Anywhere", session_type="Race", category="race",
        source_report=SourceReport(facets=[
            FacetSource(facet="results", source="openf1", provisional=True),
            FacetSource(facet="drivers", source="openf1"), FacetSource(facet="laps", source="openf1")]),
        drivers=[Driver(number="1", code="VER", name="Max Verstappen", team="Red Bull Racing")],
        classification=[ClassificationRow(position=1, driver="VER", name="Max Verstappen",
                                          team="Red Bull Racing", status="Provisional")],
        laps=[Lap(driver="VER", lap=1, lap_time=95.0, position=1)])
    dsm._finalize_session(s)
    assert s.settled is False and s.source_report.settled is False and s.complete is True
    dsm._reconcile_results(s, official_rows()[:1] and [
        ClassificationRow(position=1, driver="VER", name="Max Verstappen", team="Red Bull Racing",
                          status="Finished", gap="LEADER", points=25.0)], "jolpica")
    dsm._finalize_session(s)
    assert s.settled is True and s.source_report.settled is True
