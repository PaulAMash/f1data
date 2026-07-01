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

// Safe race-gap display. The winner never shows a "+seconds" value, and absurd
// values (a source leaking cumulative race time) are hidden rather than shown.
export function fmtGap(position?: number | null, gap?: string | null): string {
  if (position === 1) return "Winner";
  if (!gap) return "—";
  const g = String(gap);
  if (/lap/i.test(g)) return g;                 // "+1 Lap" etc.
  const m = g.match(/([-+]?\d+(?:\.\d+)?)/);
  if (!m) return g === "LEADER" ? "Winner" : "—";
  const secs = parseFloat(m[1]);
  if (!isFinite(secs) || secs < 0 || secs > 300) return "—";  // not a plausible gap
  return `+${secs.toFixed(secs < 100 ? 3 : 1)}s`.replace("++", "+");
}

// Clean, user-friendly pit-stop label (mirrors the backend PitStopDataService).
export function pitLabel(p: {
  stationary_time?: number | null; stop_duration?: number | null;
  estimated_stationary_time?: number | null; pit_lane_time?: number | null;
}): { text: string; kind: "measured" | "estimated" | "lane" | "unknown" } {
  const stat = p.stationary_time ?? p.stop_duration;
  if (stat != null) return { text: `Stop ${stat.toFixed(1)}s`, kind: "measured" };
  if (p.estimated_stationary_time != null) return { text: `~${p.estimated_stationary_time.toFixed(1)}s est.`, kind: "estimated" };
  if (p.pit_lane_time != null) return { text: `Pit loss ${p.pit_lane_time.toFixed(1)}s`, kind: "lane" };
  return { text: "—", kind: "unknown" };
}
