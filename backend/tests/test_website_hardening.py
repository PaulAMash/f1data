"""Website-only hardening: no silent mock fallback, structured Ask, historical."""
import os

from fastapi.testclient import TestClient

from app.adapters.data_source_manager import DataUnavailableError, load_session
from app.main import app

client = TestClient(app)


class _RealOnlySettings:
    """Settings as a real, live-disabled deployment would see them."""
    mock_mode = False
    enable_live_fetch = False


def test_no_silent_mock_when_live_disabled(monkeypatch):
    """With live disabled and mock off, we raise an honest error — not demo data."""
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnlySettings())
    try:
        load_session(2024, "Bahrain", "Race")
        assert False, "expected DataUnavailableError, got a (probably mock) session"
    except DataUnavailableError as e:
        payload = e.to_payload()
        assert payload["error"] == "data_unavailable"
        assert payload["attempts"] and payload["retryable"] is False


def test_session_endpoint_returns_503_not_fake(monkeypatch):
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm, "get_settings", lambda: _RealOnlySettings())
    r = client.get("/api/session", params={"year": 2024, "gp": "Bahrain", "session": "Race"})
    assert r.status_code == 503
    assert r.json()["error"] == "data_unavailable"


def test_ask_has_structured_fields():
    # mock=True forces the demo fixture regardless of env — the backend keeps this
    # param for tests only; it is not a user-facing path.
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix", "session": "Race",
                                      "question": "who had the best race pace?", "mock": True}).json()
    assert r["answer_title"] and r["short_answer"]
    assert r["analysis_steps"]           # thinking steps for the UI
    assert r["beginner_summary"]
    assert isinstance(r["evidence"], list)


def test_historical_results_never_fabricates_practice():
    # practice is not offered by the historical source → honest unavailable, never fake rows
    r = client.get("/api/historical/results",
                   params={"year": 2023, "event": "Bahrain", "session": "Practice 1"}).json()
    assert r.get("available") is False
    assert not r.get("rows")


def test_winner_gap_never_absurd():
    """P1 shows no gap; a leaked cumulative-time gap is dropped, not displayed."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import fix_classification
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    # inject a garbage gap on the leader + an absurd gap on P2
    s.classification[0].gap = "+5197.979s"
    s.classification[1].gap = "+9999.0s"
    fix_classification(s)
    p1 = next(c for c in s.classification if c.position == 1)
    p2 = next(c for c in s.classification if c.position == 2)
    assert p1.gap is None                 # winner never shows a +seconds gap
    assert p2.gap is None                 # absurd value dropped


def test_no_zero_stop_claim_without_pit_data():
    """A source with no pit AND no stint data must not be flagged reliable, must
    zero stop counts, and must never claim an N-stop race in the narrative.
    (With stint data present, counts are derived from stints instead — the
    number of stints is authoritative even without pit-lane timing.)"""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    s.pit_stops = []                      # simulate a source with no pit data
    s.stints = []                         # ...and no stint data to derive counts from
    strategy, _pace = analyze(s)          # runs normalize_session
    assert s.pit_data_reliable is False
    assert all(c.pit_stops == 0 for c in s.classification)
    assert not any("-stop race" in line for line in strategy.story)


def test_austrian_never_matches_australian():
    """Strict meeting matching: 'Austrian' must not resolve to the Australian GP."""
    from app.adapters.openf1_adapter import _name_tokens, is_testing_event
    want = _name_tokens("Austrian Grand Prix")
    australian_blob = _name_tokens("Australian Grand Prix Melbourne Australia Albert Park")
    austrian_blob = _name_tokens("Austrian Grand Prix Spielberg Austria Red Bull Ring")
    assert not (want <= australian_blob)     # the old fuzzy bug
    assert want <= austrian_blob
    # testing meetings are filtered from the calendar
    assert is_testing_event("Pre-Season Testing")
    assert is_testing_event("Pre Season Test")
    assert not is_testing_event("British Grand Prix")


def test_source_report_facets_never_duplicate():
    """Facet fallback replaces the row instead of appending a duplicate."""
    from app.adapters.data_source_manager import _set_facet
    from app.adapters.mock_adapter import get_mock_session
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert s.source_report is not None
    s.source_report.missing = ["results"]
    _set_facet(s, "results", "none", "low")
    _set_facet(s, "results", "jolpica", "high")   # fallback filled it
    rows = [f for f in s.source_report.facets if f.facet == "results"]
    assert len(rows) == 1 and rows[0].source == "jolpica"
    assert "results" not in s.source_report.missing


def test_headshot_enrich_fills_missing(monkeypatch):
    from app.adapters import headshots
    from app.adapters.mock_adapter import get_mock_session
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert all(not d.headshot_url for d in s.drivers)
    # the official listing is unavailable in tests; the season media map fills in
    monkeypatch.setattr(headshots, "f1_listing_map", lambda year: {})
    monkeypatch.setattr(headshots, "season_media_map",
                        lambda year: {d.code: f"https://media.formula1.com/{d.code}.png"
                                      for d in s.drivers})
    assert headshots.enrich(s) is True
    assert all(d.headshot_url for d in s.drivers)


def test_official_portrait_url_strips_silent_fallback():
    """The single transform every URL goes through: the Cloudinary
    default-image directive that silently serves F1's grey silhouette is
    removed, so a missing asset 404s (→ initials) instead of masquerading as a
    portrait. Working assets and non-F1 URLs are untouched; it's idempotent."""
    from app.adapters.headshots import official_portrait_url

    base = "https://media.formula1.com/content/dam/fom-website/drivers/2025Drivers/arvlin01.png"
    with_fallback = ("https://media.formula1.com/d_driver_fallback_image.png"
                     "/content/dam/fom-website/drivers/2025Drivers/arvlin01.png")
    assert official_portrait_url(with_fallback) == base
    # idempotent + leaves already-clean and non-F1 URLs alone
    assert official_portrait_url(base) == base
    assert official_portrait_url("https://example.com/x.png") == "https://example.com/x.png"
    assert official_portrait_url(None) is None
    assert official_portrait_url("") is None


def test_resolve_prefers_official_listing_then_falls_back(monkeypatch):
    """Resolution order is Formula1.com all the way down: the official
    driver-listing wins; if it lacks a driver, their own normalized F1 media
    URL is used; both are real F1 assets, never a placeholder or other source."""
    from app.adapters import headshots
    from app.adapters.mock_adapter import get_mock_session

    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    d0, d1 = s.drivers[0], s.drivers[1]
    d0.headshot_url = None
    d1.headshot_url = ("https://media.formula1.com/d_driver_fallback_image.png"
                       "/content/dam/fom-website/drivers/x/own01.png")

    monkeypatch.setattr(headshots, "season_media_map", lambda year: {})
    monkeypatch.setattr(headshots, "f1_listing_map",
                        lambda year: {headshots._norm(d0.name):
                                      "https://media.formula1.com/official/d0.png"})
    by_code = {r["code"]: r for r in headshots.resolve(s)}
    assert by_code[d0.code]["resolved_via"] == "f1-listing"
    assert by_code[d0.code]["url"] == "https://media.formula1.com/official/d0.png"
    # d1 isn't in the listing → its own media URL, normalized (directive gone)
    assert by_code[d1.code]["resolved_via"] == "session-media"
    assert "d_driver_fallback_image" not in by_code[d1.code]["url"]


