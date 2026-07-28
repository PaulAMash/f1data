import { Flag, ShieldAlert, Gauge, TrendingDown, TrendingUp, Eye } from "lucide-react";
import type { RaceSession, StrategySummary, UndercutEvent } from "./types";

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

// neutral accent for structural marks that aren't events at all (lap ticks)
export const NEUTRAL_ACCENT = "#c3ccdd";

/* -------------------------------------------------------------------------- */
/* What kind of moment is this, and why does it deserve the reader's time?     */
/*                                                                            */
/* Every strategy beat used to be drawn as the same grey dot, which told the   */
/* reader two untrue things: that an undercut and a tyre gamble are the same   */
/* sort of event, and that neither matters much. Grey is the colour of chrome; */
/* the things that decided a Grand Prix should not be wearing it.              */
/*                                                                            */
/* So moments are classified by WHAT THEY DID TO THE RACE, not by what         */
/* mechanism produced them — which is the only classification a reader can use */
/* at a glance:                                                               */
/*                                                                            */
/*   pivot    the race turned here                              amber          */
/*   gain     a call that won time or places                    speed teal     */
/*   loss     a call that cost time or places                   rose           */
/*   read     true and useful, but nobody gained or lost by it  violet         */
/*                                                                            */
/* Neutralisations keep their broadcast colours (SC orange, VSC yellow, red    */
/* flag red) because those are already learned. One table, used by the Position*/
/* chart, the Race Story timeline and the Strategy page alike, so an undercut  */
/* is the same colour and the same word wherever the reader meets it.          */
/* -------------------------------------------------------------------------- */

export type MomentClass = "pivot" | "gain" | "loss" | "read";

export const MOMENT: Record<MomentClass, {
  label: string; color: string; icon: any;
  /** Tailwind tone name, for components that style with classes. */
  tone: "amber" | "speed" | "bad" | "violet";
}> = {
  pivot: { label: "Turning point", color: "#ffb020", icon: Flag, tone: "amber" },
  gain: { label: "Time won", color: "#00e0c6", icon: TrendingUp, tone: "speed" },
  loss: { label: "Time lost", color: "#fb7185", icon: TrendingDown, tone: "bad" },
  read: { label: "Worth knowing", color: "#c4b5fd", icon: Eye, tone: "violet" },
};

/** Insight kind → what it did to the race. Falls back to severity, then read. */
const KIND_CLASS: Record<string, MomentClass> = {
  turning_point: "pivot",
  undercut: "gain", overcut: "gain", best_strategy: "gain", pit_timing: "gain",
  worst_strategy: "loss", missed_stop: "loss", tyre_risk: "loss",
  hidden_pace: "read",
};
const SEVERITY_CLASS: Record<string, MomentClass> = {
  key: "pivot", good: "gain", bad: "loss", info: "read",
};

export function momentClassOf(kind?: string | null, severity?: string | null): MomentClass {
  return KIND_CLASS[(kind ?? "").toLowerCase()]
    ?? SEVERITY_CLASS[(severity ?? "").toLowerCase()]
    ?? "read";
}

/** Human name for an insight kind — one spelling across the whole product. */
export const KIND_LABEL: Record<string, string> = {
  turning_point: "Turning point", best_strategy: "Best call", worst_strategy: "Costly call",
  pit_timing: "Pit timing", undercut: "Undercut", overcut: "Overcut",
  missed_stop: "Missed window", tyre_risk: "Tyre risk", hidden_pace: "Hidden pace",
};

/* -------------------------------------------------------------------------- */
/* Undercuts, told properly.                                                  */
/*                                                                            */
/* "HAM undercut on NOR" states that a thing happened. It does not say whether */
/* it worked, what it was worth, or why it is on a list of the six moments     */
/* that decided the race — so the reader has no way to judge it and skims past.*/
/* Every undercut we surface now carries the consequence, taken from the       */
/* event's own data: who was jumped, how many places it was worth, and whether */
/* the driver still held it at the flag.                                      */
/* -------------------------------------------------------------------------- */

export interface UndercutStory {
  /** e.g. "HAM undercut NOR" */
  title: string;
  /** One line: what it was worth. */
  outcome: string;
  /** The mechanism, for the drawer. */
  detail: string;
  cls: MomentClass;
  worked: boolean;
}

export function undercutStory(
  u: UndercutEvent,
  nameOf: (code: string) => string,
  finishPos?: (code: string) => number | null | undefined,
): UndercutStory {
  const a = nameOf(u.attacker), v = nameOf(u.victim);
  const verb = u.kind === "overcut" ? "overcut" : "undercut";
  const gained = u.positions_gained ?? 0;
  const places = `${gained} place${gained === 1 ? "" : "s"}`;

  // did the move still matter at the flag? only claimed when we can check it
  const pa = finishPos?.(u.attacker), pv = finishPos?.(u.victim);
  const heldToFlag = pa != null && pv != null ? pa < pv : null;

  let outcome: string;
  if (!u.gained) {
    outcome = `It didn't work — ${a} came out behind ${v} anyway.`;
  } else if (gained > 0) {
    const tail = heldToFlag === true ? " and was still ahead at the flag."
      : heldToFlag === false ? `, though ${v} took the place back before the end.`
        : ".";
    outcome = `Worth ${places}: ${a} came out ahead of ${v}${tail}`;
  } else {
    outcome = `${a} came out ahead of ${v} and held track position.`;
  }

  const detail = u.kind === "overcut"
    ? `${a} stayed out while ${v} pitted, banked the clear-air laps, and pitted later — coming out on fresher rubber with the place already made.`
    : `${a} pitted on lap ${u.pit_lap}, one lap before ${v}. Fresh tyres are worth roughly a second a lap for two laps; ${v} had to answer on old ones and lost the position in the pit cycle.`;

  return {
    title: `${a} ${verb} ${v}`,
    outcome,
    detail,
    cls: u.gained ? "gain" : "loss",
    worked: !!u.gained,
  };
}

/** The undercuts worth putting on a key-moments list, best first. */
export function rankedUndercuts(strategy?: StrategySummary | null, limit = 3): UndercutEvent[] {
  return [...(strategy?.undercuts ?? [])]
    .sort((a, b) => (Number(b.gained) - Number(a.gained))
      || ((b.positions_gained ?? 0) - (a.positions_gained ?? 0)))
    .slice(0, limit);
}

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
