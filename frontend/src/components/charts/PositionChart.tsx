"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Flag, ShieldAlert, Gauge, Wrench, Sparkles, Users, X, ChevronDown,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import type { RaceSession, Driver, StrategySummary, Compound } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtSec, ordinal } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";

/* -------------------------------------------------------------------------- */
/* One chart, two experiences.                                                */
/*                                                                            */
/* Simple and Advanced share ONE visual identity — same lines, same team      */
/* colours, same event markers, same focus card, same right-edge running      */
/* order. They differ only in *density*: Simple tells the story (fewer cars,  */
/* bigger type, minimal controls, plain-English hover); Advanced is the       */
/* analyst tool (all cars, per-driver control, full running order on hover).  */
/*                                                                            */
/* Colour follows the team, never rank. Two team-mates share a colour and are */
/* told apart by the direct code label at the right edge — identity is never  */
/* colour-alone.                                                              */
/* -------------------------------------------------------------------------- */

type Preset = "podium" | "top5" | "top10" | "all";
const PRESETS: { id: Preset; label: string; keep: number }[] = [
  { id: "podium", label: "Podium", keep: 3 },
  { id: "top5", label: "Top 5", keep: 5 },
  { id: "top10", label: "Top 10", keep: 10 },
  { id: "all", label: "All drivers", keep: 99 },
];

type EventKind = "start" | "sc" | "vsc" | "red" | "yellow" | "pit";
interface RaceEvent {
  lap: number; kind: EventKind; code: string; label: string; color: string;
  band?: [number, number];   // shaded window (start,end) for neutralizations
  row: number;               // 0/1 vertical stagger so close labels never collide
}
const EVENT_META: Record<EventKind, { code: string; label: string; color: string; icon: any }> = {
  start:  { code: "START", label: "Lights out",   color: "#00e0c6", icon: Flag },
  sc:     { code: "SC",    label: "Safety car",    color: "#ff8c1a", icon: ShieldAlert },
  vsc:    { code: "VSC",   label: "Virtual SC",    color: "#ffb020", icon: Gauge },
  red:    { code: "RED",   label: "Red flag",      color: "#ff4d4d", icon: ShieldAlert },
  yellow: { code: "YEL",   label: "Yellow flag",   color: "#ffd24a", icon: ShieldAlert },
  pit:    { code: "PIT",   label: "Pit window",    color: "#a78bfa", icon: Wrench },
};
const BAND_FILL: Partial<Record<EventKind, string>> = {
  sc: "rgba(255,140,26,0.11)", vsc: "rgba(255,176,32,0.08)",
  red: "rgba(255,77,77,0.12)", yellow: "rgba(255,210,74,0.06)",
};

interface LapInfo {
  position?: number | null; compound: Compound; tyre_age?: number | null;
  gap?: number | null; interval?: number | null;
  pit_in: boolean; pit_out: boolean; status: string;
}
interface DriverStat {
  grid?: number | null; best?: number | null; finish?: number | null;
  dnf: boolean; overtakes: number; net?: number | null;
  pits: number; compounds: Compound[];
}