def test_listing_map_degrades_to_empty_without_network(tmp_path, monkeypatch):
    """No key / no network / unexpected shape must yield {} — never a crash —
    so resolution safely falls through to the driver's own F1 media URL."""
    from app.adapters import headshots
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "cache_dir", tmp_path, raising=False)
    # an unreachable endpoint with no key configured must degrade cleanly
    monkeypatch.setattr(get_settings(), "f1_content_api_key", None, raising=False)
    result = headshots.f1_listing_map(2026)
    assert result == {}


def test_ask_why_lost_is_not_circular():
    r = client.post("/api/ask", json={"year": 2026, "gp": "Austrian Grand Prix", "session": "Race",
                                      "question": "why did charles lose so many positions?", "mock": True}).json()
    a = (r["short_answer"] or "") + " ".join(r.get("evidence", []))
    # must explain a mechanism / evidence, not just restate the position drop
    assert any(k in a.lower() for k in ("pit", "traffic", "pace", "undercut", "neutral", "strategy"))


def test_team_colors_filled_from_official_map():
    """Generic grey team colours are replaced with official ones by name."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import fill_team_colors
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    fer = next(d for d in s.drivers if "ferrari" in d.team.lower())
    fer.team_color = "#888888"
    row = next(c for c in s.classification if "mclaren" in c.team.lower())
    row.team_color = "#888888"
    fill_team_colors(s)
    assert fer.team_color == "#E8002D"          # Ferrari red
    assert row.team_color == "#FF8000"          # McLaren papaya


def test_window_cause_attribution():
    """A VSC window is attributed to the driver named by race control, or to a
    retirement at the window start."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import attach_window_causes
    from app.models import RaceControlEvent

    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    assert s.track_status_windows, "mock race should have a VSC window"
    w = s.track_status_windows[0]
    victim = s.drivers[5]
    s.race_control.append(RaceControlEvent(
        lap=w.start_lap, category="Flag",
        message=f"FIA STEWARDS: CAR {victim.number} ({victim.code}) STOPPED ON TRACK"))
    attach_window_causes(s)
    assert w.cause and victim.name in w.cause and "stopped" in w.cause

    # fallback path: no message naming a car, but a retirement at the start
    s2 = get_mock_session(2026, "Austrian Grand Prix", "Race")
    w2 = s2.track_status_windows[0]
    s2.race_control = []
    ret = s2.classification[-1]
    ret.retired = True
    ret.retirement_reason = "Hydraulics"
    ret.laps_completed = w2.start_lap
    attach_window_causes(s2)
    assert w2.cause and ret.name in w2.cause and "hydraulics" in w2.cause


def test_qualifying_summary():
    """The Saturday experience: pole, margins, segments, and no race language."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.qualifying import compute_qualifying

    s = get_mock_session(2026, "Austrian Grand Prix", "Qualifying")
    assert s.category == "qualifying"
    q = compute_qualifying(s)

    assert q.pole_driver and q.pole_lap and q.pole_margin is not None
    assert q.closest_pair and q.closest_pair["delta"] >= 0
    assert q.segment_bests.get("Q1") and q.segment_bests.get("Q3")
    # knockout mapping: the last five classified went out in Q1
    field = len(q.rows)
    q1_out = [r for r in q.rows if r.knocked_out_in == "Q1"]
    assert len(q1_out) == 5 and all(r.position > field - 5 for r in q1_out)
    # two renditions of Saturday, and neither implies a finished Grand Prix
    simple = " ".join(q.story).lower()
    advanced = " ".join(q.story_advanced).lower()
    assert "starts first" in simple
    assert "is still to come" in simple
    assert "pole" in advanced and "track evolution" in advanced
    for text in (simple, advanced):
        assert "won the race" not in text and "chequered flag" not in text
    # analyst extras exist
    assert q.biggest_disappointment and q.team_progression and q.conditions



def test_sc_cause_ignores_incidental_mentions_and_names_all_cars():
    """Regression for the Belgian-GP bug: an incidental 'CAR 23 (ALB) TRACK
    LIMITS' note near the window start must NOT be treated as the Safety Car
    cause. The genuine collision message wins and names every car involved."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import attach_window_causes
    from app.models import RaceControlEvent

    s = get_mock_session(2026, "Belgian Grand Prix", "Race")
    w = s.track_status_windows[0]
    w.cause = None; w.start_lap = 1; w.end_lap = 3
    for c in s.classification:
        c.retired = False
    s.race_control = [
        RaceControlEvent(lap=1, category="Other",
                         message="CAR 23 (ALB) NOTED - TRACK LIMITS AT TURN 9"),
        RaceControlEvent(lap=1, category="SafetyCar",
                         message="INCIDENT INVOLVING CARS 44 (HAM) AND 63 (RUS) - TURN 1"),
        RaceControlEvent(lap=1, category="SafetyCar", message="SAFETY CAR DEPLOYED"),
    ]
    attach_window_causes(s)
    assert w.cause == "Lewis Hamilton and George Russell collided"
    assert "Albon" not in w.cause


def test_sc_cause_undetermined_when_no_official_incident():
    """When the official feed names no genuine incident and no single clear
    retirement coincides, the cause is left undetermined — never invented."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.normalize import attach_window_causes
    from app.models import RaceControlEvent

    s = get_mock_session(2026, "Belgian Grand Prix", "Race")
    w = s.track_status_windows[0]
    w.cause = None; w.start_lap = 1; w.end_lap = 3
    for c in s.classification:
        c.retired = False
    s.race_control = [
        RaceControlEvent(lap=1, category="Other", message="CAR 23 (ALB) NOTED - TRACK LIMITS"),
        RaceControlEvent(lap=1, category="Other", message="DRS DISABLED"),
    ]
    attach_window_causes(s)
    assert w.cause is None


def test_turning_point_states_undetermined_cause_explicitly():
    """The race story must say the trigger wasn't officially recorded rather
    than fabricating or silently omitting it."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    from app.models import RaceControlEvent

    s = get_mock_session(2026, "Belgian Grand Prix", "Race")
    for c in s.classification:
        c.retired = False
    # strip any cause-bearing messages so the window is genuinely undetermined
    s.race_control = [RaceControlEvent(lap=w.start_lap, category="Other", message="DRS DISABLED")
                      for w in s.track_status_windows]
    for w in s.track_status_windows:
        w.cause = None
    strategy, _ = analyze(s)
    tp = " ".join(i.detail for i in strategy.turning_points)
    assert "didn't record" in tp or "not" in tp.lower()


