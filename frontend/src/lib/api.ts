// Thin typed client for the Pitwall IQ backend.
// The backend base URL is configurable so the app works whether the API runs
// locally (default) or elsewhere. Never contains secrets.
import type {
  GrandPrix, Meta, QuestionAnswer, RaceBundle, Season, SimulationResult,
} from "./types";

// The desktop sidecar always listens here (see backend/desktop_server.py).
const DESKTOP_API_BASE = "http://127.0.0.1:8765";

/**
 * Resolve the backend base URL across all three run modes:
 *   1. Browser web dev / prod  → NEXT_PUBLIC_API_BASE(_URL), else localhost:8000
 *   2. Tauri desktop (packaged) → the bundled sidecar on 127.0.0.1:8765
 *   3. Tauri desktop (dev)      → same sidecar port
 * An explicit env var always wins so you can point the app anywhere.
 */
function resolveApiBase(): string {
  const env =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && "__TAURI__" in window) return DESKTOP_API_BASE;
  return "http://localhost:8000";
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
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
  } catch (e: any) {
    throw new ApiError(`Cannot reach the API at ${API_BASE}. Is the backend running?`);
  }
  if (!res.ok) throw new ApiError(`API error ${res.status} on ${path}`, res.status);
  return res.json();
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
    throw new ApiError(`Cannot reach the API at ${API_BASE}. Is the backend running?`);
  }
  if (!res.ok) throw new ApiError(`API error ${res.status} on ${path}`, res.status);
  return res.json();
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  seasons: () => get<{ source: string; seasons: Season[] }>("/api/seasons"),
  races: (year: number) =>
    get<{ source: string; year: number; races: GrandPrix[] }>(`/api/seasons/${year}/races`),
  session: (year: number, gp: string, session: string, mock = false, refresh = false) =>
    get<RaceBundle>("/api/session", { year, gp, session, mock, refresh }),
  compare: (year: number, gp: string, session: string, a: string, b: string, mock = false) =>
    get<any>("/api/compare", { year, gp, session, a, b, mock }),
  ask: (body: {
    year: number; gp: string; session: string; question: string; mock?: boolean; simple?: boolean;
  }) => post<QuestionAnswer>("/api/ask", body),
  sessionsAvailable: (year: number, gp: string) =>
    get<{ source: string; sessions: string[] }>("/api/sessions/available", { year, gp }),
  dataSourceHealth: () =>
    get<{ probes: { name: string; reachable: boolean | null; detail?: string }[] }>("/api/health/data-sources"),
  sourceReport: (year: number, gp: string, session: string, mock = false) =>
    get<any>("/api/session/source-report", { year, gp, session, mock }),
  clearCache: (year?: number, gp?: string, session?: string) =>
    get<{ cleared: number }>("/api/session/cache/clear", { year, gp, session }),
  simulate: (body: {
    year: number; gp: string; session: string; driver: string;
    new_pit_lap?: number | null; num_stops?: number | null; compounds?: string[] | null; mock?: boolean;
  }) => post<SimulationResult>("/api/simulate", body),
  historyStandings: (year: number, type: "driver" | "constructor") =>
    get<{ source: string; standings: any[] }>("/api/history/standings", { year, type }),
  circuitWinners: (circuit: string) =>
    get<{ source: string; winners: any[] }>("/api/history/circuit-winners", { circuit }),
};
