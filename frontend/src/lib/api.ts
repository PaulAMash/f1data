// Thin typed client for the Pitwall IQ backend.
// The backend base URL is configurable so the app works whether the API runs
// locally (default) or elsewhere. Never contains secrets.
import type {
  GrandPrix, Meta, QuestionAnswer, RaceBundle, Season, SimulationResult,
} from "./types";

/**
 * Backend base URL. Set NEXT_PUBLIC_API_BASE_URL for production (the deployed
 * backend); it falls back to the legacy NEXT_PUBLIC_API_BASE, then localhost.
 * Never contains secrets.
 */
function resolveApiBase(): string {
  const env =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
  return (env || "http://localhost:8000").replace(/\/$/, "");
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  // `retryable` and `attempts` come from the backend's structured error payloads
  // (e.g. 503 data_unavailable) so the UI can show honest retry / diagnostics.
  constructor(message: string, public status = 0,
              public retryable = false, public attempts: any[] = []) {
    super(message);
  }
}

async function handle<T>(res: Response, path: string): Promise<T> {
  if (res.ok) return res.json();
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error */ }
  if (body && body.message) {
    throw new ApiError(body.message, res.status, !!body.retryable, body.attempts ?? []);
  }
  throw new ApiError(`API error ${res.status} on ${path}`, res.status, res.status >= 500);
}

async function get<T>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_BASE}. Is the backend running?`, 0, true);
  }
  return handle<T>(res, path);
}

async function post<T>(path: string, body: any): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_BASE}. Is the backend running?`, 0, true);
  }
  return handle<T>(res, path);
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  seasons: () => get<{ source: string; seasons: Season[] }>("/api/seasons"),
  races: (year: number) =>
    get<{ source: string; year: number; races: GrandPrix[] }>(`/api/seasons/${year}/races`),
  session: (year: number, gp: string, session: string, refresh = false) =>
    get<RaceBundle>("/api/session", { year, gp, session, refresh }),
  compare: (year: number, gp: string, session: string, a: string, b: string) =>
    get<any>("/api/compare", { year, gp, session, a, b }),
  ask: (body: {
    year: number; gp: string; session: string; question: string; simple?: boolean;
  }) => post<QuestionAnswer>("/api/ask", body),
  sessionsAvailable: (year: number, gp: string) =>
    get<{ source: string; sessions: string[] }>("/api/sessions/available", { year, gp }),
  dataSourceHealth: () =>
    get<{ probes: { name: string; reachable: boolean | null; detail?: string }[] }>("/api/health/data-sources"),
  sourceReport: (year: number, gp: string, session: string) =>
    get<any>("/api/session/source-report", { year, gp, session }),
  clearCache: (year?: number, gp?: string, session?: string) =>
    get<{ cleared: number }>("/api/session/cache/clear", { year, gp, session }),
  simulate: (body: {
    year: number; gp: string; session: string; driver: string;
    new_pit_lap?: number | null; num_stops?: number | null; compounds?: string[] | null;
  }) => post<SimulationResult>("/api/simulate", body),
  historyStandings: (year: number, type: "driver" | "constructor") =>
    get<{ source: string; standings: any[] }>("/api/history/standings", { year, type }),
  circuitWinners: (circuit: string) =>
    get<{ source: string; winners: any[] }>("/api/history/circuit-winners", { circuit }),
  // Historical Data Explorer
  histSeasons: () => get<{ seasons: Season[] }>("/api/historical/seasons"),
  histEvents: (year: number) => get<{ year: number; events: GrandPrix[] }>("/api/historical/events", { year }),
  histSessions: (year: number, event: string) =>
    get<{ available: string[]; unavailable: string[]; note?: string }>("/api/historical/sessions", { year, event }),
  histResults: (year: number, event: string, session: string) =>
    get<any>("/api/historical/results", { year, event, session }),
};