# --------------------------------------------------------------------------- #
# V25 — tyre-strategy consistency + context-aware pace verdicts
# --------------------------------------------------------------------------- #
def _mk_session_with_phantom_retirement():
    """A driver who ran Hard → Soft → Hard then retired in the pits, delivered
    (as some real sources do) with a phantom 4th stint and a 3rd pit entry —
    the exact Perez/Belgian-GP shape."""
    from app.models import (ClassificationRow, Compound, Driver, Lap, PitStop,
                            RaceSession, Stint)
    s = RaceSession(year=2025, grand_prix="Test GP", session_type="Race",
                    category="race", total_laps=40)
    s.drivers = [Driver(number="5", code="XYZ", name="Test Driver", team="Test")]
    # ran and completed 25 laps, then retired
    s.laps = [Lap(driver="XYZ", lap=n, lap_time=90.0) for n in range(1, 26)]
    s.classification = [ClassificationRow(position=None, driver="XYZ", name="Test Driver",
                                          team="Test", laps_completed=25, retired=True,
                                          retirement_reason="Gearbox")]
    # real stints: 3 (H 1-10, S 11-20, H 21-25) + a PHANTOM 4th starting at lap 26
    s.stints = [
        Stint(driver="XYZ", stint=1, compound=Compound.HARD, start_lap=1, end_lap=10, laps=10),
        Stint(driver="XYZ", stint=2, compound=Compound.SOFT, start_lap=11, end_lap=20, laps=10),
        Stint(driver="XYZ", stint=3, compound=Compound.HARD, start_lap=21, end_lap=25, laps=5),
        Stint(driver="XYZ", stint=4, compound=Compound.HARD, start_lap=26, end_lap=26, laps=1),
    ]
    # real stops: 2 (lap 10, lap 20) + a PHANTOM retirement pit entry at lap 25
    s.pit_stops = [
        PitStop(driver="XYZ", lap=10), PitStop(driver="XYZ", lap=20),
        PitStop(driver="XYZ", lap=25),
    ]
    return s


def test_retirement_pit_entry_not_counted_as_stop_or_stint():
    """H→S→H→Retired must read as 3 stints / 2 stops, never 4 stints / 3 stops."""
    from app.analysis.normalize import reconcile_stints_and_stops
    s = _mk_session_with_phantom_retirement()
    reconcile_stints_and_stops(s)
    stints = [st for st in s.stints if st.driver == "XYZ"]
    stops = [ps for ps in s.pit_stops if ps.driver == "XYZ"]
    assert len(stints) == 3, "phantom 4th stint should be dropped"
    assert len(stops) == 2, "retirement pit entry should not count as a stop"
    row = s.classification[0]
    assert row.pit_stops == 2
    # the required invariant: stints == stops + 1
    assert len(stints) == row.pit_stops + 1


def test_tyre_summary_stops_match_stints_after_retirement():
    """The displayed tyre card can never show stops != stints - 1."""
    from app.analysis.engine import analyze
    s = _mk_session_with_phantom_retirement()
    strategy, _ = analyze(s)
    row = next(t for t in strategy.tyre_summary if t["driver"] == "XYZ")
    assert len(row["sequence"]) == 3
    assert row["stops"] == 2 == len(row["sequence"]) - 1


def test_tyre_summary_always_internally_consistent_on_mock_race():
    """Universal check on a full mock race: every driver's tyre-card stop count
    equals their stint count minus one."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    s = get_mock_session(2026, "Belgian Grand Prix", "Race")
    strategy, _ = analyze(s)
    for t in strategy.tyre_summary:
        if t["sequence"]:
            assert t["stops"] == len(t["sequence"]) - 1, t


def test_pace_verdict_retired_is_clean_and_factual():
    """A retired driver never gets 'solid, unremarkable run' and never a claim
    that they finished — a clean 'Retired after lap N' (with the official reason
    when there is one), pace_evaluated=False, and no 'not evaluated' filler."""
    from app.analysis.pace import compute_pace
    s = _mk_session_with_phantom_retirement()
    p = next(x for x in compute_pace(s) if x.driver == "XYZ")
    assert p.pace_evaluated is False
    v = (p.verdict or "").lower()
    assert "unremarkable" not in v and "finished" not in v
    assert "not evaluated" not in v                # no ugly filler
    assert "retired after lap 25" in v and "gearbox" in v


def test_pace_verdict_no_reason_is_just_lap():
    """A retirement with no official reason reads as a clean 'Retired after lap
    N' — no 'no cause' / 'not evaluated' filler."""
    from app.analysis.pace import compute_pace
    s = _mk_session_with_phantom_retirement()
    s.classification[0].retirement_reason = None
    s.classification[0].status = "DNF"
    p = next(x for x in compute_pace(s) if x.driver == "XYZ")
    assert p.pace_evaluated is False
    v = (p.verdict or "").lower()
    assert v == "retired after lap 25"
    assert "cause" not in v and "not evaluated" not in v


def test_no_finished_claim_for_any_retired_driver_in_mock_race():
    """Austrian-GP regression: every retired driver's verdict must mention the
    retirement and must not claim they finished above/below their pace."""
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    _, pace = analyze(s)
    retired = {c.driver for c in s.classification if c.retired}
    assert retired, "mock race should include at least one retirement"
    for p in pace:
        if p.driver in retired:
            assert p.pace_evaluated is False
            assert "finished" not in (p.verdict or "").lower()
            assert "retired" in (p.verdict or "").lower()


def test_retirement_laps_completed_filled_from_timing():
    """A retirement with no source-provided laps_completed gets a real lap number
    derived from the timing, so the DNF badge and pace verdict are never blank."""
    from app.models import ClassificationRow, Driver, Lap, RaceSession
    from app.analysis.normalize import fill_laps_completed
    s = RaceSession(year=2025, grand_prix="Test GP", session_type="Race",
                    category="race", total_laps=50)
    s.drivers = [Driver(number="63", code="RUS", name="George Russell", team="Mercedes")]
    s.laps = [Lap(driver="RUS", lap=n, lap_time=90.0) for n in range(1, 19)]  # ran 18 laps
    s.classification = [ClassificationRow(position=None, driver="RUS", name="George Russell",
                                          team="Mercedes", retired=True, laps_completed=None)]
    fill_laps_completed(s)
    assert s.classification[0].laps_completed == 18


def test_retirement_lap_flows_into_pace_verdict():
    """End-to-end: a blank-lap retirement ends up with 'Retired after lap N'."""
    from app.models import ClassificationRow, Driver, Lap, RaceSession
    from app.analysis.engine import analyze
    s = RaceSession(year=2025, grand_prix="Test GP", session_type="Race",
                    category="race", total_laps=50)
    s.drivers = [Driver(number="63", code="RUS", name="George Russell", team="Mercedes")]
    s.laps = [Lap(driver="RUS", lap=n, lap_time=90.0) for n in range(1, 19)]
    s.classification = [ClassificationRow(position=None, driver="RUS", name="George Russell",
                                          team="Mercedes", retired=True, laps_completed=None)]
    _, pace = analyze(s)
    p = next(x for x in pace if x.driver == "RUS")
    assert p.verdict == "Retired after lap 18"


