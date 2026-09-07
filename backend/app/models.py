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
    sessions: list[str] = Field(default_factory=list)  # SCHEDULED session names
    # session name -> ISO start time. The only unambiguous instant on this
    # model: `date` means the Friday to OpenF1 and the Sunday to Jolpica, so
    # every lifecycle question is answered from here — see app/schedule.py.
    session_times: dict[str, str] = Field(default_factory=dict)
    # SCHEDULED is not AVAILABLE. `sessions` is what the calendar promises;
    # this is what has actually been run and can therefore be loaded. Stamped
    # server-side so no client re-derives it — see service.mark_completed.
    available_sessions: list[str] = Field(default_factory=list)
    # Running right now: the cars are on track. The third state, and the one a
    # boolean had nowhere to put — a reader arriving during Practice 1 was
    # being told it had not happened.
    live_sessions: list[str] = Field(default_factory=list)
    # RUN, whether or not the data has arrived. The larger set: everything in
    # `available_sessions` is here, and so is a session that finished ten
    # minutes ago and whose timing is still being published. Keeping the two
    # apart is what stops a slow archive being mistaken for a running session.
    completed_sessions: list[str] = Field(default_factory=list)
    # Has the race itself been run? Decided from the Race session's own start
    # time rather than from `date`, which is the field that meant two things.
    completed: bool = True


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
    # Pit-lane entry to exit, in seconds. THIS is what OpenF1's `pit_duration`
    # and Ergast/Jolpica's pit-stop `duration` measure — twenty-odd seconds,
    # of which the car is stationary for two or three. Both used to be copied
    # into `stop_duration` as well and read back as the stop itself, which is
    # how a 24-second lane transit was drawn as a 24-second stationary time.
    pit_lane_time: Optional[float] = None
    # A source's measure of the stop as a whole, when it has one that is
    # neither the stationary time nor the lane time. No configured source
    # publishes one today; kept for the schema, never derived from lane time.
    stop_duration: Optional[float] = None
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


class Incident(BaseModel):
    """Something race control logged, exactly as the official line named it.

    Participants are the cars the message itself cites ("CARS 16 (LEC) AND 44
    (HAM)") — never a car that happened to be near, never a car that retired
    around then. `kind` is the verb the message used. An incident is a fact
    about the log; it is not, by itself, the cause of anything.
    """
    lap: Optional[int] = None
    kind: str = "incident"            # collision | crash | spun | stopped | puncture | debris | incident
    drivers: list[str] = Field(default_factory=list)   # codes, in the order the message named them
    message: str = ""                 # the official line, verbatim
    source: str = "race_control"


class TrackStatusWindow(BaseModel):
    """A contiguous window of non-green track status (VSC/SC/red flag).

    THE EVENT IS NOT THE CAUSE. A Safety Car is a fact race control published
    ("SAFETY CAR DEPLOYED", lap N); why it was deployed is a different fact,
    and the FIA's log almost never states it. This model keeps the two apart:
    `cause` is set only when a source SAYS so (`cause_source`, `cause_message`
    carry the evidence); `incidents` are the official incident lines logged in
    the window's laps, labelled as logged alongside it and nothing more. The
    old model held one `cause` string that was filled from the nearest
    incident message up to three laps away, which is how a restart Safety Car
    was captioned with a lap-1 collision.
    """
    status: TrackStatus
    start_lap: int
    end_lap: int
    label: str = ""
    cause: Optional[str] = None       # ONLY with provenance — see cause_source
    cause_source: Optional[str] = None      # "race_control" when the deployment line states it
    cause_message: Optional[str] = None     # the official line that states it, verbatim
    incidents: list[Incident] = Field(default_factory=list)   # logged in these laps; not asserted as the trigger
    # where the window itself came from: race_control (the FIA's own
    # deployment / ending lines), track_status (the timing system's per-lap
    # status codes), mock (the simulator). Never "inferred from lap times".
    source: str = "unknown"
    confidence: str = "high"          # medium when a boundary lap had to be carried from the previous line
    end_known: bool = True            # False when no ending line / status closed it (closed at the last known lap)


class ClassificationRow(BaseModel):
    position: Optional[int] = None
    driver: str
    name: str
    team: str
    team_color: str = "#888888"
    grid: Optional[int] = None
    laps_completed: Optional[int] = None
    # Finished, +1 Lap, DNF, … — or "Provisional" until a source states it.
    # The default used to be "Finished": a row nobody had classified read as
    # a finisher, which is the one thing a missing status must not become.
    status: str = "Provisional"
    gap: Optional[str] = None
    # Official classified race time in seconds (FIA classification total for
    # lead-lap finishers). None for lapped cars and retirements.
    race_time: Optional[float] = None
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


