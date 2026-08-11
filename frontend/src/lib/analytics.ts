"use client";
import { API_BASE } from "./api";

/* -------------------------------------------------------------------------- */
/* PRIVATE PRODUCT ANALYTICS — the browser half.                              */
/*                                                                            */
/* WHAT IS SENT: an event name, and only the fields that event is about — a    */
/* path, a season, a Grand Prix, a session type, a feature name, Simple or     */
/* Advanced. Plus two random identifiers this file generates for itself.       */
/*                                                                            */
/* WHAT IS NOT SENT, and cannot be, because it is never collected: no cookies, */
/* no IP (the browser cannot send one and the server does not record one), no  */
/* user agent, no referrer, no screen or device characteristics, no fingerprint*/
/* of any kind, no name, no email, no free text — except an Ask question, which*/
/* the reader typed on purpose and which is the entire point of the exercise.  */
/*                                                                            */
/* `visitor` is a random UUID created on first visit and kept in localStorage. */
/* It is derived from nothing about the person, identifies nobody, and clearing*/
/* site data erases it. It exists to tell "one person read eight pages" from   */
/* "eight people read one", which is not answerable any other way without      */
/* collecting something we have chosen not to collect.                        */
/*                                                                            */
/* THE RULE: this file may never throw, never block, and never delay a render. */
/* Every entry point is wrapped, the transport is fire-and-forget, and a dead  */
/* analytics backend is indistinguishable from a working one to the reader.    */
/* -------------------------------------------------------------------------- */

const VISITOR_KEY = "pitwall.aid";     // anonymous id, long-lived
const VISIT_KEY = "pitwall.vid";       // this visit
const VISIT_AT_KEY = "pitwall.vat";    // last activity, for the rollover
const VISIT_IDLE_MS = 30 * 60 * 1000;  // 30 minutes ends a visit

type Event = {
  name: "page_view" | "session_open" | "feature_use" | "client_error" | "visit_start"
      | "feature_dwell" | "session_unavailable";
  path?: string;
  year?: number;
  gp?: string;
  session?: string;
  feature?: string;
  mode?: "simple" | "advanced";
  detail?: string;
  /** Milliseconds — only ever a duration this file measured itself. */
  ms?: number;
};

let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let armed = false;

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Do Not Track is deprecated and rarely set, but honouring it costs one line
 *  and a reader who has asked not to be counted should not be counted. */
function optedOut(): boolean {
  try {
    const dnt = (navigator as any).doNotTrack ?? (window as any).doNotTrack;
    return dnt === "1" || dnt === "yes";
  } catch { return false; }
}

function ids(): { visitor: string; visit: string } | null {
  try {
    if (typeof window === "undefined" || optedOut()) return null;
    let visitor = localStorage.getItem(VISITOR_KEY);
    if (!visitor) { visitor = uuid(); localStorage.setItem(VISITOR_KEY, visitor); }

    const now = Date.now();
    const last = Number(sessionStorage.getItem(VISIT_AT_KEY) || 0);
    let visit = sessionStorage.getItem(VISIT_KEY);
    if (!visit || !last || now - last > VISIT_IDLE_MS) {
      visit = uuid();
      sessionStorage.setItem(VISIT_KEY, visit);
    }
    sessionStorage.setItem(VISIT_AT_KEY, String(now));
    return { visitor, visit };
  } catch {
    // Private-mode browsers throw on storage. No identity, no analytics, no fuss.
    return null;
  }
}

/** The anonymous id, for the one call that is not a beacon (Ask). */
export function visitorId(): string | undefined {
  return ids()?.visitor;
}

/** The current visit id, so an Ask question can be placed inside the visit it
 *  belongs to. Without it "what share of visits reach Ask" has no answer. */
export function visitSessionId(): string | undefined {
  return ids()?.visit;
}

function send(events: Event[], viaBeacon: boolean) {
  const id = ids();
  if (!id || !events.length) return;
  const body = JSON.stringify({ ...id, events });
  const url = `${API_BASE}/api/signal`;
  try {
    // text/plain keeps this a "simple request", so there is no CORS preflight —
    // and a beacon fired during page-unload rarely survives a preflight.
    if (viaBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      return;
    }
    void fetch(url, {
      method: "POST", body, keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    }).catch(() => {});
  } catch { /* an unreported event is not a problem worth reporting */ }
}

function flush(viaBeacon = false) {
  if (!queue.length) return;
  const batch = queue.slice(0, 20);
  queue = queue.slice(20);
  send(batch, viaBeacon);
}

