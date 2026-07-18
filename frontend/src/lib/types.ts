// TypeScript mirror of the backend's normalized models (app.models).
// Kept intentionally close to the Python shapes so the API client is a thin pass-through.

export type DataSource = "live" | "cache" | "mock";
export type Compound =
  | "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";
export type TrackStatusKind = "GREEN" | "YELLOW" | "VSC" | "SAFETY_CAR" | "RED";

export interface Circuit {
  id: string; name: string; locality?: string | null; country?: string | null;
  length_km?: number | null; laps?: number | null;
}
export interface Driver {
  number: string; code: string; name: string; team: string;
  team_color: string; grid?: number | null; country?: string | null;
  headshot_url?: string | null;
}
export interface Constructor { id: string; name: string; color: string; }

export interface Lap {
  driver: string; lap: number; lap_time?: number | null; position?: number | null;
  compound: Compound; tyre_age?: number | null; stint?: number | null;
  pit_in: boolean; pit_out: boolean; gap_to_leader?: number | null;
  interval?: number | null; track_status: TrackStatusKind; is_outlier: boolean;
  sector1?: number | null; sector2?: number | null; sector3?: number | null;
}
export interface Stint {
  driver: string; stint: number; compound: Compound; start_lap: number; end_lap: number;
  laps: number; is_new_tyre: boolean; avg_lap?: number | null; median_lap?: number | null;
  best_lap?: number | null; degradation?: number | null;
}
export interface PitStop {
  driver: string; lap: number; stationary_time?: number | null;
  pit_lane_time?: number | null; stop_duration?: number | null;
  estimated_stationary_time?: number | null;
  compound_before: Compound; compound_after: Compound;
  under_vsc: boolean; under_safety_car: boolean;
  source: string; confidence: string; explanation?: string | null;
}
export interface Overtake {
  lap: number; overtaker: string; overtaken: string; position_after?: number | null;
  kind: string; source: string; detail?: string | null;
}
export interface FacetSource { facet: string; source: string; confidence: string; detail?: string | null; }
export interface SourceProbe { name: string; reachable?: boolean | null; detail?: string | null; }
export interface SourceReport {
  data_source: DataSource; fetched_at?: string | null; facets: FacetSource[];
  probes: SourceProbe[]; missing: string[]; partial: boolean; cache_key?: string | null;
}
export interface RaceControlEvent {
  lap?: number | null; time?: string | null; category: string; flag?: string | null;
  scope?: string | null; status?: TrackStatusKind | null; message: string;
}
export interface WeatherPoint {
  lap?: number | null; time_min?: number | null; air_temp?: number | null;
  track_temp?: number | null; humidity?: number | null; rainfall: boolean;
  wind_speed?: number | null; wind_direction?: number | null;
}
export interface PositionPoint { driver: string; lap: number; position: number; }
export interface TrackStatusWindow {
  status: TrackStatusKind; start_lap: number; end_lap: number; label: string;
  cause?: string | null;   // "Kimi Antonelli stopped on track" — who brought it out
}
export interface ClassificationRow {
  position?: number | null; driver: string; name: string; team: string; team_color: string;
  grid?: number | null; laps_completed?: number | null; status: string; gap?: string | null;
  best_lap?: number | null; pit_stops: number; points?: number | null; retired: boolean;
  retirement_reason?: string | null; retirement_source?: string | null;
}
export type SessionCategory = "race" | "qualifying" | "sprint" | "sprint_qualifying" | "practice";
export interface RaceSession {
  year: number; grand_prix: string; official_name?: string | null; session_type: string;
  category: SessionCategory; circuit?: Circuit | null; total_laps: number; data_source: DataSource;
  fetched_at?: string | null; partial: boolean; pit_data_reliable?: boolean;
  notes: string[]; source_report?: SourceReport | null;
  drivers: Driver[]; constructors: Constructor[]; classification: ClassificationRow[];
  laps: Lap[]; stints: Stint[]; pit_stops: PitStop[]; overtakes: Overtake[];
  race_control: RaceControlEvent[]; weather: WeatherPoint[]; positions: PositionPoint[];
  track_status_windows: TrackStatusWindow[];
}

