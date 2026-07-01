"use client";
import { useMemo } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DriverPaceSummary, RaceSession } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/InfoTip";
import { cx, fmtLap } from "@/lib/format";

export function PaceAnalysis({
  session, pace, selected,
}: { session: RaceSession; pace: DriverPaceSummary[]; selected: string[] }) {
  const ranked = useMemo(
    () => [...pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99)),
    [pace],
  );
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

  const constructorRank = useMemo(() => {
    const teams = new Map<string, { team: string; color: string; vals: number[] }>();
    for (const p of pace) {
      if (p.clean_air_pace == null) continue;
      if (!teams.has(p.team)) teams.set(p.team, { team: p.team, color: p.team_color, vals: [] });
      teams.get(p.team)!.vals.push(p.clean_air_pace);
    }
    return [...teams.values()]
      .map((t) => ({ ...t, avg: t.vals.reduce((a, b) => a + b, 0) / t.vals.length }))
      .sort((a, b) => a.avg - b.avg);
  }, [pace]);

  return (
    <div className="space-y-5">
      {/* lap-time trend */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
          Lap-time trend (outliers, in/out laps & neutralized laps excluded)
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
            {ranked.map((p) => (
              <tr key={p.driver}
                className={cx("border-b border-white/[0.04]", selected.includes(p.driver) && "bg-accent/[0.05]")}>
                <td className="py-2 pr-2 tabular-nums text-ink-faint">{p.pace_rank ?? "—"}</td>
                <td className="py-2 pr-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.team_color }} />
                    <span className="font-semibold">{p.driver}</span>
                    {p.tyre_limited && <Badge tone="bad">tyre-limited</Badge>}
                  </span>
                </td>
                <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(p.clean_air_pace)}</td>
                <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(p.best_lap)}</td>
                <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(p.median_lap)}</td>
                <td className="py-2 pr-2">
                  <ConsistencyBar score={p.consistency_score} />
                </td>
                <td className="py-2 pr-2 tabular-nums text-ink-muted">{p.traffic_laps}</td>
                <td className="py-2 pr-2 text-xs text-ink-muted">{p.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* constructor pace ranking */}
      <div>
        <div className="label mb-2 flex items-center gap-1.5">
          Constructor pace ranking
          <InfoTip text="Teams ranked by the average clean-air pace of their drivers — who had the quickest car, regardless of where they finished." />
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {constructorRank.map((t, i) => {
            const gap = t.avg - constructorRank[0].avg;
            return (
              <div key={t.team} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-base-800/50 px-3 py-2">
                <span className="w-4 tabular-nums text-ink-faint">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                <span className="flex-1 text-sm">{t.team}</span>
                <span className="tabular-nums text-xs text-ink-muted">
                  {i === 0 ? "reference" : `+${gap.toFixed(2)}s`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Th({ children, info }: { children: React.ReactNode; info?: string }) {
  return (
    <th className="py-2 pr-2 font-semibold">
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
