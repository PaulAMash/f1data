"use client";
import { CloudRain, CloudSun, Droplets, Navigation, Sun, Thermometer } from "lucide-react";
import type { RaceSession } from "@/lib/types";
import { InsightCard } from "@/components/ui/InsightCard";
import { IconTile, Meter, Sparkline, VisualLabel } from "@/components/ui/Visuals";
import { Term } from "@/components/ui/Term";
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

/**
 * The conditions panel wearing the standard insight-card shell, so weather sits
 * in any card grid — Practice, Qualifying, Sprint or Race — without looking like
 * a visitor. Weather shapes tyre choice, grip, long runs and pit strategy, so it
 * belongs on every session, not just Saturday.
 */
export function ConditionsCard({
  session, fallback,
}: { session: RaceSession; fallback?: string | null }) {
  if (!session.weather.length) {
    return (
      <InsightCard icon={<CloudSun size={14} />} tone="sky" label="Track conditions"
        value={fallback ? capitalize(fallback) : "Not reported"}
        caption="This session's sources didn't publish weather readings." />
    );
  }
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <IconTile tone="sky" size={26}><CloudSun size={14} /></IconTile>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Track conditions
        </span>
      </div>
      <TrackConditions session={session} compact />
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* -------------------------------------------------------------------------- */
/* The feature panel.                                                         */
/*                                                                            */
/* Conditions used to sit wherever each session's card grid had room — fifth   */
/* on Saturday, last on Friday, in a side rail on Sunday. That forced the user  */
/* to re-find the same information on every page. It now has ONE home on every  */
/* session type: the full-width panel directly beneath the story.              */
/*                                                                            */
/* The extra width earns its place. Every reading is on a scale that says what  */
/* the number means for the cars — a track temperature isn't "42°", it's "42°,  */
/* which is inside the tyres' working window" — and the whole session's         */
/* temperature trend is drawn rather than described.                            */
/* -------------------------------------------------------------------------- */

/** Where a track temperature sits relative to a slick tyre's usable range. */
function trackVerdict(c: number): { label: string; detail: string } {
  if (c < 20) return { label: "Cold", detail: "Below the window — tyres struggle to switch on, and warm-up laps matter." };
  if (c < 35) return { label: "Cool", detail: "At the low end of the window — grip builds slowly but degradation stays modest." };
  if (c < 45) return { label: "In the window", detail: "The band slick tyres are designed for — good grip, predictable wear." };
  if (c < 55) return { label: "Hot", detail: "Above the ideal band — tyres overheat sooner and degradation climbs." };
  return { label: "Extreme", detail: "Far above the window — thermal degradation dominates strategy." };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassOf = (deg: number) => COMPASS[Math.round(((deg % 360) / 45)) % 8];

export function TrackConditionsPanel({
  session, fallback,
}: { session: RaceSession; fallback?: string | null }) {
  const r = readConditions(session);
  if (!r) {
    return (
      <section className="panel p-4">
        <div className="flex items-center gap-2">
          <IconTile tone="sky" size={26}><CloudSun size={14} /></IconTile>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            <Term term="track temp">Track conditions</Term>
          </span>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {fallback ? capitalize(fallback) : "This session's sources didn't publish weather readings."}
        </p>
      </section>
    );
  }

  const Sky = r.wet ? CloudRain : (r.humidity ?? 0) > 65 ? CloudSun : Sun;
  const skyTone = r.wet ? "sky" : (r.humidity ?? 0) > 65 ? "neutral" : "amber";
  const verdict = r.track != null ? trackVerdict(r.track) : null;
  // the session's own temperature trend, drawn rather than described
  const trackSeries = session.weather
    .map((w) => w.track_temp).filter((v): v is number => v != null);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <IconTile tone={skyTone as never} size={26}><Sky size={14} /></IconTile>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Track conditions
        </span>
        <span className="ml-auto text-[11px] text-ink-faint">
          {r.wet ? "Rain fell during this session" : "Dry throughout"}
        </span>
      </div>

      <div className="grid gap-x-8 gap-y-5 px-5 pb-5 pt-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* the headline: what the tarmac was doing, and what that means */}
        <div className="min-w-0">
          <div className="text-[22px] font-bold leading-tight tracking-tight text-ink">
            {r.wet ? "Wet at times" : "Dry"}
          </div>
          {verdict && (
            <div className="mt-0.5 text-xs font-semibold" style={{ color: tempColor(r.track!) }}>
              {verdict.label}
            </div>
          )}
          {verdict && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{verdict.detail}</p>
          )}
        </div>

        {/* temperatures, each on the scale that gives it meaning */}
        <div className="min-w-0 space-y-3.5">
          {r.air != null && (
            <Meter label="Air" labelTerm="air temp" tone="sky" color={tempColor(r.air)}
              value={`${r.air.toFixed(0)}°C`} pct={(r.air / 50) * 100}
              scaleMin="0°" scaleMax="50°" />
          )}
          {r.track != null && (
            <Meter label="Track" labelTerm="track temp" tone="amber" color={tempColor(r.track)}
              value={`${r.track.toFixed(0)}°C`} pct={(r.track / 60) * 100}
              scaleMin="0°" scaleMax="60°"
              marker={(35 / 60) * 100 + 0.5}
              markerLabel="35–45°C: the slick tyre's working window" />
          )}
        </div>

        {/* how the tarmac moved through the session */}
        <div className="min-w-0">
          {trackSeries.length >= 3 ? (
            <>
              <VisualLabel term="track temp">Track through the session</VisualLabel>
              <div className="mt-1.5">
                <Sparkline points={trackSeries} tone="amber" lowerIsBetter={false}
                  labels={["Start", "End"]} valueFmt={(v) => `${v.toFixed(0)}°`} width={140} height={34} />
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-ink-faint">
                {trackSeries[trackSeries.length - 1] > trackSeries[0] + 1
                  ? "The tarmac warmed up — tyres ran hotter as the session went on."
                  : trackSeries[trackSeries.length - 1] < trackSeries[0] - 1
                    ? "The tarmac cooled — later runs had less thermal degradation."
                    : "The tarmac held steady, so every run faced the same tyre conditions."}
              </p>
            </>
          ) : r.trackMin != null && r.trackMax != null ? (
            <>
              <VisualLabel term="track temp">Track range</VisualLabel>
              <div className="mt-1 text-lg font-bold tabular-nums text-ink">
                {r.trackMin.toFixed(0)}–{r.trackMax.toFixed(0)}°C
              </div>
              <p className="mt-1 text-[10px] leading-snug text-ink-faint">
                The span the tarmac covered across the session.
              </p>
            </>
          ) : null}
        </div>

        {/* air and wind — the details that shape braking and tyre temperature */}
        <div className="min-w-0 space-y-3.5">
          {r.humidity != null && (
            <Meter label="Humidity" tone="sky" value={`${r.humidity.toFixed(0)}%`}
              pct={r.humidity} scaleMin="Dry air" scaleMax="Saturated"
              hint={r.humidity > 70
                ? "Damp air — less engine power, and a hint that rain may be close."
                : "Dry air, so no meaningful effect on grip."} />
          )}
          {r.wind != null && (
            <div>
              <div className="mb-1 flex items-baseline gap-2">
                <VisualLabel>Wind</VisualLabel>
                <span className="ml-auto text-sm font-bold tabular-nums text-ink-muted">
                  {r.wind.toFixed(1)} km/h
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* the needle only appears when there is a direction to point in
                    — a compass frozen at north is worse than no compass */}
                {r.windDir != null && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03]"
                    title={`From ${Math.round(r.windDir)}°`}>
                    <Navigation size={13} className="text-ink-muted transition-transform"
                      style={{ transform: `rotate(${r.windDir + 180}deg)` }} />
                  </span>
                )}
                <span className="text-[10px] leading-snug text-ink-faint">
                  {r.windDir != null
                    ? `Blowing from the ${compassOf(r.windDir)}. A headwind into a braking zone steadies the car; a tailwind makes it harder to slow.`
                    : r.wind < 5
                      ? "Barely a breeze — no meaningful effect on the cars."
                      : "Strong enough to matter, but the direction wasn't reported."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
