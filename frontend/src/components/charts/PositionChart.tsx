"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Users, X, ArrowUpRight, TrendingUp, TrendingDown, Circle, ChevronDown } from "lucide-react";
import type { RaceSession, Driver, StrategySummary, Compound, RaceInsight, DriverPaceSummary } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import {
  EVENT, MOMENT, deriveWindows, lapStatusMap, momentClassOf, rankedUndercuts, undercutStory,
  type EventKind, type MomentClass, type Win,
} from "@/lib/raceEvents";
import { AXIS_TICK_COLOR, CURSOR_COLOR, SURFACE_COLOR, axisLine, axisTick } from "@/lib/chartTheme";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtSec, fmtLap, ordinal } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { DriverPalette } from "./DriverPalette";
import { FocusCardShell, CloseButton, type FocusTile } from "./FocusCardShell";
import { useLivery, useCompoundColour } from "@/lib/liveryColor";

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
const BAND: Record<EventKind, string> = {
  start: "transparent", sc: "rgba(255,158,44,0.15)", vsc: "rgba(255,210,30,0.13)", red: "rgba(255,85,85,0.16)",
};
const BAND_STROKE: Record<EventKind, string> = {
  start: "transparent", sc: "rgba(255,158,44,0.5)", vsc: "rgba(255,210,30,0.5)", red: "rgba(255,85,85,0.55)",
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
interface Moment {
  id: string; lap: number; kind: MomentKind; label: string; insight?: RaceInsight;
  /** Neutralisations span laps; a strategy beat is a single instant. */
  endLap?: number;
  /** What this did to the race — decides the colour and the badge. */
  cls?: MomentClass;
  /** One line stating why this is on a list of the moments that mattered.
   *  Prose — it belongs in the drawer, never on the resting card. */
  outcome?: string;
  /** WHY IT MATTERS, in as few characters as possible: "+2 places", "4 laps
   *  neutralised". Computed from structured fields only — never scraped out of
   *  the sentence above, because a regex over prose is a bug waiting for the
   *  day someone rewords the sentence. Absent when we have no number, which is
   *  better than padding the card with words that don't measure anything. */
  impact?: string;
  /** Extra prose for the drawer, when the moment brings its own. */
  extra?: string[];
}
interface Mover { code: string; d: number; from: number; to: number; }

/** A lap range long enough to be the point of the moment, phrased as one. */
function spanImpact(range?: number[] | null): string | undefined {
  if (!range || range.length < 2) return undefined;
  const span = range[1] - range[0] + 1;
  return span > 1 ? `${span} laps` : undefined;
}

/* A moment's colour is what it DID to the race, never a neutral grey: a beat
   that decided a Grand Prix should not look like chrome. Neutralisations keep
   their learned broadcast colours; everything else is classified. */
/* THE BROADCAST COLOUR IS THE SOURCE, NOT THE OUTPUT.
   A key moment used to be painted with the literal hex from the events table —
   `#00e0c6` for a gain, `#ffd21e` for a VSC — which is correct on a black
   timing screen and close to invisible on paper, and identical to its
   neighbour for a reader with a red-green deficiency. Every read of these goes
   through the same adapter the liveries do: lightness ceiling for the surface,
   safe hue ring for the eye. */
const momentColor = (m: Pick<Moment, "kind" | "cls">) =>
  (m.kind in EVENT ? EVENT[m.kind as EventKind].color : MOMENT[m.cls ?? "read"].color);
const momentIcon = (m: Pick<Moment, "kind" | "cls">) =>
  (m.kind in EVENT ? EVENT[m.kind as EventKind].icon : MOMENT[m.cls ?? "read"].icon);
const momentBadge = (m: Pick<Moment, "kind" | "cls">) =>
  (m.kind in EVENT ? EVENT[m.kind as EventKind].label : MOMENT[m.cls ?? "read"].label);

export function PositionChart({
  session, selected, onSelect, strategy, pace, onDeepDive,
}: {
  session: RaceSession; selected: string[]; onSelect: (codes: string[]) => void;
  strategy?: StrategySummary; pace?: DriverPaceSummary[]; onDeepDive?: (code: string) => void;
}) {
  const simple = useIsSimple();
  const drivers = session.drivers;
  const total = session.total_laps;

  const [preset, setPreset] = useState<Preset>("top5");
  const [hover, setHover] = useState<string | null>(null);
  const [openMoment, setOpenMoment] = useState<string | null>(null);   // moment id, not lap
  const [browserOpen, setBrowserOpen] = useState(false);
  const [pitOverlay, setPitOverlay] = useState(false);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPreset(simple ? "top5" : "all"); setPitOverlay(false); setOpenMoment(null); }, [simple]);

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

  const windows = useMemo(() => deriveWindows(session), [session]);
  const lapStatus = useMemo(() => lapStatusMap(windows), [windows]);

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
    for (const d of drivers) { let li = -1; for (let i = 0; i < rows.length; i++) if (rows[i][d.code] != null) li = i; lastIdx.set(d.code, li); }
    return { data: rows, info, posByLap, orderByLap, lastIdx, retiredSet };
  }, [session, drivers, clsByCode, total]);

  const posAt = (code: string, lap: number) => posByLap.get(lap)?.get(code) ?? null;

  const stats = useMemo(() => {
    const sum: Record<string, number> = {}, cnt: Record<string, number> = {}, led: Record<string, number> = {}, best: Record<string, number> = {};
    for (const [, m] of posByLap) for (const [code, pos] of m) {
      sum[code] = (sum[code] ?? 0) + pos; cnt[code] = (cnt[code] ?? 0) + 1;
      best[code] = Math.min(best[code] ?? 99, pos); if (pos === 1) led[code] = (led[code] ?? 0) + 1;
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

  // Markers for the band + chart: one per neutralisation window. The race start
  // gets no annotation — lap 1 is self-evident, and a permanent START chip only
  // crowded the controls above the plot.
  const markers = useMemo(() => {
    const out: { lap: number; kind: EventKind; cause?: string | null; dur: number }[] = [];
    for (const w of windows) out.push({ lap: w.start, kind: w.kind, cause: w.cause, dur: w.end - w.start + 1 });
    const seen = new Set<string>();
    return out.filter((m) => { const k = `${m.lap}:${m.kind}`; return !seen.has(k) && seen.add(k); }).sort((a, b) => a.lap - b.lap);
  }, [windows]);

  // Key Moments tells the STORY of the race — only events that changed it.
  // Race start / finish are not moments (they're always-present bookends); the
  // panel is reserved for neutralisations and the strategy beats that mattered.
  const moments = useMemo<Moment[]>(() => {
    const out: Omit<Moment, "id">[] = [];
    for (const w of windows) {
      out.push({
        lap: w.start, kind: w.kind, label: EVENT[w.kind].label, endLap: w.end,
        outcome: w.cause ? `Brought out when ${w.cause}.` : EVENT[w.kind].blurb,
        impact: `${w.end - w.start + 1} lap${w.end - w.start ? "s" : ""} neutralised`,
      });
    }
    // Undercuts are read BEFORE the generic insight list, because both can
    // describe the same move and only this one carries `positions_gained`.
    // With the old order an insight claimed the lap first and the card lost the
    // one number that says whether the move was worth making.
    //
    // An undercut marker that says a move happened, without saying what it was
    // worth, is a fact with no reason to be on a list of moments that decided
    // the race — which is exactly why they used to get skimmed past.
    const nameOf = (c: string) => driverByCode[c]?.code ?? c;
    const finishPos = (c: string) => clsByCode[c]?.position ?? null;
    for (const u of rankedUndercuts(strategy, 3)) {
      const lap = u.pit_lap;
      if (lap == null || lap <= 1 || lap >= total) continue;
      if (out.some((m) => Math.abs(m.lap - lap) < 2)) continue;
      const st = undercutStory(u, nameOf, finishPos);
      const g = u.positions_gained ?? 0;
      out.push({ lap, kind: "story", label: st.title, cls: st.cls,
                 outcome: st.outcome, extra: [st.detail],
                 impact: !u.gained ? "no gain"
                   : g > 0 ? `+${g} place${g === 1 ? "" : "s"}` : "track position held" });
    }
    const beats: RaceInsight[] = [...(strategy?.turning_points ?? []), ...(strategy?.insights ?? [])];
    for (const b of beats) {
      const lap = b.lap_range?.[0];
      if (lap != null && lap > 1 && lap < total && !out.some((m) => Math.abs(m.lap - lap) < 2))
        out.push({
          lap, kind: "story", label: b.title, insight: b,
          cls: momentClassOf(b.kind, b.severity),
          outcome: b.detail || undefined,
          impact: spanImpact(b.lap_range),
        });
    }
    const seen = new Set<string>();
    return out.filter((m) => { const k = `${m.lap}:${m.kind}`; return !seen.has(k) && seen.add(k); })
      .sort((a, b) => a.lap - b.lap).slice(0, simple ? 6 : 10)
      // a stable, unique id per moment so same-lap events never share selection
      .map((m, i) => ({ ...m, id: `${m.lap}:${m.kind}:${i}` }));
  }, [windows, strategy, total, simple, driverByCode, clsByCode]);

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
        A.push(pole ? `${nm(pole)} converted pole into the lead.` : "Clean getaway off the line.", upStr, dnStr, "First-lap positions set the strategy landscape for the stint to come.");
      } else if (m.kind === "sc" || m.kind === "vsc" || m.kind === "red") {
        const meta = EVENT[m.kind];
        S.push(`${m.insight?.detail ?? (w?.cause ? `${w.cause}. ` : "")}${meta.blurb}`.trim());
        S.push(leadStr ? `${leadStr}.` : pitStr ? `${pitStr}.` : upStr ? `${upStr}.` : null);
        A.push(`${w?.cause ? w.cause + " — " : ""}${meta.label}${dur ? ` for ${dur} lap${dur === 1 ? "" : "s"}` : ""}.`,
          leadStr ? `${leadStr} as the pack compressed.` : null,
          pitStr ? `${pitStr} — a discounted stop while the field ran slowly.` : "Few took the stop, keeping track position.", upStr, dnStr);
      } else if (m.kind === "story") {
        // `outcome` is NOT repeated here: the drawer renders it as its own lead
        // paragraph, so pushing it into the list too printed the consequence
        // twice, one line under the other.
        S.push(m.outcome ? null : (m.insight?.detail ?? m.label),
               upStr ? `${upStr}.` : dnStr ? `${dnStr}.` : null);
        A.push(m.outcome ? null : (m.insight?.detail ?? m.label),
               ...(m.extra ?? []), m.insight?.explanation ?? null, upStr, dnStr, pitStr);
      } else {
        S.push(win ? `${nm(win)} won from ${nm(p2)} and ${nm(p3)}.` : "The chequered flag falls.");
        A.push(win ? `${nm(win)} took the win ahead of ${nm(p2)} and ${nm(p3)}.` : "Race complete.",
          strategy?.driver_of_the_day ? `Standout drive: ${nm(strategy.driver_of_the_day)}.` : null);
      }
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const clean = (a: (string | null)[]) => a.filter((x): x is string => !!x && x.length > 0).map(cap);
      return { simple: clean(S).slice(0, 2), advanced: clean(A).slice(0, 5), up: up.slice(0, 3), down: down.slice(0, 3) };
    }
    const map = new Map<string, ReturnType<typeof forMoment>>();
    for (const m of moments) map.set(m.id, forMoment(m));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments, drivers, orderByLap, posByLap, windows, session.pit_stops, strategy, finishOrder, clsByCode]);

  const anyFocus = selected.length > 0;
  function focusOnly(code: string) { onSelect([code]); }

  const visible = useMemo(() => {
    const keep = new Set(finishOrder.slice(0, PRESETS.find((p) => p.id === preset)!.keep));
    for (const c of selected) keep.add(c);
    return drivers.filter((d) => keep.has(d.code));
  }, [drivers, finishOrder, preset, selected]);

  /* Two filters can be active at once, and both have to stay visible.
   *
   * Opening a moment used to dim the whole plot surface — the focused driver's
   * line and its halo included — so choosing a driver and then a moment made the
   * driver silently disappear. One selection was overriding the other, and the
   * reader had no way to know two filters were even on.
   *
   * The rule now: a moment dims the CONTEXT, never the selection. A focused
   * driver keeps full strength and its glow whatever else is chosen; only the
   * cars nobody asked about recede further to let the moment's band read. */
  function emphasis(code: string) {
    const isFocus = selected.includes(code);
    // how far the unfocused field recedes while a moment is open
    const ctx = openMoment != null ? 0.45 : 1;
    if (hover === code) return { op: 1, w: simple ? 3.4 : 3, rank: 5, glow: true };
    if (anyFocus) {
      return isFocus
        ? { op: 1, w: 3, rank: 4, glow: true }
        : { op: 0.12 * ctx, w: 1.25, rank: 0, glow: false };
    }
    if (hover) return { op: 0.14 * ctx, w: 1.25, rank: 0, glow: false };
    if (podiumSet.has(code)) return { op: 1 * ctx, w: simple ? 2.6 : 2.2, rank: 3, glow: false };
    return { op: (simple ? 0.36 : 0.5) * ctx, w: 1.5, rank: 1, glow: false };
  }
  const drawOrder = useMemo(() => [...visible].sort((a, b) => emphasis(a.code).rank - emphasis(b.code).rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, selected, hover, podiumSet, simple]);

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

  // liveries are tuned for a dark broadcast graphic; several vanish on white.
  // Declared with the other hooks, above the early return — a hook after one is
  // a hook that runs in some renders and not others.
  const paint = useLivery();

  const yMax = useMemo(() => {
    let mx = 5;
    for (const [, m] of posByLap) for (const [code, pos] of m) if (visible.some((d) => d.code === code)) mx = Math.max(mx, pos);
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
  const pitDots = (() => {
    const out: { code: string; lap: number; pos: number; color: string }[] = [];
    const codes = pitOverlay && !simple ? visible.map((d) => d.code) : focusCode ? [focusCode] : [];
    for (const code of codes) for (const p of session.pit_stops) {
      if (p.driver !== code) continue;
      const pos = posAt(code, p.lap);
      if (pos != null) out.push({ code, lap: p.lap, pos, color: paint(driverByCode[code]?.team_color) });
    }
    return out;
  })();

  /* ONE BUTTON, EVERYTHING RESET.
     There are two kinds of focus on this chart and they were cleared by
     different means: a driver by the Clear focus button, a key moment only by
     pressing that moment again. So a reader who had chosen both — which is the
     normal way to use it — pressed Clear focus, watched half the emphasis go
     away, and had to work out where the rest of it was coming from. Anything
     that dims the plot is focus, and focus is one state. */
  const anyFocusAt = anyFocus || openMoment != null;
  const clearAll = () => { onSelect([]); setOpenMoment(null); };

  return (
    <div className="space-y-5">
      <KeyMoments moments={moments} narratives={narratives} open={openMoment} simple={simple}
        onToggle={(id) => setOpenMoment((cur) => (cur === id ? null : id))} onClose={() => setOpenMoment(null)} driverByCode={driverByCode} />

      {focusCode && driverByCode[focusCode] && (
        <PositionFocusCard driver={driverByCode[focusCode]} stat={stats[focusCode]} pace={paceByCode[focusCode]}
          stints={session.stints.filter((s) => s.driver === focusCode)} posAt={posAt} simple={simple}
          takeaway={takeaway(focusCode)} onClear={clearAll} onDeepDive={onDeepDive} />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:inline">Show</span>
          <Segmented options={PRESETS.map((p) => ({ id: p.id, label: p.label }))} value={preset} onChange={(v) => setPreset(v as Preset)} />
        </div>
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
          {anyFocusAt && (
            <button onClick={clearAll}
              title="Clear the focused driver and the open key moment"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-white/25 hover:text-ink">
              <X size={13} /> Clear focus
            </button>
          )}
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <EventBand markers={markers} lapToX={lapToX} ready={width > 0} simple={simple} total={total} />
        {/* selecting a Key Moment focuses the chart on that beat the same way
            focusing a driver does: the field recedes and the moment, drawn
            crisply on top, dominates */}
        {/* A Safety Car is not an instant — it is a stretch of the race where
            the rules change. Selecting one lights the entire period and breathes
            it, so the user reads a span of laps rather than a single marker. */}
        {(() => {
          const om = openMoment != null ? moments.find((m) => m.id === openMoment) : null;
          if (!om || width === 0) return null;
          const c = paint(momentColor(om));
          const x1 = lapToX(om.lap);
          const spans = om.endLap != null && om.endLap > om.lap;
          const x2 = spans ? lapToX(om.endLap!) : x1;
          const w = Math.max(2, x2 - x1);
          return (
            <div className="pointer-events-none absolute z-20"
              style={{ left: x1, width: spans ? w : 0, top: M.top, bottom: M.bottom + 18 }}>
              {spans && (
                <span className="moment-band absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: w, ["--pulse" as any]: c,
                           background: `linear-gradient(180deg, ${c}33, ${c}1a 60%, ${c}0d)`,
                           boxShadow: `inset 0 0 0 1px ${c}55` }} />
              )}
              <span className="moment-line-overlay absolute inset-y-0 -left-px w-0.5 rounded"
                style={{ background: c, boxShadow: `0 0 12px 0 ${c}` }} />
              {spans && (
                <span className="moment-line-overlay absolute inset-y-0 -right-px w-0.5 rounded"
                  style={{ background: c, boxShadow: `0 0 12px 0 ${c}` }} />
              )}
              <span className="absolute -top-1 h-2 w-2 -translate-x-1/2 rounded-full"
                style={{ left: 0, background: c, boxShadow: `0 0 10px 1px ${c}` }} />
            </div>
          );
        })()}
        {/* dim the PLOT, never the chrome: the opacity used to sit on this
            container, which also holds the Recharts tooltip — so hovering inside
            a selected Safety Car period faded the information card you were
            trying to read. Selected content stays the clearest thing on screen. */}
        {/* No blanket dim on the surface: it faded the focused driver too. The
            recession is per line (see emphasis) so a chosen driver and a chosen
            moment can both be lit at the same time. */}
        <div className={cx("w-full select-none", simple ? "h-[420px]" : "h-[440px]")}>
          <ResponsiveContainer>
            <LineChart data={data} margin={M}>
              {!simple && <CartesianGrid stroke="rgb(var(--tint) / 0.06)" strokeDasharray="1 6" vertical={false} />}
              {windows.map((w, i) => (
                <ReferenceArea key={`b${i}`} x1={w.start} x2={w.end} y1={1} y2={yMax}
                  fill={BAND[w.kind]} stroke={BAND_STROKE[w.kind]} strokeWidth={1} ifOverflow="hidden" />
              ))}
              {markers.map((m, i) => (
                <ReferenceLine key={`e${i}`} x={m.lap} stroke={EVENT[m.kind].color}
                  strokeOpacity={m.kind === "start" ? 0.3 : 0.42} strokeDasharray="2 5" ifOverflow="extendDomain" />
              ))}
              {(() => {
                const om = openMoment != null ? moments.find((m) => m.id === openMoment) : null;
                return om ? (
                  <ReferenceLine x={om.lap} stroke={paint(momentColor(om))} strokeOpacity={0.9} strokeWidth={1.8}
                    className="moment-line" ifOverflow="extendDomain" />
                ) : null;
              })()}
              <XAxis dataKey="lap" type="number" domain={[1, total]} allowDecimals={false}
                tick={axisTick(simple ? 12 : 11)} tickLine={false} tickMargin={8}
                axisLine={axisLine}
                label={{ value: "Lap", position: "insideBottom", offset: -14, fill: AXIS_TICK_COLOR, fontSize: 11 }} />
              {/* padding stops P1 and the last classified car being drawn on the
                  plot boundary, where half the stroke falls outside the surface */}
              <YAxis type="number" reversed domain={[1, yMax]} interval={0}
                ticks={Array.from({ length: yMax }, (_, i) => i + 1)}
                tick={axisTick(simple ? 12 : 11)} tickLine={false} tickMargin={6}
                padding={{ top: 5, bottom: 5 }}
                width={Y_AXIS_W} axisLine={axisLine}
                label={{ value: "Position", angle: -90, position: "insideLeft", offset: 4, fill: AXIS_TICK_COLOR, fontSize: 11 }} />
              <Tooltip isAnimationActive={false} allowEscapeViewBox={{ x: false, y: false }}
                cursor={{ stroke: CURSOR_COLOR, strokeWidth: 1 }} wrapperStyle={{ zIndex: 30, outline: "none" }}
                content={(p: any) => (
                  <OrderTooltip active={p.active} label={p.label} info={info} drivers={drivers} visible={visible}
                    focus={focusCode} simple={simple} lapStatus={lapStatus} surnameOf={surname} podiumSet={podiumSet}
                    driverByCode={driverByCode} />
                )} />
              {drawOrder.filter((d) => emphasis(d.code).glow).map((d) => (
                <Line key={`${d.code}-glow`} dataKey={d.code} type="monotone" className="focus-halo" stroke={paint(d.team_color)}
                  strokeWidth={emphasis(d.code).w + 7} strokeOpacity={0.16} dot={false} connectNulls isAnimationActive={false} legendType="none" />
              ))}
              {drawOrder.map((d) => {
                const em = emphasis(d.code);
                const canLabel = !retiredSet.has(d.code) && em.rank >= 1;
                return (
                  <Line key={d.code} dataKey={d.code} type="monotone" className="pos-line"
                    stroke={paint(d.team_color)} strokeWidth={em.w} strokeOpacity={em.op} dot={false} connectNulls isAnimationActive={false}
                    onClick={() => focusOnly(d.code)} style={{ cursor: "pointer" }}
                    label={(props: any) =>
                      canLabel && props.index === lastIdx.get(d.code)
                        ? <EdgeLabel x={props.x} y={props.y} code={d.code} color={paint(d.team_color)} op={em.op} onClick={() => focusOnly(d.code)} />
                        : <g />} />
                );
              })}
              {/* pit markers follow the same emphasis rule as the lines: when a
                  driver is focused, only their stops stay bright and breathing;
                  everyone else's fade back with their line */}
              {pitDots.map((p, i) => {
                const dim = anyFocus && !selected.includes(p.code);
                return (
                  <ReferenceDot key={`pd${i}`} x={p.lap} y={p.pos} ifOverflow="hidden"
                    shape={(props: any) => (
                      <circle className={dim ? undefined : "pit-dot"} cx={props.cx} cy={props.cy}
                        r={dim ? 3 : 3.6} fill={SURFACE_COLOR} stroke={p.color} strokeWidth={2}
                        opacity={dim ? 0.16 : 1} />
                    )} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <UnifiedLegend simple={simple} windows={windows} hasFocus={anyFocus} pitOverlay={pitOverlay} />

      <DriverPalette open={browserOpen} onClose={() => setBrowserOpen(false)}
        drivers={drivers} finishOrder={finishOrder} focused={selected} onFocus={focusOnly} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Key Moments                                                                */
/* -------------------------------------------------------------------------- */
function KeyMoments({ moments, narratives, open, simple, onToggle, onClose, driverByCode }: {
  moments: Moment[]; narratives: Map<string, { simple: string[]; advanced: string[]; up: Mover[]; down: Mover[] }>;
  open: string | null; simple: boolean; onToggle: (id: string) => void; onClose: () => void; driverByCode: Record<string, Driver>;
}) {
  const paint = useLivery();
  const openM = open != null ? moments.find((m) => m.id === open) : null;
  const text = open != null ? narratives.get(open) : null;
  const lines = text ? (simple ? text.simple : text.advanced) : [];
  if (!moments.length) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-base-900/40">
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Key moments</span>
        <span className="text-[12px] text-ink-faint">
          · {simple ? "tap a beat for the story" : "tap a beat for the analysis"}
        </span>
      </div>
      {/* flex-wrap (not a scroll container) so a hover/selected card is never
          clipped along the top edge; padding gives the elevation room */}
      <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1">
        {moments.map((m) => {
          const on = open === m.id; const c = paint(momentColor(m)); const Icon = momentIcon(m);
          return (
            // The selected state always wins. Hover may only *reinforce* it —
            // never dim it, never move it — so exploring the chart can't make
            // the thing you deliberately chose look less chosen than its
            // neighbours.
            //
            // Three lines, in the order a reader needs them: WHAT KIND of
            // moment (colour + badge), WHAT happened (the headline), and WHY
            // IT MATTERED (the consequence). The third line is the one that
            // turns a marker into something worth opening.
            <button key={m.id} onClick={() => onToggle(m.id)} aria-expanded={on}
              className={cx("group relative flex min-w-[248px] flex-1 basis-[248px] items-start gap-3 overflow-hidden rounded-xl border p-3 text-left",
                "transition-all duration-200 ease-out",
                on ? "accent-breathing -translate-y-0.5 bg-white/[0.09] hover:bg-white/[0.12]"
                   : "bg-white/[0.02] hover:-translate-y-0.5 hover:bg-white/[0.05] hover:[box-shadow:0_0_0_1.5px_var(--mc),0_12px_26px_-10px_var(--shadow-strong)]")}
              style={{ ["--mc" as any]: c, borderColor: on ? c : `${c}55`, ...(on ? { ["--pulse" as any]: `${c}66` } : {}) }}>
              {/* a wash of the moment's own colour, so the card is tinted by
                  what it is rather than relying on one small glyph */}
              <span aria-hidden className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `radial-gradient(120% 100% at 0% 0%, ${c}1a, transparent 62%)` }} />
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-transform duration-300 ease-out group-hover:scale-110"
                style={{ background: `${c}22`, color: c, boxShadow: `inset 0 0 0 1.5px ${c}${on ? "88" : "3a"}` }}>
                <Icon size={16} />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: c }}>
                  <span className="tabular-nums">
                    {m.endLap != null && m.endLap > m.lap ? `Laps ${m.lap}–${m.endLap}` : `Lap ${m.lap}`}
                  </span>
                  <span className="opacity-45">·</span>
                  <span className="truncate opacity-90">{momentBadge(m)}</span>
                </span>
                <span className={cx("mt-0.5 block text-[13.5px] font-semibold leading-tight",
                  on ? "text-ink" : "text-ink-muted group-hover:text-ink")}>
                  {m.label}
                </span>
                {/* WHY IT MATTERS, as a measurement rather than a sentence.
                    This line used to carry two clamped lines of prose, so a
                    row of moments was a wall of half-finished paragraphs and
                    the reader had to actually read all of it before deciding
                    what to open. The explanation is still there — it opens
                    with the drawer, which is what the chevron is promising. */}
                {m.impact && (
                  <span className="mt-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ background: `${c}1f`, color: c }}>
                    {m.impact}
                  </span>
                )}
              </span>
              <ChevronDown size={14}
                className={cx("relative mt-0.5 shrink-0 text-ink-faint transition-all duration-300 ease-out group-hover:text-ink",
                  on && "rotate-180 text-ink")} />
            </button>
          );
        })}
      </div>
      {openM && (
        <div className="animate-fade-in border-t p-4" style={{ borderTopColor: "rgb(var(--tint) / 0.06)" }}>
          <div className="mb-2.5 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${paint(momentColor(openM))}1f`, boxShadow: `inset 0 0 0 1.5px ${paint(momentColor(openM))}66` }}>
              {(() => { const Ic = momentIcon(openM); return <Ic size={18} style={{ color: paint(momentColor(openM)) }} />; })()}
            </span>
            <div className="min-w-0 flex-1">
              <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                style={{ background: `${paint(momentColor(openM))}22`, color: paint(momentColor(openM)) }}>
                {openM.endLap != null && openM.endLap > openM.lap
                  ? `LAPS ${openM.lap}–${openM.endLap}` : `LAP ${openM.lap}`}
              </span>
              <div className="mt-0.5 text-base font-bold text-ink">{openM.label}</div>
              {openM.endLap != null && openM.endLap > openM.lap && (
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
                  {openM.endLap - openM.lap + 1} laps neutralised — the highlighted band on the chart
                  is the whole period, not the moment it started.
                </div>
              )}
            </div>
            <CloseButton onClick={onClose} label="Collapse moment" />
          </div>
          {/* the consequence, in words, leads the drawer — it is what the
              reader opened the card to get */}
          {openM.outcome && (
            <p className="mb-2.5 text-[13.5px] font-medium leading-relaxed text-ink">
              {openM.outcome}
            </p>
          )}
          <ul className={cx("space-y-1.5", simple ? "text-[15px] leading-relaxed text-ink" : "text-sm leading-relaxed text-ink-muted")}>
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2">{!simple && <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />}<span>{l}</span></li>
            ))}
            {lines.length === 0 && <li className="text-ink-faint">Positions held steady through this phase.</li>}
          </ul>
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
      <Icon size={11} /><span className="h-1.5 w-1.5 rounded-full" style={{ background: driver?.team_color ?? "#888" }} />
      <span className="text-ink">{mv.code}</span><span className="tabular-nums">{up ? `+${mv.d}` : mv.d}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Position focus card (uses the shared shell)                                */
/* -------------------------------------------------------------------------- */
function PositionFocusCard({ driver, stat, pace, stints, posAt, simple, takeaway, onClear, onDeepDive }: {
  driver: Driver; stat?: DriverStat; pace?: DriverPaceSummary; stints: RaceSession["stints"];
  posAt: (c: string, l: number) => number | null; simple: boolean; takeaway: string;
  onClear: () => void; onDeepDive?: (code: string) => void;
}) {
  const compoundHue = useCompoundColour();
  if (!stat) return null;
  const net = stat.net;
  const tiles: FocusTile[] = [
    { label: "Started", value: stat.grid != null ? `P${stat.grid}` : "—" },
    { label: "Finished", value: stat.dnf ? "DNF" : stat.finish != null ? `P${stat.finish}` : "—", tone: stat.dnf ? "bad" : undefined },
    { label: "Gain / loss", value: net == null ? "—" : net > 0 ? `+${net}` : net < 0 ? `${net}` : "0", tone: net == null || net === 0 ? undefined : net > 0 ? "good" : "bad" },
    { label: "Overtakes", value: String(stat.overtakes) },
  ];
  if (!simple) tiles.push({ label: "Highest", value: stat.best != null ? `P${stat.best}` : "—" });
  const secondary = !simple ? [
    { label: "Avg running", value: stat.avgPos != null ? `P${stat.avgPos.toFixed(1)}` : "—" },
    { label: "Clean-air pace", value: pace?.clean_air_pace != null ? fmtLap(pace.clean_air_pace) : "—" },
    { label: "Pit loss", value: pace?.total_pit_loss != null ? fmtSec(pace.total_pit_loss) : "—" },
    { label: "Pit stops", value: String(stat.pits) },
    { label: "Pace rank", value: pace?.pace_rank != null ? `P${pace.pace_rank}` : "—" },
  ] : [];
  return (
    <FocusCardShell driver={driver} tiles={tiles} takeaway={takeaway} big={simple} onClear={onClear} onDeepDive={onDeepDive}>
      {simple ? (
        stat.compounds.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</span>
            {stat.compounds.map((c, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: compoundHue(c), color: "#0b0e16" }}>{COMPOUND_LABEL[c]}</span>
            ))}
          </div>
        )
      ) : (
        <div className="mt-3 space-y-3">
          {secondary.some((s) => s.value !== "—") && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-white/[0.06] pt-3">
              {secondary.map((s) => (
                <div key={s.label}><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{s.label}</span>
                  <div className="text-sm font-semibold tabular-nums text-ink">{s.value}</div></div>
              ))}
            </div>
          )}
          {stints.length > 0 && <StintTimeline stints={stints} code={driver.code} posAt={posAt} />}
        </div>
      )}
    </FocusCardShell>
  );
}

