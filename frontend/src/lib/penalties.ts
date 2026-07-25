import type { RaceControlEvent } from "./types";

/* -------------------------------------------------------------------------- */
/* Penalty awareness — one parser for the whole app. Structured penalties are  */
/* derived from official race-control messages (the only honest source we      */
/* have), so a badge never claims more than the FIA feed actually said.        */
/* -------------------------------------------------------------------------- */

export type PenaltyKind =
  | "grid" | "time" | "drive_through" | "stop_go"
  | "deleted_lap" | "investigation" | "reprimand" | "disqualified";

export interface Penalty {
  driver: string;            // 3-letter code extracted from the message
  kind: PenaltyKind;
  label: string;             // compact badge text, e.g. "+5 GRID"
  detail: string;            // the official message, cleaned for reading
  lap?: number | null;
  places?: number | null;    // grid penalties
  seconds?: number | null;   // time penalties
}

export const PENALTY_META: Record<PenaltyKind, { tone: "red" | "amber" | "neutral"; title: string }> = {
  grid:          { tone: "red",     title: "Grid penalty" },
  time:          { tone: "red",     title: "Time penalty" },
  drive_through: { tone: "red",     title: "Drive-through penalty" },
  stop_go:       { tone: "red",     title: "Stop-go penalty" },
  disqualified:  { tone: "red",     title: "Disqualified" },
  deleted_lap:   { tone: "amber",   title: "Lap time deleted" },
  investigation: { tone: "amber",   title: "Under investigation" },
  reprimand:     { tone: "neutral", title: "Reprimand" },
};

// "CAR 44 (HAM)" / "(HAM)" / "CARS 4 (NOR) AND 81 (PIA)" → codes
function codesIn(msg: string): string[] {
  const out: string[] = [];
  const re = /\(([A-Z]{3})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function clean(msg: string): string {
  const s = msg.replace(/^FIA STEWARDS:\s*/i, "").trim();
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** Parse the race-control log into structured penalties, newest last. */
export function derivePenalties(raceControl: RaceControlEvent[]): Penalty[] {
  const out: Penalty[] = [];
  for (const e of raceControl) {
    const up = (e.message || "").toUpperCase();
    const codes = codesIn(up);
    if (!codes.length) continue;
    const base = { detail: clean(e.message), lap: e.lap };

    const grid = up.match(/(\d+)\s*(?:PLACE|GRID POSITION)S?\s*GRID PENALTY|GRID PENALTY[^0-9]*(\d+)\s*PLACE/);
    const time = up.match(/(\d+)\s*SEC(?:OND)?S?\s*(?:TIME\s*)?PENALTY/);
    for (const driver of codes) {
      if (grid) {
        const places = parseInt(grid[1] ?? grid[2], 10);
        out.push({ ...base, driver, kind: "grid", places, label: `+${places} GRID` });
      } else if (up.includes("DISQUALIF")) {
        out.push({ ...base, driver, kind: "disqualified", label: "DSQ" });
      } else if (time) {
        const seconds = parseInt(time[1], 10);
        out.push({ ...base, driver, kind: "time", seconds, label: `+${seconds}s` });
      } else if (up.includes("DRIVE THROUGH")) {
        out.push({ ...base, driver, kind: "drive_through", label: "DRIVE-THRU" });
      } else if (/STOP\s*(?:AND|\/|&)?\s*GO/.test(up)) {
        out.push({ ...base, driver, kind: "stop_go", label: "STOP-GO" });
      } else if (up.includes("LAP DELETED") || up.includes("TIME DELETED")) {
        out.push({ ...base, driver, kind: "deleted_lap", label: "LAP DELETED" });
      } else if (up.includes("UNDER INVESTIGATION") || up.includes("WILL BE INVESTIGATED")) {
        out.push({ ...base, driver, kind: "investigation", label: "INVESTIGATION" });
      } else if (up.includes("REPRIMAND")) {
        out.push({ ...base, driver, kind: "reprimand", label: "REPRIMAND" });
      }
    }
  }
  return out;
}

/** The penalties that change where a driver starts the NEXT race. */
export function gridPenaltiesByDriver(penalties: Penalty[]): Map<string, Penalty[]> {
  const m = new Map<string, Penalty[]>();
  for (const p of penalties) {
    if (p.kind !== "grid" && p.kind !== "disqualified") continue;
    (m.get(p.driver) ?? m.set(p.driver, []).get(p.driver)!).push(p);
  }
  return m;
}

export function penaltiesByDriver(penalties: Penalty[]): Map<string, Penalty[]> {
  const m = new Map<string, Penalty[]>();
  for (const p of penalties) (m.get(p.driver) ?? m.set(p.driver, []).get(p.driver)!).push(p);
  return m;
}