def test_unknown_compound_is_recovered_from_the_laps_that_do_have_one():
    """A stint's compound comes from the first lap of the stint — which is the
    out-lap, and out-laps are exactly the laps the timing feeds leave blank. One
    missing value used to grey out a whole stint and label it "Unknown" while
    every other lap in it named the tyre."""
    from app.analysis.normalize import recover_stint_compounds
    from app.models import Compound, Lap, RaceSession, SessionType, Stint

    session = RaceSession(
        year=2024, grand_prix="Testing", session_type=SessionType.RACE,
        category="race", total_laps=10,
        stints=[
            # the out-lap had no compound, so the stint was built as UNKNOWN
            Stint(driver="VER", stint=2, compound=Compound.UNKNOWN,
                  start_lap=4, end_lap=6, laps=3),
            # a stint the source genuinely never published a tyre for
            Stint(driver="NOR", stint=2, compound=Compound.UNKNOWN,
                  start_lap=4, end_lap=5, laps=2),
        ],
        laps=[
            Lap(driver="VER", lap=4, stint=2, compound=Compound.UNKNOWN, pit_out=True),
            Lap(driver="VER", lap=5, stint=2, compound=Compound.HARD),
            Lap(driver="VER", lap=6, stint=2, compound=Compound.HARD),
            Lap(driver="NOR", lap=4, stint=2, compound=Compound.UNKNOWN),
            Lap(driver="NOR", lap=5, stint=2, compound=Compound.UNKNOWN),
        ],
    )

    recover_stint_compounds(session)

    ver = next(s for s in session.stints if s.driver == "VER")
    assert ver.compound == Compound.HARD, "stint should adopt the tyre its own laps report"
    # and the blank out-lap is filled from the stint, so pace analysis (which
    # skips laps with no compound) sees the whole run
    assert all(l.compound == Compound.HARD for l in session.laps if l.driver == "VER")

    nor = next(s for s in session.stints if s.driver == "NOR")
    assert nor.compound == Compound.UNKNOWN, "nothing is invented when nothing was recorded"


def test_compound_recovery_takes_the_majority_not_the_first_lap():
    """One mislabelled lap must not decide what tyre a whole stint was on."""
    from app.analysis.normalize import recover_stint_compounds
    from app.models import Compound, Lap, RaceSession, SessionType, Stint

    session = RaceSession(
        year=2024, grand_prix="Testing", session_type=SessionType.RACE,
        category="race", total_laps=10,
        stints=[Stint(driver="LEC", stint=1, compound=Compound.UNKNOWN,
                      start_lap=1, end_lap=4, laps=4)],
        laps=[
            Lap(driver="LEC", lap=1, stint=1, compound=Compound.SOFT),
            Lap(driver="LEC", lap=2, stint=1, compound=Compound.MEDIUM),
            Lap(driver="LEC", lap=3, stint=1, compound=Compound.MEDIUM),
            Lap(driver="LEC", lap=4, stint=1, compound=Compound.MEDIUM),
        ],
    )

    recover_stint_compounds(session)
    assert session.stints[0].compound == Compound.MEDIUM


# --------------------------------------------------------------------------- #
# Source diagnostics
#
# The archive probe used to walk nine seasons and report one generic
# "host blocked?" sentence for every possible failure, and the UI printed the
# word "unreachable" without it. An HTTP 403 (host up, refusing us) and a DNS
# failure (nothing to do with F1) were indistinguishable — which is how two days
# passed without knowing which one was happening.
# --------------------------------------------------------------------------- #
class _Resp:
    def __init__(self, status, payload=None, body=b"{}"):
        self.status_code, self._payload, self.content = status, payload, body
        self.encoding = None

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


def _probe_with(monkeypatch, result):
    """Run pitwall_adapter.probe() with a stubbed HTTP layer."""
    import pitwall
    from app.adapters import pitwall_adapter

    def fake_get(url, **kw):
        if isinstance(result, Exception):
            raise result
        return result
    monkeypatch.setattr(pitwall._http, "get", fake_get)
    return pitwall_adapter.probe()


def test_probe_reports_a_403_as_a_refusal_not_an_outage(monkeypatch):
    ok, detail = _probe_with(monkeypatch, _Resp(403))
    assert ok is False
    # the distinction that matters: the host answered, so it is not down
    assert "403" in detail
    assert "up but refused" in detail
    assert "User-Agent" in detail


def test_probe_reports_a_404_as_a_moved_path(monkeypatch):
    ok, detail = _probe_with(monkeypatch, _Resp(404))
    assert ok is False and "404" in detail and "moved" in detail


def test_probe_reports_rate_limiting_distinctly(monkeypatch):
    ok, detail = _probe_with(monkeypatch, _Resp(429))
    assert ok is False and "rate limited" in detail.lower()


def test_probe_separates_transport_failures_from_http_answers(monkeypatch):
    ok, detail = _probe_with(monkeypatch, OSError("Name or service not known"))
    assert ok is False and "DNS" in detail

    ok, detail = _probe_with(monkeypatch, OSError("proxy CONNECT tunnel failed"))
    assert ok is False and "proxy" in detail

    ok, detail = _probe_with(monkeypatch, OSError("certificate verify failed"))
    assert ok is False and "TLS" in detail


def test_probe_success_reports_what_it_found(monkeypatch):
    ok, detail = _probe_with(monkeypatch, _Resp(200, {"Meetings": [{}, {}, {}]}))
    assert ok is True and "3 meetings" in detail


def test_probe_catches_a_200_that_is_not_the_index(monkeypatch):
    """A CDN error page served with a 200 must not read as healthy."""
    ok, detail = _probe_with(monkeypatch, _Resp(200, None))
    assert ok is False and "layout may have changed" in detail


def test_archive_requests_do_not_use_the_bare_library_user_agent():
    """livetiming.formula1.com is behind a CDN with bot rules; the package's
    default "Pitwall/1.0" is exactly the kind of agent those rules reject."""
    import pitwall
    from app.adapters import pitwall_adapter  # noqa: F401  (import applies the header)
    ua = pitwall._http.headers.get("User-Agent", "")
    assert ua and ua != "Pitwall/1.0"


def test_health_lists_the_archive_once_under_the_host_it_probes(monkeypatch):
    """It used to appear twice — as "fastf1", plus a "pitwall" row saying it
    "uses FastF1" — two rows for one host, each describing the other."""
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm.openf1_adapter, "probe", lambda: (True, "reachable"))
    monkeypatch.setattr(dsm.jolpica_adapter, "probe", lambda: (True, "reachable"))
    monkeypatch.setattr(dsm.fastf1, "probe", lambda: (False, "HTTP 403 — the host is up but refused this request."))
    names = [p.name for p in dsm.data_source_health()]
    assert "f1-archive" in names
    assert "fastf1" not in names and "pitwall" not in names
    row = next(p for p in dsm.data_source_health() if p.name == "f1-archive")
    assert row.detail and "403" in row.detail