export interface StintPace {
  stint: number; compound: Compound; start_lap: number; end_lap: number; laps: number;
  avg_lap?: number | null; median_lap?: number | null; degradation?: number | null;
}
export interface DriverPaceSummary {
  driver: string; name: string; team: string; team_color: string;
  grid?: number | null; finish?: number | null; net_positions?: number | null;
  best_lap?: number | null; median_lap?: number | null; average_lap?: number | null;
  clean_air_pace?: number | null; consistency?: number | null; consistency_score?: number | null;
  pit_stops: number; total_pit_loss?: number | null; traffic_laps: number;
  tyre_limited: boolean; stints: StintPace[]; pace_rank?: number | null; verdict?: string | null;
}
export interface RaceInsight {
  kind: string; title: string; detail: string; explanation?: string | null; drivers: string[];
  lap_range?: number[] | null; severity: "info" | "good" | "bad" | "key"; confidence: string;
}
export interface UndercutEvent {
  attacker: string; victim: string; pit_lap: number; gained: boolean;
  positions_gained: number; kind: string;
}
export interface StrategySummary {
  winner?: string | null; driver_of_the_day?: string | null; dotd_reason?: string | null;
  biggest_gainers: any[]; biggest_losers: any[];
  best_strategy?: any; worst_strategy?: any; best_pit_timing?: any;
  avg_pit_loss?: number | null; pit_counts: Record<string, number>; tyre_summary: any[];
  turning_points: RaceInsight[]; undercuts: UndercutEvent[];
  hidden_pace_driver?: string | null; strategy_helped_driver?: string | null;
  weather_summary?: string | null; insights: RaceInsight[]; story: string[];
  story_advanced?: string[];
  avg_pit_loss_kind?: string | null;
}

export interface PracticeDriverRow {
  driver: string; name: string; team: string; team_color: string;
  best_lap?: number | null; best_lap_rank?: number | null; gap_to_fastest?: number | null;
  laps_completed: number; long_run_pace?: number | null; long_run_laps: number;
  consistency_score?: number | null; improvement?: number | null;
  compounds: string[]; best_sectors: (number | null)[]; low_running: boolean;
}
export interface PracticeSummary {
  session_type: string; fastest_driver?: string | null; fastest_lap?: number | null;
  best_long_run_driver?: string | null; most_laps_driver?: string | null;
  most_improved_driver?: string | null; most_consistent_driver?: string | null;
  track_evolving: boolean; rows: PracticeDriverRow[]; team_ranking: any[];
  story: string[]; notes: string[];
}

export interface RaceBundle {
  source: DataSource; source_label: string; category: SessionCategory;
  session: RaceSession; strategy: StrategySummary; pace: DriverPaceSummary[];
  practice?: PracticeSummary | null;
}

export interface QuestionAnswer {
  source?: DataSource; category?: SessionCategory; question: string; answer: string; kind: string;
  used_llm: boolean; confidence: string; supporting: Record<string, any>; missing_data: string[];
  entities: Record<string, any>; follow_ups: string[]; simple: boolean;
  // structured, analyst-style fields
  answer_title?: string | null;
  short_answer?: string | null;
  detailed_answer: string[];
  evidence: string[];
  beginner_summary?: string | null;
  advanced_notes: string[];
  related_drivers: string[];
  related_laps: number[];
  analysis_steps: string[];
}
export interface SimulationResult {
  source?: DataSource; driver: string; summary: string;
  baseline_finish?: number | null; estimated_finish?: number | null;
  delta_seconds?: number | null; rejoin_position?: number | null; rejoin_behind?: string | null;
  tyre_risk: string; verdict: string; assumptions: string[]; is_estimate: boolean;
}
export interface Season { year: number; events: number; }
export interface GrandPrix {
  round?: number | null; name: string; official_name?: string | null;
  location?: string | null; country?: string | null; circuit?: Circuit | null;
  date?: string | null; sessions: string[];
  session_times?: Record<string, string>;   // session name -> ISO start time
}
export interface Meta {
  app: string; mock_mode: boolean; live_fetch_enabled: boolean; llm_available: boolean;
  default_year: number; source_labels: Record<DataSource, string>;
}
