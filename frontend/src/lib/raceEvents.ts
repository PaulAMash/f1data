import { Flag, ShieldAlert, Gauge } from "lucide-react";
import type { RaceSession } from "./types";

/* -------------------------------------------------------------------------- */
/* One source of truth for race-control events, shared by every chart so a     */
/* Safety Car shows up identically on the Position chart, the Tyre chart and   */
/* the hover. Windows are derived from BOTH the reported window list AND the    */
/* per-lap track status — sources routinely flag a lap as SAFETY_CAR without    */
/* ever emitting the window (the missing Belgian lap-1 SC), and scanning the    */
/* laps recovers it.                                                           */
/* -------------------------------------------------------------------------- */

export type EventKind = "start" | "sc" | "vsc" | "red";

export const EVENT: Record<EventKind, { code: string; label: string; color: string; icon: any; blurb: string }> = {
  start: { code: "START", label: "Race start", color: "#00e0c6", icon: Flag, blurb: "Lights out and the run to turn 1." },
  sc:    { code: "SC",    label: "Safety Car",  color: "#ff9e2c", icon: ShieldAlert, blurb: "Full safety car — the field bunches up and the pit lane gets busy." },
  vsc:   { code: "VSC",   label: "Virtual SC",  color: "#ffd21e", icon: Gauge, blurb: "Virtual safety car — everyone slows to a delta; a cheap moment to pit." },
  red:   { code: "RED",   label: "Red flag",    color: "#ff5555", icon: ShieldAlert, blurb: "Session stopped — cars return to the pits and can change tyres." },
};

// neutral accent for non-neutralisation beats (lap markers / story / finish)
export const NEUTRAL_ACCENT = "#c3ccdd";

export interface Win { kind: EventKind; start: number; end: number; cause?: string | null; }

const STATUS_TO_KIND = (s: string): EventKind | null =>
  s === "SAFETY_CAR" ? "sc" : s === "VSC" ? "vsc" : s === "RED" ? "red" : null;
const SEV: Record<EventKind, number> = { red: 4, sc: 3, vsc: 2, start: 0 };

/** Contiguous neutralisation windows, most-severe-wins per lap, with a cause. */
export function deriveWindows(session: RaceSession): Win[] {
  const total = session.total_laps;
  const lapKind = new Map<number, EventKind>();
  const bump = (lap: number, k: EventKind) => {
    if (lap < 1 || lap > total) return;
    if (SEV[k] > SEV[lapKind.get(lap) ?? "start"]) lapKind.set(lap, k);
  };
  for (const w of session.track_status_windows) {
    const k = STATUS_TO_KIND(w.status);
    if (k) for (let l = w.start_lap; l <= w.end_lap; l++) bump(l, k);
  }
  for (const lp of session.laps) {
    const k = STATUS_TO_KIND(lp.track_status);
    if (k) bump(lp.lap, k);
  }
  const wins: Win[] = [];
  let cur: Win | null = null;
  for (let l = 1; l <= total; l++) {
    const k = lapKind.get(l) ?? null;
    if (k && cur && cur.kind === k && l === cur.end + 1) cur.end = l;
    else { if (cur) wins.push(cur); cur = k ? { kind: k, start: l, end: l } : null; }
  }
  if (cur) wins.push(cur);
  for (const w of wins) {
    const src = session.track_status_windows.find(
      (s) => STATUS_TO_KIND(s.status) === w.kind && s.start_lap <= w.end && s.end_lap >= w.start && s.cause);
    w.cause = src?.cause ?? null;
  }
  return wins;
}

/** lap → the neutralisation kind in force on that lap (for hover banners). */
export function lapStatusMap(windows: Win[]): Map<number, EventKind> {
  const m = new Map<number, EventKind>();
  for (const w of windows) for (let l = w.start; l <= w.end; l++) m.set(l, w.kind);
  return m;
}
