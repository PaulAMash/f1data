"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Flag, ShieldAlert, Gauge, Users, X, ArrowUpRight, ChevronDown } from "lucide-react";
import type {
  RaceSession, Driver, StrategySummary, Compound, RaceInsight, DriverPaceSummary,
} from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtSec, fmtLap, ordinal } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { DriverPalette } from "./DriverPalette";

/* -------------------------------------------------------------------------- */
/* Track Position — the race as a story, the chart as the hero.               */
/*                                                                            */
/* Key Moments is the narrative: compact until you open a beat, then it reads */
/* like race commentary. Simple and Advanced are one product at two densities */
/* — same layout, colour, type and motion — Simple tells the story, Advanced  */
/* explains why. Team colour carries identity; the code at each finisher's    */
/* line-end makes it never colour-alone.                                      */
/* -------------------------------------------------------------------------- */

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
const EVENT: Record<EventKind, { code: string; label: string; color: string; icon: any; blurb: string }> = {
  start: { code: "START", label: "Race start", color: "#00e0c6", icon: Flag, blurb: "Lights out and the run to turn 1." },
  sc:    { code: "SC",    label: "Safety Car",  color: "#ff8c1a", icon: ShieldAlert, blurb: "Full safety car — the field bunches up and the pit lane gets busy." },
  vsc:   { code: "VSC",   label: "Virtual SC",  color: "#ffb020", icon: Gauge, blurb: "Virtual safety car — everyone slows to a delta; a cheap moment to pit." },
  red:   { code: "RED",   label: "Red flag",    color: "#ff4d4d", icon: ShieldAlert, blurb: "Session stopped — cars return to the pits and can change tyres." },
};
const BAND_FILL: Partial<Record<EventKind, string>> = {
  sc: "rgba(255,140,26,0.10)", vsc: "rgba(255,176,32,0.07)", red: "rgba(255,77,77,0.11)",
};

interface LapInfo {
  position?: number | null; compound: Compound; tyre_age?: number | null;
  gap?: number | null; interval?: number | null; pit_in: boolean; status: string;
}
interface DriverStat {
  grid?: number | null; best?: number | null; finish?: number | null; dnf: boolean;
  lapsCompleted?: number | null; overtakes: number; net?: number | null; pits: number;
  compounds: Compound[]; avgPos?: number | null; ledLaps: number;
}
type MomentKind = EventKind | "story" | "finish";
interface Moment { lap: number; kind: MomentKind; label: string; insight?: RaceInsight; }
interface RaceEvt { lap: number; kind: EventKind; band?: [number, number]; cause?: string | null; }

