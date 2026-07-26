"use client";
import { CloudRain, CloudSun, Droplets, Navigation, Sun, Thermometer } from "lucide-react";
import type { RaceSession } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Conditions you understand before you read them.                            */
/*                                                                            */
/* A line of text ("Dry · track 42–50°C") is accurate but inert — you have to  */
/* parse it to feel anything. Temperature maps onto the colour people already  */
/* associate with it (cool blue → hot orange), rain becomes an icon, wind      */
/* becomes an arrow that actually points, humidity becomes a filled track.     */
/* Numbers stay, but they arrive second.                                       */
/* -------------------------------------------------------------------------- */

/** Cool blue → warm amber → hot orange-red, over the range F1 actually runs in. */
export function tempColor(c: number): string {
  const stops: [number, string][] = [
    [5, "#4da3ff"], [15, "#38bdf8"], [25, "#22d3a7"],
    [35, "#facc15"], [45, "#fb923c"], [60, "#f43f5e"],
  ];
  if (c <= stops[0][0]) return stops[0][1];
  if (c >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (c >= t0 && c <= t1) return mix(c0, c1, (c - t0) / (t1 - t0));
  }
  return stops[2][1];
}
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r1 + (r2 - r1) * t)}${to(g1 + (g2 - g1) * t)}${to(b1 + (b2 - b1) * t)}`;
}

interface Reading {
  air?: number | null; track?: number | null; humidity?: number | null;
  wind?: number | null; windDir?: number | null; wet: boolean;
  trackMin?: number | null; trackMax?: number | null;
}

export function readConditions(session: RaceSession): Reading | null {
  const w = session.weather;
  if (!w.length) return null;
  const last = w[w.length - 1];
  const tracks = w.map((x) => x.track_temp).filter((x): x is number => x != null);
  return {
    air: last.air_temp, track: last.track_temp, humidity: last.humidity,
    wind: last.wind_speed, windDir: last.wind_direction,
    wet: w.some((x) => x.rainfall),
    trackMin: tracks.length ? Math.min(...tracks) : null,
    trackMax: tracks.length ? Math.max(...tracks) : null,
  };
}

/** A temperature read as a coloured track with the value riding on it. */
function TempMeter({ label, value, min = 0, max = 60, icon }: {
  label: string; value: number; min?: number; max?: number; icon: React.ReactNode;
}) {
  const pct = Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100));
  const c = tempColor(value);
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5">
        <span style={{ color: c }}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: c }}>
          {value.toFixed(0)}°
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tempColor(min + 5)}, ${c})` }} />
      </div>
    </div>
  );
}

/**
 * The conditions panel. `compact` fits the qualifying story card grid; the
 * full version adds humidity and wind for the race-control view.
 */
export function TrackConditions({ session, compact = false }: { session: RaceSession; compact?: boolean }) {
  const r = readConditions(session);
  if (!r) return <p className="text-sm text-ink-faint">No weather data for this session.</p>;
  const Sky = r.wet ? CloudRain : (r.humidity ?? 0) > 65 ? CloudSun : Sun;
  const skyTone = r.wet ? "text-sky-300" : (r.humidity ?? 0) > 65 ? "text-ink-muted" : "text-amber";

  return (
    <div className={cx("space-y-3", compact && "space-y-2.5")}>
      <div className="flex items-center gap-2.5">
        <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]", skyTone)}>
          <Sky size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-bold leading-tight text-ink">{r.wet ? "Wet at times" : "Dry"}</div>
          {r.trackMin != null && r.trackMax != null && (
            <div className="text-[11px] text-ink-faint">
              Track ran {r.trackMin.toFixed(0)}–{r.trackMax.toFixed(0)}°C
            </div>
          )}
        </div>
        {/* wind as a needle that genuinely points where it blows */}
        {r.wind != null && (
          <div className="ml-auto flex items-center gap-1.5" title={`Wind ${r.wind.toFixed(1)} km/h${r.windDir != null ? ` from ${Math.round(r.windDir)}°` : ""}`}>
            <Navigation size={14} className="text-ink-muted transition-transform"
              style={{ transform: `rotate(${(r.windDir ?? 0) + 180}deg)` }} />
            <span className="text-xs font-semibold tabular-nums text-ink-muted">{r.wind.toFixed(1)}</span>
            <span className="text-[10px] text-ink-faint">km/h</span>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {r.air != null && <TempMeter label="Air" value={r.air} icon={<Thermometer size={12} />} />}
        {r.track != null && <TempMeter label="Track" value={r.track} icon={<Thermometer size={12} />} />}
      </div>

      {!compact && r.humidity != null && (
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Droplets size={12} className="text-sky-300" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Humidity</span>
            <span className="ml-auto text-sm font-bold tabular-nums text-sky-200">{r.humidity.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500/60 to-sky-300 transition-all duration-500"
              style={{ width: `${Math.max(4, Math.min(100, r.humidity))}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
