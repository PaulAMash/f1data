"""
Pitwall IQ — normalized F1 data models.

These Pydantic models are the *app-friendly* shape that the entire application
speaks. Every data adapter (real pitwall/FastF1/Jolpica or mock) must produce
these types, so the analysis engine, API and frontend never care where the data
came from. Raw F1 feed shapes (TimingData, TyreStintSeries, ...) are converted
into these models inside the adapters and nowhere else.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class Compound(str, Enum):
    SOFT = "SOFT"
    MEDIUM = "MEDIUM"
    HARD = "HARD"
    INTERMEDIATE = "INTERMEDIATE"
    WET = "WET"
    UNKNOWN = "UNKNOWN"


class SessionType(str, Enum):
    RACE = "Race"
    QUALIFYING = "Qualifying"
    SPRINT = "Sprint"
    SPRINT_QUALIFYING = "Sprint Qualifying"
    PRACTICE_1 = "Practice 1"
    PRACTICE_2 = "Practice 2"
    PRACTICE_3 = "Practice 3"


class TrackStatus(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    VSC = "VSC"
    SAFETY_CAR = "SAFETY_CAR"
    RED = "RED"


class DataSource(str, Enum):
    """Where the currently-served session data came from."""
    LIVE = "live"          # freshly fetched real pitwall / FastF1 data
    CACHE = "cache"        # previously fetched real data, served from local cache
    MOCK = "mock"          # realistic simulated data (clearly labeled in the UI)


# --------------------------------------------------------------------------- #
# Calendar / reference
# --------------------------------------------------------------------------- #
class Circuit(BaseModel):
    id: str
    name: str
    locality: Optional[str] = None
    country: Optional[str] = None
    length_km: Optional[float] = None
    laps: Optional[int] = None


class GrandPrix(BaseModel):
    round: Optional[int] = None
    name: str                         # "Austrian Grand Prix"
    official_name: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    circuit: Optional[Circuit] = None
    date: Optional[str] = None        # event (start) date, ISO — used to hide future races
    sessions: list[str] = Field(default_factory=list)  # available session names
    # session name -> ISO start time, so the UI can offer a session only once it
    # has actually begun (an in-progress weekend shows P1 but not yet the race)
    session_times: dict[str, str] = Field(default_factory=dict)


class Season(BaseModel):
    year: int
    events: int = 0


class Constructor(BaseModel):
    id: str
    name: str
    color: str = "#888888"            # brand color for charts


class Driver(BaseModel):
    number: str                       # "1", "16" (car number, string to match feeds)
    code: str                         # TLA, "VER"
    name: str                         # full name
    team: str                         # constructor name
    team_color: str = "#888888"
    grid: Optional[int] = None        # starting position
    country: Optional[str] = None
    headshot_url: Optional[str] = None  # OpenF1 portrait where available


# --------------------------------------------------------------------------- #
# Per-lap / per-driver time series
# --------------------------------------------------------------------------- #
class Lap(BaseModel):
    driver: str                       # driver code (TLA)
    lap: int
    lap_time: Optional[float] = None  # seconds
    position: Optional[int] = None
    compound: Compound = Compound.UNKNOWN
    tyre_age: Optional[int] = None    # laps on this set at end of this lap
    stint: Optional[int] = None
    pit_in: bool = False              # pitted at end of this lap
    pit_out: bool = False             # out-lap (first lap of a new stint)
    gap_to_leader: Optional[float] = None    # seconds
    interval: Optional[float] = None         # seconds to car ahead
    track_status: TrackStatus = TrackStatus.GREEN
    is_outlier: bool = False          # excluded from clean-pace calculations
    sector1: Optional[float] = None
    sector2: Optional[float] = None
    sector3: Optional[float] = None


class Stint(BaseModel):
    driver: str
    stint: int
    compound: Compound
    start_lap: int
    end_lap: int
    laps: int
    is_new_tyre: bool = True
    avg_lap: Optional[float] = None
    median_lap: Optional[float] = None
    best_lap: Optional[float] = None
    # Estimated degradation in seconds/lap (positive = getting slower).
    degradation: Optional[float] = None


class PitStop(BaseModel):
    driver: str
    lap: int
    stationary_time: Optional[float] = None       # wheel-gun to release (s), measured
    pit_lane_time: Optional[float] = None          # total pit-lane loss (s)
    stop_duration: Optional[float] = None          # OpenF1 "pit_duration" (stationary-ish)
    estimated_stationary_time: Optional[float] = None  # derived estimate when not measured
    compound_before: Compound = Compound.UNKNOWN
    compound_after: Compound = Compound.UNKNOWN
    under_vsc: bool = False
    under_safety_car: bool = False
    source: str = "unknown"                        # openf1 | jolpica | fastf1 | derived | mock
    confidence: str = "medium"                     # high | medium | low
    explanation: Optional[str] = None

    @property
    def best_stationary(self) -> Optional[float]:
        """Best available representation of how long the car was stationary."""
        return self.stationary_time or self.stop_duration or self.estimated_stationary_time


class Overtake(BaseModel):
    """A position change between two cars, from data or inferred from the trace."""
    lap: int
    overtaker: str                    # driver code that moved ahead
    overtaken: str                    # driver code that was passed
    position_after: Optional[int] = None
    kind: str = "unclear"             # on_track | pit_cycle | penalty | start | unclear
    source: str = "inferred"          # openf1 | inferred
    detail: Optional[str] = None


class RaceControlEvent(BaseModel):
    lap: Optional[int] = None
    time: Optional[str] = None
    category: str = ""                # Flag, SafetyCar, Drs, CarEvent, Other
    flag: Optional[str] = None        # GREEN, YELLOW, RED, ...
    scope: Optional[str] = None       # Track, Sector, Driver
    status: Optional[TrackStatus] = None
    message: str = ""


class WeatherPoint(BaseModel):
    lap: Optional[int] = None
    time_min: Optional[float] = None
    air_temp: Optional[float] = None
    track_temp: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: bool = False
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None


class PositionPoint(BaseModel):
    driver: str
    lap: int
    position: int


class TrackStatusWindow(BaseModel):
    """A contiguous window of non-green track status (VSC/SC/red flag)."""
    status: TrackStatus
    start_lap: int
    end_lap: int
    label: str = ""
    # Who/what brought it out, e.g. "Kimi Antonelli stopped on track" — derived
    # from race-control messages and retirements (see normalize.attach_window_causes).
    cause: Optional[str] = None


class ClassificationRow(BaseModel):
    position: Optional[int] = None
    driver: str
    name: str
    team: str
    team_color: str = "#888888"
    grid: Optional[int] = None
    laps_completed: Optional[int] = None
    status: str = "Finished"          # Finished, +1 Lap, DNF, ...
    gap: Optional[str] = None
    best_lap: Optional[float] = None
    pit_stops: int = 0
    points: Optional[float] = None
    retired: bool = False
    # Why they retired ("Hydraulics", "Collision", ...) and where the reason
    # came from — surfaced by the DNF badge tooltip in the UI.
    retirement_reason: Optional[str] = None
    retirement_source: Optional[str] = None
    # Qualifying only: per-segment bests (seconds), merged from the official
    # archive when the primary source doesn't provide them.
    q1: Optional[float] = None
    q2: Optional[float] = None
    q3: Optional[float] = None


# --------------------------------------------------------------------------- #
# Source reporting (kept out of the main UI; surfaced in a Data Sources panel)
# --------------------------------------------------------------------------- #
class FacetSource(BaseModel):
    """Where one facet of the session came from + how confident we are."""
    facet: str                        # results | laps | pit_stops | overtakes | weather | ...
    source: str = "unknown"           # openf1 | fastf1 | jolpica | pitwall | mock | none
    confidence: str = "medium"        # high | medium | low
    detail: Optional[str] = None


class SourceProbe(BaseModel):
    name: str                         # openf1 | fastf1 | jolpica | pitwall | cache
    reachable: Optional[bool] = None  # None = not probed
    detail: Optional[str] = None


class SourceReport(BaseModel):
    data_source: DataSource = DataSource.MOCK
    fetched_at: Optional[str] = None
    facets: list[FacetSource] = Field(default_factory=list)
    probes: list[SourceProbe] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    partial: bool = False
    cache_key: Optional[str] = None


# --------------------------------------------------------------------------- #
# Top-level session
# --------------------------------------------------------------------------- #
def session_category(session_type: str) -> str:
    """Group any session name into race | qualifying | sprint | practice."""
    s = (session_type or "").lower()
    if "sprint" in s and ("qual" in s or "shootout" in s):
        return "sprint_qualifying"
    if "sprint" in s:
        return "sprint"
    if "qual" in s:
        return "qualifying"
    if "practice" in s or s.startswith("fp") or s in ("p1", "p2", "p3"):
        return "practice"
    return "race"


class RaceSession(BaseModel):
    """The complete normalized picture of one session."""
    year: int
    grand_prix: str
    official_name: Optional[str] = None
    session_type: str
    category: str = "race"            # race | qualifying | sprint | practice (derived)
    circuit: Optional[Circuit] = None
    total_laps: int = 0
    data_source: DataSource = DataSource.MOCK
    fetched_at: Optional[str] = None
    partial: bool = False             # some facets missing but session still usable
    pit_data_reliable: bool = True    # False when the source has no trustworthy pit data
    notes: list[str] = Field(default_factory=list)
    source_report: Optional[SourceReport] = None

    drivers: list[Driver] = Field(default_factory=list)
    constructors: list[Constructor] = Field(default_factory=list)
    classification: list[ClassificationRow] = Field(default_factory=list)
    laps: list[Lap] = Field(default_factory=list)
    stints: list[Stint] = Field(default_factory=list)
    pit_stops: list[PitStop] = Field(default_factory=list)
    overtakes: list[Overtake] = Field(default_factory=list)
    race_control: list[RaceControlEvent] = Field(default_factory=list)
    weather: list[WeatherPoint] = Field(default_factory=list)
    positions: list[PositionPoint] = Field(default_factory=list)
    track_status_windows: list[TrackStatusWindow] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Analysis outputs
# --------------------------------------------------------------------------- #
class StintPace(BaseModel):
    stint: int
    compound: Compound
    start_lap: int
    end_lap: int
    laps: int
    avg_lap: Optional[float] = None
    median_lap: Optional[float] = None
    degradation: Optional[float] = None


class DriverPaceSummary(BaseModel):
    driver: str
    name: str
    team: str
    team_color: str = "#888888"
    grid: Optional[int] = None
    finish: Optional[int] = None
    net_positions: Optional[int] = None       # grid - finish (positive = gained)
    best_lap: Optional[float] = None
    median_lap: Optional[float] = None
    average_lap: Optional[float] = None
    clean_air_pace: Optional[float] = None     # median of non-traffic, non-outlier laps
    consistency: Optional[float] = None        # stdev of clean laps (lower = better)
    consistency_score: Optional[float] = None  # 0-100, higher = more consistent
    pit_stops: int = 0
    total_pit_loss: Optional[float] = None
    traffic_laps: int = 0
    tyre_limited: bool = False
    stints: list[StintPace] = Field(default_factory=list)
    # "Pace rank" among all classified drivers by clean-air pace (1 = fastest).
    pace_rank: Optional[int] = None
    verdict: Optional[str] = None
    # Number of representative (clean-air, non-outlier) laps behind the pace
    # read — surfaced so the UI can be honest about small samples.
    representative_laps: int = 0
    # False when pace could not be meaningfully evaluated (retired, DSQ, DNS,
    # or too few representative laps). The verdict then states the factual
    # reason instead of a generic "solid run", and the UI hides the
    # field-relative metrics that would mislead.
    pace_evaluated: bool = True


class RaceInsight(BaseModel):
    kind: str            # turning_point | best_strategy | worst_strategy | undercut | vsc_stop | pace | ...
    title: str
    detail: str
    explanation: Optional[str] = None   # the WHY, shown when the card is expanded
    drivers: list[str] = Field(default_factory=list)
    lap_range: Optional[list[int]] = None
    severity: str = "info"   # info | good | bad | key
    confidence: str = "medium"  # low | medium | high


class UndercutEvent(BaseModel):
    attacker: str
    victim: str
    pit_lap: int
    gained: bool
    positions_gained: int = 0
    kind: str = "undercut"   # undercut | overcut


class StrategySummary(BaseModel):
    winner: Optional[str] = None
    driver_of_the_day: Optional[str] = None
    dotd_reason: Optional[str] = None
    biggest_gainers: list[dict] = Field(default_factory=list)
    biggest_losers: list[dict] = Field(default_factory=list)
    best_strategy: Optional[dict] = None
    worst_strategy: Optional[dict] = None
    best_pit_timing: Optional[dict] = None
    avg_pit_loss: Optional[float] = None
    avg_pit_loss_kind: Optional[str] = None   # measured | estimated | None
    pit_counts: dict = Field(default_factory=dict)
    tyre_summary: list[dict] = Field(default_factory=list)
    turning_points: list[RaceInsight] = Field(default_factory=list)
    undercuts: list[UndercutEvent] = Field(default_factory=list)
    hidden_pace_driver: Optional[str] = None
    strategy_helped_driver: Optional[str] = None
    weather_summary: Optional[str] = None
    insights: list[RaceInsight] = Field(default_factory=list)
    # 3-5 plain-English sentences for the Race Story overview.
    story: list[str] = Field(default_factory=list)
    # The analyst's version of the same story: margins, corrected-pace numbers,
    # pit economics — shown when the user is in Advanced mode.
    story_advanced: list[str] = Field(default_factory=list)


class QuestionAnswer(BaseModel):
    question: str
    answer: str
    kind: str = "generic"
    used_llm: bool = False
    confidence: str = "medium"
    supporting: dict = Field(default_factory=dict)   # structured evidence for the UI
    missing_data: list[str] = Field(default_factory=list)
    entities: dict = Field(default_factory=dict)     # {drivers: [...], teams: [...], ...}
    follow_ups: list[str] = Field(default_factory=list)  # suggested next questions/actions
    simple: bool = False                             # answer already in beginner language
    # --- richer structured answer (analyst-style) ---
    answer_title: Optional[str] = None
    short_answer: Optional[str] = None
    detailed_answer: list[str] = Field(default_factory=list)   # paragraphs
    evidence: list[str] = Field(default_factory=list)          # supporting bullets
    beginner_summary: Optional[str] = None
    advanced_notes: list[str] = Field(default_factory=list)
    related_drivers: list[str] = Field(default_factory=list)
    related_laps: list[int] = Field(default_factory=list)
    analysis_steps: list[str] = Field(default_factory=list)    # "what I checked"


# --------------------------------------------------------------------------- #
# Practice / non-race analysis
# --------------------------------------------------------------------------- #
class PracticeDriverRow(BaseModel):
    driver: str
    name: str
    team: str
    team_color: str = "#888888"
    best_lap: Optional[float] = None
    best_lap_rank: Optional[int] = None
    gap_to_fastest: Optional[float] = None
    laps_completed: int = 0
    long_run_pace: Optional[float] = None       # median of longest clean stint
    long_run_laps: int = 0
    consistency_score: Optional[float] = None
    improvement: Optional[float] = None         # first vs best representative lap (s)
    compounds: list[str] = Field(default_factory=list)
    best_sectors: list[Optional[float]] = Field(default_factory=list)
    low_running: bool = False                   # very few laps -> not representative


class PracticeSummary(BaseModel):
    session_type: str
    fastest_driver: Optional[str] = None
    fastest_lap: Optional[float] = None
    best_long_run_driver: Optional[str] = None
    most_laps_driver: Optional[str] = None
    most_improved_driver: Optional[str] = None
    most_consistent_driver: Optional[str] = None
    track_evolving: bool = False
    rows: list[PracticeDriverRow] = Field(default_factory=list)
    team_ranking: list[dict] = Field(default_factory=list)
    story: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class QualiDriverRow(BaseModel):
    driver: str
    name: str
    team: str
    team_color: str = "#888888"
    position: Optional[int] = None              # final qualifying classification
    best_lap: Optional[float] = None
    gap_to_pole: Optional[float] = None
    laps_completed: int = 0
    q1: Optional[float] = None                  # per-segment best, where known
    q2: Optional[float] = None
    q3: Optional[float] = None
    knocked_out_in: Optional[str] = None        # "Q1" | "Q2" | None (reached Q3)
    improvement: Optional[float] = None         # first-run best vs final best (s)
    consistency_score: Optional[float] = None
    best_sectors: list[Optional[float]] = Field(default_factory=list)
    vs_teammate: Optional[float] = None         # best-lap delta to teammate (negative = quicker)


class QualifyingSummary(BaseModel):
    session_type: str
    pole_driver: Optional[str] = None
    pole_lap: Optional[float] = None
    pole_margin: Optional[float] = None         # P1 -> P2 on best laps
    closest_pair: Optional[dict] = None         # {a, b, delta} tightest gap in the top 10
    biggest_surprise: Optional[dict] = None     # {driver, reason}
    biggest_disappointment: Optional[dict] = None  # {driver, reason}
    biggest_improvement_driver: Optional[str] = None
    fastest_sector_driver: Optional[str] = None # most session-best sectors
    most_consistent_driver: Optional[str] = None
    early_elimination: Optional[dict] = None    # {driver, reason} notable Q1 exit
    track_evolving: bool = False
    red_flags: list[str] = Field(default_factory=list)
    # structured red-flag parse: {message, driver, driver_name, cause, turn, lap}
    interruptions: list[dict] = Field(default_factory=list)
    deleted_laps: list[str] = Field(default_factory=list)
    pole_sector_breakdown: Optional[dict] = None  # pole's sectors vs session-best sectors
    segment_bests: dict = Field(default_factory=dict)  # {"Q1": s, "Q2": s, "Q3": s} where known
    rows: list[QualiDriverRow] = Field(default_factory=list)
    team_ranking: list[dict] = Field(default_factory=list)
    # which teams gained most from Q1 to their final segment (analyst view)
    team_progression: list[dict] = Field(default_factory=list)
    avg_final_run_gain: Optional[float] = None  # mean in-session improvement (s)
    conditions: Optional[str] = None            # "Dry · track 41–46°C"
    # two tellings of the same Saturday: plain-English recap vs analyst report
    story: list[str] = Field(default_factory=list)
    story_advanced: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    driver: str
    summary: str
    baseline_finish: Optional[int] = None
    estimated_finish: Optional[int] = None
    delta_seconds: Optional[float] = None            # negative = faster (time gained)
    rejoin_position: Optional[int] = None
    rejoin_behind: Optional[str] = None
    tyre_risk: str = "medium"                         # low | medium | high
    verdict: str = "neutral"                          # better | worse | neutral
    assumptions: list[str] = Field(default_factory=list)
    is_estimate: bool = True


# --------------------------------------------------------------------------- #
# API envelopes
# --------------------------------------------------------------------------- #
class RaceBundle(BaseModel):
    """Everything the Race Explorer needs in one payload."""
    session: RaceSession
    strategy: StrategySummary
    pace: list[DriverPaceSummary]
    practice: Optional[PracticeSummary] = None   # populated for practice sessions