#: What a row says in `status` while it is only a running order — a place in
#: the timing feed's final order, not a classified result. It used to say
#: "Finished", which is a claim a position feed cannot make.
PROVISIONAL_STATUS = "Provisional"


def classification_is_official(rows: list[ClassificationRow]) -> bool:
    """Does this classification carry anything only an official result can?

    THE RULE EVERY ADAPTER AND THE AUDIT SHARE. A running order rebuilt from a
    timing feed — OpenF1's position feed, FastF1's results before the results
    archive has the round, the F1 archive's last timing frame — has no gap, no
    classified time, no points and no retirement on any row, and every status
    is the default. A single one of those anywhere means a result was
    published: no real classification has none of them, in any season since
    1950. Provenance-free on purpose, so a record cached by a build that did
    not flag its results is recognised by what it holds rather than by who
    built it.
    """
    for c in rows:
        if c.retired or c.gap is not None or c.race_time is not None or c.points is not None:
            return True
        if c.status and c.status not in ("Finished", PROVISIONAL_STATUS):
            return True
    return False


# --------------------------------------------------------------------------- #
# Source reporting (kept out of the main UI; surfaced in a Data Sources panel)
# --------------------------------------------------------------------------- #
class FacetSource(BaseModel):
    """Where one facet of the session came from + how confident we are."""
    facet: str                        # results | laps | pit_stops | overtakes | weather | ...
    source: str = "unknown"           # openf1 | fastf1 | jolpica | pitwall | mock | none
    confidence: str = "medium"        # high | medium | low
    detail: Optional[str] = None
    # PRESENT IS NOT THE SAME AS AUTHORITATIVE. A classification rebuilt from
    # the timing feed's final running order is a real list of real cars — and
    # it is not the official result: it knows no gaps, no times, no points and
    # no retirements, and a post-race penalty can reorder it. An adapter that
    # had to fall back to one says so here, so the pipeline can keep asking the
    # sources that publish the official record until one of them answers. See
    # data_source_manager._reconcile_results.
    provisional: bool = False


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
    # Why the missing facets are missing, in plain language. "Partial data" that
    # can't say what went wrong reads as a defect in the app; the same chip that
    # says a source wasn't answering reads as the truth about the session.
    missing_reason: Optional[str] = None
    partial: bool = False
    # ---- one verdict, and every page reads this one ----------------------
    #
    # `partial` was the only axis for four releases and it could not carry the
    # decision, because it lumps two different situations together. A 2024 race
    # with no weather trace is partial and completely worth reading. A race whose
    # ENTRY LIST never arrived is partial too — and it renders as a page of car
    # numbers with question marks under them, which is not a race analysis at
    # all.
    #
    # So the facets are split by what a session cannot be reconstructed without.
    # `essential_missing` is empty or it is not; if it is not, the product owes
    # the reader the unavailable screen rather than a page they would have to
    # take on trust. Enriching facets that are absent stay in `missing`, are
    # explained in the sources panel, and never gate the page.
    essential_missing: list[str] = Field(default_factory=list)
    #: True when everything essential to this kind of session is present.
    complete: bool = True
    # ---- the second axis: present, but not yet the official record ---------
    #
    # `complete` answers "can this session be read?" and it must keep doing
    # only that: a race whose official classification has not been published
    # yet still has every lap, every stint and every position, and refusing to
    # show them because one feed is late would be the generic unavailable
    # screen the product exists to avoid. What `complete` could not say is
    # that the classification it counted as present was PROVISIONAL — a
    # running order with no gaps, no points and no retirements in it. That
    # silence is how a race fetched minutes after the flag was cached as
    # finished, frozen for a month, and rendered with a "—" in every column
    # the official result fills.
    #
    # `provisional` lists the essential facets that are present in that
    # weaker form. `settled` is the single verdict the clients read: the record
    # is complete AND nothing in it is standing in for the official one. A
    # record that is not settled is served, labelled, and re-asked for.
    provisional: list[str] = Field(default_factory=list)
    settled: bool = True
    # ---- the third axis: official, and still owed a field -------------------
    #
    # `settled` says the classification is the official one. It does not say
    # the official RECORD is whole: OpenF1 publishes a result with no starting
    # grid when its grid feed is empty and never with a classified time or a
    # retirement reason; the results archive has all three, hours later. A
    # record can therefore be settled — every position, gap and point right —
    # and still print "won from P?" because the one field the sentence needs
    # never arrived from the one source that was asked. That is not
    # provisional (nothing is standing in for anything) and it must not flip
    # `settled` (the reader would be told an official result is pending). It
    # is a field the record is still waiting on, named here so the pipeline
    # keeps asking the source that publishes it, on the same cadence as an
    # unsettled record, and so the sources panel can say what is missing.
    # Values: "grid", "race_time", "retirement_reason", "pit_timing".
    awaiting: list[str] = Field(default_factory=list)
    # ---- the fourth axis: two sources, two answers ---------------------------
    #
    # When the source that settled a row and the source asked to complete it
    # disagree about where a car finished, nothing position-dependent is taken
    # from the second (see data_source_manager._fill_official_fields) and the
    # disagreement is written here, one line each ("position NOR: openf1=3
    # jolpica=4"), so it is visible rather than silently resolved.
    conflicts: list[str] = Field(default_factory=list)
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
    # True when nothing ESSENTIAL to this kind of session is missing — see
    # SourceReport.complete. The UI gates the whole race page on this: complete
    # sessions render, incomplete ones get the unavailable screen rather than a
    # page the reader would have to take on trust.
    complete: bool = True
    # True when the record is complete AND authoritative — nothing essential in
    # it is a stand-in for the official one. False is the "still assembling"
    # state: readable, labelled as provisional, and re-checked against the
    # sources until it settles. See SourceReport.settled.
    settled: bool = True
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
    # Seconds per lap behind the fastest ranked car's clean-air pace, rounded
    # ONCE here. The website used to subtract two already-rounded paces itself
    # and print the floating-point residue to three places; the app did its
    # own arithmetic; the two disagreed by a thousandth on the same record.
    gap_to_best: Optional[float] = None
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


