"use client";
import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CloudRain, Flag, Gauge, ShieldAlert, TriangleAlert, Wind } from "lucide-react";
import type { RaceSession } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { flagKindOf } from "@/lib/raceEvents";
import {
  CHART_MARGIN, GRID_COLOR, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE,
  axisLine, axisTick,
} from "@/lib/chartTheme";
import { TrackConditions } from "./TrackConditions";
import { cx } from "@/lib/format";

export function RaceControlWeather({ session }: { session: RaceSession }) {
  const weatherData = useMemo(() => {
    return session.weather.map((w, i) => ({
      x: w.lap ?? Math.round(((i + 0.5) / Math.max(1, session.weather.length)) * session.total_laps),
      air: w.air_temp, track: w.track_temp, rain: w.rainfall ? 1 : 0,
    }));
  }, [session]);

  const pittedInWindow = (start: number, end: number) =>
    Array.from(new Set(session.pit_stops.filter((p) => p.lap >= start && p.lap <= end).map((p) => p.driver)));

  const latest = session.weather[session.weather.length - 1];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* weather */}
      <div>
        {/* the same visual conditions panel the qualifying story uses, so
            weather reads identically wherever it appears */}
        <div className="mb-3">
          <div className="label mb-2">Track conditions</div>
          <TrackConditions session={session} />
        </div>
        {weatherData.length ? (
          <div className="h-[210px] w-full">
            <ResponsiveContainer>
              <AreaChart data={weatherData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="track" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6a5a" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ff6a5a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="air" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e0c6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00e0c6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} />
                <XAxis dataKey="x" type="number" domain={[1, session.total_laps]}
                  tick={axisTick()} tickLine={false} tickMargin={6} height={26} axisLine={axisLine} />
                <YAxis tick={axisTick()} width={38} tickLine={false}
                  padding={{ top: 6, bottom: 2 }} axisLine={axisLine} unit="°" />
                <Tooltip isAnimationActive={false} contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
                  labelFormatter={(l) => `Lap ${l}`} />
                <Area name="Track" dataKey="track" stroke="#ff6a5a" fill="url(#track)" strokeWidth={2} isAnimationActive={false} />
                <Area name="Air" dataKey="air" stroke="#00e0c6" fill="url(#air)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">No weather data for this session.</p>
        )}
      </div>

      {/* race control timeline */}
      <div>
        <div className="label mb-3">Race control</div>
        <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
          {session.track_status_windows.map((w, i) => {
            const drivers = pittedInWindow(w.start_lap, w.end_lap);
            return (
              <div key={`w${i}`} className="rounded-lg border border-amber/20 bg-amber/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber">
                  <ShieldAlert size={13} /> {w.label} · laps {w.start_lap}–{w.end_lap}
                </div>
                {drivers.length > 0 && (
                  <div className="mt-1 text-xs text-ink-muted">
                    Pitted in this window (cheap stop): <span className="text-ink">{drivers.join(", ")}</span>
                  </div>
                )}
              </div>
            );
          })}
          {session.race_control.map((m, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-base-800/40 px-3 py-1.5">
              <span className="mt-0.5 text-ink-faint">{iconFor(m.category, m.flag)}</span>
              <div className="min-w-0">
                <span className="text-[11px] tabular-nums text-ink-faint">
                  {m.lap != null ? `L${m.lap}` : "—"}
                </span>
                <span className={cx("ml-2 text-xs", flagTone(m.flag))}>{m.message}</span>
              </div>
            </div>
          ))}
          {!session.race_control.length && !session.track_status_windows.length && (
            <p className="text-sm text-ink-faint">No race-control messages for this session.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function iconFor(category: string, flag?: string | null) {
  if (/safety/i.test(category)) return <ShieldAlert size={13} />;
  if (/flag/i.test(category)) return <Flag size={13} />;
  if (/car/i.test(category)) return <TriangleAlert size={13} />;
  if (/drs/i.test(category)) return <Gauge size={13} />;
  return <Flag size={13} />;
}

function flagTone(flag?: string | null) {
  // exact flag semantics via the shared classifier — "CHEQUERED" contains
  // "RED", so substring checks painted every chequered flag as a stoppage
  switch (flagKindOf(flag)) {
    case "red": return "text-accent-soft";
    case "yellow": case "double_yellow": return "text-amber";
    case "chequered": return "text-ink";
    case "green": case "clear": return "text-emerald-300";
    default: return "text-ink-muted";
  }
}
