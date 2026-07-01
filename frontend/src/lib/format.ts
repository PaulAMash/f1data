// Formatting helpers shared across the UI.

/** 83.421 -> "1:23.421", 59.2 -> "59.200" */
export function fmtLap(sec?: number | null): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

/** 20.5 -> "20.5s" */
export function fmtSec(sec?: number | null, digits = 1): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "—";
  return `${sec.toFixed(digits)}s`;
}

export function fmtDelta(sec?: number | null): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "—";
  return `${sec >= 0 ? "+" : ""}${sec.toFixed(1)}s`;
}

export function ordinal(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function netBadge(net?: number | null): { text: string; tone: "up" | "down" | "flat" } {
  if (net === null || net === undefined) return { text: "—", tone: "flat" };
  if (net > 0) return { text: `▲ ${net}`, tone: "up" };
  if (net < 0) return { text: `▼ ${Math.abs(net)}`, tone: "down" };
  return { text: "—", tone: "flat" };
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
