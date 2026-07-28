import type { Compound } from "./types";

// Broadcast-accurate tyre colors.
export const COMPOUND_COLOR: Record<Compound, string> = {
  SOFT: "#ff3b3b",
  MEDIUM: "#ffcf3f",
  HARD: "#e7ecf3",
  INTERMEDIATE: "#3fd06a",
  WET: "#3aa0ff",
  UNKNOWN: "#6b7488",
};

/* A compound the timing feed never reported is a gap in the data, not a tyre.
   "Unknown" is a developer's word for it; the reader is told, in their own
   language, that this one wasn't recorded — and the chart stops shouting a
   question mark at them. */
export const COMPOUND_LABEL: Record<Compound, string> = {
  SOFT: "Soft", MEDIUM: "Medium", HARD: "Hard",
  INTERMEDIATE: "Inter", WET: "Wet", UNKNOWN: "Not recorded",
};

export const COMPOUND_SHORT: Record<Compound, string> = {
  SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "",
};

/** True when the source actually told us which tyre this was. */
export function compoundKnown(c: Compound): boolean {
  return c !== "UNKNOWN";
}

/** One sentence for the reader when a stint's tyre wasn't in the feed. */
export const COMPOUND_MISSING_HINT =
  "The timing feed didn't report a tyre for this stint — the laps are real, the compound simply wasn't published.";

// Text color that reads on each compound chip.
export function compoundText(c: Compound): string {
  return c === "HARD" || c === "MEDIUM" ? "#0b0e16" : "#0b0e16";
}