function armUnload() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  try {
    // `pagehide` rather than `beforeunload`: it fires on mobile Safari's
    // back/forward cache path, which `beforeunload` does not, and that is where
    // "what were they doing before they left" actually gets recorded.
    window.addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
  } catch { /* ignore */ }
}

/** Record one product event. Batched, fire-and-forget, never throws. */
export function track(event: Event) {
  try {
    if (typeof window === "undefined" || optedOut()) return;
    armUnload();
    queue.push(event);
    if (queue.length >= 10) { flush(); return; }
    if (timer) clearTimeout(timer);
    // A short debounce so a tab-hop that fires three events costs one request.
    timer = setTimeout(() => { timer = null; flush(); }, 1500);
  } catch { /* never */ }
}

/* -- the handful of call sites, named so the intent is readable ------------ */

export function trackPageView(path: string) {
  track({ name: "page_view", path });
}

/** Which F1 data people actually open. The one event that answers "most viewed
 *  races" and "most viewed sessions". */
export function trackSessionOpen(year: number, gp: string, session: string) {
  track({ name: "session_open", year, gp, session });
}

export function trackFeature(feature: string, extra?: Partial<Event>) {
  track({ name: "feature_use", feature, ...extra });
}

export function trackClientError(detail: string) {
  track({ name: "client_error", detail: String(detail).slice(0, 300) });
}

/** How long a feature actually held someone.
 *
 *  "Opened" and "read" are different facts and only this one distinguishes
 *  them: a tab everybody clicks and nobody stays on is a naming or content
 *  problem, and it looks identical to a popular tab in a plain use count.
 *  Under a second is dropped — those are pass-throughs on the way somewhere
 *  else, and counting them would drag every average toward zero. */
export function trackFeatureDwell(feature: string, ms: number, extra?: Partial<Event>) {
  if (!Number.isFinite(ms) || ms < 1000 || ms > 3_600_000) return;
  track({ name: "feature_dwell", feature, ms: Math.round(ms), ...extra });
}

/** The reader hit the "this session isn't available" screen. A dead end seen
 *  from the reader's side — the API's own 503 says a request failed, not that
 *  somebody was left with nowhere to go. */
export function trackSessionUnavailable(year: number, gp: string, session: string,
                                        detail?: string) {
  track({ name: "session_unavailable", year, gp, session,
          detail: detail ? String(detail).slice(0, 300) : undefined });
}

/* -------------------------------------------------------------------------- */
/* WHICH ANSWERS THIS READER HAS ALREADY RATED.                               */
/*                                                                            */
/* The rating lives on the server, but the server never tells the browser what */
/* it already knows — an Ask response carries a fresh `ask_ref` and nothing    */
/* about prior opinions. So without a local record the only thing holding      */
/* "you already rated this" was React component state, which a tab switch      */
/* destroys and which, worse, was being inherited by a DIFFERENT answer when   */
/* the list re-keyed (see QuestionBox.tsx). Keyed by `ask_ref`, which is unique */
/* per answer, so a remembered rating can only ever be shown against the exact  */
/* answer it was given for.                                                    */
/*                                                                            */
/* Bounded to the most recent 200 so it cannot grow without limit.            */
/* -------------------------------------------------------------------------- */
const RATED_KEY = "pitwall.rated";
const RATED_MAX = 200;

type RatedMap = Record<string, boolean>;

function readRated(): RatedMap {
  try {
    const raw = localStorage.getItem(RATED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as RatedMap) : {};
  } catch { return {}; }
}

/** What this browser previously said about one answer, or undefined. */
export function recallFeedback(ref?: string | null): boolean | undefined {
  if (!ref) return undefined;
  const value = readRated()[ref];
  return typeof value === "boolean" ? value : undefined;
}

function rememberFeedback(ref: string, helpful: boolean) {
  try {
    const map = readRated();
    map[ref] = helpful;
    const keys = Object.keys(map);
    if (keys.length > RATED_MAX) {
      for (const key of keys.slice(0, keys.length - RATED_MAX)) delete map[key];
    }
    localStorage.setItem(RATED_KEY, JSON.stringify(map));
  } catch { /* private mode: the control still works, it just forgets */ }
}

/** Thumbs on an Ask answer. Direct rather than batched: it is a deliberate act
 *  and it should land even if the reader closes the tab a moment later. */
export function sendAskFeedback(ref: string, helpful: boolean) {
  try {
    if (!ref) return;
    rememberFeedback(ref, helpful);
    void fetch(`${API_BASE}/api/ask/feedback`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, helpful }),
    }).catch(() => {});
  } catch { /* never */ }
}