# --------------------------------------------------------------------------- #
# Enrichment must not make every page pay for one dead host.
#
# V46 started asking the F1 archive to backfill stints/weather/race-control.
# That is right when the archive answers and badly wrong when it doesn't: the
# enrichment is optional, the session is already loaded, and yet every single
# session view would sit through the same doomed request. These tests pin the
# breaker's behaviour — skip a host that just failed, keep asking one that
# works, and never count "this session isn't in the archive" as an outage.
# --------------------------------------------------------------------------- #
def _filled(session, *, without=()):
    """Give a session the facets a complete one of its category would have.

    The fixtures below used to be empty shells carrying only a `missing` list,
    which was fine while "is this session complete" was answered by reading that
    list. It is answered by reading the SESSION now (see `_audit_report`), so a
    shell claiming to be "a real-shaped session" has to actually have the shape:
    otherwise every one of these tests is exercising a session that, correctly,
    is missing everything.
    """
    from app.models import (
        ClassificationRow, Driver, Lap, Overtake, PitStop, PositionPoint,
        RaceControlEvent, Stint, WeatherPoint,
    )
    have = {
        "drivers": [Driver(number="1", code="VER", name="Max Verstappen",
                           team="Red Bull Racing", team_color="#3671C6")],
        "classification": [ClassificationRow(position=1, driver="VER", name="Max Verstappen",
                                             team="Red Bull Racing", team_color="#3671C6",
                                             status="Finished")],
        "laps": [Lap(driver="VER", lap=1, lap_time=92.5)],
        "positions": [PositionPoint(driver="VER", lap=1, position=1)],
        "stints": [Stint(driver="VER", stint=1, compound="MEDIUM",
                         start_lap=1, end_lap=20, laps=20)],
        "pit_stops": [PitStop(driver="VER", lap=20, stationary_time=2.4)],
        "overtakes": [Overtake(lap=5, overtaker="VER", overtaken="NOR")],
        "race_control": [RaceControlEvent(lap=1, category="Flag", message="GREEN LIGHT")],
        "weather": [WeatherPoint(minute=0, air_temp=24.0, track_temp=31.0)],
    }
    for name, value in have.items():
        setattr(session, name, [] if name in without else value)
    return session


def _archive_session():
    """A real-shaped session that is missing exactly the archive's facets."""
    from app.models import RaceSession, SourceReport
    return _filled(RaceSession(
        year=2025, grand_prix="Bahrain", session_type="Race", category="race",
        source_report=SourceReport(missing=["stints", "weather"]),
    ), without=("stints", "weather"))


def _fresh_breaker(monkeypatch, **kw):
    from app.adapters import data_source_manager as dsm
    b = dsm._Breaker(threshold=kw.get("threshold", 2), cooldown=kw.get("cooldown", 600.0))
    monkeypatch.setattr(dsm, "_archive_breaker", b)
    return b


def test_a_dead_archive_is_asked_twice_then_left_alone(monkeypatch):
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch)
    calls = []

    def boom(*a, **kw):
        calls.append(a)
        raise OSError("connection refused")
    monkeypatch.setattr(dsm.fastf1, "fetch_session", boom)

    for _ in range(5):
        dsm._merge_from_archive(_archive_session(), primary="openf1")
    # two strikes and it stops — not five, not one per page view
    assert len(calls) == 2


def test_the_archive_is_retried_once_the_cooldown_expires(monkeypatch):
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch, threshold=1, cooldown=0.0)
    calls = []

    def boom(*a, **kw):
        calls.append(a)
        raise OSError("connection refused")
    monkeypatch.setattr(dsm.fastf1, "fetch_session", boom)

    dsm._merge_from_archive(_archive_session(), primary="openf1")
    dsm._merge_from_archive(_archive_session(), primary="openf1")
    # a zero cooldown means every call re-tests: recovery needs no restart
    assert len(calls) == 2


def test_a_session_absent_from_the_archive_does_not_trip_the_breaker(monkeypatch):
    """"No session found" describes the session, not the host. Counting it would
    let one obscure practice session blind the app to a perfectly healthy CDN."""
    from app.adapters import data_source_manager as dsm
    breaker = _fresh_breaker(monkeypatch)
    monkeypatch.setattr(dsm.fastf1, "fetch_session",
                        lambda *a, **kw: (_ for _ in ()).throw(ValueError("no session matches")))
    for _ in range(4):
        dsm._merge_from_archive(_archive_session(), primary="openf1")
    assert breaker.failures == 0


def test_a_successful_merge_clears_earlier_failures(monkeypatch):
    from app.adapters import data_source_manager as dsm
    from app.models import Stint
    breaker = _fresh_breaker(monkeypatch)
    breaker.failed("earlier outage")

    other = _archive_session()
    other.stints = [Stint(driver="VER", stint=1, compound="SOFT", start_lap=1, end_lap=20, laps=20)]
    monkeypatch.setattr(dsm.fastf1, "fetch_session", lambda *a, **kw: other)

    session = _archive_session()
    dsm._merge_from_archive(session, primary="openf1")
    assert breaker.failures == 0 and breaker.detail is None
    assert session.stints and "stints" not in session.source_report.missing


def test_partial_data_says_which_source_was_down(monkeypatch):
    """"Partial data" with no cause reads as a bug in the app. Naming the source
    turns it into a fact about the session."""
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch)
    monkeypatch.setattr(dsm.fastf1, "fetch_session",
                        lambda *a, **kw: (_ for _ in ()).throw(OSError("connection refused")))
    session = _archive_session()
    dsm._merge_from_archive(session, primary="openf1")
    reason = session.source_report.missing_reason
    assert reason and "archive" in reason.lower()


def test_a_session_cached_during_an_outage_heals_when_the_source_returns(monkeypatch):
    """The cache is thirty days deep. Without this, one bad afternoon would show
    "partial data" for a month after F1 came back."""
    from app.adapters import data_source_manager as dsm
    from app.models import Stint
    _fresh_breaker(monkeypatch)
    cached = _archive_session()          # cached while the archive was down

    healed = _archive_session()
    healed.stints = [Stint(driver="VER", stint=1, compound="MEDIUM", start_lap=1, end_lap=25, laps=25)]
    monkeypatch.setattr(dsm.fastf1, "fetch_session", lambda *a, **kw: healed)

    assert dsm._heal_cached(cached) is True     # gained something -> worth re-saving
    assert cached.stints
    assert dsm._heal_cached(cached) is False    # nothing left to gain -> no cache write


def test_a_still_dead_archive_never_rewrites_the_cache(monkeypatch):
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch)
    monkeypatch.setattr(dsm.fastf1, "fetch_session",
                        lambda *a, **kw: (_ for _ in ()).throw(OSError("connection refused")))
    assert dsm._heal_cached(_archive_session()) is False


# --------------------------------------------------------------------------- #
# The health endpoint is a diagnostic. It has to answer even when everything
# it is diagnosing is broken — three 30s probes run back-to-back took long
# enough that the browser gave up and reported "cannot reach the API", which is
# how a slow probe came to look like a dead backend.
# --------------------------------------------------------------------------- #
def test_probes_use_the_probe_timeout_not_the_fetch_timeout():
    from app.config import get_settings
    s = get_settings()
    assert s.probe_timeout < s.fetch_timeout


def test_one_hanging_probe_does_not_hold_up_the_others(monkeypatch):
    import time as _time
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm.openf1_adapter, "probe", lambda: (True, "reachable"))
    monkeypatch.setattr(dsm.jolpica_adapter, "probe", lambda: (True, "reachable"))

    def slow():
        _time.sleep(1.0)
        return False, "timed out"
    monkeypatch.setattr(dsm.fastf1, "probe", slow)

    started = _time.monotonic()
    probes = dsm.data_source_health()
    # concurrent: the cost is the slowest probe, not the sum of all three
    assert _time.monotonic() - started < 2.5
    assert {p.name for p in probes} >= {"openf1", "jolpica", "f1-archive", "cache"}


