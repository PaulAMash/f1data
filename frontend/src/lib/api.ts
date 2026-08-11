// Thin typed client for the Pitwall IQ backend.
// The backend base URL is configurable so the app works whether the API runs
// locally (default) or elsewhere. Never contains secrets.
import { normalizeBundle } from "./sessionShape";
import type {
  ArchiveScale, Featured,
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
  // `reason`/`retryable`/`attempts` come from the backend's structured error
  // payloads (e.g. 503 data_unavailable) so the UI can show reason-specific help.
  constructor(message: string, public status = 0, public retryable = false,
              public attempts: any[] = [], public reason: string = "") {
    super(message);
  }
}

async function handle<T>(res: Response, path: string): Promise<T> {
  if (res.ok) return res.json();
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error */ }
  // Our structured errors use `message`; FastAPI HTTPExceptions use `detail`.
  const msg = body?.message ?? (typeof body?.detail === "string" ? body.detail : null);
  if (msg) {
    throw new ApiError(msg, res.status, !!body.retryable, body.attempts ?? [], body.reason ?? "");
  }
  throw new ApiError(`API error ${res.status} on ${path}`, res.status, res.status >= 500);
}

/**
 * `timeoutMs` gives a call its own ceiling. Without one, a request that never
 * answers hangs until the browser's own (very long, unknowable) limit, and the
 * only thing the user sees is a button that stays busy forever. A bounded call
 * fails in a knowable time and can say something useful.
 */
async function get<T>(path: string, params?: Record<string, any>,
                      opts?: { timeoutMs?: number; noStore?: boolean }): Promise<T> {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const ctl = opts?.timeoutMs ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), opts!.timeoutMs) : null;
  let res: Response;
  try {
    /* `no-store` USED TO BE ON EVERY CALL, WHICH MADE THE SERVER'S OPINION
       IRRELEVANT. It is the strongest possible instruction — do not cache this,
       do not even keep it for a back-navigation — and it was being applied to a
       quarter of a megabyte of finished, immutable race data. Every tab change
       and every Back re-fetched a Grand Prix from 2024 that had not changed
       since 2024, which costs nothing over loopback and is the whole page load
       again over a real connection.
       The server now says how long each answer stays good for (see
       Cache-Control on /api/session), so the default mode is right: revalidate
       when the server says to, reuse when it says it may. Explicit refresh
       still bypasses it, because Re-run carries `refresh=true` and that is a
       different URL. Only genuinely live probes opt back into `no-store`. */
    res = await fetch(url.toString(), {
      cache: opts?.noStore ? "no-store" : "default",
      signal: ctl?.signal,
    });
  } catch {
    // An abort and a dead server are different problems with different fixes,
    // so they must not share one message.
    throw ctl?.signal.aborted
      ? new ApiError(`The API didn't answer within ${Math.round(opts!.timeoutMs! / 1000)}s.`, 0, true)
      : new ApiError(`Cannot reach the API at ${API_BASE}. Is the backend running?`, 0, true);
  } finally {
    if (timer) clearTimeout(timer);
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
  /** Coverage figures for the landing band — derived server-side, never typed. */
  archiveScale: () => get<ArchiveScale>("/api/archive/scale"),
  /** The most recent completed race, as a headline. Powers the landing card. */
  featured: () => get<Featured>("/api/featured"),
  seasons: () => get<{ source: string; seasons: Season[] }>("/api/seasons"),
  races: (year: number) =>
    get<{ source: string; year: number; races: GrandPrix[] }>(`/api/seasons/${year}/races`),
  // normalized on arrival, so no panel has to defend itself against a session
  // that reached it without an entry list — see lib/sessionShape
  session: (year: number, gp: string, session: string, refresh = false) =>
    get<RaceBundle>("/api/session", { year, gp, session, refresh }).then(normalizeBundle),
  compare: (year: number, gp: string, session: string, a: string, b: string) =>
    get<any>("/api/compare", { year, gp, session, a, b }),
  // `visitor` is the browser's own anonymous id (see lib/analytics) — it is
  // what lets the private dashboard tell one person asking eight questions from
  // eight people asking one. It carries nothing identifying.
  ask: (body: {
    year: number; gp: string; session: string; question: string; simple?: boolean;
    visitor?: string; visit?: string;
  }) => post<QuestionAnswer>("/api/ask", body),
  current: () =>
    get<{ year: number; gp: string | null; session: string; seasons: number[] }>("/api/current"),
  sessionsAvailable: (year: number, gp: string) =>
    get<{ source: string; sessions: string[] }>("/api/sessions/available", { year, gp }),
  // The backend caps every probe and runs them together, so this answers in
  // seconds or not at all — 20s is generous headroom, not a target.
  // a liveness probe answers "right now" or it answers nothing useful
  dataSourceHealth: () =>
    get<{ probes: { name: string; reachable: boolean | null; detail?: string }[] }>(
      "/api/health/data-sources", undefined, { timeoutMs: 20_000, noStore: true }),
  sourceReport: (year: number, gp: string, session: string) =>
    get<any>("/api/session/source-report", { year, gp, session }),
  // a cache-clear that could itself be served from cache is not a cache-clear
  clearCache: (year?: number, gp?: string, session?: string) =>
    get<{ cleared: number }>("/api/session/cache/clear", { year, gp, session },
                             { noStore: true }),
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