function StintTimeline({ stints, code, posAt }: { stints: RaceSession["stints"]; code: string; posAt: (c: string, l: number) => number | null }) {
  const compoundHue = useCompoundColour();
  const ordered = [...stints].sort((a, b) => a.start_lap - b.start_lap);
  return (
    <div className="border-t border-white/[0.06] pt-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stints · position by stint</div>
      <div className="flex gap-1">
        {ordered.map((s, i) => {
          const laps = s.end_lap - s.start_lap + 1;
          const pStart = posAt(code, s.start_lap), pEnd = posAt(code, s.end_lap);
          return (
            <div key={i} className="min-w-0 rounded-md px-2 py-1.5 text-center" style={{ flexGrow: laps, background: `${compoundHue(s.compound)}22`, boxShadow: `inset 0 -2px 0 0 ${compoundHue(s.compound)}` }}
              title={`${COMPOUND_LABEL[s.compound]} · laps ${s.start_lap}-${s.end_lap}`}>
              <div className="text-[11px] font-bold" style={{ color: compoundHue(s.compound) }}>{COMPOUND_SHORT[s.compound]} · {laps}L</div>
              {pStart != null && pEnd != null && <div className="text-[11px] tabular-nums text-ink-muted">P{pStart}→P{pEnd}</div>}
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

// Editorial event markers above the plot. Same-lap events (e.g. START + SC on
// lap 1) stack vertically in one column so their labels never collide; columns
// that fall close together are staggered so those don't collide either.
function EventBand({ markers, lapToX, ready, simple, total }: {
  markers: { lap: number; kind: EventKind; cause?: string | null; dur: number }[]; lapToX: (lap: number) => number; ready: boolean; simple: boolean; total: number;
}) {
  const byLap = new Map<number, typeof markers>();
  for (const m of markers) (byLap.get(m.lap) ?? byLap.set(m.lap, []).get(m.lap)!).push(m);
  const groups = [...byLap.entries()].sort((a, b) => a[0] - b[0]);
  let lastLap = -99, lastRow = 1;
  const withRow = groups.map(([lap, ms]) => {
    const near = lap - lastLap < total * 0.06;
    const row = near ? 1 - lastRow : 0;
    lastLap = lap; lastRow = row;
    return { lap, ms, row };
  });
  return (
    <div className={cx("relative mb-1 transition-opacity", ready ? "opacity-100" : "opacity-0")} style={{ height: simple ? 62 : 56 }}>
      {withRow.map(({ lap, ms, row }) => (
        <div key={lap} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: Math.max(30, lapToX(lap)), paddingBottom: row === 1 ? 0 : 22 }}>
          <div className="flex flex-col items-center gap-0.5">
            {ms.map((m, i) => {
              const meta = EVENT[m.kind]; const Icon = meta.icon;
              return (
                <span key={i} className="group/mk relative">
                  <span className={cx("flex cursor-default items-center gap-1 rounded-full border font-bold", simple ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[11px]")}
                    style={{ borderColor: meta.color, color: meta.color, background: `${meta.color}1a` }}>
                    <Icon size={simple ? 13 : 11} /> {meta.code}
                  </span>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-base-900 p-2.5 text-left opacity-0 shadow-glow transition-opacity group-hover/mk:opacity-100">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Icon size={12} style={{ color: meta.color }} /> {meta.label}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">Lap {m.lap}{m.dur ? ` · ${m.dur} lap${m.dur === 1 ? "" : "s"}` : ""}</div>
                    {m.cause && <div className="mt-1 text-[11px] text-ink-muted">{m.cause}</div>}
                    <div className="mt-1 text-[11px] leading-snug text-ink-muted">{meta.blurb}</div>
                  </div>
                </span>
              );
            })}
          </div>
          <span className="mt-0.5 text-[11px] tabular-nums text-ink-faint">L{lap}</span>
          <span className="mt-0.5 w-px flex-1" style={{ background: ms[0] ? EVENT[ms[0].kind].color : "#888", opacity: 0.55 }} />
        </div>
      ))}
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

function UnifiedLegend({ simple, windows, hasFocus, pitOverlay }: { simple: boolean; windows: Win[]; hasFocus: boolean; pitOverlay: boolean }) {
  const kinds = Array.from(new Set(windows.map((w) => w.kind)));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.05] bg-base-900/30 px-4 py-2.5 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 rounded" style={{ background: "#8892a6" }} /> Driver · constructor colour, code at the right</span>
      {kinds.map((k) => { const meta = EVENT[k]; const Icon = meta.icon; return <span key={k} className="inline-flex items-center gap-1.5"><Icon size={12} style={{ color: meta.color }} /> {meta.label}</span>; })}
      {(hasFocus || pitOverlay) && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-muted bg-base-900" /> Pit stop</span>}
      <span className="ml-auto hidden text-ink-faint sm:inline">
        {hasFocus ? "Hover the chart for the running order at any lap." : simple ? "Click any line to follow that driver." : "Click a line to focus · hover for gaps & tyres · toggle Pit stops."}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hover — labelled, aligned, with the focused driver clearly picked out       */
/* -------------------------------------------------------------------------- */
function OrderTooltip({ active, label, info, drivers, visible, focus, simple, lapStatus, surnameOf, podiumSet, driverByCode }: {
  active?: boolean; label?: any; info: Map<string, LapInfo>; drivers: Driver[]; visible: Driver[];
  focus: string | null; simple: boolean; lapStatus: Map<number, EventKind>; surnameOf: (c: string) => string;
  podiumSet: Set<string>; driverByCode: Record<string, Driver>;
}) {
  const paint = useLivery();
  const compoundHue = useCompoundColour();
  if (!active || label == null) return null;
  const lap = Number(label);
  const rows = visible.map((d) => ({ d, i: info.get(`${d.code}:${lap}`) }))
    .filter((r) => r.i && r.i.position != null)
    .sort((a, b) => (a.i!.position ?? 99) - (b.i!.position ?? 99));
  if (!rows.length) return null;
  const status = lapStatus.get(lap);
  const focusRead = focus ? plainRead(focus, lap, info) : null;
  const leader = rows[0], last = rows[rows.length - 1];
  const spread = last.i!.gap != null && leader.i!.position === 1 ? last.i!.gap : null;
  // grid: pos · dot · [code ·] name · tyre · [gap] — fixed columns keep pit rows aligned
  const grid = simple ? "grid grid-cols-[1.5rem_0.55rem_1fr_2.9rem] items-center gap-x-2"
    : "grid grid-cols-[1.5rem_0.55rem_2.1rem_1fr_2.9rem_3.4rem] items-center gap-x-1.5";

  // under SC/VSC/red the ENTIRE card softly pulses in the event colour, so a
  // neutralised lap is unmistakable without hunting for the badge
  const sc = status ? EVENT[status] : null;
  return (
    <div className={cx("overflow-hidden rounded-xl border bg-base-900 text-xs",
        sc ? "tip-breathing" : "border-white/10 shadow-glow", simple ? "w-[17rem]" : "w-[21rem]")}
      style={sc ? { borderColor: `${sc.color}80`, ["--pulse" as any]: sc.color } : undefined}>
      <div className={cx("flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2")}
        style={sc ? { background: `${sc.color}18` } : undefined}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Lap</span>
          <span className="text-sm font-bold text-ink">{lap}</span>
          {sc && (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold"
              style={{ background: sc.color, color: "#0b0e16" }}>
              {(() => { const Ic = sc.icon; return <Ic size={11} />; })()} {sc.code}
            </span>
          )}
        </div>
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">{rows.length} cars</span>
      </div>
      {focus && focusRead && <div className="border-b border-white/[0.06] bg-speed/[0.06] px-3 py-1.5 text-[11px] leading-snug text-ink">{focusRead}</div>}
      {!simple && spread != null && (
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1 text-[11px] text-ink-faint">
          <span>Leader <span className="font-semibold text-ink-muted">{leader.d.code}</span></span>
          <span>Field spread <span className="tabular-nums text-ink-muted">{fmtSec(spread)}</span></span>
        </div>
      )}
      {/* column labels — so "M8" reads as compound + age, not a mystery code */}
      <div className={cx(grid, "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint")}>
        <span className="text-right">Pos</span><span /><span>{simple ? "Driver" : "Code"}</span>
        {!simple && <span>Driver</span>}<span>Tyre·age</span>{!simple && <span className="text-right">Gap</span>}
      </div>
      <div className="modal-scroll max-h-[54vh] px-1.5 pb-1.5">
        {rows.map(({ d, i }) => {
          const isFocus = d.code === focus; const onPod = podiumSet.has(d.code); const tc = paint(d.team_color);
          return (
            <div key={d.code} className={cx(grid, "rounded px-1.5 py-[3px] leading-tight", onPod && !isFocus && "bg-white/[0.02]")}
              style={isFocus ? { background: `${tc}22`, boxShadow: `inset 3px 0 0 0 ${tc}` } : undefined}>
              <span className={cx("text-right text-[11px] tabular-nums", isFocus ? "font-bold text-ink" : "text-ink-faint")}>P{i!.position}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tc }} />
              {simple ? (
                <span className={cx("truncate text-[12px]", isFocus ? "font-bold text-ink" : "font-medium text-ink-muted")}>{surnameOf(d.code)}</span>
              ) : (
                <>
                  <span className={cx("text-[11px] font-bold", isFocus ? "text-ink" : "text-ink-muted")}>{d.code}</span>
                  <span className={cx("min-w-0 truncate text-[11px]", isFocus ? "text-ink" : "text-ink-faint")}>{surnameOf(d.code)}</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <span className="rounded px-1 text-[11px] font-bold" style={{ background: compoundHue(i!.compound), color: "#0b0e16" }}>{COMPOUND_SHORT[i!.compound]}</span>
                {i!.tyre_age != null && <span className="text-[11px] tabular-nums text-ink-faint">{i!.tyre_age}</span>}
              </span>
              {!simple && (
                <span className="text-right text-[11px] tabular-nums">
                  {i!.pit_in ? <span className="font-bold text-[rgb(var(--best))]">PIT</span>
                    : <span className="text-ink-muted">{i!.position === 1 ? "leader" : i!.interval != null ? `+${fmtSec(i!.interval)}` : fmtSec(i!.gap)}</span>}
                </span>
              )}
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
