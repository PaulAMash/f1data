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
    sessions: list[str] = Field(default_factory=list)  # available session names


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
    stationary_time: Optional[float] = None   # wheel-gun to release (s)
    pit_lane_time: Optional[float] = None      # total pit-lane loss (s)
    under_vsc: bool = False
    under_safety_car: bool = False


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


# --------------------------------------------------------------------------- #
# Top-level session
# --------------------------------------------------------------------------- #
class RaceSession(BaseModel):
    """The complete normalized picture of one session."""
    year: int
    grand_prix: str
    official_name: Optional[str] = None
    session_type: str
    circuit: Optional[Circuit] = None
    total_laps: int = 0
    data_source: DataSource = DataSource.MOCK
    fetched_at: Optional[str] = None
    notes: list[str] = Field(default_factory=list)   # e.g. "PitStopSeries not available pre-2025"

    drivers: list[Driver] = Field(default_factory=list)
    constructors: list[Constructor] = Field(default_factory=list)
    classification: list[ClassificationRow] = Field(default_factory=list)
    laps: list[Lap] = Field(default_factory=list)
    stints: list[Stint] = Field(default_factory=list)
    pit_stops: list[PitStop] = Field(default_factory=list)
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


class RaceInsight(BaseModel):
    kind: str            # turning_point | best_strategy | worst_strategy | undercut | vsc_stop | pace | ...
    title: str
    detail: str
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
    pit_counts: dict = Field(default_factory=dict)
    tyre_summary: list[dict] = Field(default_factory=list)
    turning_points: list[RaceInsight] = Field(default_factory=list)
    undercuts: list[UndercutEvent] = Field(default_factory=list)
    hidden_pace_driver: Optional[str] = None
    strategy_helped_driver: Optional[str] = None
    weather_summary: Optional[str] = None
    insights: list[RaceInsight] = Field(default_factory=list)


class QuestionAnswer(BaseModel):
    question: str
    answer: str
    kind: str = "generic"
    used_llm: bool = False
    confidence: str = "medium"
    supporting: dict = Field(default_factory=dict)   # structured evidence for the UI
    missing_data: list[str] = Field(default_factory=list)


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
