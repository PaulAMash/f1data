// Thin typed client for the Pitwall IQ backend.
// The backend base URL is configurable so the app works whether the API runs
// locally (default) or elsewhere. Never contains secrets.
import type {
  GrandPrix, Meta, QuestionAnswer, RaceBundle, Season, SimulationResult,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

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
    year: number; gp: string; session: string; question: string; mock?: boolean;
  }) => post<QuestionAnswer>("/api/ask", body),
  simulate: (body: {
    year: number; gp: string; session: string; driver: string;
    new_pit_lap?: number | null; num_stops?: number | null; compounds?: string[] | null; mock?: boolean;
  }) => post<SimulationResult>("/api/simulate", body),
  historyStandings: (year: number, type: "driver" | "constructor") =>
    get<{ source: string; standings: any[] }>("/api/history/standings", { year, type }),
  circuitWinners: (circuit: string) =>
    get<{ source: string; winners: any[] }>("/api/history/circuit-winners", { circuit }),
};