export function PositionChart({
  session, selected, onSelect, strategy,
}: {
  session: RaceSession;
  selected: string[];
  onSelect: (codes: string[]) => void;
  strategy?: StrategySummary;
}) {
  const simple = useIsSimple();
  const drivers = session.drivers;

  const [preset, setPreset] = useState<Preset>("top10");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [showDrivers, setShowDrivers] = useState(false);

  // Each mode has its own sensible default density: Simple opens on the Top 10
  // (the story), Advanced opens on the full field (the tool). Switching modes
  // resets to that default; the user can still override within a mode.
  useEffect(() => { setPreset(simple ? "top10" : "all"); }, [simple]);

  const driverByCode = useMemo(() => {
    const m: Record<string, Driver> = {};
    for (const d of drivers) m[d.code] = d;
    return m;
  }, [drivers]);

  // Finishing order drives the leaderboard, the presets and the focus picker.
  const finishOrder = useMemo(() => {
    const cls = [...session.classification].sort(
      (a, b) => (a.position ?? 99) - (b.position ?? 99));
    if (cls.length) return cls.map((c) => c.driver).filter((c) => driverByCode[c]);
    return drivers.map((d) => d.code);
  }, [session.classification, drivers, driverByCode]);

  const podiumSet = useMemo(() => new Set(finishOrder.slice(0, 3)), [finishOrder]);

  // Wide-format rows for the chart + a per-(driver,lap) lookup for the tooltip.
  const { data, info } = useMemo(() => {
    const byLap = new Map<number, Record<string, number>>();
    for (let l = 1; l <= session.total_laps; l++) byLap.set(l, { lap: l });
    for (const p of session.positions) {
      const row = byLap.get(p.lap);
      if (row) row[p.driver] = p.position;
    }
    const info = new Map<string, LapInfo>();
    for (const lp of session.laps) {
      info.set(`${lp.driver}:${lp.lap}`, {
        position: lp.position, compound: lp.compound, tyre_age: lp.tyre_age,
        gap: lp.gap_to_leader, interval: lp.interval,
        pit_in: lp.pit_in, pit_out: lp.pit_out, status: lp.track_status,
      });
    }
    return { data: Array.from(byLap.values()), info };
  }, [session]);

  // Per-driver stats for the focus card — every value read straight from the
  // session, never invented.
  const stats = useMemo(() => {
    const best: Record<string, number> = {};
    for (const p of session.positions) {
      best[p.driver] = Math.min(best[p.driver] ?? 99, p.position);
    }
    const overtakes: Record<string, number> = {};
    for (const o of session.overtakes) overtakes[o.overtaker] = (overtakes[o.overtaker] ?? 0) + 1;
    const compounds: Record<string, Compound[]> = {};
    for (const s of [...session.stints].sort((a, b) => a.start_lap - b.start_lap)) {
      (compounds[s.driver] ??= []);
      if (!compounds[s.driver].includes(s.compound)) compounds[s.driver].push(s.compound);
    }
    const out: Record<string, DriverStat> = {};
    for (const d of drivers) {
      const cls = session.classification.find((c) => c.driver === d.code);
      const grid = cls?.grid ?? d.grid ?? null;
      const finish = cls?.position ?? null;
      const dnf = !!cls?.retired;
      const net = grid != null && finish != null && !dnf ? grid - finish : null;
      out[d.code] = {
        grid, best: best[d.code] ?? null, finish, dnf,
        overtakes: overtakes[d.code] ?? 0, net,
        pits: cls?.pit_stops ?? 0, compounds: compounds[d.code] ?? [],
      };
    }
    return out;
  }, [session, drivers]);

  // The busiest green-flag pit lap — a real strategic beat, not every stop.
  const pitWindowLap = useMemo(() => {
    if (session.pit_data_reliable === false) return null;
    const laps = session.pit_stops
      .filter((p) => !p.under_safety_car && !p.under_vsc)
      .map((p) => p.lap).sort((a, b) => a - b);
    if (laps.length < 4) return null;
    let best = { lap: 0, count: 0 };
    for (const l of laps) {
      const c = laps.filter((x) => x >= l && x <= l + 2).length;
      if (c > best.count) best = { lap: l + 1, count: c };
    }
    return best.count >= 4 ? Math.min(best.lap, session.total_laps) : null;
  }, [session]);

  // Build the event set. Simple keeps the headline beats; Advanced adds yellows.
  const events = useMemo<RaceEvent[]>(() => {
    const mk = (kind: EventKind, lap: number, band?: [number, number]): Omit<RaceEvent, "row"> => ({
      kind, lap, band, code: EVENT_META[kind].code, label: EVENT_META[kind].label, color: EVENT_META[kind].color,
    });
    const raw: Omit<RaceEvent, "row">[] = [mk("start", 1)];
    for (const w of session.track_status_windows) {
      const k: EventKind | null = w.status === "SAFETY_CAR" ? "sc" : w.status === "VSC" ? "vsc"
        : w.status === "RED" ? "red" : w.status === "YELLOW" ? "yellow" : null;
      if (!k) continue;
      if (simple && k === "yellow") continue;   // yellows are noise for casual fans
      raw.push(mk(k, w.start_lap, [w.start_lap, w.end_lap]));
    }
    if (pitWindowLap) raw.push(mk("pit", pitWindowLap));
    raw.sort((a, b) => a.lap - b.lap);
    // Stagger labels that fall within a few laps of each other.
    const span = Math.max(session.total_laps, 1);
    let lastLap = -99, lastRow = 1;
    return raw.map((e) => {
      const near = e.lap - lastLap < span * 0.07;
      const row = near ? 1 - lastRow : 0;
      lastLap = e.lap; lastRow = row;
      return { ...e, row };
    });
  }, [session.track_status_windows, session.total_laps, pitWindowLap, simple]);

  // Which drivers are drawn. Focused drivers are always kept visible.
  const visible = useMemo(() => {
    const focus = new Set(selected);
    const keepN = PRESETS.find((p) => p.id === preset)!.keep;
    const codes = new Set(finishOrder.slice(0, keepN));
    for (const c of selected) codes.add(c);
    let list = drivers.filter((d) => codes.has(d.code));
    if (!simple) list = list.filter((d) => !hidden.has(d.code) || focus.has(d.code));
    return list;
  }, [drivers, finishOrder, preset, selected, hidden, simple]);

  const anyFocus = selected.length > 0;

  function emphasis(code: string): { op: number; w: number; rank: number; label: boolean } {
    const isFocus = selected.includes(code);
    if (hover === code) return { op: 1, w: simple ? 3.6 : 3.2, rank: 5, label: true };
    if (anyFocus) return isFocus
      ? { op: 1, w: 3, rank: 4, label: true }
      : { op: 0.1, w: 1.2, rank: 0, label: false };
    if (hover) return { op: 0.16, w: 1.2, rank: 0, label: false };
    if (podiumSet.has(code)) return { op: 1, w: simple ? 2.6 : 2.2, rank: 3, label: true };
    return { op: simple ? 0.4 : 0.55, w: 1.5, rank: 1, label: !simple };
  }

  // Draw least-emphasised first so highlighted lines sit on top.
  const drawOrder = useMemo(
    () => [...visible].sort((a, b) => emphasis(a.code).rank - emphasis(b.code).rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, selected, hover, podiumSet, simple],
  );

  function toggleHidden(code: string) {
    setHidden((h) => { const n = new Set(h); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }
  function toggleFocus(code: string) {
    onSelect(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  // Practice / qualifying carry no running order — say so plainly.
  if (!session.positions.length) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        Position order isn&apos;t tracked in this session — practice and qualifying have no
        lap-by-lap running order to chart.
      </p>
    );
  }

  const focusCode = selected.length === 1 ? selected[0] : null;
  const yMax = drivers.length;

  return (
    <div className="space-y-4">
      <StoryCard simple={simple} strategy={strategy} />

      {/* CONTROLS — Simple keeps it to the essentials; Advanced reveals the tool. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FocusPicker
          finishOrder={finishOrder} driverByCode={driverByCode} stats={stats}
          value={focusCode} onPick={(c) => onSelect(c ? [c] : [])} />
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:inline">Show</span>
          <Segmented
            options={(simple ? PRESETS.filter((p) => p.id !== "top5") : PRESETS)
              .map((p) => ({ id: p.id, label: p.label }))}
            value={preset} onChange={(v) => setPreset(v as Preset)} />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {!simple && (
            <button onClick={() => setShowDrivers((s) => !s)}
              aria-pressed={showDrivers}
              className={cx("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                showDrivers ? "border-accent/40 bg-accent/10 text-accent-soft" : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink")}>
              <Users size={13} /> Drivers
              <ChevronDown size={12} className={cx("transition-transform", showDrivers && "rotate-180")} />
            </button>
          )}
          {anyFocus && (
            <button onClick={() => onSelect([])} className="chip hover:text-ink">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Advanced-only per-driver control panel, revealed on demand so it never
          clutters the default view. Click = show/hide · double-click = highlight. */}
      {!simple && showDrivers && (
        <div className="rounded-xl border border-white/[0.06] bg-base-900/40 p-2.5">
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Click to show / hide · double-click to highlight &amp; compare
            </span>
            {hidden.size > 0 && (
              <button onClick={() => setHidden(new Set())} className="text-[11px] text-ink-muted hover:text-ink">
                Show all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {finishOrder.map((code) => {
              const d = driverByCode[code]; if (!d) return null;
              const off = hidden.has(code); const sel = selected.includes(code);
              return (
                <button key={code}
                  onClick={() => toggleHidden(code)}
                  onDoubleClick={() => toggleFocus(code)}
                  onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)}
                  aria-pressed={!off}
                  className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-all",
                    off ? "border-white/5 text-ink-faint opacity-50" : "border-white/10 bg-white/[0.03] text-ink",
                    sel && "ring-1 ring-accent/60")}>
                  <span className="h-2 w-2 rounded-full" style={{ background: d.team_color }} />
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {focusCode && (
        <FocusCard driver={driverByCode[focusCode]} stat={stats[focusCode]} simple={simple}
          onClear={() => onSelect([])} />
      )}
      {selected.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-base-900/40 px-3 py-2 text-xs text-ink-muted">
          <span className="font-semibold text-ink">Comparing {selected.length} drivers:</span>
          {selected.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <span className="h-2 w-2 rounded-full" style={{ background: driverByCode[c]?.team_color }} />
              {c}
            </span>
          ))}
        </div>
      )}

      {/* EVENT STRIP — the same beats both modes; a quick-read legend that pairs
          with the vertical markers on the chart. */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {events.map((e, i) => {
            const Icon = EVENT_META[e.kind].icon;
            return (
              <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <Icon size={13} style={{ color: e.color }} />
                <span className="font-semibold text-ink">{e.label}</span>
                <span className="text-ink-faint">· Lap {e.lap}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* THE CHART */}
      <div className={cx("w-full select-none", simple ? "h-[440px]" : "h-[460px]")}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 24, right: 52, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="2 5" vertical={false} />
            {/* neutralization bands */}
            {events.filter((e) => e.band).map((e, i) => (
              <ReferenceArea key={`b${i}`} x1={e.band![0]} x2={e.band![1]}
                fill={BAND_FILL[e.kind] ?? "rgba(255,255,255,0.05)"} stroke="none" />
            ))}
            {/* event markers */}
            {events.map((e, i) => (
              <ReferenceLine key={`e${i}`} x={e.lap} stroke={e.color} strokeOpacity={0.5}
                strokeDasharray="3 4"
                label={(props: any) => <EventLabel viewBox={props.viewBox} event={e} />} />
            ))}
            <XAxis
              dataKey="lap" type="number" domain={[1, session.total_laps]}
              tick={{ fill: "#5f6b84", fontSize: simple ? 12 : 11 }} tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              label={{ value: "Lap number", position: "insideBottom", offset: -12,
                fill: "#5f6b84", fontSize: simple ? 12 : 11 }} />
            <YAxis
              type="number" reversed domain={[1, yMax]} interval={0}
              ticks={Array.from({ length: yMax }, (_, i) => i + 1)}
              tick={{ fill: "#5f6b84", fontSize: simple ? 12 : 11 }} tickLine={false}
              tickMargin={6} width={44} axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              label={{ value: "Track position", angle: -90, position: "insideLeft",
                offset: 4, fill: "#5f6b84", fontSize: simple ? 12 : 11 }} />
            <Tooltip
              isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 40, outline: "none" }}
              content={(p: any) => (
                <PosTooltip active={p.active} label={p.label} info={info} drivers={drivers}
                  visible={visible} focus={focusCode} simple={simple} stat={focusCode ? stats[focusCode] : undefined} />
              )} />
            {drawOrder.map((d) => {
              const em = emphasis(d.code);
              return (
                <Line
                  key={d.code} dataKey={d.code} type="monotone"
                  stroke={d.team_color} strokeWidth={em.w} strokeOpacity={em.op}
                  dot={false} connectNulls isAnimationActive={false}
                  label={(props: any) =>
                    props.index === data.length - 1 && em.label
                      ? <EdgeLabel x={props.x} y={props.y} code={d.code} color={d.team_color} op={em.op} />
                      : <g />} />
              );
            })}
            {/* pit stops on the focused line only — clean, legible */}
            {focusCode && session.pit_stops.filter((p) => p.driver === focusCode).map((p, i) => {
              const pos = info.get(`${focusCode}:${p.lap}`)?.position;
              if (pos == null) return null;
              return <ReferenceDot key={`p${i}`} x={p.lap} y={pos} r={4}
                fill="#0b0e16" stroke={driverByCode[focusCode]?.team_color} strokeWidth={2} />;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend simple={simple} hasFocus={!!focusCode} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StoryCard({ simple, strategy }: { simple: boolean; strategy?: StrategySummary }) {
  const lines = useMemo(() => {
    if (!strategy) return [];
    const src = (!simple && strategy.story_advanced?.length ? strategy.story_advanced : strategy.story) ?? [];
    return src.filter(Boolean).slice(0, simple ? 2 : 3);
  }, [strategy, simple]);
  if (!lines.length) return null;
  return (
    <div className="rounded-xl border border-speed/15 bg-speed/[0.04] p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Sparkles size={14} className="text-speed" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-speed">
          {simple ? "The story" : "Analyst read"}
        </span>
      </div>
      <div className={cx("space-y-1 text-ink", simple ? "text-[15px] leading-relaxed" : "text-sm leading-relaxed text-ink-muted")}>
        {lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}

function FocusPicker({
  finishOrder, driverByCode, stats, value, onPick,
}: {
  finishOrder: string[]; driverByCode: Record<string, Driver>;
  stats: Record<string, DriverStat>; value: string | null; onPick: (code: string | null) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="pointer-events-none absolute left-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Focus
      </span>
      <select
        aria-label="Focus a driver"
        value={value ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
        className="appearance-none rounded-lg border border-white/10 bg-base-800 py-2 pl-[4.2rem] pr-8 text-sm font-semibold text-ink transition-colors hover:border-white/20 focus-visible:border-accent/50">
        <option value="">a driver…</option>
        {finishOrder.map((code, i) => {
          const d = driverByCode[code]; if (!d) return null;
          const s = stats[code];
          const place = s?.dnf ? "DNF" : s?.finish != null ? `P${s.finish}` : `#${i + 1}`;
          return <option key={code} value={code}>{place} · {d.name}</option>;
        })}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-ink-faint" />
    </label>
  );
}

function Segmented({
  options, value, onChange,
}: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
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

function FocusCard({
  driver, stat, simple, onClear,
}: { driver?: Driver; stat?: DriverStat; simple: boolean; onClear: () => void }) {
  if (!driver || !stat) return null;
  const net = stat.net;
  const tiles: { label: string; value: string; tone?: "good" | "bad" }[] = [
    { label: "Started", value: stat.grid != null ? `P${stat.grid}` : "—" },
    { label: "Highest", value: stat.best != null ? `P${stat.best}` : "—" },
    { label: "Finished", value: stat.dnf ? "DNF" : stat.finish != null ? `P${stat.finish}` : "—",
      tone: stat.dnf ? "bad" : undefined },
    { label: "Overtakes", value: String(stat.overtakes) },
    { label: "Net", value: net == null ? "—" : net > 0 ? `+${net}` : net < 0 ? `${net}` : "0",
      tone: net == null || net === 0 ? undefined : net > 0 ? "good" : "bad" },
  ];
  if (!simple) {
    tiles.push({ label: "Pit stops", value: String(stat.pits) });
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.08] bg-base-900/50 p-4">
      <div className="flex items-center gap-3">
        <DriverAvatar driver={driver} size={simple ? 52 : 46} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Selected driver</div>
          <div className={cx("truncate font-bold leading-tight", simple ? "text-xl" : "text-lg")}>{driver.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: driver.team_color }} />
            {driver.team}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-stretch gap-2">
        {tiles.map((t) => <StatTile key={t.label} {...t} big={simple} />)}
      </div>
      <button onClick={onClear} aria-label="Clear focus"
        className="ml-auto self-start rounded-md p-1 text-ink-faint hover:text-ink">
        <X size={16} />
      </button>
      {!simple && stat.compounds.length > 0 && (
        <div className="flex w-full items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</span>
          {stat.compounds.map((c, i) => (
            <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: COMPOUND_COLOR[c], color: "#0b0e16" }}>
              {COMPOUND_LABEL[c]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, big }: {
  label: string; value: string; tone?: "good" | "bad"; big?: boolean;
}) {
  const color = tone === "good" ? "text-speed" : tone === "bad" ? "text-accent-soft" : "text-ink";
  return (
    <div className="flex-1 min-w-[68px] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx("mt-0.5 font-bold tabular-nums", big ? "text-xl" : "text-lg", color)}>{value}</div>
    </div>
  );
}

// Vertical event marker label — a small chip on the axis, auto-aligned to the
// line's x pixel. Staggered rows keep close events from colliding.
function EventLabel({ viewBox, event }: { viewBox?: any; event: RaceEvent }) {
  if (!viewBox) return <g />;
  const { x, y } = viewBox;               // y is the top of the plot area
  const w = event.code.length * 7 + 12;
  const top = (y ?? 0) + (event.row === 1 ? 15 : -1);
  // keep the chip fully on-canvas at the left edge (lap 1 sits on the axis)
  const left = Math.max(x - w / 2, 2);
  return (
    <g transform={`translate(${left}, ${top - 16})`}>
      <rect width={w} height={15} rx={4} fill="#0b0e16" stroke={event.color} strokeOpacity={0.8} />
      <text x={w / 2} y={11} textAnchor="middle" fontSize={9} fontWeight={700} fill={event.color}>
        {event.code}
      </text>
    </g>
  );
}

// Right-edge running-order label: team-colour dot + driver code at each line's
// final position. Positions are distinct integers at the last lap, so these
// never collide — the chart edge becomes a live leaderboard.
function EdgeLabel({ x, y, code, color, op }: {
  x: number; y: number; code: string; color: string; op: number;
}) {
  return (
    <g opacity={Math.max(op, 0.35)}>
      <circle cx={x + 8} cy={y} r={3} fill={color} />
      <text x={x + 15} y={y} dy={3.5} fontSize={10.5} fontWeight={700} fill={color}>{code}</text>
    </g>
  );
}

function ChartLegend({ simple, hasFocus }: { simple: boolean; hasFocus: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.05] pt-3 text-[11px] text-ink-faint">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-5 rounded bg-ink-muted" /> Each line is a driver (team colour · code at the right)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-amber/20" /> Safety-car / VSC window
      </span>
      {hasFocus && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-muted bg-base-900" /> Pit stop
        </span>
      )}
      <span className="ml-auto hidden sm:inline">
        {simple ? "Hover any lap to see the running order." : "Hover for full running order, gaps & tyres. Open Drivers to compare."}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hover tooltip — running order, plus a plain-English read of the focus.     */
/* -------------------------------------------------------------------------- */
function PosTooltip({
  active, label, info, drivers, visible, focus, simple, stat,
}: {
  active?: boolean; label?: any; info: Map<string, LapInfo>;
  drivers: Driver[]; visible: Driver[]; focus: string | null; simple: boolean; stat?: DriverStat;
}) {
  if (!active || label == null) return null;
  const lap = Number(label);
  const pool = focus ? drivers : visible;   // when focused, rank the whole field
  const rows = pool
    .map((d) => ({ d, i: info.get(`${d.code}:${lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99));
  if (!rows.length) return null;

  const cap = simple ? 6 : 12;
  let shown = rows.slice(0, cap);
  // Always include the focused driver even if outside the cap.
  if (focus && !shown.some((r) => r.d.code === focus)) {
    const fr = rows.find((r) => r.d.code === focus);
    if (fr) shown = [...shown.slice(0, cap - 1), fr];
  }

  const focusRead = focus ? plainRead(focus, lap, info) : null;

  return (
    <div className="max-w-[min(20rem,86vw)] rounded-xl border border-white/10 bg-base-900/97 p-3 text-xs shadow-glow backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-semibold text-ink">Lap {lap}</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Running order</span>
      </div>
      {focus && focusRead && (
        <div className="mb-2 rounded-lg bg-speed/[0.06] px-2 py-1.5 text-[11px] leading-snug text-ink">
          {focusRead}
        </div>
      )}
      <div className="space-y-1">
        {shown.map(({ d, i }) => {
          const isFocus = d.code === focus;
          return (
            <div key={d.code} className={cx("flex items-center gap-2", isFocus && "rounded bg-white/[0.05] -mx-1 px-1 py-0.5")}>
              <span className="w-6 text-right tabular-nums text-ink-faint">P{i!.position}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: d.team_color }} />
              <span className={cx("w-9 font-semibold", isFocus ? "text-ink" : "text-ink-muted")}>{d.code}</span>
              <span className="rounded px-1 text-[10px] font-bold"
                style={{ background: COMPOUND_COLOR[i!.compound], color: "#0b0e16" }}>
                {COMPOUND_SHORT[i!.compound]}{!simple && i!.tyre_age != null ? i!.tyre_age : ""}
              </span>
              {!simple && (
                <span className="ml-auto tabular-nums text-ink-muted">
                  {i!.position === 1 ? "leader" : i!.interval != null ? `+${fmtSec(i!.interval)}` : fmtSec(i!.gap)}
                </span>
              )}
              {i!.pit_in && <span className={cx("font-semibold text-[#a78bfa]", !simple && "ml-0")}>PIT</span>}
              {i!.status !== "GREEN" && <span className="text-amber">{i!.status}</span>}
            </div>
          );
        })}
        {rows.length > shown.length && (
          <div className="pt-0.5 text-center text-[10px] text-ink-faint">+{rows.length - shown.length} more</div>
        )}
      </div>
    </div>
  );
}

// A friendly one-liner about the focused driver's moment — recent places
// gained/lost plus current tyre. Everything read from the lap data.
function plainRead(code: string, lap: number, info: Map<string, LapInfo>): string | null {
  const now = info.get(`${code}:${lap}`);
  if (!now || now.position == null) return null;
  const back = 3;
  let prev: number | null = null;
  for (let l = lap - 1; l >= Math.max(1, lap - back); l--) {
    const p = info.get(`${code}:${l}`);
    if (p?.position != null) { prev = p.position; break; }
  }
  const tyre = COMPOUND_LABEL[now.compound];
  const posTxt = `running ${ordinal(now.position)}`;
  let move = "";
  if (prev != null) {
    const delta = prev - now.position;
    if (delta > 0) move = `gained ${delta} place${delta > 1 ? "s" : ""}`;
    else if (delta < 0) move = `lost ${-delta} place${-delta > 1 ? "s" : ""}`;
    else move = "holding position";
  }
  if (now.pit_in) return `Pitting from ${ordinal(now.position)} — onto fresh rubber.`;
  const bits = [posTxt.charAt(0).toUpperCase() + posTxt.slice(1)];
  if (move) bits.push(move);
  bits.push(`on ${tyre}s`);
  return bits.join(" · ") + " over the last few laps.";
}
