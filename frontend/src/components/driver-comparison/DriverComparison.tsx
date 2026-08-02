"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowLeftRight, Gauge, Repeat, Target, Timer, TrendingUp, Trophy, Zap } from "lucide-react";
import { Crown, Flag } from "@/components/ui/MotionIcon";
import { api } from "@/lib/api";
import type { RaceBundle } from "@/lib/types";
import {
  COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_MISSING_HINT, COMPOUND_SHORT, compoundKnown,
} from "@/lib/compounds";
import { Spinner, ErrorState } from "@/components/ui/misc";
import { InfoTip } from "@/components/ui/InfoTip";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { useGrowIn } from "@/components/ui/Visuals";
import { deriveWindows, EVENT, type Win } from "@/lib/raceEvents";
import {
  CHART_MARGIN, GRID_COLOR, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE,
  axisLine, axisTick,
  SURFACE_COLOR,
} from "@/lib/chartTheme";
import { cx, fmtLap, fmtSec } from "@/lib/format";
import { useLivery } from "@/lib/liveryColor";
import { Select } from "@/components/ui/Select";

/* -------------------------------------------------------------------------- */
/* Compare — a duel, told as a story.                                          */
/*                                                                            */
/* The old page plotted two lines and printed a spreadsheet. This one leads    */
/* with who won and why: a battle chart that shades who is ahead and marks the */
/* moments that decided it, a gap chart phrased in plain language, metric rows */
/* that declare a winner instead of asking you to compare digits, and a        */
/* verdict written like an analyst's closing summary.                          */
/* -------------------------------------------------------------------------- */