def test_a_probe_that_raises_is_a_failed_probe_not_a_failed_endpoint(monkeypatch):
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm.openf1_adapter, "probe",
                        lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    monkeypatch.setattr(dsm.jolpica_adapter, "probe", lambda: (True, "reachable"))
    monkeypatch.setattr(dsm.fastf1, "probe", lambda: (True, "reachable"))
    row = next(p for p in dsm.data_source_health() if p.name == "openf1")
    assert row.reachable is False and "boom" in (row.detail or "")


def test_health_endpoint_answers_promptly_even_when_sources_are_down(monkeypatch):
    from app.adapters import data_source_manager as dsm
    monkeypatch.setattr(dsm.openf1_adapter, "probe", lambda: (False, "unreachable"))
    monkeypatch.setattr(dsm.jolpica_adapter, "probe", lambda: (False, "unreachable"))
    monkeypatch.setattr(dsm.fastf1, "probe", lambda: (False, "unreachable"))
    r = client.get("/api/health/data-sources")
    assert r.status_code == 200
    assert [p for p in r.json()["probes"] if p["name"] == "cache"][0]["reachable"] is True


def test_every_adapter_names_the_tyre_facet_the_same_thing():
    """Three adapters called one facet three things — "stints", "tyres" and
    "tyres/compounds". A backfill keyed on one name silently never ran for a
    session reported under another, and the UI printed the raw key it had no
    label for."""
    import inspect
    from app.adapters import jolpica_adapter, openf1_adapter, pitwall_adapter
    for mod in (openf1_adapter, pitwall_adapter, jolpica_adapter):
        # comments are allowed to mention the old names; code is not
        code = "\n".join(ln for ln in inspect.getsource(mod).splitlines()
                         if not ln.lstrip().startswith("#"))
        assert '"tyres"' not in code and '"tyres/compounds"' not in code, mod.__name__


def test_a_pre_2018_race_never_asks_the_archive(monkeypatch):
    """F1's live timing starts in 2018. Asking it about 1995 always fails, and
    the failure would open the breaker and hide a healthy host from 2025."""
    from app.adapters import data_source_manager as dsm
    breaker = _fresh_breaker(monkeypatch)
    called = []
    monkeypatch.setattr(dsm.fastf1, "fetch_session", lambda *a, **kw: called.append(a))

    old = _archive_session()
    old.year = 1995
    dsm._merge_from_archive(old, primary="jolpica")
    assert called == [] and breaker.failures == 0
    # and it says so, rather than leaving a bare "Partial data" chip
    assert "2018" in (old.source_report.missing_reason or "")


def test_the_archive_is_not_asked_to_backfill_its_own_session(monkeypatch):
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch)
    called = []
    monkeypatch.setattr(dsm.fastf1, "fetch_session", lambda *a, **kw: called.append(a))
    for primary in ("f1-archive", "fastf1"):
        dsm._merge_from_archive(_archive_session(), primary=primary)
    assert called == []


def test_every_source_explains_a_failure_in_the_same_plain_language(monkeypatch):
    """One panel used to speak two languages: the archive said "blocked by an
    HTTP proxy", while OpenF1 and Jolpica pasted a truncated urllib3 traceback
    at the reader. Stack-trace fragments are exactly the implementation detail
    the app promises never to show."""
    from app.adapters import jolpica_adapter, openf1_adapter
    from app.adapters import pitwall_adapter

    proxy_error = OSError("HTTPSConnectionPool(host='x', port=443): Max retries "
                          "exceeded (Caused by ProxyError('Unable to connect'))")
    monkeypatch.setattr(openf1_adapter, "_get",
                        lambda *a, **kw: (_ for _ in ()).throw(proxy_error))
    monkeypatch.setattr(jolpica_adapter, "_get",
                        lambda *a, **kw: (_ for _ in ()).throw(proxy_error))

    for probe, host in ((openf1_adapter.probe, "api.openf1.org"),
                        (jolpica_adapter.probe, "api.jolpi.ca")):
        ok, detail = probe()
        assert ok is False
        assert "blocked by an HTTP proxy" in detail and host in detail
        assert "HTTPSConnectionPool" not in detail and "Traceback" not in detail

    ok, detail = _probe_with(monkeypatch, proxy_error)
    assert ok is False and "blocked by an HTTP proxy" in detail
    assert pitwall_adapter._transport_detail(proxy_error).startswith("blocked by")


def test_a_reachable_source_says_how_fast_it_answered(monkeypatch):
    """"reachable" alone can't tell a healthy source from one that took nine
    seconds — which is the shape of the next outage."""
    from app.adapters import jolpica_adapter, openf1_adapter
    monkeypatch.setattr(openf1_adapter, "_get", lambda *a, **kw: [{"session_key": 1}])
    monkeypatch.setattr(jolpica_adapter, "_get", lambda *a, **kw: {"MRData": {}})
    for probe in (openf1_adapter.probe, jolpica_adapter.probe):
        ok, detail = probe()
        assert ok is True and "ms" in detail


# --------------------------------------------------------------------------- #
# "Partial data" has to mean something. It was lit on every session in the app,
# largely because a qualifying hour was marked as missing its overtakes.
# --------------------------------------------------------------------------- #
def _report_with(missing, category):
    from app.models import RaceSession, SourceReport
    from app.models import FacetSource
    return _filled(RaceSession(
        year=2025, grand_prix="Bahrain", session_type="Qualifying", category=category,
        source_report=SourceReport(
            missing=list(missing),
            facets=[FacetSource(facet=m, source="none", confidence="low") for m in missing]),
    ), without=tuple(missing))


def test_qualifying_is_not_partial_for_lacking_overtakes():
    """A qualifying hour has no overtakes, no strategy pit stops and no position
    trace. Reporting those as missing is a category error, and it made the
    "Partial data" chip permanent — a warning that is always on says nothing."""
    from app.adapters import data_source_manager as dsm
    s = _report_with(["overtakes", "pit_stops", "positions"], "qualifying")
    dsm._prune_inapplicable_facets(s)
    assert s.source_report.missing == []
    assert s.source_report.facets == []


def test_a_race_missing_its_overtakes_is_still_partial():
    """The prune must not become a way to hide real gaps."""
    from app.adapters import data_source_manager as dsm
    s = _report_with(["overtakes", "weather"], "race")
    dsm._prune_inapplicable_facets(s)
    assert set(s.source_report.missing) == {"overtakes", "weather"}


def test_pruning_keeps_facets_a_session_actually_recorded():
    """If a qualifying session really did record pit stops, that is a fact and
    it stays on the report — only the empty "none" rows are dropped."""
    from app.adapters import data_source_manager as dsm
    from app.models import FacetSource
    s = _report_with(["overtakes"], "qualifying")
    s.source_report.facets.append(
        FacetSource(facet="pit_stops", source="openf1", confidence="high"))
    dsm._prune_inapplicable_facets(s)
    assert [f.facet for f in s.source_report.facets] == ["pit_stops"]


