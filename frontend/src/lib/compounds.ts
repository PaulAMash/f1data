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

export const COMPOUND_LABEL: Record<Compound, string> = {
  SOFT: "Soft", MEDIUM: "Medium", HARD: "Hard",
  INTERMEDIATE: "Inter", WET: "Wet", UNKNOWN: "Unknown",
};

export const COMPOUND_SHORT: Record<Compound, string> = {
  SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?",
};

// Text color that reads on each compound chip.
export function compoundText(c: Compound): string {
  return c === "HARD" || c === "MEDIUM" ? "#0b0e16" : "#0b0e16";
}