export function DriverComparison({
  bundle, year, gp, session, initial,
}: {
  bundle: RaceBundle; year: number; gp: string; session: string; initial: string[];
}) {
  const codes = bundle.session.drivers.map((d) => d.code);
  const ranked = [...bundle.pace].sort((x, y) => (x.pace_rank ?? 99) - (y.pace_rank ?? 99));
  const [a, setA] = useState(initial[0] ?? ranked[0]?.driver ?? codes[0]);
  const [b, setB] = useState(initial[1] ?? ranked[1]?.driver ?? codes[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // liveries are tuned for a dark broadcast graphic; several vanish on white
  const paint = useLivery();
  const drvOf = (c: string) => bundle.session.drivers.find((d) => d.code === c);
  const colorOf = (c: string) => paint(drvOf(c)?.team_color);
  const nameOf = (c: string) => drvOf(c)?.name ?? c;

  useEffect(() => {
    let cancel = false;
    setLoading(true); setErr(null);
    api.compare(year, gp, session, a, b)
      .then((r) => { if (!cancel) setData(r); })
      .catch((e) => { if (!cancel) setErr(e.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [a, b, year, gp, session]);

  const positionData = useMemo(() => {
    const byLap = new Map<number, any>();
    for (const p of bundle.session.positions) {
      if (p.driver !== a && p.driver !== b) continue;
      if (!byLap.has(p.lap)) byLap.set(p.lap, { lap: p.lap });
      byLap.get(p.lap)[p.driver] = p.position;
    }
    return Array.from(byLap.values()).sort((x, y) => x.lap - y.lap);
  }, [bundle, a, b]);

  // the moments that actually decided the duel: every lap the lead between the
  // two changed hands, plus each driver's stops and the neutralisations
  const swings = useMemo(() => {
    const out: { lap: number; leader: string }[] = [];
    let prev: string | null = null;
    for (const row of positionData) {
      const pa = row[a], pb = row[b];
      if (pa == null || pb == null) continue;
      const lead = pa < pb ? a : b;
      if (prev && lead !== prev) out.push({ lap: row.lap, leader: lead });
      prev = lead;
    }
    return out;
  }, [positionData, a, b]);

  const stopsOf = (code: string) =>
    bundle.session.pit_stops.filter((p) => p.driver === code).map((p) => p.lap);
  const windows = useMemo(() => deriveWindows(bundle.session), [bundle.session]);
  // teammate duels are the most interesting comparison and the one the colour
  // scheme can't tell apart on its own — every chart here checks for it
  const sameLivery = colorOf(a).toLowerCase() === colorOf(b).toLowerCase();

  const posAt = (code: string, lap: number) =>
    positionData.find((r) => r.lap === lap)?.[code] ?? null;

  return (
    <div className="space-y-4">
      {/* who's fighting whom — this page frames its own panels, so the section
          title lives here rather than in another card around the whole thing */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-1 text-sm font-semibold text-ink">Driver comparison</h2>
        <DriverSelect value={a} onChange={setA} options={codes} color={colorOf(a)} />
        <ArrowLeftRight size={16} className="text-ink-faint" />
        <DriverSelect value={b} onChange={setB} options={codes} color={colorOf(b)} />
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {err && <ErrorState message={err} />}

      {data && !loading && !("error" in data) && (
        <>
          <HeadToHead bundle={bundle} data={data} a={a} b={b}
            drvOf={drvOf} nameOf={nameOf} colorOf={colorOf} swings={swings} />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ChartCard title="The battle"
              info="Where each car ran, lap by lap. The shaded band shows who was ahead; markers show the laps the lead changed hands and each driver's pit stops.">
              {positionData.length === 0 ? (
                <div className="flex h-[268px] items-center justify-center px-6 text-center text-[12.5px] leading-relaxed text-ink-muted">
                  Position order isn&apos;t tracked in this session — practice and qualifying have no running order.
                </div>
              ) : (
                <>
                  <div className="h-[268px]">
                    <ResponsiveContainer>
                      <LineChart data={positionData} margin={CHART_MARGIN}>
                        <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
                        {/* neutralisations, so a swing under SC reads as one */}
                        {windows.map((w, i) => (
                          <ReferenceArea key={`w${i}`} x1={w.start} x2={w.end}
                            fill={`${EVENT[w.kind].color}1f`} stroke="none" ifOverflow="hidden" />
                        ))}
                        <XAxis dataKey="lap" type="number" domain={[1, bundle.session.total_laps]}
                          tick={axisTick()} tickLine={false} tickMargin={6} height={26}
                          axisLine={axisLine} />
                        {/* padding keeps the P1 line off the top edge — a 2.4px
                            stroke sitting exactly on the boundary is drawn at
                            half weight and reads as a fainter driver */}
                        <YAxis reversed domain={[1, bundle.session.drivers.length]}
                          tick={axisTick()} width={30} tickLine={false}
                          padding={{ top: 6, bottom: 6 }} axisLine={axisLine} />
                        <Tooltip isAnimationActive={false} contentStyle={TOOLTIP_STYLE}
                          labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
                          labelFormatter={(l) => `Lap ${l}`} formatter={(v: any, n: any) => [`P${v}`, n]} />
                        <Line dataKey={a} stroke={colorOf(a)} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
                        {/* teammates share a colour, which made this chart a
                            single indistinguishable line. The second car is
                            dashed whenever the two would otherwise match. */}
                        <Line dataKey={b} stroke={colorOf(b)} strokeWidth={2.4} dot={false}
                          strokeDasharray={sameLivery ? "6 4" : undefined}
                          isAnimationActive={false} connectNulls />
                        {/* lead changes — the turning points of the duel */}
                        {swings.map((s, i) => (
                          <ReferenceLine key={`s${i}`} x={s.lap} stroke={colorOf(s.leader)}
                            strokeOpacity={0.5} strokeDasharray="2 4" ifOverflow="hidden" />
                        ))}
                        {[a, b].flatMap((code) => stopsOf(code).map((lap, i) => {
                          const y = posAt(code, lap);
                          return y == null ? null : (
                            <ReferenceDot key={`${code}p${i}`} x={lap} y={y} r={4}
                              fill={SURFACE_COLOR} stroke={colorOf(code)} strokeWidth={2} ifOverflow="hidden" />
                          );
                        })).filter(Boolean)}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <ChartLegend items={[
                    { swatch: colorOf(a), label: a },
                    { swatch: colorOf(b), label: b, dashedSwatch: sameLivery },
                    { ring: true, label: "Pit stop" }, { dashed: true, label: "Lead change" },
                    ...(windows.length ? [{ band: EVENT[windows[0].kind].color, label: "Neutralised" }] : []),
                  ]} />
                </>
              )}
            </ChartCard>

            <ChartCard title="Pace advantage"
              info="Cumulative lap-time difference over the laps both drivers ran, with pit laps excluded. This is the pure pace picture — who was quicker on track, independent of strategy and track position. The band takes the colour of whoever is quicker overall at that point.">
              <GapChart data={data.lap_delta} a={a} b={b} colorOf={colorOf}
                total={bundle.session.total_laps} windows={windows} sameLivery={sameLivery} />
            </ChartCard>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
            <MetricDuel data={data} a={a} b={b} bundle={bundle} colorOf={colorOf} />
            <Verdict data={data} a={a} b={b} nameOf={nameOf} colorOf={colorOf} />
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- head to head ---------------------------- */
function HeadToHead({ bundle, data, a, b, drvOf, nameOf, colorOf, swings }: any) {
  const ca = data.classification[a], cb = data.classification[b];
  const pa = ca?.position ?? 99, pb = cb?.position ?? 99;
  const winner = pa < pb ? a : b;
  // the cumulative lap-time delta is a PACE measure (pit laps excluded), so it
  // must not be presented as a finishing margin — that comes from the result
  const paceEdge = data.lap_delta?.length
    ? data.lap_delta[data.lap_delta.length - 1].delta as number : null;
  const quicker = paceEdge == null ? null : (paceEdge < 0 ? a : b);
  const Side = ({ code, won }: { code: string; won: boolean }) => (
    <div className={cx("flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-3 transition-colors",
      won ? "bg-white/[0.04]" : "border-white/[0.06] bg-base-850/40")}
      style={won ? { borderColor: `${colorOf(code)}66`, background: `linear-gradient(120deg, ${colorOf(code)}1f, transparent 70%)` } : undefined}>
      <DriverAvatar driver={drvOf(code)} size={44} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-ink">{nameOf(code)}</span>
          {won && <Crown size={14} className="shrink-0 text-amber" />}
        </div>
        <div className="text-xs text-ink-muted">{drvOf(code)?.team}</div>
      </div>
      <span className="ml-auto text-2xl font-extrabold tabular-nums"
        style={{ color: colorOf(code) }}>
        {data.classification[code]?.position ? `P${data.classification[code].position}` : "—"}
      </span>
    </div>
  );
  return (
    <div className="panel p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Side code={a} won={winner === a} />
        {/* "Quicker on track" read as a verdict, and sat a few centimetres from
            a Final verdict that named the other driver — two panels appearing to
            contradict each other. It's a measurement, not a conclusion, so it
            now says which measurement it is and leaves the verdict to the
            verdict (true pace corrects for fuel and tyres; this doesn't). */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-1 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {paceEdge != null ? "Total lap time" : "Head to head"}
          </span>
          <span className="text-sm font-bold tabular-nums text-ink">
            {paceEdge != null && quicker
              ? <><span style={{ color: colorOf(quicker) }}>{quicker}</span> by {Math.abs(paceEdge).toFixed(1)}s</>
              : "vs"}
          </span>
          <span className="text-[11px] text-ink-muted">
            {swings.length > 0
              ? `${swings.length} lead change${swings.length > 1 ? "s" : ""}`
              : "over laps both ran"}
          </span>
        </div>
        <Side code={b} won={winner === b} />
      </div>
    </div>
  );
}

/* --------------------------------- gap chart ----------------------------- */
/**
 * The cumulative delta, made readable. The zero line is "level"; the area is
 * shaded in the colour of whoever is ahead, and the axis is labelled in plain
 * words rather than a signed number the reader has to decode.
 */
function GapChart({ data, a, b, colorOf, total, windows, sameLivery }: any) {
  if (!data?.length) {
    return <div className="flex h-[268px] items-center justify-center px-4 text-center text-[12.5px] text-ink-muted">
      No lap timing available for this pair.
    </div>;
  }
  const rows = data.map((d: any) => ({
    lap: d.lap,
    ahead: d.delta <= 0 ? Math.abs(d.delta) : 0,   // a is ahead
    behind: d.delta > 0 ? d.delta : 0,             // b is ahead
    delta: d.delta,
  }));
  return (
    <>
      <div className="h-[268px]">
        <ResponsiveContainer>
          <AreaChart data={rows} margin={CHART_MARGIN} stackOffset="none">
            <defs>
              <linearGradient id="gapA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorOf(a)} stopOpacity={0.45} />
                <stop offset="100%" stopColor={colorOf(a)} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gapB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorOf(b)} stopOpacity={0.45} />
                <stop offset="100%" stopColor={colorOf(b)} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
            {(windows as Win[]).map((w, i) => (
              <ReferenceArea key={`gw${i}`} x1={w.start} x2={w.end}
                fill={`${EVENT[w.kind].color}18`} stroke="none" ifOverflow="hidden" />
            ))}
            <XAxis dataKey="lap" type="number" domain={[1, total]}
              tick={axisTick()} tickLine={false} tickMargin={6} height={26} axisLine={axisLine} />
            <YAxis tick={axisTick()} width={46} tickFormatter={(v) => `${v}s`}
              tickLine={false} padding={{ top: 6, bottom: 2 }} axisLine={axisLine} />
            <ReferenceLine y={0} stroke="rgb(var(--tint) / 0.28)" />
            <Tooltip isAnimationActive={false} contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
              labelFormatter={(l) => `Lap ${l}`}
              formatter={(_v: any, _n: any, p: any) => {
                const d = p?.payload?.delta ?? 0;
                return d === 0 ? ["level", "Pace"]
                  : [`${Math.abs(d).toFixed(1)}s quicker`, `${d < 0 ? a : b}`];
              }} />
            <Area dataKey="ahead" stroke={colorOf(a)} fill="url(#gapA)" strokeWidth={2} isAnimationActive={false} />
            <Area dataKey="behind" stroke={colorOf(b)} fill="url(#gapB)" strokeWidth={2}
              strokeDasharray={sameLivery ? "6 4" : undefined} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={[
        { swatch: colorOf(a), label: `${a} quicker` },
        { swatch: colorOf(b), label: `${b} quicker`, dashedSwatch: sameLivery },
      ]} />
    </>
  );
}

/* ------------------------------ metric duel ------------------------------ */
type Cmp = { key: string; label: string; icon: any; av: number | null; bv: number | null;
  fmt: (v: number | null) => string; lowerWins?: boolean; group: string };

/**
 * Metrics that declare a winner. Each row shows both values on a shared bar
 * with the better side highlighted, so "who was faster / kinder on tyres /
 * cleaner" is answered by scanning the colour, not by comparing digits.
 */
function MetricDuel({ data, a, b, bundle, colorOf }: any) {
  const pa = bundle.pace.find((p: any) => p.driver === a);
  const pb = bundle.pace.find((p: any) => p.driver === b);
  const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : null);

  const rows: Cmp[] = [
    { key: "finish", label: "Finish", icon: Trophy, group: "Result",
      av: num(data.classification[a]?.position), bv: num(data.classification[b]?.position),
      fmt: (v) => (v == null ? "—" : `P${v}`), lowerWins: true },
    { key: "pacerank", label: "Pace rank", icon: Gauge, group: "Result",
      av: num(pa?.pace_rank), bv: num(pb?.pace_rank),
      fmt: (v) => (v == null ? "—" : `P${v}`), lowerWins: true },
    { key: "clean", label: "Clean-air pace", icon: Zap, group: "Speed",
      av: num(pa?.clean_air_pace), bv: num(pb?.clean_air_pace),
      fmt: (v) => fmtLap(v), lowerWins: true },
    { key: "best", label: "Best lap", icon: Timer, group: "Speed",
      av: num(pa?.best_lap), bv: num(pb?.best_lap), fmt: (v) => fmtLap(v), lowerWins: true },
    { key: "consistency", label: "Consistency", icon: Target, group: "Execution",
      av: num(pa?.consistency_score), bv: num(pb?.consistency_score),
      fmt: (v) => (v == null ? "—" : `${v.toFixed(0)}/100`) },
    { key: "traffic", label: "Laps in traffic", icon: Repeat, group: "Execution",
      av: num(pa?.traffic_laps), bv: num(pb?.traffic_laps),
      fmt: (v) => (v == null ? "—" : String(v)), lowerWins: true },
    { key: "pit", label: "Pit-lane loss", icon: Timer, group: "Strategy",
      av: num(data.pit_loss[a]), bv: num(data.pit_loss[b]),
      fmt: (v) => fmtSec(v), lowerWins: true },
  ];

  const groups = ["Result", "Speed", "Execution", "Strategy"];
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Head-to-head metrics</span>
        <InfoTip text="Each row highlights the driver with the advantage. Bars are relative — a longer bar simply means a bigger share of that metric between the two." />
        <span className="ml-auto flex items-center gap-3 text-[11px] font-bold">
          <span style={{ color: colorOf(a) }}>{a}</span>
          <span style={{ color: colorOf(b) }}>{b}</span>
        </span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {groups.map((g) => {
          const items = rows.filter((r) => r.group === g && (r.av != null || r.bv != null));
          if (!items.length) return null;
          return (
            <div key={g} className="px-4 py-2.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{g}</div>
              <div className="space-y-2">
                {items.map((r) => <MetricRow key={r.key} r={r} a={a} b={b} colorOf={colorOf} />)}
              </div>
            </div>
          );
        })}
        <div className="px-4 py-2.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tyres</div>
          <div className="flex items-center gap-3 text-sm">
            <CompoundSeq seq={data.compound_sequence[a]} />
            <span className="text-[11.5px] text-ink-faint">vs</span>
            <CompoundSeq seq={data.compound_sequence[b]} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ r, a, b, colorOf }: { r: Cmp; a: string; b: string; colorOf: (c: string) => string }) {
  const { av, bv, lowerWins } = r;
  let winner: "a" | "b" | null = null;
  if (av != null && bv != null && av !== bv) winner = (lowerWins ? av < bv : av > bv) ? "a" : "b";
  // share of the bar: for "lower is better" metrics the advantage is inverted
  const total = (av ?? 0) + (bv ?? 0);
  let aPct = total > 0 ? ((lowerWins ? (bv ?? 0) : (av ?? 0)) / total) * 100 : 50;
  aPct = Math.max(12, Math.min(88, aPct));
  const Icon = r.icon;
  const grown = useGrowIn();
  return (
    <div className="group/row flex items-center gap-2.5">
      <span className="flex w-[8.5rem] shrink-0 items-center gap-1.5 text-xs text-ink-muted">
        <Icon size={12} className="shrink-0 text-ink-faint transition-colors duration-200 group-hover/row:text-ink-muted" />
        <span className="truncate">{r.label}</span>
      </span>
      <span className={cx("w-[4.5rem] shrink-0 text-right text-xs tabular-nums",
        winner === "a" ? "font-bold text-ink" : "text-ink-muted")}>{r.fmt(av)}</span>
      <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <span className="draw-in h-full"
          style={{ width: grown ? `${aPct}%` : "50%", background: colorOf(a), opacity: winner === "b" ? 0.35 : 1 }} />
        <span className="h-full flex-1 transition-opacity duration-500"
          style={{ background: colorOf(b), opacity: winner === "a" ? 0.35 : 1 }} />
      </span>
      <span className={cx("w-[4.5rem] shrink-0 text-xs tabular-nums",
        winner === "b" ? "font-bold text-ink" : "text-ink-muted")}>{r.fmt(bv)}</span>
    </div>
  );
}

/* -------------------------------- verdict -------------------------------- */
/** The closing summary: a headline, then the reasoning behind it. */
function Verdict({ data, a, b, nameOf, colorOf }: any) {
  const pts: string[] = data.verdict_points ?? [];
  const bottom = pts.length ? pts[pts.length - 1] : data.verdict;
  const reasons = pts.length ? pts.slice(0, -1) : [];
  const pa = data.classification[a]?.position ?? 99, pb = data.classification[b]?.position ?? 99;
  const winner = pa < pb ? a : b;
  return (
    <div className="panel overflow-hidden p-4"
      style={{ borderColor: `${colorOf(winner)}44`, background: `linear-gradient(140deg, ${colorOf(winner)}1a, transparent 60%)` }}>
      <div className="mb-2 flex items-center gap-1.5">
        <Flag size={13} style={{ color: colorOf(winner) }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Final verdict</span>
      </div>
      <p className="text-base font-semibold leading-snug text-ink">{bottom}</p>
      {reasons.length > 0 && (
        <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.07]">
          {reasons.map((p, i) => {
            // the engine writes these as "Label: sentence" — surface the label
            // as a micro-heading so the eye can scan the reasons, not read them
            const m = /^([^:]{2,22}):\s*(.+)$/.exec(p);
            return (
              <div key={i} className="py-2.5">
                {m && (
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: colorOf(winner) }}>
                    {m[1]}
                  </div>
                )}
                <p className="text-sm leading-relaxed text-ink-muted">{m ? m[2] : p}</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
        Built from this session&apos;s timing, strategy and tyre data — {nameOf(winner)} is the reference.
      </p>
    </div>
  );
}

/* -------------------------------- bits ----------------------------------- */
function ChartLegend({ items }: {
  items: { swatch?: string; ring?: boolean; dashed?: boolean; band?: string;
           dashedSwatch?: boolean; label: string }[];
}) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-muted">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.swatch && (it.dashedSwatch
            ? <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: it.swatch }} />
            : <span className="inline-block h-0.5 w-4 rounded" style={{ background: it.swatch }} />)}
          {it.ring && <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink-muted bg-base-900" />}
          {it.dashed && <span className="inline-block h-0 w-4 border-t-2 border-dashed border-ink-muted" />}
          {it.band && <span className="inline-block h-3 w-4 rounded-sm" style={{ background: `${it.band}33` }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function CompoundSeq({ seq }: { seq: string[] }) {
  if (!seq?.length) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {seq.map((c, i) => {
        const key = c as keyof typeof COMPOUND_COLOR;
        const named = compoundKnown(key);
        return (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mx-0.5 text-[11px] text-ink-faint">›</span>}
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold"
              title={named ? COMPOUND_LABEL[key] : COMPOUND_MISSING_HINT}
              style={named
                ? { background: COMPOUND_COLOR[key], color: "#0b0e16" }
                : { boxShadow: "inset 0 0 0 1px rgb(var(--tint) / .22)", color: "rgb(var(--ink-muted))" }}>
              {named ? COMPOUND_SHORT[key] : "?"}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function DriverSelect({ value, onChange, options, color }: {
  value: string; onChange: (v: string) => void; options: string[]; color: string;
}) {
  // the chip carries the driver's livery into the trigger and into every row,
  // so the two sides of a comparison are told apart before they are read
  return (
    <Select value={value} onChange={onChange} ariaLabel="Driver"
      options={options.map((o) => ({ value: o, label: o, tint: o === value ? color : undefined }))} />
  );
}

function ChartCard({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {title}{info && <InfoTip text={info} />}
      </div>
      {children}
    </div>
  );
}
