"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Flag, ShieldAlert, Gauge, Sparkles, Users, X, ChevronRight, ArrowUpRight,
} from "lucide-react";
import type { RaceSession, Driver, StrategySummary, Compound, RaceInsight } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtSec, ordinal } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { DriverPalette } from "./DriverPalette";

/* -------------------------------------------------------------------------- */
/* Track Position — the race as a story, the chart as the hero.               */
/*                                                                            */
/* Simple and Advanced are the SAME product at two densities: identical       */
/* layout, colours, type and motion. Simple tells the story (Top 5, plain     */
/* English, minimal controls); Advanced investigates it (all cars, gaps &     */
/* tyre age, a driver command-palette). Team colour carries identity; the     */
/* code at each line's end (and everywhere text appears) makes it never       */
/* colour-alone.                                                              */
/* -------------------------------------------------------------------------- */

// Chart geometry — shared by Recharts AND the HTML annotation band so the
// editorial event markers above the plot line up exactly with the laps below.
const M = { top: 10, right: 58, bottom: 26, left: 8 };
const Y_AXIS_W = 44;
const PLOT_LEFT = M.left + Y_AXIS_W;

type Preset = "podium" | "top5" | "top10" | "all";
const PRESETS: { id: Preset; label: string; keep: number }[] = [
  { id: "podium", label: "Podium", keep: 3 },
  { id: "top5", label: "Top 5", keep: 5 },
  { id: "top10", label: "Top 10", keep: 10 },
  { id: "all", label: "All", keep: 99 },
];

type EventKind = "start" | "sc" | "vsc" | "red";
const EVENT: Record<EventKind, { code: string; label: string; color: string; icon: any }> = {
  start: { code: "START", label: "Race start", color: "#00e0c6", icon: Flag },
  sc:    { code: "SC",    label: "Safety Car",  color: "#ff8c1a", icon: ShieldAlert },
  vsc:   { code: "VSC",   label: "Virtual SC",  color: "#ffb020", icon: Gauge },
  red:   { code: "RED",   label: "Red flag",    color: "#ff4d4d", icon: ShieldAlert },
};
const BAND_FILL: Partial<Record<EventKind, string>> = {
  sc: "rgba(255,140,26,0.10)", vsc: "rgba(255,176,32,0.07)", red: "rgba(255,77,77,0.11)",
};

interface LapInfo {
  position?: number | null; compound: Compound; tyre_age?: number | null;
  gap?: number | null; interval?: number | null; pit_in: boolean; status: string;
}
interface DriverStat {
  grid?: number | null; best?: number | null; finish?: number | null;
  dnf: boolean; overtakes: number; net?: number | null; pits: number; compounds: Compound[];
}
interface RaceEvt { lap: number; kind: EventKind; band?: [number, number]; }
interface Moment { lap: number; label: string; kind: EventKind | "story" | "finish"; }