class NeutralizationCounts(BaseModel):
    safety_cars: int = 0
    virtual_safety_cars: int = 0
    red_flags: int = 0
    total: int = 0                     # the three above — what "interruptions" means everywhere
    local_yellows: int = 0             # sector yellows; the session was never neutralised
    source: str = "none"               # race_control | track_status | mock | none


class RaceFacts(BaseModel):
    """The race-level facts every client shows, computed once, here.

    WHY THIS EXISTS. The finisher count, the retirement count, the margin,
    the fastest lap, the best-pace gap and the number of Safety Cars were each
    being recomputed by whichever client was drawing them — the website
    counted `!retired` rows and subtracted two rounded paces, the app did the
    same in its own code — and two clients reading one record disagreed by a
    thousandth of a second. A domain fact has one implementation, and it is
    this one; a client formats it.

    Every field is None when the record cannot establish it: no finisher
    count before the classification is official, no margin without a
    runner-up gap, no fastest lap without a lap table. None is the answer,
    not zero.
    """
    settled: bool = True
    awaiting: list[str] = Field(default_factory=list)
    entries: Optional[int] = None
    finishers: Optional[int] = None
    retirements: Optional[int] = None
    winner: Optional[str] = None
    winner_name: Optional[str] = None
    winner_grid: Optional[int] = None
    runner_up: Optional[str] = None
    margin: Optional[str] = None           # "+3.857s" / "+1 Lap", as the official result gives it
    margin_s: Optional[float] = None       # seconds, when the margin is a time
    fastest_lap_driver: Optional[str] = None
    fastest_lap: Optional[float] = None    # quickest racing lap in the lap table (not the FIA award)
    best_pace_driver: Optional[str] = None
    best_pace: Optional[float] = None      # corrected clean-air pace, seconds
    best_pace_gap: Optional[float] = None  # to the next ranked car, rounded once
    best_pace_gap_to: Optional[str] = None
    race_distance_laps: Optional[int] = None
    pit_data_reliable: bool = True
    neutralizations: NeutralizationCounts = Field(default_factory=NeutralizationCounts)


class StrategySummary(BaseModel):
    facts: Optional[RaceFacts] = None
    winner: Optional[str] = None
    driver_of_the_day: Optional[str] = None
    dotd_reason: Optional[str] = None
    #: The same evidence as `dotd_reason`, unjoined, so the UI can render chips
    #: instead of a semicolon-separated sentence.
    dotd_factors: list[str] = Field(default_factory=list)
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
    #: Whether a real handler recognised this question, or the chain fell through
    #: to the best-effort fallback. The fallback returns a session overview, which
    #: after the fact is indistinguishable from an overview somebody asked for —
    #: so without this flag "Ask did not understand the question" is invisible,
    #: and that is the single most useful thing to know about a beta feature.
    #: Read by app/analytics/classify.py; changes no behaviour and no wording.
    matched_handler: bool = True
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
    # Verified grid changes: the official starting grid compared against this
    # qualifying result. Post-session steward decisions (gearbox/engine grid
    # drops) are published after the session's own race-control feed closes, so
    # the starting grid is the only trustworthy record that they happened.
    # {driver, name, qualified, starts, places}
    grid_changes: list[dict] = Field(default_factory=list)
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
