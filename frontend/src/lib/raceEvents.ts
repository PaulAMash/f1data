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

/* -------------------------------------------------------------------------- */
/* Flag semantics — exact, not substring. "CHEQUERED" contains "RED", so any    */
/* naive includes() check counts every segment-end chequered flag as a red      */
/* flag (the Hungarian-quali "3 red flags" bug: three segments, three           */
/* chequereds). Every component classifies flags through this one function.     */
/* -------------------------------------------------------------------------- */

export type FlagKind = "red" | "yellow" | "double_yellow" | "green" | "clear" | "chequered" | "blue" | "other";

export function flagKindOf(flag?: string | null): FlagKind {
  if (!flag) return "other";
  const f = flag.toUpperCase().trim();
  if (f.includes("CHEQUERED") || f.includes("CHECKERED")) return "chequered";
  if (f.includes("DOUBLE YELLOW")) return "double_yellow";
  if (f.includes("YELLOW")) return "yellow";
  if (f.includes("GREEN")) return "green";
  if (f.includes("CLEAR")) return "clear";
  if (f.includes("BLUE")) return "blue";
  // exact word "RED" only — never a substring of another flag name
  if (/(^|\s)RED(\s|$)/.test(f) || f === "RED FLAG") return "red";
  return "other";
}

/* -------------------------------------------------------------------------- */
/* ONE definition of an interruption, used by every page.                      */
/*                                                                            */
/* An INTERRUPTION is something that stopped or neutralised the session — a    */
/* red flag, safety car or VSC. That is what Lap Analysis has always shown and */
/* what a broadcast means by the word, so the headline statistic now matches   */
/* everywhere. Local yellow flags are NOT interruptions: the session keeps     */
/* running. They are reported separately, clearly labelled, so the two numbers */
/* can never be mistaken for the same thing.                                   */
/* -------------------------------------------------------------------------- */

export interface SessionInterruptions {
  /** red-flag stoppages (the session was halted) */
  stoppages: number;
  /** safety-car deployments */
  safetyCars: number;
  /** virtual safety-car periods */
  virtualSafetyCars: number;
  /** everything above — the canonical "interruptions" count */
  total: number;
  /** local yellow-flag incidents; the session was never stopped */
  localYellows: number;
}

// which sector a flag message refers to, so a yellow in S1 and a yellow in S3
// are two incidents while repeated S1 messages are one
function sectorOf(message: string): string {
  const m = message.toUpperCase().match(/SECTOR\s*(\d+)/);
  return m ? `S${m[1]}` : "TRACK";
}

/**
 * Interruption episodes from the official race-control log.
 *
 * Yellow counting is sector-aware: the FIA feed repeats a yellow for as long
 * as the incident stands (and often re-issues it per sector), so a naive
 * message count reported seven yellows for a session that had two incidents.
 * A yellow opens an episode for its sector; the matching clear (or any
 * green/chequered) closes it. Reds and neutralisations collapse the same way.
 */
export function sessionInterruptions(
  raceControl: { flag?: string | null; message: string; status?: string | null }[],
  windows?: Win[],
): SessionInterruptions {
  let stoppages = 0;
  let inRed = false;
  const openYellow = new Set<string>();
  const yellowIncidents = new Set<string>();
  let yellowSeq = 0;

  for (const e of raceControl) {
    const k = flagKindOf(e.flag);
    const up = (e.message || "").toUpperCase();
    const sector = sectorOf(up);
    if (k === "red" || /\bRED\s+FLAG\b/.test(up)) {
      if (!inRed) { stoppages += 1; inRed = true; }
      openYellow.clear();
      continue;
    }
    if (k === "yellow" || k === "double_yellow") {
      if (!openYellow.has(sector)) {
        openYellow.add(sector);
        yellowIncidents.add(`${sector}#${++yellowSeq}`);
      }
      continue;
    }
    if (k === "green" || k === "chequered") { openYellow.clear(); inRed = false; continue; }
    if (k === "clear" || up.includes("TRACK CLEAR")) {
      // a sector-scoped clear only ends that sector's yellow
      if (sector === "TRACK") { openYellow.clear(); inRed = false; }
      else openYellow.delete(sector);
    }
  }

  // neutralisations come from the same derived windows the charts draw
  const safetyCars = (windows ?? []).filter((w) => w.kind === "sc").length;
  const virtualSafetyCars = (windows ?? []).filter((w) => w.kind === "vsc").length;
  const redWindows = (windows ?? []).filter((w) => w.kind === "red").length;
  stoppages = Math.max(stoppages, redWindows);

  return {
    stoppages, safetyCars, virtualSafetyCars,
    total: stoppages + safetyCars + virtualSafetyCars,
    localYellows: yellowIncidents.size,
  };
}
