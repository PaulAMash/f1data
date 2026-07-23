"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Flag, ShieldAlert, Gauge, Users, X, ArrowUpRight, TrendingUp, TrendingDown, Circle,
} from "lucide-react";
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
/* Key Moments is the narrative: a scannable timeline that opens into race    */
/* commentary. Simple is the story (fewer cars, calm canvas, plain English);  */
/* Advanced is the analyst tool (all cars, an analytical overlay, gaps &      */
/* tyre age on hover, and the movers behind every beat). Same product, two    */
/* densities.                                                                 */
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
  sc:    { code: "SC",    label: "Safety Car",  color: "#ff9e2c", icon: ShieldAlert, blurb: "Full safety car — the field bunches up and the pit lane gets busy." },
  vsc:   { code: "VSC",   label: "Virtual SC",  color: "#ffd21e", icon: Gauge, blurb: "Virtual safety car — everyone slows to a delta; a cheap moment to pit." },
  red:   { code: "RED",   label: "Red flag",    color: "#ff5555", icon: ShieldAlert, blurb: "Session stopped — cars return to the pits and can change tyres." },
};
// brighter, bordered bands so neutralisations read at a glance without shouting
const BAND: Record<EventKind, { fill: string; stroke: string }> = {
  start: { fill: "transparent", stroke: "transparent" },
  sc:  { fill: "rgba(255,158,44,0.15)", stroke: "rgba(255,158,44,0.5)" },
  vsc: { fill: "rgba(255,210,30,0.13)", stroke: "rgba(255,210,30,0.5)" },
  red: { fill: "rgba(255,85,85,0.16)",  stroke: "rgba(255,85,85,0.55)" },
};
const STATUS_TO_KIND = (s: string): EventKind | null =>
  s === "SAFETY_CAR" ? "sc" : s === "VSC" ? "vsc" : s === "RED" ? "red" : null;
