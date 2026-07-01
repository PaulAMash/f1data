"""The simulated demo race must be internally consistent and tell the story."""
from app.mock.simulator import simulate
from app.models import DataSource


def test_session_shape():
    s = simulate()
    assert s.total_laps == 71
    assert len(s.drivers) == 16
    assert s.data_source == DataSource.MOCK
    # every lap record references a real driver and a sane lap number
    codes = {d.code for d in s.drivers}
    assert all(l.driver in codes for l in s.laps)
    assert all(1 <= l.lap <= s.total_laps for l in s.laps)


def test_positions_are_a_permutation_each_lap():
    s = simulate()
    by_lap = {}
    for p in s.positions:
        by_lap.setdefault(p.lap, []).append(p.position)
    for lap, positions in by_lap.items():
        # positions on any lap are 1..N with no duplicates
        assert sorted(positions) == list(range(1, len(positions) + 1)), lap


def test_story_verstappen_wins_leclerc_falls_back():
    s = simulate()
    by_code = {c.driver: c for c in s.classification}
    assert by_code["VER"].position == 1              # VER wins from pole on a 2-stop
    assert by_code["VER"].pit_stops == 2
    assert by_code["LEC"].grid == 2                  # started P2
    assert by_code["LEC"].position > 2               # dropped back
    assert by_code["LEC"].pit_stops == 3             # the extra stop
    assert any(c.retired for c in s.classification)  # at least one DNF


def test_vsc_window_and_cheap_stops():
    s = simulate()
    assert any(w.status.value == "VSC" for w in s.track_status_windows)
    vsc = next(w for w in s.track_status_windows if w.status.value == "VSC")
    cheap = [ps for ps in s.pit_stops if vsc.start_lap <= ps.lap <= vsc.end_lap]
    assert cheap, "expected at least one stop during the VSC window"
    assert all(ps.under_vsc for ps in cheap)