export function PositionChart({
  session, selected, onSelect, strategy, pace, onDeepDive,
}: {
  session: RaceSession;
  selected: string[];
  onSelect: (codes: string[]) => void;
  strategy?: StrategySummary;
  pace?: DriverPaceSummary[];
  onDeepDive?: (code: string) => void;
}) {
  const simple = useIsSimple();
  const drivers = session.drivers;
  const total = session.total_laps;

  const [preset, setPreset] = useState<Preset>("top5");
  const [hover, setHover] = useState<string | null>(null);
  const [openMoment, setOpenMoment] = useState<number | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPreset(simple ? "top5" : "all"); }, [simple]);

  const driverByCode = useMemo(() => {
    const m: Record<string, Driver> = {};
    for (const d of drivers) m[d.code] = d;
    return m;
  }, [drivers]);
  const paceByCode = useMemo(() => {
    const m: Record<string, DriverPaceSummary> = {};
    for (const p of pace ?? []) m[p.driver] = p;
    return m;
  }, [pace]);
  const clsByCode = useMemo(() => {
    const m: Record<string, RaceSession["classification"][number]> = {};
    for (const c of session.classification) m[c.driver] = c;
    return m;
  }, [session.classification]);

  const finishOrder = useMemo(() => {
    const cls = [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const codes = cls.map((c) => c.driver).filter((c) => driverByCode[c]);
    return codes.length ? codes : drivers.map((d) => d.code);
  }, [session.classification, drivers, driverByCode]);
  const podiumSet = useMemo(() => new Set(finishOrder.slice(0, 3)), [finishOrder]);
  const surname = (code: string) => (driverByCode[code]?.name ?? code).split(" ").slice(-1)[0];

  // ── Chart data, with DNF-aware termination ────────────────────────────────
  // A retired car's line ends at the lap it stopped; only classified finishers
  // carry a right-edge label. This kills the "ghost line to the flag" and the
  // stray label for a driver who parked on lap 1.
  const { data, info, posByLap, orderByLap, lastIdx, retiredSet } = useMemo(() => {
    const endLap = new Map<string, number>();
    const retiredSet = new Set<string>();
    for (const d of drivers) {
      const c = clsByCode[d.code];
      if (c?.retired) { retiredSet.add(d.code); endLap.set(d.code, Math.max(0, c.laps_completed ?? 0)); }
      else endLap.set(d.code, total);
    }
    const byLap = new Map<number, Record<string, number>>();
    for (let l = 1; l <= total; l++) byLap.set(l, { lap: l });
    const posByLap = new Map<number, Map<string, number>>();
    for (const p of session.positions) {
      if (p.lap > (endLap.get(p.driver) ?? total)) continue;   // drop ghost points
      const row = byLap.get(p.lap); if (row) row[p.driver] = p.position;
      (posByLap.get(p.lap) ?? posByLap.set(p.lap, new Map()).get(p.lap)!).set(p.driver, p.position);
    }
    const orderByLap = new Map<number, string[]>();
    for (const [lap, m] of posByLap) {
      orderByLap.set(lap, [...m.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c));
    }
    const info = new Map<string, LapInfo>();
    for (const lp of session.laps) {
      if (lp.lap > (endLap.get(lp.driver) ?? total)) continue;
      info.set(`${lp.driver}:${lp.lap}`, {
        position: lp.position, compound: lp.compound, tyre_age: lp.tyre_age,
        gap: lp.gap_to_leader, interval: lp.interval, pit_in: lp.pit_in, status: lp.track_status,
      });
    }
    const rows = Array.from(byLap.values());
    const lastIdx = new Map<string, number>();
    for (const d of drivers) {
      let li = -1;
      for (let i = 0; i < rows.length; i++) if (rows[i][d.code] != null) li = i;
      lastIdx.set(d.code, li);
    }
    return { data: rows, info, posByLap, orderByLap, lastIdx, retiredSet };
  }, [session, drivers, clsByCode, total]);

  const posAt = (code: string, lap: number) => posByLap.get(lap)?.get(code) ?? null;

  // ── Per-driver stats for the focus card ───────────────────────────────────
  const stats = useMemo(() => {
    const sum: Record<string, number> = {}, cnt: Record<string, number> = {}, led: Record<string, number> = {};
    const best: Record<string, number> = {};
    for (const [, m] of posByLap) for (const [code, pos] of m) {
      sum[code] = (sum[code] ?? 0) + pos; cnt[code] = (cnt[code] ?? 0) + 1;
      best[code] = Math.min(best[code] ?? 99, pos);
      if (pos === 1) led[code] = (led[code] ?? 0) + 1;
    }
    const ot: Record<string, number> = {};
    for (const o of session.overtakes) ot[o.overtaker] = (ot[o.overtaker] ?? 0) + 1;
    const comp: Record<string, Compound[]> = {};
    for (const s of [...session.stints].sort((a, b) => a.start_lap - b.start_lap)) {
      (comp[s.driver] ??= []); if (!comp[s.driver].includes(s.compound)) comp[s.driver].push(s.compound);
    }
    const out: Record<string, DriverStat> = {};
    for (const d of drivers) {
      const c = clsByCode[d.code];
      const grid = c?.grid ?? d.grid ?? null;
      const finish = c?.position ?? null;
      const dnf = !!c?.retired;
      out[d.code] = {
        grid, best: best[d.code] ?? null, finish, dnf, lapsCompleted: c?.laps_completed ?? null,
        overtakes: ot[d.code] ?? 0, net: grid != null && finish != null && !dnf ? grid - finish : null,
        pits: c?.pit_stops ?? 0, compounds: comp[d.code] ?? [],
        avgPos: cnt[d.code] ? sum[d.code] / cnt[d.code] : null, ledLaps: led[d.code] ?? 0,
      };
    }
    return out;
  }, [posByLap, session.overtakes, session.stints, drivers, clsByCode]);

  function takeaway(code: string): string {
    const s = stats[code]; if (!s) return "";
    if (s.dnf) return `Retired on lap ${s.lapsCompleted ?? "—"} after running as high as P${s.best ?? "?"}.`;
    if (s.finish === 1) {
      return s.ledLaps >= total * 0.6
        ? `Led ${s.ledLaps} of ${total} laps — in control from lights to flag.`
        : `Won it after leading ${s.ledLaps} lap${s.ledLaps === 1 ? "" : "s"}, timing the race to perfection.`;
    }
    const net = s.net;
    if (net != null && net > 0) return `Climbed ${net} place${net === 1 ? "" : "s"} — P${s.grid} on the grid to P${s.finish} at the flag.`;
    if (net != null && net < 0) return `Slipped ${-net} place${-net === 1 ? "" : "s"} from P${s.grid} to P${s.finish}.`;
    return `Held station around P${s.finish}${s.overtakes ? `, with ${s.overtakes} pass${s.overtakes === 1 ? "" : "es"} along the way` : ""}.`;
  }

  // ── Race-control events (annotations only) ─────────────────────────────────
  const events = useMemo<RaceEvt[]>(() => {
    const out: RaceEvt[] = [{ lap: 1, kind: "start" }];
    for (const w of session.track_status_windows) {
      const k: EventKind | null = w.status === "SAFETY_CAR" ? "sc" : w.status === "VSC" ? "vsc"
        : w.status === "RED" ? "red" : null;
      if (k) out.push({ lap: w.start_lap, kind: k, band: [w.start_lap, w.end_lap], cause: w.cause });
    }
    const seen = new Set<number>();
    return out.filter((e) => e.lap >= 1 && e.lap <= total && !seen.has(e.lap) && seen.add(e.lap));
  }, [session.track_status_windows, total]);

  // ── Key Moments (the narrative) ────────────────────────────────────────────
  const moments = useMemo<Moment[]>(() => {
    const out: Moment[] = [{ lap: 1, kind: "start", label: "Race start" }];
    for (const e of events) if (e.kind !== "start") out.push({ lap: e.lap, kind: e.kind, label: EVENT[e.kind].label });
    const beats: RaceInsight[] = [...(strategy?.turning_points ?? []), ...(strategy?.insights ?? [])];
    for (const b of beats) {
      const lap = b.lap_range?.[0];
      if (lap != null && lap > 1 && lap < total && !out.some((m) => Math.abs(m.lap - lap) < 2))
        out.push({ lap, kind: "story", label: b.title, insight: b });
    }
    out.push({ lap: total, kind: "finish", label: "Race finish" });
    return out.sort((a, b) => a.lap - b.lap).slice(0, simple ? 6 : 9);
  }, [events, strategy, total, simple]);

  // Rich commentary per moment — computed from the running order, pit stops,
  // overtakes and track status around the lap. Reads like a commentary panel.
  const narratives = useMemo(() => {
    const pole = finishOrder.length ? (drivers.find((d) => (d.grid ?? 99) === 1)?.code ?? null) : null;
    const win = finishOrder[0], p2 = finishOrder[1], p3 = finishOrder[2];
    const nm = (c?: string | null) => (c ? surname(c) : "");
    const plc = (n: number) => `${n} place${n === 1 ? "" : "s"}`;

    function forMoment(m: Moment): { simple: string[]; advanced: string[] } {
      const W = 3;
      const before = Math.max(1, m.lap - W), after = Math.min(total, m.lap + W);
      const deltas = drivers.map((d) => {
        const pb = posAt(d.code, before), pa = posAt(d.code, after);
        return pb != null && pa != null ? { code: d.code, d: pb - pa, from: pb, to: pa } : null;
      }).filter(Boolean) as { code: string; d: number; from: number; to: number }[];
      const gain = deltas.filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
      const loss = deltas.filter((x) => x.d < 0).sort((a, b) => a.d - b.d);
      const pitters = [...new Set(session.pit_stops.filter((p) => p.lap >= m.lap - 1 && p.lap <= m.lap + 3).map((p) => p.driver))];
      const win2 = session.track_status_windows.find((w) => w.start_lap === m.lap);
      const dur = win2 ? win2.end_lap - win2.start_lap + 1 : 0;
      const leadB = orderByLap.get(before)?.[0], leadA = orderByLap.get(after)?.[0];
      const gainStr = gain[0] ? `${nm(gain[0].code)} gained ${plc(gain[0].d)} (P${gain[0].from}→P${gain[0].to})` : null;
      const lossStr = loss[0] ? `${nm(loss[0].code)} lost ${plc(-loss[0].d)} (P${loss[0].from}→P${loss[0].to})` : null;
      const leadStr = leadB && leadA && leadB !== leadA ? `${nm(leadA)} took the lead from ${nm(leadB)}` : null;
      const pitStr = pitters.length ? `${pitters.length} car${pitters.length === 1 ? "" : "s"} pitted (${pitters.slice(0, 4).map(nm).join(", ")}${pitters.length > 4 ? "…" : ""})` : null;

      const S: (string | null)[] = [];
      const A: (string | null)[] = [];
      if (m.kind === "start") {
        S.push(pole ? `${nm(pole)} led the field away from pole.` : "Lights out and away they go.");
        S.push(gain[0] && gain[0].d >= 2 ? `${nm(gain[0].code)} made the best start, up ${plc(gain[0].d)}.` : gainStr);
        A.push(pole ? `${nm(pole)} converted pole into the lead.` : "Clean getaway off the line.");
        A.push(gainStr, lossStr, "First-lap positions set the strategy landscape for the stint to come.");
      } else if (m.kind === "sc" || m.kind === "vsc" || m.kind === "red") {
        const meta = EVENT[m.kind];
        S.push(`${m.insight?.detail ?? (win2?.cause ? `${win2.cause}. ` : "")}${meta.blurb}`.trim());
        S.push(leadStr ? `${leadStr}.` : pitStr ? `${pitStr}.` : gainStr ? `${gainStr}.` : null);
        A.push(`${win2?.cause ? win2.cause + " — " : ""}${meta.label}${dur ? ` for ${dur} lap${dur === 1 ? "" : "s"}` : ""}.`);
        A.push(leadStr ? `${leadStr} as the pack compressed.` : null);
        A.push(pitStr ? `${pitStr} — a discounted stop while the field ran slowly.` : "Few took the stop, keeping track position.");
        A.push(gainStr, lossStr);
      } else if (m.kind === "story") {
        S.push(m.insight?.detail ?? m.label);
        S.push(gainStr ? `${gainStr}.` : lossStr ? `${lossStr}.` : null);
        A.push(m.insight?.detail ?? m.label);
        if (m.insight?.explanation) A.push(m.insight.explanation);
        A.push(gainStr, lossStr, pitStr);
      } else { // finish
        S.push(win ? `${nm(win)} won from ${nm(p2)} and ${nm(p3)}.` : "The chequered flag falls.");
        A.push(win ? `${nm(win)} took the win ahead of ${nm(p2)} and ${nm(p3)}.` : "Race complete.");
        if (strategy?.driver_of_the_day) A.push(`Standout drive: ${nm(strategy.driver_of_the_day)}.`);
      }
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const clean = (a: (string | null)[]) => a.filter((x): x is string => !!x && x.length > 0).map(cap);
      return { simple: clean(S).slice(0, 2), advanced: clean(A).slice(0, 5) };
    }
    const map = new Map<number, { simple: string[]; advanced: string[] }>();
    for (const m of moments) map.set(m.lap, forMoment(m));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments, drivers, orderByLap, posByLap, session.pit_stops, session.track_status_windows, strategy, finishOrder]);

  // ── Which drivers are drawn ────────────────────────────────────────────────
  const anyFocus = selected.length > 0;
  function focusOnly(code: string) { onSelect([code]); }

  const visible = useMemo(() => {
    const keep = new Set(finishOrder.slice(0, PRESETS.find((p) => p.id === preset)!.keep));
    for (const c of selected) keep.add(c);
    return drivers.filter((d) => keep.has(d.code));
  }, [drivers, finishOrder, preset, selected]);

  function emphasis(code: string) {
    const isFocus = selected.includes(code);
    if (hover === code) return { op: 1, w: simple ? 3.4 : 3, rank: 5, glow: true };
    if (anyFocus) return isFocus ? { op: 1, w: 3, rank: 4, glow: true } : { op: 0.12, w: 1.25, rank: 0, glow: false };
    if (hover) return { op: 0.14, w: 1.25, rank: 0, glow: false };
    if (podiumSet.has(code)) return { op: 1, w: simple ? 2.6 : 2.2, rank: 3, glow: false };
    return { op: simple ? 0.36 : 0.5, w: 1.5, rank: 1, glow: false };
  }
  const drawOrder = useMemo(
    () => [...visible].sort((a, b) => emphasis(a.code).rank - emphasis(b.code).rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, selected, hover, podiumSet, simple],
  );

  // measured plot geometry for the annotation band
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const lapToX = (lap: number) => {
    const x0 = PLOT_LEFT, x1 = width - M.right;
    if (total <= 1 || width === 0) return x0;
    return x0 + ((lap - 1) / (total - 1)) * (x1 - x0);
  };

  const yMax = useMemo(() => {
    let mx = 5;
    for (const [, m] of posByLap) for (const [code, pos] of m)
      if (visible.some((d) => d.code === code)) mx = Math.max(mx, pos);
    return Math.min(drivers.length, Math.max(mx, Math.min(5, drivers.length)));
  }, [posByLap, visible, drivers.length]);

  if (!session.positions.length) {
    return (
      <p className="py-12 text-center text-sm text-ink-faint">
        Position order isn&apos;t tracked in this session — practice and qualifying have no
        lap-by-lap running order to chart.
      </p>
    );
  }

  const focusCode = selected.length >= 1 ? selected[0] : null;

  return (
    <div className="space-y-5">
      <KeyMoments moments={moments} narratives={narratives} open={openMoment} simple={simple}
        onToggle={(lap) => setOpenMoment((cur) => (cur === lap ? null : lap))} />

      {focusCode && (
        <FocusCard driver={driverByCode[focusCode]} stat={stats[focusCode]} pace={paceByCode[focusCode]}
          stints={session.stints.filter((s) => s.driver === focusCode)} posAt={posAt} simple={simple}
          takeaway={takeaway(focusCode)} onClear={() => onSelect([])} onDeepDive={onDeepDive} />
      )}

      {/* CONTROLS — identical in both modes; only the density downstream differs */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:inline">Show</span>
          <Segmented options={PRESETS.map((p) => ({ id: p.id, label: p.label }))}
            value={preset} onChange={(v) => setPreset(v as Preset)} />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setBrowserOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink">
            <Users size={13} /> Pick a driver
          </button>
          {anyFocus && (
            <button onClick={() => onSelect([])} className="chip hover:text-ink"><X size={12} /> Clear focus</button>
          )}
        </div>
      </div>

      {/* ANNOTATION BAND + CHART */}
      <div ref={wrapRef} className="relative">
        <EventBand events={events} lapToX={lapToX} ready={width > 0} />
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
              {openMoment != null && (
                <ReferenceLine x={openMoment} stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1.4}
                  className="moment-line" ifOverflow="extendDomain" />
              )}
              <XAxis dataKey="lap" type="number" domain={[1, total]} allowDecimals={false}
                tick={{ fill: "#5f6b84", fontSize: simple ? 12 : 11 }} tickLine={false} tickMargin={8}
                axisLine={{ stroke: "rgba(255,255,255,0.07)" }}
                label={{ value: "Lap", position: "insideBottom", offset: -14, fill: "#5f6b84", fontSize: 11 }} />
              <YAxis type="number" reversed domain={[1, yMax]} interval={0}
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
              {drawOrder.filter((d) => emphasis(d.code).glow).map((d) => (
                <Line key={`${d.code}-glow`} dataKey={d.code} type="monotone" stroke={d.team_color}
                  strokeWidth={emphasis(d.code).w + 6} strokeOpacity={0.16} dot={false}
                  connectNulls isAnimationActive={false} legendType="none" />
              ))}
              {drawOrder.map((d) => {
                const em = emphasis(d.code);
                const canLabel = !retiredSet.has(d.code) && (em.rank >= 1);
                return (
                  <Line key={d.code} dataKey={d.code} type="monotone" className="pos-line"
                    stroke={d.team_color} strokeWidth={em.w} strokeOpacity={em.op}
                    dot={false} connectNulls isAnimationActive={false}
                    onClick={() => focusOnly(d.code)} style={{ cursor: "pointer" }}
                    label={(props: any) =>
                      canLabel && props.index === lastIdx.get(d.code)
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

      <DriverPalette open={browserOpen} onClose={() => setBrowserOpen(false)}
        drivers={drivers} finishOrder={finishOrder} focused={selected} onFocus={focusOnly} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Key Moments — the narrative panel                                          */
/* -------------------------------------------------------------------------- */
function KeyMoments({ moments, narratives, open, simple, onToggle }: {
  moments: Moment[]; narratives: Map<number, { simple: string[]; advanced: string[] }>;
  open: number | null; simple: boolean; onToggle: (lap: number) => void;
}) {
  if (moments.length < 2) return null;
  const openM = open != null ? moments.find((m) => m.lap === open) : null;
  const text = open != null ? narratives.get(open) : null;
  const lines = text ? (simple ? text.simple : text.advanced) : [];
  const color = (m: Moment) => (m.kind in EVENT ? EVENT[m.kind as EventKind].color : "#8892a6");
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-base-900/40">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Key moments</span>
        <span className="text-[11px] text-ink-faint/70">· {simple ? "tap a beat for the story" : "tap a beat for the analysis"}</span>
      </div>
      {/* compact chips */}
      <div className="flex flex-wrap gap-1.5 p-3 pt-2.5">
        {moments.map((m) => {
          const on = open === m.lap;
          return (
            <button key={`${m.lap}-${m.label}`} onClick={() => onToggle(m.lap)}
              aria-expanded={on}
              className={cx("group inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-2.5 text-xs transition-all",
                on ? "border-white/25 bg-white/[0.07] text-ink" : "border-white/[0.08] bg-white/[0.02] text-ink-muted hover:border-white/15 hover:text-ink")}>
              <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-base-950" style={{ background: color(m) }} />
              <span className="font-semibold tabular-nums text-ink-faint">L{m.lap}</span>
              <span className="font-medium">{m.label}</span>
            </button>
          );
        })}
      </div>
      {/* expanded commentary */}
      {openM && (
        <div className="animate-fade-in border-t border-white/[0.06] bg-white/[0.015] p-4">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{ background: `${color(openM)}22`, color: color(openM), boxShadow: `inset 0 0 0 1.5px ${color(openM)}` }}>
              L{openM.lap}
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Lap {openM.lap}{simple ? "" : " · what happened & why"}
              </div>
              <div className="text-sm font-semibold text-ink">{openM.label}</div>
            </div>
          </div>
          <ul className={cx("space-y-1.5", simple ? "text-[15px] leading-relaxed text-ink" : "text-sm leading-relaxed text-ink-muted")}>
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                {!simple && <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />}
                <span>{l}</span>
              </li>
            ))}
            {lines.length === 0 && <li className="text-ink-faint">Positions held steady through this phase.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Focus card — premium, mode-adaptive                                        */
/* -------------------------------------------------------------------------- */
function FocusCard({ driver, stat, pace, stints, posAt, simple, takeaway, onClear, onDeepDive }: {
  driver?: Driver; stat?: DriverStat; pace?: DriverPaceSummary; stints: RaceSession["stints"];
  posAt: (c: string, l: number) => number | null; simple: boolean; takeaway: string;
  onClear: () => void; onDeepDive?: (code: string) => void;
}) {
  if (!driver || !stat) return null;
  const tc = driver.team_color;
  const net = stat.net;
  const primary: { label: string; value: string; tone?: "good" | "bad" }[] = [
    { label: "Started", value: stat.grid != null ? `P${stat.grid}` : "—" },
    { label: "Finished", value: stat.dnf ? "DNF" : stat.finish != null ? `P${stat.finish}` : "—", tone: stat.dnf ? "bad" : undefined },
    { label: "Gain / loss", value: net == null ? "—" : net > 0 ? `+${net}` : net < 0 ? `${net}` : "0",
      tone: net == null || net === 0 ? undefined : net > 0 ? "good" : "bad" },
    { label: "Overtakes", value: String(stat.overtakes) },
  ];
  if (!simple) primary.push({ label: "Highest", value: stat.best != null ? `P${stat.best}` : "—" });

  const secondary: { label: string; value: string }[] = !simple ? [
    { label: "Avg running", value: stat.avgPos != null ? `P${stat.avgPos.toFixed(1)}` : "—" },
    { label: "Clean-air pace", value: pace?.clean_air_pace != null ? fmtLap(pace.clean_air_pace) : "—" },
    { label: "Pit loss", value: pace?.total_pit_loss != null ? fmtSec(pace.total_pit_loss) : "—" },
    { label: "Pit stops", value: String(stat.pits) },
    { label: "Pace rank", value: pace?.pace_rank != null ? `P${pace.pace_rank}` : "—" },
  ] : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border p-4 animate-fade-in"
      style={{ borderColor: `${tc}44`, background: `linear-gradient(135deg, ${tc}1f 0%, ${tc}0a 22%, transparent 60%)` }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tc }} />
      <div className="flex flex-wrap items-center gap-4 pl-2">
        <button onClick={() => onDeepDive?.(driver.code)} disabled={!onDeepDive}
          className="group flex items-center gap-3 text-left disabled:cursor-default">
          <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${tc}, 0 6px 20px -6px ${tc}80` }}>
            <DriverAvatar driver={driver} size={simple ? 58 : 52} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tc }}>Focused driver</div>
            <div className={cx("flex items-center gap-1.5 font-bold leading-tight", simple ? "text-2xl" : "text-xl")}>
              <span className="truncate">{driver.name}</span>
              {onDeepDive && <ArrowUpRight size={16} className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />}
            </div>
            <div className="text-xs font-medium text-ink-muted">{driver.team}</div>
          </div>
        </button>
        <div className="flex flex-1 flex-wrap items-stretch gap-2">
          {primary.map((t) => <StatTile key={t.label} {...t} accent={tc} big={simple} />)}
        </div>
        <button onClick={onClear} aria-label="Clear focus" className="ml-auto self-start rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>
      </div>

      {/* takeaway — the one-liner both modes get */}
      <p className={cx("mt-3 pl-2 leading-snug text-ink", simple ? "text-[15px] font-medium" : "text-sm text-ink-muted")}>
        {takeaway}
      </p>

      {/* Simple: tyre strategy chips. Advanced: metrics row + stint timeline. */}
      {simple ? (
        stat.compounds.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 pl-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</span>
            {stat.compounds.map((c, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: COMPOUND_COLOR[c], color: "#0b0e16" }}>
                {COMPOUND_LABEL[c]}
              </span>
            ))}
          </div>
        )
      ) : (
        <div className="mt-3 space-y-3 pl-2">
          {secondary.some((s) => s.value !== "—") && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-white/[0.06] pt-3">
              {secondary.map((s) => (
                <div key={s.label} className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{s.label}</span>
                  <div className="text-sm font-semibold tabular-nums text-ink">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {stints.length > 0 && (
            <StintTimeline stints={stints} code={driver.code} posAt={posAt} />
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, accent, big }: {
  label: string; value: string; tone?: "good" | "bad"; accent: string; big?: boolean;
}) {
  const color = tone === "good" ? "text-speed" : tone === "bad" ? "text-accent-soft" : "text-ink";
  return (
    <div className="flex-1 min-w-[74px] rounded-xl border border-white/[0.07] bg-base-950/40 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx("mt-0.5 font-bold tabular-nums", big ? "text-2xl" : "text-lg", color)}>{value}</div>
    </div>
  );
}

// Advanced tyre-stint timeline with the position at each stint's start → end.
function StintTimeline({ stints, code, posAt }: {
  stints: RaceSession["stints"]; code: string; posAt: (c: string, l: number) => number | null;
}) {
  const ordered = [...stints].sort((a, b) => a.start_lap - b.start_lap);
  return (
    <div className="border-t border-white/[0.06] pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Stints · position by stint</div>
      <div className="flex gap-1">
        {ordered.map((s, i) => {
          const laps = s.end_lap - s.start_lap + 1;
          const pStart = posAt(code, s.start_lap), pEnd = posAt(code, s.end_lap);
          return (
            <div key={i} className="min-w-0 grow rounded-md px-2 py-1.5 text-center"
              style={{ flexGrow: laps, background: `${COMPOUND_COLOR[s.compound]}22`, boxShadow: `inset 0 -2px 0 0 ${COMPOUND_COLOR[s.compound]}` }}
              title={`${COMPOUND_LABEL[s.compound]} · laps ${s.start_lap}-${s.end_lap}`}>
              <div className="text-[10px] font-bold" style={{ color: COMPOUND_COLOR[s.compound] }}>
                {COMPOUND_SHORT[s.compound]} · {laps}L
              </div>
              {pStart != null && pEnd != null && (
                <div className="text-[10px] tabular-nums text-ink-muted">P{pStart}→P{pEnd}</div>
              )}
            </div>
          );
        })}
      </div>
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

// Editorial event markers above the plot — annotations, not controls. Hover for
// lap, duration, cause and a one-line explanation.
function EventBand({ events, lapToX, ready }: {
  events: RaceEvt[]; lapToX: (lap: number) => number; ready: boolean;
}) {
  return (
    <div className={cx("relative mb-1 h-11 transition-opacity", ready ? "opacity-100" : "opacity-0")}>
      {events.map((e, i) => {
        const meta = EVENT[e.kind]; const Icon = meta.icon;
        const dur = e.band ? e.band[1] - e.band[0] + 1 : 0;
        return (
          <div key={i} className="group absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: Math.max(28, lapToX(e.lap)) }}>
            <span className="flex cursor-default items-center gap-1 rounded-full border bg-base-900/80 px-2 py-0.5 text-[10px] font-bold"
              style={{ borderColor: `${meta.color}66`, color: meta.color }}>
              <Icon size={11} /> {meta.code}
            </span>
            <span className="mt-0.5 text-[10px] tabular-nums text-ink-faint">L{e.lap}</span>
            <span className="mt-0.5 h-1.5 w-px" style={{ background: `${meta.color}66` }} />
            {/* hover tooltip */}
            <div className="pointer-events-none absolute bottom-full z-40 mb-1 w-52 -translate-x-1/2 left-1/2 rounded-lg border border-white/10 bg-base-900/97 p-2.5 text-left opacity-0 shadow-glow backdrop-blur-md transition-opacity group-hover:opacity-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Icon size={12} style={{ color: meta.color }} /> {meta.label}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-faint">
                Lap {e.lap}{dur ? ` · ${dur} lap${dur === 1 ? "" : "s"}` : ""}
              </div>
              {e.cause && <div className="mt-1 text-[11px] text-ink-muted">{e.cause}</div>}
              <div className="mt-1 text-[11px] leading-snug text-ink-muted">{meta.blurb}</div>
            </div>
          </div>
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
        return <span key={k} className="inline-flex items-center gap-1.5"><Icon size={12} style={{ color: meta.color }} /> {meta.label}</span>;
      })}
      {events.some((e) => e.band) && (
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-amber/20" /> Neutralised (shaded)</span>
      )}
      <span className="ml-auto hidden text-ink-faint sm:inline">
        {hasFocus ? "Hover the chart for the running order at any lap."
          : simple ? "Click any line to follow that driver." : "Click a line to focus · hover for gaps & tyres."}
      </span>
    </div>
  );
}

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