const SEV: Record<EventKind, number> = { red: 4, sc: 3, vsc: 2, start: 0 };

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
interface Win { kind: EventKind; start: number; end: number; cause?: string | null; }
interface Mover { code: string; d: number; from: number; to: number; }

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
  const [pitOverlay, setPitOverlay] = useState(false);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPreset(simple ? "top5" : "all"); setPitOverlay(false); }, [simple]);

  const driverByCode = useMemo(() => Object.fromEntries(drivers.map((d) => [d.code, d])) as Record<string, Driver>, [drivers]);
  const paceByCode = useMemo(() => Object.fromEntries((pace ?? []).map((p) => [p.driver, p])) as Record<string, DriverPaceSummary>, [pace]);
  const clsByCode = useMemo(() => Object.fromEntries(session.classification.map((c) => [c.driver, c])) as Record<string, RaceSession["classification"][number]>, [session.classification]);

  const finishOrder = useMemo(() => {
    const cls = [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const codes = cls.map((c) => c.driver).filter((c) => driverByCode[c]);
    return codes.length ? codes : drivers.map((d) => d.code);
  }, [session.classification, drivers, driverByCode]);
  const podiumSet = useMemo(() => new Set(finishOrder.slice(0, 3)), [finishOrder]);
  const surname = (code: string) => (driverByCode[code]?.name ?? code).split(" ").slice(-1)[0];

  // ── Neutralisation windows, derived from BOTH the window list AND the
  // per-lap track status. Sources routinely report a lap as SAFETY_CAR without
  // ever emitting the window (the missing Belgian lap-1 SC) — scanning the laps
  // recovers it so every event shows up consistently across the page.
  const { windows, lapStatus } = useMemo(() => {
    const lapKind = new Map<number, EventKind>();
    const bump = (lap: number, k: EventKind) => {
      if (lap < 1 || lap > total) return;
      if (SEV[k] > SEV[lapKind.get(lap) ?? "start"]) lapKind.set(lap, k);
    };
    for (const w of session.track_status_windows) {
      const k = STATUS_TO_KIND(w.status);
      if (k) for (let l = w.start_lap; l <= w.end_lap; l++) bump(l, k);
    }
    for (const lp of session.laps) {
      const k = STATUS_TO_KIND(lp.track_status);
      if (k) bump(lp.lap, k);
    }
    // contiguous runs of the same kind → windows
    const wins: Win[] = [];
    let cur: Win | null = null;
    for (let l = 1; l <= total; l++) {
      const k = lapKind.get(l) ?? null;
      if (k && cur && cur.kind === k && l === cur.end + 1) cur.end = l;
      else { if (cur) wins.push(cur); cur = k ? { kind: k, start: l, end: l } : null; }
    }
    if (cur) wins.push(cur);
    // attach a cause from any overlapping reported window
    for (const w of wins) {
      const src = session.track_status_windows.find(
        (s) => STATUS_TO_KIND(s.status) === w.kind && s.start_lap <= w.end && s.end_lap >= w.start && s.cause);
      w.cause = src?.cause ?? null;
    }
    return { windows: wins, lapStatus: lapKind };
  }, [session.track_status_windows, session.laps, total]);

  // ── Chart data with DNF-aware termination ─────────────────────────────────
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
      if (p.lap > (endLap.get(p.driver) ?? total)) continue;
      const row = byLap.get(p.lap); if (row) row[p.driver] = p.position;
      (posByLap.get(p.lap) ?? posByLap.set(p.lap, new Map()).get(p.lap)!).set(p.driver, p.position);
    }
    const orderByLap = new Map<number, string[]>();
    for (const [lap, m] of posByLap) orderByLap.set(lap, [...m.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c));
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

  // ── Per-driver stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const sum: Record<string, number> = {}, cnt: Record<string, number> = {}, led: Record<string, number> = {}, best: Record<string, number> = {};
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
      const grid = c?.grid ?? d.grid ?? null, finish = c?.position ?? null, dnf = !!c?.retired;
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
    if (s.finish === 1) return s.ledLaps >= total * 0.6
      ? `Led ${s.ledLaps} of ${total} laps — in control from lights to flag.`
      : `Won it after leading ${s.ledLaps} lap${s.ledLaps === 1 ? "" : "s"}, timing the race to perfection.`;
    const net = s.net;
    if (net != null && net > 0) return `Climbed ${net} place${net === 1 ? "" : "s"} — P${s.grid} on the grid to P${s.finish} at the flag.`;
    if (net != null && net < 0) return `Slipped ${-net} place${-net === 1 ? "" : "s"} from P${s.grid} to P${s.finish}.`;
    return `Held station around P${s.finish}${s.overtakes ? `, with ${s.overtakes} pass${s.overtakes === 1 ? "" : "es"} along the way` : ""}.`;
  }

  const events = useMemo(() => {
    const out: { lap: number; kind: EventKind; band?: [number, number]; cause?: string | null }[] = [{ lap: 1, kind: "start" }];
    for (const w of windows) out.push({ lap: w.start, kind: w.kind, band: [w.start, w.end], cause: w.cause });
    const seen = new Set<number>();
    return out.filter((e) => !seen.has(e.lap) && seen.add(e.lap));
  }, [windows]);

  const moments = useMemo<Moment[]>(() => {
    const out: Moment[] = [{ lap: 1, kind: "start", label: "Race start" }];
    for (const w of windows) out.push({ lap: w.start, kind: w.kind, label: EVENT[w.kind].label });
    const beats: RaceInsight[] = [...(strategy?.turning_points ?? []), ...(strategy?.insights ?? [])];
    for (const b of beats) {
      const lap = b.lap_range?.[0];
      if (lap != null && lap > 1 && lap < total && !out.some((m) => Math.abs(m.lap - lap) < 2))
        out.push({ lap, kind: "story", label: b.title, insight: b });
    }
    out.push({ lap: total, kind: "finish", label: "Race finish" });
    const seen = new Set<number>();
    return out.filter((m) => !seen.has(m.lap) && seen.add(m.lap)).sort((a, b) => a.lap - b.lap).slice(0, simple ? 6 : 10);
  }, [windows, strategy, total, simple]);

  const narratives = useMemo(() => {
    const pole = drivers.find((d) => (clsByCode[d.code]?.grid ?? d.grid ?? 99) === 1)?.code ?? null;
    const win = finishOrder[0], p2 = finishOrder[1], p3 = finishOrder[2];
    const nm = (c?: string | null) => (c ? surname(c) : "");
    const plc = (n: number) => `${n} place${n === 1 ? "" : "s"}`;

    function forMoment(m: Moment) {
      const W = 3, before = Math.max(1, m.lap - W), after = Math.min(total, m.lap + W);
      const deltas: Mover[] = drivers.map((d) => {
        const pb = posAt(d.code, before), pa = posAt(d.code, after);
        return pb != null && pa != null ? { code: d.code, d: pb - pa, from: pb, to: pa } : null;
      }).filter(Boolean) as Mover[];
      const up = deltas.filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
      const down = deltas.filter((x) => x.d < 0).sort((a, b) => a.d - b.d);
      const pitters = [...new Set(session.pit_stops.filter((p) => p.lap >= m.lap - 1 && p.lap <= m.lap + 3).map((p) => p.driver))];
      const w = windows.find((x) => x.start === m.lap);
      const dur = w ? w.end - w.start + 1 : 0;
      const leadB = orderByLap.get(before)?.[0], leadA = orderByLap.get(after)?.[0];
      const upStr = up[0] ? `${nm(up[0].code)} gained ${plc(up[0].d)} (P${up[0].from}→P${up[0].to})` : null;
      const dnStr = down[0] ? `${nm(down[0].code)} lost ${plc(-down[0].d)} (P${down[0].from}→P${down[0].to})` : null;
      const leadStr = leadB && leadA && leadB !== leadA ? `${nm(leadA)} took the lead from ${nm(leadB)}` : null;
      const pitStr = pitters.length ? `${pitters.length} car${pitters.length === 1 ? "" : "s"} pitted (${pitters.slice(0, 4).map(nm).join(", ")}${pitters.length > 4 ? "…" : ""})` : null;

      const S: (string | null)[] = [], A: (string | null)[] = [];
      if (m.kind === "start") {
        S.push(pole ? `${nm(pole)} led the field away from pole.` : "Lights out and away they go.");
        S.push(up[0] && up[0].d >= 2 ? `${nm(up[0].code)} made the best start, up ${plc(up[0].d)}.` : upStr);
        A.push(pole ? `${nm(pole)} converted pole into the lead.` : "Clean getaway off the line.", upStr, dnStr,
          "First-lap positions set the strategy landscape for the stint to come.");
      } else if (m.kind === "sc" || m.kind === "vsc" || m.kind === "red") {
        const meta = EVENT[m.kind];
        S.push(`${m.insight?.detail ?? (w?.cause ? `${w.cause}. ` : "")}${meta.blurb}`.trim());
        S.push(leadStr ? `${leadStr}.` : pitStr ? `${pitStr}.` : upStr ? `${upStr}.` : null);
        A.push(`${w?.cause ? w.cause + " — " : ""}${meta.label}${dur ? ` for ${dur} lap${dur === 1 ? "" : "s"}` : ""}.`,
          leadStr ? `${leadStr} as the pack compressed.` : null,
          pitStr ? `${pitStr} — a discounted stop while the field ran slowly.` : "Few took the stop, keeping track position.",
          upStr, dnStr);
      } else if (m.kind === "story") {
        S.push(m.insight?.detail ?? m.label, upStr ? `${upStr}.` : dnStr ? `${dnStr}.` : null);
        A.push(m.insight?.detail ?? m.label, m.insight?.explanation ?? null, upStr, dnStr, pitStr);
      } else {
        S.push(win ? `${nm(win)} won from ${nm(p2)} and ${nm(p3)}.` : "The chequered flag falls.");
        A.push(win ? `${nm(win)} took the win ahead of ${nm(p2)} and ${nm(p3)}.` : "Race complete.",
          strategy?.driver_of_the_day ? `Standout drive: ${nm(strategy.driver_of_the_day)}.` : null);
      }
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const clean = (a: (string | null)[]) => a.filter((x): x is string => !!x && x.length > 0).map(cap);
      return { simple: clean(S).slice(0, 2), advanced: clean(A).slice(0, 5), up: up.slice(0, 3), down: down.slice(0, 3) };
    }
    const map = new Map<number, ReturnType<typeof forMoment>>();
    for (const m of moments) map.set(m.lap, forMoment(m));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments, drivers, orderByLap, posByLap, windows, session.pit_stops, strategy, finishOrder, clsByCode]);

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
  // pit-stop markers: the focused line always; every visible line when the
  // Advanced "pit stops" overlay is on
  const pitDots = (() => {
    const out: { code: string; lap: number; pos: number; color: string }[] = [];
    const codes = pitOverlay && !simple ? visible.map((d) => d.code) : focusCode ? [focusCode] : [];
    for (const code of codes) {
      for (const p of session.pit_stops) {
        if (p.driver !== code) continue;
        const pos = posAt(code, p.lap);
        if (pos != null) out.push({ code, lap: p.lap, pos, color: driverByCode[code]?.team_color ?? "#fff" });
      }
    }
    return out;
  })();

  return (
    <div className="space-y-5">
      <KeyMoments moments={moments} narratives={narratives} open={openMoment} simple={simple}
        onToggle={(lap) => setOpenMoment((cur) => (cur === lap ? null : lap))} driverByCode={driverByCode} />

      {focusCode && (
        <FocusCard driver={driverByCode[focusCode]} stat={stats[focusCode]} pace={paceByCode[focusCode]}
          stints={session.stints.filter((s) => s.driver === focusCode)} posAt={posAt} simple={simple}
          takeaway={takeaway(focusCode)} onClear={() => onSelect([])} onDeepDive={onDeepDive} />
      )}

      {/* CONTROLS */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:inline">Show</span>
          <Segmented options={PRESETS.map((p) => ({ id: p.id, label: p.label }))} value={preset} onChange={(v) => setPreset(v as Preset)} />
        </div>
        {/* Advanced-only analytical overlay */}
        {!simple && (
          <button onClick={() => setPitOverlay((v) => !v)} aria-pressed={pitOverlay}
            className={cx("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              pitOverlay ? "border-accent/40 bg-accent/10 text-accent-soft" : "border-white/10 bg-white/[0.03] text-ink-muted hover:text-ink")}>
            <Circle size={11} className={pitOverlay ? "fill-accent-soft" : ""} /> Pit stops
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setBrowserOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink">
            <Users size={13} /> Pick a driver
          </button>
          {anyFocus && <button onClick={() => onSelect([])} className="chip hover:text-ink"><X size={12} /> Clear focus</button>}
        </div>
      </div>

      {/* ANNOTATION BAND + CHART */}
      <div ref={wrapRef} className="relative">
        <EventBand events={events} lapToX={lapToX} ready={width > 0} simple={simple} />
        <div className={cx("w-full select-none", simple ? "h-[420px]" : "h-[440px]")}>
          <ResponsiveContainer>
            <LineChart data={data} margin={M}>
              {!simple && <CartesianGrid stroke="rgba(255,255,255,0.035)" strokeDasharray="1 6" vertical={false} />}
              {events.filter((e) => e.band).map((e, i) => (
                <ReferenceArea key={`b${i}`} x1={e.band![0]} x2={e.band![1]} y1={1} y2={yMax}
                  fill={BAND[e.kind].fill} stroke={BAND[e.kind].stroke} strokeWidth={1} ifOverflow="hidden" />
              ))}
              {events.map((e, i) => (
                <ReferenceLine key={`e${i}`} x={e.lap} stroke={EVENT[e.kind].color}
                  strokeOpacity={e.kind === "start" ? 0.3 : 0.42} strokeDasharray="2 5" ifOverflow="extendDomain" />
              ))}
              {openMoment != null && (
                <ReferenceLine x={openMoment} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.6}
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
                cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} wrapperStyle={{ zIndex: 30, outline: "none" }}
                content={(p: any) => (
                  <OrderTooltip active={p.active} label={p.label} info={info} drivers={drivers} visible={visible}
                    focus={focusCode} simple={simple} lapStatus={lapStatus} surnameOf={surname} podiumSet={podiumSet} />
                )} />
              {drawOrder.filter((d) => emphasis(d.code).glow).map((d) => (
                <Line key={`${d.code}-glow`} dataKey={d.code} type="monotone" className="focus-halo" stroke={d.team_color}
                  strokeWidth={emphasis(d.code).w + 7} strokeOpacity={0.16} dot={false} connectNulls isAnimationActive={false} legendType="none" />
              ))}
              {drawOrder.map((d) => {
                const em = emphasis(d.code);
                const canLabel = !retiredSet.has(d.code) && em.rank >= 1;
                return (
                  <Line key={d.code} dataKey={d.code} type="monotone" className="pos-line"
                    stroke={d.team_color} strokeWidth={em.w} strokeOpacity={em.op} dot={false} connectNulls isAnimationActive={false}
                    onClick={() => focusOnly(d.code)} style={{ cursor: "pointer" }}
                    label={(props: any) =>
                      canLabel && props.index === lastIdx.get(d.code)
                        ? <EdgeLabel x={props.x} y={props.y} code={d.code} color={d.team_color} op={em.op} onClick={() => focusOnly(d.code)} />
                        : <g />} />
                );
              })}
              {pitDots.map((p, i) => (
                <ReferenceDot key={`pd${i}`} x={p.lap} y={p.pos} r={3.5} fill="#0b0e16" stroke={p.color} strokeWidth={2} ifOverflow="hidden" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <UnifiedLegend simple={simple} events={events} hasFocus={anyFocus} pitOverlay={pitOverlay} />

      <DriverPalette open={browserOpen} onClose={() => setBrowserOpen(false)}
        drivers={drivers} finishOrder={finishOrder} focused={selected} onFocus={focusOnly} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Key Moments — a scannable timeline that opens into commentary              */
/* -------------------------------------------------------------------------- */
function KeyMoments({ moments, narratives, open, simple, onToggle, driverByCode }: {
  moments: Moment[]; narratives: Map<number, { simple: string[]; advanced: string[]; up: Mover[]; down: Mover[] }>;
  open: number | null; simple: boolean; onToggle: (lap: number) => void; driverByCode: Record<string, Driver>;
}) {
  if (moments.length < 2) return null;
  const colorOf = (m: Moment) => (m.kind in EVENT ? EVENT[m.kind as EventKind].color : "#8892a6");
  const iconOf = (m: Moment) => (m.kind in EVENT ? EVENT[m.kind as EventKind].icon : Circle);
  const openM = open != null ? moments.find((m) => m.lap === open) : null;
  const text = open != null ? narratives.get(open) : null;
  const lines = text ? (simple ? text.simple : text.advanced) : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-base-900/40">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Key moments</span>
        <span className="text-[11px] text-ink-faint/70">· {simple ? "tap a beat for the story" : "tap a beat for the analysis"}</span>
      </div>
      {/* timeline cards */}
      <div className="flex gap-2 overflow-x-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {moments.map((m) => {
          const on = open === m.lap; const c = colorOf(m); const Icon = iconOf(m);
          return (
            <button key={`${m.lap}-${m.label}`} onClick={() => onToggle(m.lap)} aria-expanded={on}
              className={cx("group relative flex min-w-[148px] flex-1 flex-col gap-1.5 rounded-xl border-l-[3px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-left transition-all hover:-translate-y-px hover:bg-white/[0.05]",
                on && "chip-breathing bg-white/[0.06] ring-1 ring-white/20")}
              style={{ borderLeftColor: c }}>
              <div className="flex items-center gap-1.5">
                <Icon size={13} style={{ color: c }} />
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: `${c}22`, color: c }}>
                  LAP {m.lap}
                </span>
              </div>
              <span className={cx("text-[13px] font-semibold leading-tight", on ? "text-ink" : "text-ink-muted group-hover:text-ink")}>{m.label}</span>
            </button>
          );
        })}
      </div>
      {/* expanded commentary */}
      {openM && (
        <div className="animate-fade-in border-t border-white/[0.06] bg-white/[0.015] p-4">
          <div className="mb-2.5 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${colorOf(openM)}1f`, boxShadow: `inset 0 0 0 1.5px ${colorOf(openM)}66` }}>
              {(() => { const Ic = iconOf(openM); return <Ic size={18} style={{ color: colorOf(openM) }} />; })()}
            </span>
            <div className="min-w-0">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${colorOf(openM)}22`, color: colorOf(openM) }}>LAP {openM.lap}</span>
              <div className="mt-0.5 text-base font-bold text-ink">{openM.label}</div>
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
          {/* movers — an Advanced-only scannable summary of who won and lost */}
          {!simple && text && (text.up.length > 0 || text.down.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/[0.06] pt-2.5">
              {text.up.map((mv) => <MoverChip key={`u${mv.code}`} mv={mv} driver={driverByCode[mv.code]} up />)}
              {text.down.map((mv) => <MoverChip key={`d${mv.code}`} mv={mv} driver={driverByCode[mv.code]} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MoverChip({ mv, driver, up }: { mv: Mover; driver?: Driver; up?: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      up ? "border-speed/30 bg-speed/10 text-speed" : "border-accent/30 bg-accent/10 text-accent-soft")}>
      <Icon size={11} />
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: driver?.team_color ?? "#888" }} />
      <span className="text-ink">{mv.code}</span>
      <span className="tabular-nums">{up ? `+${mv.d}` : mv.d}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Focus card                                                                 */
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
    <div className="relative overflow-hidden rounded-2xl border p-4 pl-5 animate-fade-in"
      style={{ borderColor: `${tc}55`, background: `linear-gradient(120deg, ${tc}24 0%, ${tc}0d 26%, transparent 62%)` }}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tc }} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button onClick={() => onDeepDive?.(driver.code)} disabled={!onDeepDive} className="group flex items-center gap-3.5 text-left disabled:cursor-default">
          {/* single, intentional ring + soft team-colour glow (no double circle) */}
          <span className="grid place-items-center rounded-full p-[3px]" style={{ background: `${tc}26`, boxShadow: `0 0 0 2px ${tc}, 0 8px 26px -8px ${tc}` }}>
            <DriverAvatar driver={driver} size={simple ? 56 : 50} ring={false} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: tc }}>Focused driver</div>
            <div className={cx("flex items-center gap-1.5 font-extrabold leading-tight tracking-tight", simple ? "text-[26px]" : "text-2xl")}>
              <span className="truncate">{driver.name}</span>
              {onDeepDive && <ArrowUpRight size={17} className="shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: tc }} /> {driver.team}
            </div>
          </div>
        </button>
        <div className="flex flex-1 flex-wrap items-stretch gap-2">
          {primary.map((t) => <StatTile key={t.label} {...t} big={simple} />)}
        </div>
        <button onClick={onClear} aria-label="Clear focus" className="ml-auto self-start rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>
      </div>

      <p className={cx("mt-3 leading-snug text-ink", simple ? "text-[15px] font-medium" : "text-sm text-ink-muted")}>{takeaway}</p>

      {simple ? (
        stat.compounds.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</span>
            {stat.compounds.map((c, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: COMPOUND_COLOR[c], color: "#0b0e16" }}>{COMPOUND_LABEL[c]}</span>
            ))}
          </div>
        )
      ) : (
        <div className="mt-3 space-y-3">
          {secondary.some((s) => s.value !== "—") && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-white/[0.06] pt-3">
              {secondary.map((s) => (
                <div key={s.label}><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{s.label}</span>
                  <div className="text-sm font-semibold tabular-nums text-ink">{s.value}</div></div>
              ))}
            </div>
          )}
          {stints.length > 0 && <StintTimeline stints={stints} code={driver.code} posAt={posAt} />}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, big }: { label: string; value: string; tone?: "good" | "bad"; big?: boolean }) {
  const color = tone === "good" ? "text-speed" : tone === "bad" ? "text-accent-soft" : "text-ink";
  return (
    <div className="flex-1 min-w-[74px] rounded-xl border border-white/[0.07] bg-base-950/40 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx("mt-0.5 font-bold tabular-nums", big ? "text-2xl" : "text-lg", color)}>{value}</div>
    </div>
  );
}

function StintTimeline({ stints, code, posAt }: { stints: RaceSession["stints"]; code: string; posAt: (c: string, l: number) => number | null }) {
  const ordered = [...stints].sort((a, b) => a.start_lap - b.start_lap);
  return (
    <div className="border-t border-white/[0.06] pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Stints · position by stint</div>
      <div className="flex gap-1">
        {ordered.map((s, i) => {
          const laps = s.end_lap - s.start_lap + 1;
          const pStart = posAt(code, s.start_lap), pEnd = posAt(code, s.end_lap);
          return (
            <div key={i} className="min-w-0 rounded-md px-2 py-1.5 text-center" style={{ flexGrow: laps, background: `${COMPOUND_COLOR[s.compound]}22`, boxShadow: `inset 0 -2px 0 0 ${COMPOUND_COLOR[s.compound]}` }}
              title={`${COMPOUND_LABEL[s.compound]} · laps ${s.start_lap}-${s.end_lap}`}>
              <div className="text-[10px] font-bold" style={{ color: COMPOUND_COLOR[s.compound] }}>{COMPOUND_SHORT[s.compound]} · {laps}L</div>
              {pStart != null && pEnd != null && <div className="text-[10px] tabular-nums text-ink-muted">P{pStart}→P{pEnd}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-white/10 bg-base-900/60 p-0.5">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={cx("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.id ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30" : "text-ink-muted hover:text-ink")}>{o.label}</button>
      ))}
    </div>
  );
}

function EventBand({ events, lapToX, ready, simple }: { events: { lap: number; kind: EventKind; band?: [number, number]; cause?: string | null }[]; lapToX: (lap: number) => number; ready: boolean; simple: boolean }) {
  return (
    <div className={cx("relative mb-1 transition-opacity", simple ? "h-12" : "h-11", ready ? "opacity-100" : "opacity-0")}>
      {events.map((e, i) => {
        const meta = EVENT[e.kind]; const Icon = meta.icon;
        const dur = e.band ? e.band[1] - e.band[0] + 1 : 0;
        return (
          <div key={i} className="group absolute bottom-0 flex -translate-x-1/2 flex-col items-center" style={{ left: Math.max(30, lapToX(e.lap)) }}>
            <span className={cx("flex cursor-default items-center gap-1 rounded-full border font-bold", simple ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]")}
              style={{ borderColor: meta.color, color: meta.color, background: `${meta.color}1a` }}>
              <Icon size={simple ? 13 : 11} /> {meta.code}
            </span>
            <span className="mt-0.5 text-[10px] tabular-nums text-ink-faint">L{e.lap}</span>
            <span className="mt-0.5 h-1.5 w-px" style={{ background: meta.color }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-base-900/97 p-2.5 text-left opacity-0 shadow-glow backdrop-blur-md transition-opacity group-hover:opacity-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Icon size={12} style={{ color: meta.color }} /> {meta.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-faint">Lap {e.lap}{dur ? ` · ${dur} lap${dur === 1 ? "" : "s"}` : ""}</div>
              {e.cause && <div className="mt-1 text-[11px] text-ink-muted">{e.cause}</div>}
              <div className="mt-1 text-[11px] leading-snug text-ink-muted">{meta.blurb}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EdgeLabel({ x, y, code, color, op, onClick }: { x: number; y: number; code: string; color: string; op: number; onClick: () => void }) {
  return (
    <g className="pos-edge" opacity={Math.max(op, 0.35)} style={{ cursor: "pointer" }} onClick={onClick}>
      <rect x={x + 3} y={y - 8} width={40} height={16} rx={4} fill="transparent" />
      <circle cx={x + 9} cy={y} r={3} fill={color} />
      <text x={x + 16} y={y} dy={3.5} fontSize={11} fontWeight={800} fill={color}>{code}</text>
    </g>
  );
}

function UnifiedLegend({ simple, events, hasFocus, pitOverlay }: { simple: boolean; events: { kind: EventKind }[]; hasFocus: boolean; pitOverlay: boolean }) {
  const kinds = Array.from(new Set(events.map((e) => e.kind))).filter((k) => k !== "start");
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.05] bg-base-900/30 px-4 py-2.5 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 rounded" style={{ background: "#8892a6" }} /> Driver · team colour, code at the right</span>
      {kinds.map((k) => { const meta = EVENT[k]; const Icon = meta.icon; return <span key={k} className="inline-flex items-center gap-1.5"><Icon size={12} style={{ color: meta.color }} /> {meta.label}</span>; })}
      {(hasFocus || pitOverlay) && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-muted bg-base-900" /> Pit stop</span>}
      <span className="ml-auto hidden text-ink-faint sm:inline">
        {hasFocus ? "Hover the chart for the running order at any lap." : simple ? "Click any line to follow that driver." : "Click a line to focus · hover for gaps & tyres · toggle Pit stops."}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hover — the running order, grouped and dense                               */
/* -------------------------------------------------------------------------- */
function OrderTooltip({ active, label, info, drivers, visible, focus, simple, lapStatus, surnameOf, podiumSet }: {
  active?: boolean; label?: any; info: Map<string, LapInfo>; drivers: Driver[]; visible: Driver[];
  focus: string | null; simple: boolean; lapStatus: Map<number, EventKind>; surnameOf: (c: string) => string; podiumSet: Set<string>;
}) {
  if (!active || label == null) return null;
  const lap = Number(label);
  const rows = visible.map((d) => ({ d, i: info.get(`${d.code}:${lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99));
  if (!rows.length) return null;
  const focusRead = focus ? plainRead(focus, lap, info) : null;
  const status = lapStatus.get(lap);
  const leader = rows[0];
  const last = rows[rows.length - 1];
  const spread = last.i!.gap != null && leader.i!.position === 1 ? last.i!.gap : null;

  return (
    <div className={cx("overflow-hidden rounded-xl border border-white/10 bg-base-900/97 text-xs shadow-glow backdrop-blur-md", simple ? "w-[15rem]" : "w-[20rem]")}>
      {/* header: lap · neutralisation status · (advanced) leader + spread */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">Lap {lap}</span>
          {status && (
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: `${EVENT[status].color}22`, color: EVENT[status].color }}>
              {(() => { const Ic = EVENT[status].icon; return <Ic size={10} />; })()} {EVENT[status].code}
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">{rows.length} cars</span>
      </div>
      {focus && focusRead && <div className="border-b border-white/[0.06] bg-speed/[0.06] px-3 py-1.5 text-[11px] leading-snug text-ink">{focusRead}</div>}
      {!simple && spread != null && (
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1 text-[10px] text-ink-faint">
          <span>Leader <span className="font-semibold text-ink-muted">{leader.d.code}</span></span>
          <span>Field spread <span className="tabular-nums text-ink-muted">{fmtSec(spread)}</span></span>
        </div>
      )}
      <div className="max-h-[58vh] overflow-y-auto p-1.5">
        {rows.map(({ d, i }) => {
          const isFocus = d.code === focus; const onPod = podiumSet.has(d.code);
          return (
            <div key={d.code} className={cx("flex items-center gap-2 rounded px-1.5 py-[3px] leading-tight",
              isFocus ? "bg-white/[0.08]" : onPod ? "bg-white/[0.02]" : "")}>
              <span className="w-6 text-right text-[11px] tabular-nums text-ink-faint">P{i!.position}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.team_color }} />
              <span className={cx("w-9 shrink-0 text-[11px] font-bold", isFocus ? "text-ink" : "text-ink-muted")}>{d.code}</span>
              {!simple && <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{surnameOf(d.code)}</span>}
              <span className={cx("shrink-0 rounded px-1 text-[10px] font-bold", simple && "ml-auto")} style={{ background: COMPOUND_COLOR[i!.compound], color: "#0b0e16" }}>
                {COMPOUND_SHORT[i!.compound]}{!simple && i!.tyre_age != null ? i!.tyre_age : ""}
              </span>
              {!simple && (
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-muted">
                  {i!.position === 1 ? "leader" : i!.interval != null ? `+${fmtSec(i!.interval)}` : fmtSec(i!.gap)}
                </span>
              )}
              {i!.pit_in && <span className="shrink-0 text-[10px] font-bold text-[#a78bfa]">PIT</span>}
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
