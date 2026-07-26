"use client";
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Building2, User } from "lucide-react";
import type { ClassificationRow, DriverPaceSummary, RaceSession } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { DriverBadge } from "@/components/ui/DriverBadge";
import { PaceBoard } from "./PaceBoard";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtLap } from "@/lib/format";

type PaceView = "drivers" | "teams";

// Which section a driver belongs in, from the official classification only.
type PaceGroup = "finisher" | "dnf" | "dns" | "dsq";
function statusGroupOf(c?: ClassificationRow): PaceGroup {
  const st = (c?.status ?? "").toLowerCase();
  if (/disqualif|dsq|excluded/.test(st)) return "dsq";
  if (/did not start|dns|withdrawn/.test(st)) return "dns";
  if (c?.retired || /\bdnf\b|retired/.test(st)) return "dnf";
  return "finisher";
}

interface TeamPace {
  team: string;
  color: string;
  avg: number;                    // mean clean-air pace of the team's cars
  gap: number;                    // to the fastest team
  drivers: DriverPaceSummary[];   // sorted fastest first
  bestLap: number | null;
}

export function PaceAnalysis({
  session, pace, selected,
}: { session: RaceSession; pace: DriverPaceSummary[]; selected: string[] }) {
  const simple = useIsSimple();
  const [view, setView] = useState<PaceView>("drivers");
  const ranked = useMemo(
    // Drivers whose pace couldn't be evaluated (retired / DSQ / DNS) always sort
    // to the bottom — whether or not they set a time before stopping — so the
    // ranked field reads top-to-bottom by real, comparable pace. Within each
    // group, order by pace rank.
    () => [...pace].sort((a, b) => {
      const ga = a.pace_evaluated === false ? 1 : 0;
      const gb = b.pace_evaluated === false ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return (a.pace_rank ?? 999) - (b.pace_rank ?? 999);
    }),
    [pace],
  );
  const classByDriver = useMemo(() => {
    const m = new Map<string, ClassificationRow>();
    for (const c of session.classification) m.set(c.driver, c);
    return m;
  }, [session]);

  // Advanced-table grouping: classified finishers first (ordered by pace,
  // exactly as today), then a Retired (DNF) section, then DNS / DSQ if present.
  // This changes ONLY the grouping/ordering shown — never how pace is computed
  // or ranked. Finishers keep their raw pace_rank; the DNF section is ordered by
  // laps completed (most first) as required.
  const sections = useMemo(() => {
    const finishers: DriverPaceSummary[] = [];
    const dnf: DriverPaceSummary[] = [];
    const dns: DriverPaceSummary[] = [];
    const dsq: DriverPaceSummary[] = [];
    for (const p of pace) {
      const g = statusGroupOf(classByDriver.get(p.driver));
      (g === "dsq" ? dsq : g === "dns" ? dns : g === "dnf" ? dnf : finishers).push(p);
    }
    const laps = (p: DriverPaceSummary) => classByDriver.get(p.driver)?.laps_completed ?? -1;
    // finishers: by pace rank (unchanged, stable)
    finishers.sort((a, b) => (a.pace_rank ?? 999) - (b.pace_rank ?? 999));
    // DNF / DSQ: most laps completed first, pace rank as a stable tiebreak
    const byLaps = (a: DriverPaceSummary, b: DriverPaceSummary) =>
      (laps(b) - laps(a)) || (a.pace_rank ?? 999) - (b.pace_rank ?? 999);
    dnf.sort(byLaps);
    dsq.sort(byLaps);
    // DNS ran nothing — order by grid so it's at least deterministic
    dns.sort((a, b) =>
      (classByDriver.get(a.driver)?.grid ?? 99) - (classByDriver.get(b.driver)?.grid ?? 99));
    return { finishers, dnf, dns, dsq };
  }, [pace, classByDriver]);

  // which drivers to plot: highlighted set, else top 5 on pace
  const plot = selected.length ? selected : ranked.slice(0, 5).map((p) => p.driver);
  const plotKey = plot.join(",");
  const colorFor = (code: string) => session.drivers.find((d) => d.code === code)?.team_color ?? "#888";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { data, yDomain } = useMemo(() => {
    const byLap = new Map<number, any>();
    let lo = Infinity, hi = -Infinity;
    for (const lp of session.laps) {
      if (!plot.includes(lp.driver) || !lp.lap_time || lp.is_outlier) continue;
      if (!byLap.has(lp.lap)) byLap.set(lp.lap, { lap: lp.lap });
      byLap.get(lp.lap)[lp.driver] = lp.lap_time;
      lo = Math.min(lo, lp.lap_time); hi = Math.max(hi, lp.lap_time);
    }
    const arr = Array.from(byLap.values()).sort((a, b) => a.lap - b.lap);
    const pad = (hi - lo) * 0.1 || 1;
    return { data: arr, yDomain: [lo - pad, hi + pad] as [number, number] };
  }, [session, plotKey]);

  // constructor pace: average of each team's cars, in official team colours
  const teams: TeamPace[] = useMemo(() => {
    const m = new Map<string, { team: string; color: string; drivers: DriverPaceSummary[] }>();
    for (const p of pace) {
      if (p.clean_air_pace == null) continue;
      if (!m.has(p.team)) m.set(p.team, { team: p.team, color: p.team_color, drivers: [] });
      m.get(p.team)!.drivers.push(p);
    }
    const rows = [...m.values()].map((t) => {
      const drivers = [...t.drivers].sort(
        (a, b) => (a.clean_air_pace ?? 9e9) - (b.clean_air_pace ?? 9e9));
      return {
        team: t.team, color: t.color, drivers,
        avg: drivers.reduce((s, d) => s + (d.clean_air_pace ?? 0), 0) / drivers.length,
        bestLap: drivers.reduce<number | null>(
          (best, d) => (d.best_lap != null && (best == null || d.best_lap < best)) ? d.best_lap : best, null),
        gap: 0,
      };
    }).sort((a, b) => a.avg - b.avg);
    return rows.map((r) => ({ ...r, gap: r.avg - (rows[0]?.avg ?? r.avg) }));
  }, [pace]);

  const viewSwitch = (
    <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs"
      role="tablist" aria-label="Pace view">
      {([["drivers", "Drivers", User], ["teams", "Constructors", Building2]] as const).map(([id, label, Icon]) => (
        <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
          className={cx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
            view === id
              ? "bg-accent/15 text-accent-soft ring-1 ring-accent/25"
              : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  );

  // ---- SIMPLE: one pace board, identical to Practice and Qualifying ----
  if (simple) {
    const withPace = ranked.filter((p) => p.clean_air_pace != null);
    const fastest = withPace[0];
    const fastestTeam = teams[0];
    const mismatch = fastest && fastest.finish && fastest.pace_rank && fastest.finish > fastest.pace_rank;
    return (
      <PaceBoard
        title="Pace analysis"
        views={[
          {
            id: "drivers", label: "Drivers", icon: <User size={12} />,
            heroLabel: "Fastest car",
            measures: "True one-lap speed, corrected for fuel and tyres.",
            info: "Each driver's true one-lap speed, fuel- and tyre-corrected. Bars show the gap to the fastest car.",
            heroNote: fastest ? (
              <>
                {fastest.name} had the quickest <Term>clean-air pace</Term> — the truest measure of
                speed once fuel and tyres are evened out.
                {mismatch ? ` Despite that they only finished P${fastest.finish}.`
                  : fastest.finish === 1 ? " And they converted it into the win." : ""}
              </>
            ) : undefined,
            entries: withPace.slice(0, 12).map((p) => ({
              key: p.driver, name: p.name ?? p.driver, sub: p.team, color: p.team_color,
              driver: session.drivers.find((d) => d.code === p.driver) ?? null,
              value: fmtLap(p.clean_air_pace),
              gap: (p.clean_air_pace ?? 0) - (fastest?.clean_air_pace ?? 0),
            })),
            formatGap: (g) => `+${g.toFixed(2)}s`,
            emptyTitle: "No comparable pace",
            emptyHint: "Too few clean green-flag laps to rank true pace in this session.",
          },
          {
            id: "constructors", label: "Constructors", icon: <Building2 size={12} />,
            heroLabel: "Fastest constructor",
            measures: "The average true pace of each constructor's two cars.",
            info: "Constructors ranked by the average true pace of their cars. Bars show the gap to the fastest constructor.",
            heroNote: fastestTeam ? (
              <>
                Quickest average true pace across their cars
                ({fastestTeam.drivers.map((d) => d.driver).join(" & ")})
                {teams[1] ? ` — ${teams[1].gap.toFixed(2)}s per lap ahead of ${teams[1].team}.` : "."}
              </>
            ) : undefined,
            entries: teams.map((t) => ({
              key: t.team, name: t.team, color: t.color,
              value: fmtLap(t.avg), gap: t.gap,
            })),
            formatGap: (g) => `+${g.toFixed(2)}s`,
            emptyTitle: "No constructor pace",
          },
        ]}
      />
    );
  }

  // ---- ADVANCED ----
  return (
    <Card>
      <CardHeader title="Pace analysis"
        subtitle={view === "teams"
          ? "Constructor lap-time trends and the numbers behind them."
          : "Fuel- and tyre-corrected true pace, driver by driver."}
        right={viewSwitch}
        info={<InfoTip label="Reading pace" text="Clean-air pace separates real speed from track position: it corrects for fuel burn and tyre age, and ignores laps spent in traffic, behind a safety car or in the pit lane." />} />
      <CardBody className="space-y-5">

      {view === "teams" ? (
        <>
          <TeamTrend session={session} pace={pace} teams={teams} />
          <TeamTable rows={teams} />
        </>
      ) : (
        <>
          {/* lap-time trend */}
          <div>
            <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-speed" />
                <span className="label">Lap-time trend</span>
              </span>
              <span className="text-[11px] text-ink-faint">
                outliers, in/out laps &amp; neutralized laps excluded
              </span>
              <InfoTip label="Reading pace" text="Lower is faster. Rising lines within a stint show tyre degradation; a step down marks fresh tyres after a stop. Pit and safety-car laps are removed so only representative green-flag pace is shown." />
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 6, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="2 4" />
                  {session.track_status_windows.map((w, i) => (
                    <ReferenceArea key={i} x1={w.start_lap} x2={w.end_lap} fill="rgba(255,176,32,0.08)" />
                  ))}
                  <XAxis dataKey="lap" type="number" domain={[1, session.total_laps]}
                    tick={{ fill: "#5f6b84", fontSize: 11 }} tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
                  <YAxis domain={yDomain} tickFormatter={(v) => fmtLap(v)}
                    tick={{ fill: "#5f6b84", fontSize: 10 }} width={58} tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
                  <Tooltip isAnimationActive={false}
                    contentStyle={{ background: "#0f131d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(l) => `Lap ${l}`} formatter={(v: any, k: any) => [fmtLap(v), k]} />
                  {plot.map((code) => (
                    <Line key={code} dataKey={code} stroke={colorFor(code)} strokeWidth={1.8}
                      dot={false} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* pace table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
                  <Th>#</Th><Th>Driver</Th>
                  <Th info="Fuel- and tyre-corrected representative clean-air lap. The fairest measure of true car speed.">Clean-air pace</Th>
                  <Th>Best</Th><Th>Median</Th>
                  <Th info="Standard deviation of clean laps, scaled 0–100. Higher = more metronomic.">Consistency</Th>
                  <Th info="Green laps spent within 1.5s of the car ahead — i.e. in dirty air.">Traffic</Th>
                  <Th>Verdict</Th>
                </tr>
              </thead>
              <tbody>
                {sections.finishers.map((p) => (
                  <PaceRow key={p.driver} p={p} session={session} selected={selected} />
                ))}
                <PaceSection label="Retired (DNF)" rows={sections.dnf} session={session} selected={selected} />
                <PaceSection label="Did not start (DNS)" rows={sections.dns} session={session} selected={selected} />
                <PaceSection label="Disqualified (DSQ)" rows={sections.dsq} session={session} selected={selected} />
              </tbody>
            </table>
          </div>
        </>
      )}
      </CardBody>
    </Card>
  );
}

/* ---- one pace-table row, reused for finishers and every DNF/DNS/DSQ row ---- */
function PaceRow({ p, session, selected }: {
  p: DriverPaceSummary; session: RaceSession; selected: string[];
}) {
  // A driver whose pace couldn't be evaluated (retired / DSQ / DNS / too few
  // clean laps) is dimmed, and the field-relative metrics that would mislead on
  // a tiny sample (rank, clean-air pace, consistency) show "—". Raw best/median
  // laps remain — those are real measurements.
  const unranked = p.pace_evaluated === false;
  return (
    <tr className={cx("border-b border-white/[0.04]",
      selected.includes(p.driver) && "bg-accent/[0.05]", unranked && "opacity-55")}>
      <td className="py-2 pr-3 tabular-nums text-ink-faint">{unranked ? "—" : (p.pace_rank ?? "—")}</td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-2">
          {/* fixed-width identity block so the tyre-limited badges line up in a
              clean column for every driver */}
          <DriverBadge driver={session.drivers.find((d) => d.code === p.driver)}
            code={p.driver} name={p.name} team={p.team} teamColor={p.team_color}
            size={26} className="w-48 min-w-0" />
          {p.tyre_limited && !unranked && (
            <Term term="tyre-limited">
              <Badge tone="bad" className="whitespace-nowrap">tyre-limited</Badge>
            </Term>
          )}
        </span>
      </td>
      <td className="py-2 pr-3 tabular-nums text-speed">{unranked ? "—" : fmtLap(p.clean_air_pace)}</td>
      <td className="py-2 pr-3 tabular-nums text-ink-muted">{fmtLap(p.best_lap)}</td>
      <td className="py-2 pr-3 tabular-nums text-ink-muted">{fmtLap(p.median_lap)}</td>
      <td className="py-2 pr-3">
        {unranked ? <span className="text-ink-faint">—</span>
          : <ConsistencyBar score={p.consistency_score} />}
      </td>
      <td className="py-2 pr-3 tabular-nums text-ink-muted">{p.traffic_laps}</td>
      <td className={cx("max-w-[24rem] py-2 pr-2 text-xs leading-relaxed",
        unranked ? "italic text-ink-faint" : "text-ink-muted")}>
        {p.verdict}
      </td>
    </tr>
  );
}

/* ---- a labelled divider + its rows, kept inside the same table so it reads as
       one continuous list (renders nothing when the group is empty) ---- */
function PaceSection({ label, rows, session, selected }: {
  label: string; rows: DriverPaceSummary[]; session: RaceSession; selected: string[];
}) {
  if (!rows.length) return null;
  return (
    <>
      <tr>
        <td colSpan={8}
          className="border-t border-white/[0.08] bg-white/[0.015] px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {label} · {rows.length}
        </td>
      </tr>
      {rows.map((p) => <PaceRow key={p.driver} p={p} session={session} selected={selected} />)}
    </>
  );
}

/* ---- advanced-mode constructor view: the same lap-trend chart, per team ---- */
function TeamTrend({ session, pace, teams }: {
  session: RaceSession; pace: DriverPaceSummary[]; teams: TeamPace[];
}) {
  // plot the 5 quickest teams: per lap, the mean of that team's clean lap times
  const plotTeams = teams.slice(0, 5);
  const { data, yDomain } = useMemo(() => {
    const teamOf = new Map(pace.map((p) => [p.driver, p.team]));
    const plotted = new Set(plotTeams.map((t) => t.team));
    const byLap = new Map<number, Map<string, { sum: number; n: number }>>();
    let lo = Infinity, hi = -Infinity;
    for (const lp of session.laps) {
      const team = teamOf.get(lp.driver);
      if (!team || !plotted.has(team) || !lp.lap_time || lp.is_outlier) continue;
      if (!byLap.has(lp.lap)) byLap.set(lp.lap, new Map());
      const cell = byLap.get(lp.lap)!.get(team) ?? { sum: 0, n: 0 };
      cell.sum += lp.lap_time; cell.n += 1;
      byLap.get(lp.lap)!.set(team, cell);
    }
    const arr = [...byLap.entries()]
      .map(([lap, cells]) => {
        const row: any = { lap };
        for (const [team, { sum, n }] of cells) {
          const avg = sum / n;
          row[team] = avg;
          lo = Math.min(lo, avg); hi = Math.max(hi, avg);
        }
        return row;
      })
      .sort((a, b) => a.lap - b.lap);
    const pad = (hi - lo) * 0.1 || 1;
    return { data: arr, yDomain: [lo - pad, hi + pad] as [number, number] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pace, plotTeams.map((t) => t.team).join(",")]);

  if (!plotTeams.length || !data.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
        Constructor lap-time trend — average of each constructor&apos;s cars (top 5; outliers, in/out &amp; neutralized laps excluded)
        <InfoTip label="Reading constructor pace" text="Each line averages a constructor's drivers lap by lap. Lower is faster; diverging lines show one constructor's tyres holding on longer than another's." />
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="2 4" />
            {session.track_status_windows.map((w, i) => (
              <ReferenceArea key={i} x1={w.start_lap} x2={w.end_lap} fill="rgba(255,176,32,0.08)" />
            ))}
            <XAxis dataKey="lap" type="number" domain={[1, session.total_laps]}
              tick={{ fill: "#5f6b84", fontSize: 11 }} tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
            <YAxis domain={yDomain} tickFormatter={(v) => fmtLap(v)}
              tick={{ fill: "#5f6b84", fontSize: 10 }} width={58} tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Tooltip isAnimationActive={false}
              contentStyle={{ background: "#0f131d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
              labelFormatter={(l) => `Lap ${l}`} formatter={(v: any, k: any) => [fmtLap(v), k]} />
            {plotTeams.map((t) => (
              <Line key={t.team} dataKey={t.team} stroke={t.color} strokeWidth={1.8}
                dot={false} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---- advanced-mode constructor table: the numbers under the chart ---- */
function TeamTable({ rows }: { rows: TeamPace[] }) {
  if (!rows.length) return <p className="text-sm text-ink-faint">No constructor pace data for this session.</p>;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <Th>#</Th><Th>Constructor</Th>
              <Th info="Mean of the constructor's drivers' fuel- and tyre-corrected clean-air laps — the fairest read of car speed.">Avg clean-air pace</Th>
              <Th>Gap</Th>
              <Th info="The constructor's quicker driver on corrected pace, with their lap.">Faster driver</Th>
              <Th>Best lap</Th>
              <Th info="Where each of the constructor's drivers ranks in the field on true pace.">Driver pace ranks</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.team} className="border-b border-white/[0.04]">
                <td className="py-2 pr-2 tabular-nums text-ink-faint">{i + 1}</td>
                <td className="py-2 pr-2">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                    {t.team}
                  </span>
                </td>
                <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(t.avg)}</td>
                <td className="py-2 pr-2 tabular-nums text-ink-muted">
                  {t.gap === 0 ? "reference" : `+${t.gap.toFixed(2)}s`}
                </td>
                <td className="py-2 pr-2">
                  {t.drivers[0] && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold">{t.drivers[0].driver}</span>
                      <span className="tabular-nums text-xs text-ink-muted">{fmtLap(t.drivers[0].clean_air_pace)}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(t.bestLap)}</td>
                <td className="py-2 pr-2 text-xs text-ink-muted">
                  {t.drivers.map((d) => `${d.driver} P${d.pace_rank ?? "?"}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, info }: { children: React.ReactNode; info?: string }) {
  return (
    // nowrap: header labels must never wrap to a second line and knock the
    // columns out of alignment with each other.
    <th className="whitespace-nowrap py-2 pr-3 font-semibold">
      <span className="inline-flex items-center gap-1">{children}{info && <InfoTip text={info} />}</span>
    </th>
  );
}

function ConsistencyBar({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-speed" style={{ width: `${score}%` }} />
      </span>
      <span className="tabular-nums text-xs text-ink-muted">{score.toFixed(0)}</span>
    </span>
  );
}
