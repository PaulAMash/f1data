"use client";
import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { CloudRain, ShieldAlert, TriangleAlert } from "lucide-react";
import { Flag, Gauge, Thermometer } from "@/components/ui/MotionIcon";
import type { RaceSession } from "@/lib/types";
import { flagKindOf } from "@/lib/raceEvents";
import { StatStrip, VisualLabel } from "@/components/ui/Visuals";
import { Term } from "@/components/ui/Term";
import { tempColor } from "./TrackConditions";
import {
  CHART_MARGIN, GRID_COLOR, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE,
  axisLine, axisTick,
} from "@/lib/chartTheme";
import { TrackConditions } from "./TrackConditions";
import { cx } from "@/lib/format";

/* The tyre's usable band. Everything on this page is measured against it,
   because "42 degrees" only means something once you know what the rubber
   wants. Same numbers as the Track Conditions verdict, deliberately. */
const WINDOW_LO = 35, WINDOW_HI = 45;

export function RaceControlWeather({ session }: { session: RaceSession }) {
  const weatherData = useMemo(() => {
    return session.weather.map((w, i) => ({
      x: w.lap ?? Math.round(((i + 0.5) / Math.max(1, session.weather.length)) * session.total_laps),
      air: w.air_temp, track: w.track_temp, rain: w.rainfall ? 1 : 0,
      // the number that actually drives tyre behaviour: how much hotter the
      // tarmac is than the air above it
      spread: w.track_temp != null && w.air_temp != null ? +(w.track_temp - w.air_temp).toFixed(1) : null,
    }));
  }, [session]);

  const pittedInWindow = (start: number, end: number) =>
    Array.from(new Set(session.pit_stops.filter((p) => p.lap >= start && p.lap <= end).map((p) => p.driver)));

  /* ---- the analysis this page exists for --------------------------------
     Track Conditions answers "what were the conditions?". Repeating it here
     was the redundancy. This section answers the questions it cannot: how far
     did the tarmac move, WHEN, how much of the session was actually inside the
     tyre's working window, and what did that do to the cars. */
  const wx = useMemo(() => {
    const pts = weatherData.filter((d) => d.track != null) as
      { x: number; track: number; air: number | null; spread: number | null; rain: number }[];
    if (!pts.length) return null;
    const hottest = pts.reduce((a, b) => (b.track > a.track ? b : a));
    const coldest = pts.reduce((a, b) => (b.track < a.track ? b : a));
    const inWindow = pts.filter((d) => d.track >= WINDOW_LO && d.track <= WINDOW_HI).length;
    const spreads = pts.map((d) => d.spread).filter((v): v is number => v != null);
    const rainLaps = weatherData.filter((d) => d.rain).map((d) => d.x);
    // thirds of the race, so "when" has an answer a reader can act on
    const third = Math.max(1, Math.ceil(pts.length / 3));
    const phase = (arr: typeof pts) => arr.length
      ? arr.reduce((a, b) => a + b.track, 0) / arr.length : null;
    return {
      hottest, coldest,
      swing: hottest.track - coldest.track,
      windowPct: (inWindow / pts.length) * 100,
      avgSpread: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null,
      rainLaps,
      phases: [
        { label: "Opening third", v: phase(pts.slice(0, third)) },
        { label: "Middle third", v: phase(pts.slice(third, third * 2)) },
        { label: "Closing third", v: phase(pts.slice(third * 2)) },
      ].filter((p) => p.v != null) as { label: string; v: number }[],
    };
  }, [weatherData]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {/* ---------------------------- weather ---------------------------- */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <VisualLabel term="track temp" tone="amber">How the track moved</VisualLabel>
          <span className="text-[12px] text-ink-faint">· and what it did to the tyres</span>
        </div>

        {wx ? (
          <>
            <StatStrip className="mb-3" items={[
              { label: "Swing", value: `${wx.swing.toFixed(1)}°`, tone: "amber",
                sub: `${wx.coldest.track.toFixed(0)}° → ${wx.hottest.track.toFixed(0)}°` },
              { label: "Hottest", value: `${wx.hottest.track.toFixed(0)}°`,
                sub: `lap ${wx.hottest.x}` },
              { label: "In the window", value: `${wx.windowPct.toFixed(0)}%`,
                tone: wx.windowPct > 60 ? "good" : "bad", sub: `of readings, ${WINDOW_LO}–${WINDOW_HI}°` },
              ...(wx.avgSpread != null
                ? [{ label: "Over air", value: `+${wx.avgSpread.toFixed(1)}°`, tone: "sky" as const,
                     sub: "tarmac above ambient" }] : []),
            ]} />

            <div className="h-[230px] w-full">
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
                  {/* the working window, drawn. This is the whole point of the
                      section: you can SEE which laps ran on a tarmac the slicks
                      were designed for, which no summary panel can show. */}
                  {/* explicit x bounds: without them Recharts stops the band at
                      the last data point, which leaves a hard edge mid-chart */}
                  <ReferenceArea x1={1} x2={session.total_laps}
                    y1={WINDOW_LO} y2={WINDOW_HI} fill="#34d399" fillOpacity={0.1}
                    stroke="#34d399" strokeOpacity={0.22} ifOverflow="hidden" />
                  {/* rain, lap by lap */}
                  {weatherData.map((d, i) => (d.rain ? (
                    <ReferenceArea key={`r${i}`} x1={d.x - 0.5} x2={d.x + 0.5}
                      fill="#3aa0ff" fillOpacity={0.16} stroke="none" ifOverflow="hidden" />
                  ) : null))}
                  <ReferenceLine y={WINDOW_HI} stroke="#34d399" strokeOpacity={0.35} strokeDasharray="3 4"
                    label={{ value: `${WINDOW_HI}°`, position: "right", fill: "#8bd9bd", fontSize: 10 }} />
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

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-[#ff6a5a]" />Track
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-[#00e0c6]" />Air
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded-sm bg-emerald-400/20 ring-1 ring-emerald-400/30" />
                <Term term="track temp">Tyre working window</Term>
              </span>
              {wx.rainLaps.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-4 rounded-sm bg-sky-400/25" />
                  Rain — {wx.rainLaps.length} lap{wx.rainLaps.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {/* thirds, so "when" has an answer, and each carries its verdict */}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {wx.phases.map((ph) => {
                const inW = ph.v >= WINDOW_LO && ph.v <= WINDOW_HI;
                return (
                  <div key={ph.label}
                    className="rounded-xl border border-white/[0.07] bg-base-800/50 p-3">
                    <div className="flex items-center gap-1.5">
                      <Thermometer size={12} style={{ color: tempColor(ph.v) }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        {ph.label}
                      </span>
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: tempColor(ph.v) }}>
                      {ph.v.toFixed(1)}°
                    </div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                      {inW ? "Inside the window — predictable wear."
                        : ph.v > WINDOW_HI ? "Above the window — tyres overheating."
                          : "Below the window — slow to switch on."}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
              {wx.rainLaps.length > 0
                ? `Rain fell across ${wx.rainLaps.length} reading${wx.rainLaps.length === 1 ? "" : "s"} — the shaded laps. Wet tarmac cools fast, and the track temperature trace is the quickest way to see when grip came back.`
                : wx.swing < 3
                  ? "The tarmac barely moved all session, so every stint faced the same tyre behaviour — a rare case where strategy could be planned on Friday's numbers and still hold."
                  : wx.hottest.x < wx.coldest.x
                    ? `The track cooled ${wx.swing.toFixed(1)}° from its peak on lap ${wx.hottest.x}. Cooler tarmac means less thermal degradation, so later stints could be pushed harder than the opening ones.`
                    : `The track warmed ${wx.swing.toFixed(1)}° to its peak on lap ${wx.hottest.x}. Hotter tarmac brings degradation forward, which is what pulls a planned one-stop into a two.`}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-ink-muted">No weather readings for this session.</p>
        )}
      </div>

      {/* race control timeline */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <VisualLabel tone="amber">Race control</VisualLabel>
          <span className="text-[12px] text-ink-faint">· the official log, as it was issued</span>
        </div>
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
