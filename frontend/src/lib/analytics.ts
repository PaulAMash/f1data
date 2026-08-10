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
  name: "page_view" | "session_open" | "feature_use" | "client_error" | "visit_start";
  path?: string;
  year?: number;
  gp?: string;
  session?: string;
  feature?: string;
  mode?: "simple" | "advanced";
  detail?: string;
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

/** Thumbs on an Ask answer. Direct rather than batched: it is a deliberate act
 *  and it should land even if the reader closes the tab a moment later. */
export function sendAskFeedback(ref: string, helpful: boolean) {
  try {
    if (!ref) return;
    void fetch(`${API_BASE}/api/ask/feedback`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, helpful }),
    }).catch(() => {});
  } catch { /* never */ }
}