export function PositionChart({
  session, selected, onSelect, strategy, onDeepDive,
}: {
  session: RaceSession;
  selected: string[];
  onSelect: (codes: string[]) => void;
  strategy?: StrategySummary;
  onDeepDive?: (code: string) => void;
}) {
  const simple = useIsSimple();
  const drivers = session.drivers;

  const [visibleSet, setVisibleSet] = useState<Set<string>>(new Set());
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [activeLap, setActiveLap] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const driverByCode = useMemo(() => {
    const m: Record<string, Driver> = {};
    for (const d of drivers) m[d.code] = d;
    return m;
  }, [drivers]);

  const finishOrder = useMemo(() => {
    const cls = [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const codes = cls.map((c) => c.driver).filter((c) => driverByCode[c]);
    return codes.length ? codes : drivers.map((d) => d.code);
  }, [session.classification, drivers, driverByCode]);

  const podiumSet = useMemo(() => new Set(finishOrder.slice(0, 3)), [finishOrder]);

  const presetSet = (id: Preset) =>
    new Set(finishOrder.slice(0, PRESETS.find((p) => p.id === id)!.keep));

  // Visibility source of truth. Presets replace it; the palette mutates it.
  // Each mode opens on its own density: Simple on the Top 5 (the story),
  // Advanced on the full field (the tool).
  useEffect(() => {
    setVisibleSet(new Set(finishOrder.slice(0, simple ? 5 : 99)));
  }, [simple, finishOrder]);

  const activePreset = useMemo<Preset | null>(() => {
    for (const p of PRESETS) {
      const s = presetSet(p.id);
      if (s.size === visibleSet.size && [...s].every((c) => visibleSet.has(c))) return p.id;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSet, finishOrder]);

  // measure the plot so the annotation band can align to laps
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const lapToX = (lap: number) => {
    const x0 = PLOT_LEFT, x1 = width - M.right;
    if (session.total_laps <= 1 || width === 0) return x0;
    return x0 + ((lap - 1) / (session.total_laps - 1)) * (x1 - x0);
  };

  const { data, info } = useMemo(() => {
    const byLap = new Map<number, Record<string, number>>();
    for (let l = 1; l <= session.total_laps; l++) byLap.set(l, { lap: l });
    for (const p of session.positions) { const r = byLap.get(p.lap); if (r) r[p.driver] = p.position; }
    const info = new Map<string, LapInfo>();
    for (const lp of session.laps) {
      info.set(`${lp.driver}:${lp.lap}`, {
        position: lp.position, compound: lp.compound, tyre_age: lp.tyre_age,
        gap: lp.gap_to_leader, interval: lp.interval, pit_in: lp.pit_in, status: lp.track_status,
      });
    }
    return { data: Array.from(byLap.values()), info };
  }, [session]);

  const stats = useMemo(() => {
    const best: Record<string, number> = {};
    for (const p of session.positions) best[p.driver] = Math.min(best[p.driver] ?? 99, p.position);
    const ot: Record<string, number> = {};
    for (const o of session.overtakes) ot[o.overtaker] = (ot[o.overtaker] ?? 0) + 1;
    const comp: Record<string, Compound[]> = {};
    for (const s of [...session.stints].sort((a, b) => a.start_lap - b.start_lap)) {
      (comp[s.driver] ??= []); if (!comp[s.driver].includes(s.compound)) comp[s.driver].push(s.compound);
    }
    const out: Record<string, DriverStat> = {};
    for (const d of drivers) {
      const cls = session.classification.find((c) => c.driver === d.code);
      const grid = cls?.grid ?? d.grid ?? null;
      const finish = cls?.position ?? null;
      const dnf = !!cls?.retired;
      out[d.code] = {
        grid, best: best[d.code] ?? null, finish, dnf,
        overtakes: ot[d.code] ?? 0, net: grid != null && finish != null && !dnf ? grid - finish : null,
        pits: cls?.pit_stops ?? 0, compounds: comp[d.code] ?? [],
      };
    }
    return out;
  }, [session, drivers]);

  // Race-control events for the annotation band + shaded bands (calm: no pit).
  const events = useMemo<RaceEvt[]>(() => {
    const out: RaceEvt[] = [{ lap: 1, kind: "start" }];
    for (const w of session.track_status_windows) {
      const k: EventKind | null = w.status === "SAFETY_CAR" ? "sc" : w.status === "VSC" ? "vsc"
        : w.status === "RED" ? "red" : null;
      if (k) out.push({ lap: w.start_lap, kind: k, band: [w.start_lap, w.end_lap] });
    }
    return dedupeByLap(out, session.total_laps);
  }, [session.track_status_windows, session.total_laps]);

  // Narrative beats for the interactive story timeline (jump-to-moment).
  const moments = useMemo<Moment[]>(() => {
    const out: Moment[] = [{ lap: 1, kind: "start", label: "Race start" }];
    for (const e of events) if (e.kind !== "start") out.push({ lap: e.lap, kind: e.kind, label: EVENT[e.kind].label });
    const beats: RaceInsight[] = [...(strategy?.turning_points ?? []), ...(strategy?.insights ?? [])];
    for (const b of beats) {
      const lap = b.lap_range?.[0];
      if (lap != null && !out.some((m) => Math.abs(m.lap - lap) < 2)) out.push({ lap, kind: "story", label: b.title });
    }
    out.push({ lap: session.total_laps, kind: "finish", label: "Race finish" });
    return out.sort((a, b) => a.lap - b.lap).slice(0, simple ? 5 : 8);
  }, [events, strategy, session.total_laps, simple]);

  const anyFocus = selected.length > 0;
  function focusOnly(code: string) { onSelect([code]); setActiveLap(null); }

  function emphasis(code: string) {
    const isFocus = selected.includes(code);
    if (hover === code) return { op: 1, w: simple ? 3.4 : 3, rank: 5, label: true, glow: true };
    if (anyFocus) return isFocus
      ? { op: 1, w: 3, rank: 4, label: true, glow: true }
      : { op: 0.12, w: 1.25, rank: 0, label: false, glow: false };
    if (hover) return { op: 0.14, w: 1.25, rank: 0, label: false, glow: false };
    if (podiumSet.has(code)) return { op: 1, w: simple ? 2.6 : 2.2, rank: 3, label: true, glow: false };
    return { op: simple ? 0.36 : 0.5, w: 1.5, rank: 1, label: !simple, glow: false };
  }

  const visible = useMemo(() => {
    const focus = new Set(selected);
    return drivers.filter((d) => visibleSet.has(d.code) || focus.has(d.code));
  }, [drivers, visibleSet, selected]);

  const drawOrder = useMemo(
    () => [...visible].sort((a, b) => emphasis(a.code).rank - emphasis(b.code).rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, selected, hover, podiumSet, simple],
  );

  function toggleVisible(code: string) {
    setVisibleSet((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }
  function toggleFav(code: string) {
    setFavourites((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  // Fit the vertical axis to the field actually on screen — showing 20 rows for
  // a Top-5 view wastes half the frame. The lowest place any drawn driver hits
  // sets the floor, so the lines fill the chart instead of floating up top.
  const yMax = useMemo(() => {
    let mx = 5;
    for (const p of session.positions) {
      if (visibleSet.has(p.driver) || selected.includes(p.driver)) mx = Math.max(mx, p.position);
    }
    return Math.min(drivers.length, Math.max(mx, Math.min(5, drivers.length)));
  }, [session.positions, visibleSet, selected, drivers.length]);

  if (!session.positions.length) {
    return (
      <p className="py-12 text-center text-sm text-ink-faint">
        Position order isn&apos;t tracked in this session — practice and qualifying have no
        lap-by-lap running order to chart.
      </p>
    );
  }

  const focusCode = selected.length === 1 ? selected[0] : null;
  const activeMoment = activeLap != null ? moments.find((m) => m.lap === activeLap) ?? null : null;

  return (
    <div className="space-y-5">
      {/* ── STORY: summary + interactive timeline ─────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-5">
        <SummaryStory simple={simple} strategy={strategy} className="lg:col-span-3" />
        <StoryTimeline moments={moments} activeLap={activeLap}
          onJump={(l) => setActiveLap((cur) => (cur === l ? null : l))} className="lg:col-span-2" />
      </div>

      {activeMoment && (
        <MomentCard moment={activeMoment} info={info} drivers={drivers} visible={visible}
          onClose={() => setActiveLap(null)} />
      )}

      {focusCode && (
        <FocusBar driver={driverByCode[focusCode]} stat={stats[focusCode]} simple={simple}
          onClear={() => onSelect([])} onDeepDive={onDeepDive} />
      )}

      {/* ── CONTROLS — same row both modes, just fewer decisions in Simple ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:inline">Show</span>
          <Segmented
            options={(simple ? PRESETS.filter((p) => p.id !== "podium") : PRESETS).map((p) => ({ id: p.id, label: p.label }))}
            value={activePreset ?? ""} onChange={(v) => setVisibleSet(presetSet(v as Preset))} />
        </div>
        {selected.map((c) => (
          <button key={c} onClick={() => onSelect(selected.filter((x) => x !== c))}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-2 pr-1.5 text-xs font-semibold text-ink">
            <span className="h-2 w-2 rounded-full" style={{ background: driverByCode[c]?.team_color }} />
            {c} <X size={12} className="text-ink-faint" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink">
            <Users size={13} /> Drivers
            <kbd className="hidden rounded bg-white/[0.06] px-1 text-[10px] text-ink-faint sm:inline">{visibleSet.size}</kbd>
          </button>
          {anyFocus && (
            <button onClick={() => onSelect([])} className="chip hover:text-ink"><X size={12} /> Clear focus</button>
          )}
        </div>
      </div>

      {/* ── EVENT ANNOTATION BAND + CHART ─────────────────────────────────── */}
      <div ref={wrapRef} className="relative">
        <EventBand events={events} lapToX={lapToX} ready={width > 0} activeLap={activeLap}
          onJump={(l) => setActiveLap((cur) => (cur === l ? null : l))} />
        <div className={cx("w-full select-none", simple ? "h-[420px]" : "h-[440px]")}>
          <ResponsiveContainer>
            <LineChart data={data} margin={M}>
              <CartesianGrid stroke="rgba(255,255,255,0.035)" strokeDasharray="1 6" vertical={false} />
              {events.filter((e) => e.band).map((e, i) => (
                <ReferenceArea key={`b${i}`} x1={e.band![0]} x2={e.band![1]} y1={1} y2={yMax}
                  fill={BAND_FILL[e.kind]} stroke="none" ifOverflow="hidden" />
              ))}
              {events.map((e, i) => (
                <ReferenceLine key={`e${i}`} x={e.lap} stroke={EVENT[e.kind].color} strokeOpacity={0.22}
                  strokeDasharray="2 5" ifOverflow="extendDomain" />
              ))}
              {activeLap != null && (
                <ReferenceLine x={activeLap} stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1.4}
                  className="moment-line" ifOverflow="extendDomain" />
              )}
              <XAxis
                dataKey="lap" type="number" domain={[1, session.total_laps]} allowDecimals={false}
                tick={{ fill: "#5f6b84", fontSize: simple ? 12 : 11 }} tickLine={false} tickMargin={8}
                axisLine={{ stroke: "rgba(255,255,255,0.07)" }}
                label={{ value: "Lap", position: "insideBottom", offset: -14, fill: "#5f6b84", fontSize: 11 }} />
              <YAxis
                type="number" reversed domain={[1, yMax]} interval={0}
                ticks={Array.from({ length: yMax }, (_, i) => i + 1)}
                tick={{ fill: "#5f6b84", fontSize: simple ? 12 : 11 }} tickLine={false} tickMargin={6}
                width={Y_AXIS_W} axisLine={{ stroke: "rgba(255,255,255,0.07)" }}
                label={{ value: "Position", angle: -90, position: "insideLeft", offset: 4, fill: "#5f6b84", fontSize: 11 }} />
              <Tooltip isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }}
                cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
                wrapperStyle={{ zIndex: 30, outline: "none" }}
                content={(p: any) => (
                  <OrderTooltip active={p.active} label={p.label} info={info} drivers={drivers}
                    visible={visible} focus={focusCode} simple={simple} />
                )} />
              {/* soft halo under emphasised lines — premium, cheap (1–2 extra) */}
              {drawOrder.filter((d) => emphasis(d.code).glow).map((d) => (
                <Line key={`${d.code}-glow`} dataKey={d.code} type="monotone" stroke={d.team_color}
                  strokeWidth={emphasis(d.code).w + 6} strokeOpacity={0.16} dot={false}
                  connectNulls isAnimationActive={false} legendType="none" />
              ))}
              {drawOrder.map((d) => {
                const em = emphasis(d.code);
                return (
                  <Line
                    key={d.code} dataKey={d.code} type="monotone" className="pos-line"
                    stroke={d.team_color} strokeWidth={em.w} strokeOpacity={em.op}
                    dot={false} connectNulls isAnimationActive={false}
                    onClick={() => focusOnly(d.code)} style={{ cursor: "pointer" }}
                    label={(props: any) =>
                      props.index === data.length - 1 && em.label
                        ? <EdgeLabel x={props.x} y={props.y} code={d.code} color={d.team_color}
                            op={em.op} onClick={() => focusOnly(d.code)} />
                        : <g />} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <UnifiedLegend simple={simple} events={events} hasFocus={anyFocus} />

      <DriverPalette
        open={paletteOpen} onClose={() => setPaletteOpen(false)}
        drivers={drivers} finishOrder={finishOrder}
        visible={visibleSet} onToggleVisible={toggleVisible}
        onSetVisible={(codes) => setVisibleSet(new Set(codes))}
        onFocus={focusOnly} favourites={favourites} onToggleFav={toggleFav} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* helpers + sub-components                                                   */
/* -------------------------------------------------------------------------- */

function dedupeByLap(evts: RaceEvt[], total: number): RaceEvt[] {
  const seen = new Set<number>();
  return evts.filter((e) => e.lap >= 1 && e.lap <= total && !seen.has(e.lap) && seen.add(e.lap));
}

function SummaryStory({ simple, strategy, className }: {
  simple: boolean; strategy?: StrategySummary; className?: string;
}) {
  const lines = useMemo(() => {
    if (!strategy) return [];
    const src = (!simple && strategy.story_advanced?.length ? strategy.story_advanced : strategy.story) ?? [];
    return src.filter(Boolean).slice(0, simple ? 2 : 3);
  }, [strategy, simple]);
  if (!lines.length) return <div className={className} />;
  return (
    <div className={cx("rounded-2xl border border-white/[0.06] bg-gradient-to-br from-speed/[0.06] to-transparent p-5", className)}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={14} className="text-speed" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-speed">
          {simple ? "The story" : "Analyst read"}
        </span>
      </div>
      <div className={cx("space-y-1.5 text-ink", simple ? "text-[17px] font-medium leading-snug" : "text-sm leading-relaxed text-ink-muted")}>
        {lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}

function StoryTimeline({ moments, activeLap, onJump, className }: {
  moments: Moment[]; activeLap: number | null; onJump: (lap: number) => void; className?: string;
}) {
  if (moments.length < 2) return <div className={className} />;
  return (
    <div className={cx("rounded-2xl border border-white/[0.06] bg-base-900/40 p-4", className)}>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Key moments</div>
      <ol className="relative space-y-1 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-white/[0.08]">
        {moments.map((m) => {
          const on = activeLap === m.lap;
          const color = m.kind in EVENT ? EVENT[m.kind as EventKind].color : "#8892a6";
          return (
            <li key={`${m.lap}-${m.label}`}>
              <button onClick={() => onJump(m.lap)}
                className={cx("group relative flex w-full items-center gap-2.5 rounded-lg py-1 pl-0 pr-1 text-left transition-colors",
                  on ? "bg-white/[0.05]" : "hover:bg-white/[0.03]")}>
                <span className="relative z-10 grid h-[11px] w-[11px] place-items-center rounded-full ring-2 ring-base-900"
                  style={{ background: color }} />
                <span className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-ink-faint">Lap {m.lap}</span>
                <span className={cx("min-w-0 flex-1 truncate text-xs", on ? "text-ink" : "text-ink-muted group-hover:text-ink")}>{m.label}</span>
                <ChevronRight size={13} className={cx("shrink-0 transition-opacity", on ? "text-ink opacity-100" : "text-ink-faint opacity-0 group-hover:opacity-100")} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MomentCard({ moment, info, drivers, visible, onClose }: {
  moment: Moment; info: Map<string, LapInfo>; drivers: Driver[]; visible: Driver[]; onClose: () => void;
}) {
  const rows = visible
    .map((d) => ({ d, i: info.get(`${d.code}:${moment.lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99))
    .slice(0, 5);
  const color = moment.kind in EVENT ? EVENT[moment.kind as EventKind].color : "#8892a6";
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/[0.08] bg-base-900/60 p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
          <span className="text-xs font-bold" style={{ color }}>L{moment.lap}</span>
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">The moment</div>
          <div className="text-sm font-semibold text-ink">{moment.label}</div>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {rows.map(({ d, i }) => (
            <span key={d.code} className="inline-flex items-center gap-1.5 text-xs">
              <span className="tabular-nums text-ink-faint">P{i!.position}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: d.team_color }} />
              <span className="font-semibold text-ink">{d.code}</span>
            </span>
          ))}
        </div>
      )}
      <button onClick={onClose} aria-label="Dismiss moment" className="ml-auto rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>
    </div>
  );
}

function FocusBar({ driver, stat, simple, onClear, onDeepDive }: {
  driver?: Driver; stat?: DriverStat; simple: boolean; onClear: () => void; onDeepDive?: (code: string) => void;
}) {
  if (!driver || !stat) return null;
  const net = stat.net;
  const tiles: { label: string; value: string; tone?: "good" | "bad" }[] = [
    { label: "Started", value: stat.grid != null ? `P${stat.grid}` : "—" },
    { label: "Highest", value: stat.best != null ? `P${stat.best}` : "—" },
    { label: "Finished", value: stat.dnf ? "DNF" : stat.finish != null ? `P${stat.finish}` : "—", tone: stat.dnf ? "bad" : undefined },
    { label: "Gain / loss", value: net == null ? "—" : net > 0 ? `+${net}` : net < 0 ? `${net}` : "0",
      tone: net == null || net === 0 ? undefined : net > 0 ? "good" : "bad" },
    { label: "Overtakes", value: String(stat.overtakes) },
  ];
  if (!simple) tiles.push({ label: "Pit stops", value: String(stat.pits) });
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-4 animate-fade-in">
      <button onClick={() => onDeepDive?.(driver.code)} disabled={!onDeepDive}
        className="group flex items-center gap-3 text-left disabled:cursor-default">
        <DriverAvatar driver={driver} size={simple ? 52 : 46} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Focused driver</div>
          <div className={cx("flex items-center gap-1.5 font-bold leading-tight", simple ? "text-xl" : "text-lg")}>
            <span className="truncate">{driver.name}</span>
            {onDeepDive && <ArrowUpRight size={15} className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: driver.team_color }} /> {driver.team}
          </div>
        </div>
      </button>
      <div className="flex flex-1 flex-wrap items-stretch gap-2">
        {tiles.map((t) => <StatTile key={t.label} {...t} big={simple} />)}
      </div>
      <button onClick={onClear} aria-label="Clear focus" className="ml-auto self-start rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>
      {!simple && stat.compounds.length > 0 && (
        <div className="flex w-full items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</span>
          {stat.compounds.map((c, i) => (
            <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: COMPOUND_COLOR[c], color: "#0b0e16" }}>
              {COMPOUND_LABEL[c]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, big }: { label: string; value: string; tone?: "good" | "bad"; big?: boolean }) {
  const color = tone === "good" ? "text-speed" : tone === "bad" ? "text-accent-soft" : "text-ink";
  return (
    <div className="flex-1 min-w-[72px] rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx("mt-0.5 font-bold tabular-nums", big ? "text-xl" : "text-lg", color)}>{value}</div>
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { id: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-white/10 bg-base-900/60 p-0.5">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={cx("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.id ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30" : "text-ink-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Editorial event markers, in their own band ABOVE the plot, aligned to laps.
function EventBand({ events, lapToX, ready, activeLap, onJump }: {
  events: RaceEvt[]; lapToX: (lap: number) => number; ready: boolean; activeLap: number | null; onJump: (lap: number) => void;
}) {
  return (
    <div className={cx("relative mb-1 h-11 transition-opacity", ready ? "opacity-100" : "opacity-0")}>
      {events.map((e, i) => {
        const meta = EVENT[e.kind];
        const Icon = meta.icon;
        const on = activeLap === e.lap;
        return (
          <button key={i} onClick={() => onJump(e.lap)} title={`${meta.label} · Lap ${e.lap}`}
            className="group absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: Math.max(28, Math.min(lapToX(e.lap), 100000)) }}>
            <span className={cx("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
              on ? "bg-white/10" : "bg-base-900/80 group-hover:bg-white/[0.06]")}
              style={{ borderColor: `${meta.color}66`, color: meta.color }}>
              <Icon size={11} /> {meta.code}
            </span>
            <span className="mt-0.5 text-[10px] tabular-nums text-ink-faint">L{e.lap}</span>
            <span className="mt-0.5 h-1.5 w-px" style={{ background: `${meta.color}66` }} />
          </button>
        );
      })}
    </div>
  );
}

function EdgeLabel({ x, y, code, color, op, onClick }: {
  x: number; y: number; code: string; color: string; op: number; onClick: () => void;
}) {
  return (
    <g className="pos-edge" opacity={Math.max(op, 0.35)} style={{ cursor: "pointer" }} onClick={onClick}>
      <rect x={x + 3} y={y - 8} width={40} height={16} rx={4} fill="transparent" />
      <circle cx={x + 9} cy={y} r={3} fill={color} />
      <text x={x + 16} y={y} dy={3.5} fontSize={11} fontWeight={800} fill={color}>{code}</text>
    </g>
  );
}

function UnifiedLegend({ simple, events, hasFocus }: { simple: boolean; events: RaceEvt[]; hasFocus: boolean }) {
  const kinds = Array.from(new Set(events.map((e) => e.kind)));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.05] bg-base-900/30 px-4 py-2.5 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-6 rounded" style={{ background: "#8892a6" }} /> Driver · team colour, code at the right
      </span>
      {kinds.map((k) => {
        const meta = EVENT[k]; const Icon = meta.icon;
        return (
          <span key={k} className="inline-flex items-center gap-1.5">
            <Icon size={12} style={{ color: meta.color }} /> {meta.label}
          </span>
        );
      })}
      {events.some((e) => e.band) && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-amber/20" /> Neutralised (shaded)
        </span>
      )}
      <span className="ml-auto hidden text-ink-faint sm:inline">
        {hasFocus
          ? "Hover the chart for the running order at any lap."
          : simple ? "Click any line to follow that driver." : "Click a line to focus · hover for gaps & tyres · ⌘ Drivers to filter."}
      </span>
    </div>
  );
}

/* Hover: the running order at a lap. Never truncated — every visible driver is
   listed; the focused driver is pinned on top with a plain-English read. */
function OrderTooltip({ active, label, info, drivers, visible, focus, simple }: {
  active?: boolean; label?: any; info: Map<string, LapInfo>; drivers: Driver[];
  visible: Driver[]; focus: string | null; simple: boolean;
}) {
  if (!active || label == null) return null;
  const lap = Number(label);
  const rows = visible
    .map((d) => ({ d, i: info.get(`${d.code}:${lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99));
  if (!rows.length) return null;
  const focusRead = focus ? plainRead(focus, lap, info) : null;
  return (
    <div className="w-[min(21rem,88vw)] overflow-hidden rounded-xl border border-white/10 bg-base-900/97 text-xs shadow-glow backdrop-blur-md">
      <div className="flex items-baseline justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="font-semibold text-ink">Lap {lap}</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Running order · {rows.length}</span>
      </div>
      {focus && focusRead && (
        <div className="border-b border-white/[0.06] bg-speed/[0.06] px-3 py-1.5 text-[11px] leading-snug text-ink">{focusRead}</div>
      )}
      {/* every driver shown — the whole field fits without scrolling; the
          cap is only a safety net for an unusually deep grid */}
      <div className="max-h-[62vh] overflow-y-auto p-2 text-[11px]">
        {rows.map(({ d, i }) => {
          const isFocus = d.code === focus;
          return (
            <div key={d.code} className={cx("flex items-center gap-2 rounded px-1 py-[1.5px] leading-tight", isFocus && "bg-white/[0.06]")}>
              <span className="w-6 text-right tabular-nums text-ink-faint">P{i!.position}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: d.team_color }} />
              <span className={cx("w-9 font-semibold", isFocus ? "text-ink" : "text-ink-muted")}>{d.code}</span>
              <span className="rounded px-1 text-[10px] font-bold" style={{ background: COMPOUND_COLOR[i!.compound], color: "#0b0e16" }}>
                {COMPOUND_SHORT[i!.compound]}{!simple && i!.tyre_age != null ? i!.tyre_age : ""}
              </span>
              {!simple && (
                <span className="ml-auto tabular-nums text-ink-muted">
                  {i!.position === 1 ? "leader" : i!.interval != null ? `+${fmtSec(i!.interval)}` : fmtSec(i!.gap)}
                </span>
              )}
              {i!.pit_in && <span className={cx("font-semibold text-[#a78bfa]", simple && "ml-auto")}>PIT</span>}
              {i!.status !== "GREEN" && <span className="text-amber">{i!.status}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function plainRead(code: string, lap: number, info: Map<string, LapInfo>): string | null {
  const now = info.get(`${code}:${lap}`);
  if (!now || now.position == null) return null;
  if (now.pit_in) return `Pitting from ${ordinal(now.position)} — onto fresh rubber.`;
  let prev: number | null = null;
  for (let l = lap - 1; l >= Math.max(1, lap - 3); l--) {
    const p = info.get(`${code}:${l}`);
    if (p?.position != null) { prev = p.position; break; }
  }
  const bits = [`Running ${ordinal(now.position)}`];
  if (prev != null) {
    const delta = prev - now.position;
    if (delta > 0) bits.push(`gained ${delta} place${delta > 1 ? "s" : ""}`);
    else if (delta < 0) bits.push(`lost ${-delta} place${-delta > 1 ? "s" : ""}`);
    else bits.push("holding position");
  }
  bits.push(`on ${COMPOUND_LABEL[now.compound]}s`);
  return bits.join(" · ") + " over the last few laps.";
}