def test_a_cached_session_stops_claiming_a_gap_a_newer_release_fixed(monkeypatch):
    """Old cache files froze the old verdict, so sessions kept showing "Partial
    data" for a reason the app no longer believes in."""
    from app.adapters import data_source_manager as dsm
    _fresh_breaker(monkeypatch)
    s = _report_with(["overtakes"], "qualifying")
    s.partial = True
    s.source_report.partial = True
    assert dsm._heal_cached(s) is True
    assert s.partial is False and s.source_report.partial is False


# --------------------------------------------------------------------------- #
# The archive "outage" that was ours all along.
#
# `pitwall` ships as a single-file MCP *server script*: its module body runs
# `from mcp.server.fastmcp import FastMCP` and builds a server. So `import
# pitwall` needs an entire MCP SDK to read static JSON from F1, and on a machine
# where that package is missing every archive call raised ModuleNotFoundError —
# surfaced to the user as "F1 live-timing archive: not answering".
# --------------------------------------------------------------------------- #
class _BlockMcp:
    """Import hook that hides a package, the way a partial install does."""

    def __init__(self, *names):
        self.names = names

    def find_module(self, name, path=None):
        return self if name in self.names or any(
            name.startswith(n + ".") for n in self.names) else None

    def load_module(self, name):
        raise ModuleNotFoundError(f"No module named '{name}'", name=name)


def _without(monkeypatch, *packages):
    """Run with `packages` unimportable and pitwall_runtime's cache cleared."""
    import sys
    from app.adapters import pitwall_runtime
    monkeypatch.setattr(pitwall_runtime, "_module", None)
    hidden = {k: v for k, v in sys.modules.items()
              if k in packages or any(k.startswith(p + ".") for p in packages)}
    for k in hidden:
        monkeypatch.delitem(sys.modules, k, raising=False)
    hook = _BlockMcp(*packages)
    monkeypatch.setattr(sys, "meta_path", [hook] + list(sys.meta_path))


def test_the_archive_client_loads_without_the_mcp_sdk(monkeypatch):
    """The whole bug. We read static JSON over HTTPS; we do not run an MCP
    server, so an MCP server SDK must not be on that critical path."""
    from app.adapters.pitwall_runtime import load_pitwall
    _without(monkeypatch, "mcp")
    pw = load_pitwall()
    assert pw.STATIC_BASE.startswith("https://")
    # every helper the adapter actually calls has to survive the stub
    for name in ("_http", "_get_json", "_find_session", "_driver_map", "_get_keyframe",
                 "_parse_stream_line", "_deep_merge", "_resolve_circuit_id", "get_lap_times"):
        assert getattr(pw, name, None) is not None, name


def test_the_real_mcp_sdk_is_preferred_when_present():
    """The stub is a fallback, never a replacement — we must not shadow a real
    module with a fake one and silently change pitwall's behaviour."""
    import sys
    from app.adapters.pitwall_runtime import _install_mcp_stub
    try:
        import mcp.server.fastmcp as real
    except Exception:  # pragma: no cover - depends on the environment
        return
    assert _install_mcp_stub() is False
    assert sys.modules["mcp.server.fastmcp"] is real


def test_an_unloadable_client_is_not_reported_as_an_f1_outage(monkeypatch):
    """"not answering" sends the reader to F1's status page for a problem that
    lives in their own virtualenv. It is a third state, not a red one."""
    from app.adapters import data_source_manager as dsm
    _without(monkeypatch, "mcp", "pitwall")
    row = next(p for p in dsm.data_source_health() if p.name == "f1-archive")
    assert row.reachable is None                 # never got as far as asking
    assert "pip install" in (row.detail or "")   # and it names the fix
    assert "Traceback" not in (row.detail or "")


def test_a_missing_package_explains_itself_instead_of_raising_a_traceback():
    from app.adapters.pitwall_runtime import explain_import
    detail = explain_import(ModuleNotFoundError("No module named 'mcp'", name="mcp"))
    assert "'mcp'" in detail and "pip install" in detail
    assert "ModuleNotFoundError" not in detail


def test_partial_data_blames_the_install_not_formula_one(monkeypatch):
    """When our own client can't load, "the archive isn't answering" is false."""
    from app.adapters import data_source_manager as dsm
    from app.adapters.pitwall_runtime import ArchiveClientUnavailable
    _fresh_breaker(monkeypatch)
    monkeypatch.setattr(dsm.fastf1, "fetch_session", lambda *a, **kw: (_ for _ in ()).throw(
        ArchiveClientUnavailable("the F1 archive client needs the 'mcp' package")))
    session = _archive_session()
    dsm._merge_from_archive(session, primary="openf1")
    reason = session.source_report.missing_reason or ""
    assert "can't load its F1 archive client" in reason
    assert "not because F1 is down" in reason


def test_pitwall_is_never_imported_directly(monkeypatch):
    """Nine bare `import pitwall` statements gave one failure nine shapes and no
    single place to fix it. Every one goes through load_pitwall() now."""
    import pathlib
    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    offenders = []
    for path in root.rglob("*.py"):
        if path.name == "pitwall_runtime.py":
            continue
        for i, line in enumerate(path.read_text().splitlines(), 1):
            if line.strip() in ("import pitwall", "import pitwall as pw"):
                offenders.append(f"{path.relative_to(root)}:{i}")
    assert not offenders, f"bare pitwall imports: {offenders}"


# --------------------------------------------------------------------------- #
# Evidence the UI can draw.
#
# "gained 1 place (P3 → P2); top-3 race pace; 2-stop execution" is three facts
# wearing one sentence's clothing. A panel can only show three chips if it is
# handed three things, so the analysis emits them separately as well as joined.
# --------------------------------------------------------------------------- #
def test_standout_drive_reports_its_evidence_as_separate_factors():
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    strategy, _pace = analyze(s)
    assert strategy.driver_of_the_day
    assert strategy.dotd_factors, "the pick must carry its evidence in parts"
    # each one is chip-sized, and none of them is the joined sentence
    for f in strategy.dotd_factors:
        assert ";" not in f and len(f) <= 24, f
    # and the prose form still exists for the tooltip
    assert strategy.dotd_reason


def test_standout_factors_survive_a_driver_with_nothing_to_report():
    """A winner from pole with no pit data has no factors — and an empty list is
    the honest answer, not a chip saying nothing."""
    from app.analysis.strategy import _driver_of_the_day
    from app.adapters.mock_adapter import get_mock_session
    s = get_mock_session(2026, "Austrian Grand Prix", "Race")
    for c in s.classification:
        c.grid, c.pit_stops = c.position, 0
    driver, reason, factors = _driver_of_the_day(s, {})
    assert driver and reason
    assert factors == []


# --------------------------------------------------------------------------- #
# A championship table is a list of people, and it had no faces in it. The
# standings source (Jolpica) knows a driver's name and nothing else; F1's own
# driver listing knows the portrait and is keyed by exactly that. The join is
# by name — with the surname fallback the session portraits already rely on —
# and a name that does not resolve is simply absent, because the UI draws a
# clean initials avatar for those and a wrong face is worse than no face.
# --------------------------------------------------------------------------- #
def test_portraits_join_standings_rows_by_name(monkeypatch):
    from app.adapters import headshots
    monkeypatch.setattr(headshots, "f1_listing_map", lambda year: {
        "max verstappen": "https://media.formula1.com/x/max.png",
        "surname:hamilton": "https://media.formula1.com/x/lewis.png",
    })
    out = headshots.portraits_by_name(
        2025, ["Max Verstappen", "Sir Lewis Hamilton", "Nobody At All", ""])
    assert out["Max Verstappen"].endswith("max.png")
    # the exact name misses, the unique surname still finds the person
    assert out["Sir Lewis Hamilton"].endswith("lewis.png")
    # and an unknown driver gets no entry rather than someone else's portrait
    assert "Nobody At All" not in out
    assert "" not in out


def test_portraits_are_absent_rather_than_wrong_when_the_listing_is_unavailable(monkeypatch):
    from app.adapters import headshots
    monkeypatch.setattr(headshots, "f1_listing_map", lambda year: {})
    assert headshots.portraits_by_name(2025, ["Max Verstappen"]) == {}


def test_standings_endpoint_stays_offline_in_demo_mode(monkeypatch):
    """Demo mode never reaches the network, so the table must render without a
    portrait rather than block on a fetch that isn't allowed."""
    from fastapi.testclient import TestClient
    from app import main
    from app.adapters import headshots
    from app.config import get_settings

    called = []
    monkeypatch.setattr(headshots, "portraits_by_name",
                        lambda year, names: called.append(names) or {})

    settings = get_settings()
    monkeypatch.setattr(settings, "mock_mode", True)
    client = TestClient(main.app)
    r = client.get("/api/history/standings", params={"year": 2026, "type": "driver"})
    assert r.status_code == 200
    assert r.json()["standings"], "the table itself still comes back"
    assert called == [], "no portrait lookup while the app is offline"

    # and with the network allowed, the join is attempted exactly once
    monkeypatch.setattr(settings, "mock_mode", False)
    monkeypatch.setattr(settings, "enable_live_fetch", True)
    r = client.get("/api/history/standings", params={"year": 2026, "type": "driver"})
    assert r.status_code == 200
    assert len(called) == 1 and called[0], "one lookup, for the whole table"


def test_constructor_standings_never_ask_for_a_driver_portrait(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    from app.adapters import headshots
    from app.config import get_settings

    called = []
    monkeypatch.setattr(headshots, "portraits_by_name",
                        lambda year, names: called.append(names) or {})
    settings = get_settings()
    monkeypatch.setattr(settings, "mock_mode", False)
    monkeypatch.setattr(settings, "enable_live_fetch", True)
    r = TestClient(main.app).get("/api/history/standings",
                                 params={"year": 2026, "type": "constructor"})
    assert r.status_code == 200
    assert called == []


# --------------------------------------------------------------------------- #
# "Is this session complete?" is asked once, of the session.
#
# Every adapter used to answer it for itself, and each declared a different set
# of facets — so a facet an adapter never declared could never be reported
# missing. A race fetched through the archive with no position trace at all
# reported COMPLETE, and the reader got a Race Story with no timeline in it and
# nothing saying why. `_audit_report` asks the session instead of the adapter.
# --------------------------------------------------------------------------- #
def test_a_facet_no_adapter_declared_is_still_missing():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(
        year=2025, grand_prix="Monaco", session_type="Race", category="race",
        # the archive's report shape: it never mentions positions at all
        source_report=SourceReport(missing=[]),
    ), without=("positions",))
    dsm._audit_report(s)
    assert "positions" in s.source_report.missing
    assert s.partial is True and s.source_report.partial is True


def test_a_complete_session_is_never_flagged_partial():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=2025, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()))
    dsm._audit_report(s)
    assert s.source_report.missing == []
    assert s.partial is False


def test_the_audit_is_idempotent():
    """It runs on fetch, on cache heal and after every enrichment step, so
    running it twice has to be the same as running it once."""
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=2025, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()),
                without=("weather",))
    dsm._audit_report(s)
    first = (list(s.source_report.missing), [f.facet for f in s.source_report.facets])
    dsm._audit_report(s)
    assert (list(s.source_report.missing), [f.facet for f in s.source_report.facets]) == first


def test_the_audit_keeps_the_adapter_s_provenance():
    """WHERE a facet came from is the adapter's answer and only it knows; WHETHER
    the facet is there is decided by looking. The audit must not overwrite the
    first with the second."""
    from app.adapters import data_source_manager as dsm
    from app.models import FacetSource, RaceSession, SourceReport
    s = _filled(RaceSession(
        year=2025, grand_prix="Monaco", session_type="Race", category="race",
        source_report=SourceReport(facets=[
            FacetSource(facet="laps", source="openf1", confidence="high",
                        detail="Lap timing from OpenF1."),
        ])))
    dsm._audit_report(s)
    laps = next(f for f in s.source_report.facets if f.facet == "laps")
    assert laps.source == "openf1" and laps.detail == "Lap timing from OpenF1."


def test_a_qualifying_hour_is_not_missing_things_it_cannot_have():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=2025, grand_prix="Monaco", session_type="Qualifying",
                            category="qualifying", source_report=SourceReport()),
                without=("overtakes", "pit_stops", "positions"))
    dsm._audit_report(s)
    assert s.source_report.missing == []
    assert not any(f.facet in ("overtakes", "positions") for f in s.source_report.facets)


# --------------------------------------------------------------------------- #
# A feed that had not been invented yet is not a gap in our data.
#
# V67 stopped a qualifying hour being reported as missing its overtakes. The
# same category error was still being made along the other axis: a 1975 Grand
# Prix was reported as missing its lap times, tyre stints, weather and
# race-control log — none of which were recorded, by anybody, in 1975. The
# reader was told a fifty-year-old race had a data problem. It had a 1975
# problem, which is not the same thing and is not ours.
# --------------------------------------------------------------------------- #
def test_a_1975_race_is_not_missing_things_that_did_not_exist():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=1975, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()),
                without=("laps", "positions", "overtakes", "pit_stops",
                         "stints", "weather", "race_control"))
    dsm._audit_report(s)
    assert s.source_report.missing == []
    assert s.partial is False
    # and the absence is explained rather than silent
    assert any("1996" in n for n in s.notes)


def test_a_2015_race_is_not_missing_tyre_and_weather_feeds():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=2015, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()),
                without=("stints", "weather", "race_control"))
    dsm._audit_report(s)
    assert s.source_report.missing == []
    assert s.partial is False
    assert any("2018" in n for n in s.notes)


def test_a_modern_race_missing_the_same_feeds_is_still_partial():
    """The era rule must not become a blanket excuse: 2024 HAS all of these."""
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=2024, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()),
                without=("stints", "weather"))
    dsm._audit_report(s)
    assert set(s.source_report.missing) == {"stints", "weather"}
    assert s.partial is True
    assert not any("2018" in n for n in s.notes)


def test_the_era_note_is_added_once_however_often_the_audit_runs():
    from app.adapters import data_source_manager as dsm
    from app.models import RaceSession, SourceReport
    s = _filled(RaceSession(year=1975, grand_prix="Monaco", session_type="Race",
                            category="race", source_report=SourceReport()),
                without=("laps", "positions", "overtakes", "pit_stops",
                         "stints", "weather", "race_control"))
    dsm._audit_report(s)
    dsm._audit_report(s)
    assert len([n for n in s.notes if "1996" in n]) == 1
