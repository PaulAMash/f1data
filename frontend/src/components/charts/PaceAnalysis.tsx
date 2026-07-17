"use client";
import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Building2, User } from "lucide-react";
import type { DriverPaceSummary, RaceSession } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { DriverBadge } from "@/components/ui/DriverBadge";
import { useIsSimple } from "@/lib/mode";
import { cx, fmtLap } from "@/lib/format";

type PaceView = "drivers" | "teams";

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
      {([["drivers", "Drivers", User], ["teams", "Teams", Building2]] as const).map(([id, label, Icon]) => (
        <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
          className={cx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium",
            view === id ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  );

  // ---- SIMPLE: fastest car + fastest team, then a visual ranking ----
  if (simple) {
    const withPace = ranked.filter((p) => p.clean_air_pace != null);
    const fastest = withPace[0];
    const fastestTeam = teams[0];
    const mismatch = fastest && fastest.finish && fastest.pace_rank && fastest.finish > fastest.pace_rank;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fastest && (
            <div className="rounded-xl border border-white/[0.06] bg-base-800/50 p-4">
              <div className="label text-speed">Fastest car</div>
              <div className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-speed">
                <span className="h-3 w-3 rounded-full" style={{ background: fastest.team_color }} />
                {fastest.driver}
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {fastest.name} had the quickest <Term>clean-air pace</Term> — the truest measure of speed
                once fuel and tyres are evened out.
                {mismatch ? ` Despite that they only finished P${fastest.finish}.`
                  : fastest.finish === 1 ? " And they converted it into the win." : ""}
              </p>
            </div>
          )}
          {fastestTeam && (
            <div className="rounded-xl border border-white/[0.06] bg-base-800/50 p-4">
              <div className="label text-speed">Fastest team</div>
              <div className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-ink">
                <span className="h-3 w-3 rounded-full" style={{ background: fastestTeam.color }} />
                {fastestTeam.team}
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Quickest average true pace across their cars
                ({fastestTeam.drivers.map((d) => d.driver).join(" & ")})
                {teams[1] ? ` — ${teams[1].gap.toFixed(2)}s per lap ahead of ${teams[1].team}.` : "."}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-base-800/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="label">Pace ranking</span>
              <InfoTip text={view === "drivers"
                ? "Each driver's true one-lap speed, fuel- and tyre-corrected. Bars show the gap to the fastest car."
                : "Teams ranked by the average true pace of their cars. Bars show the gap to the fastest team."} />
            </span>
            {viewSwitch}
          </div>
          {view === "drivers"
            ? <DriverBars rows={withPace.slice(0, 10)} session={session} />
            : <TeamBars rows={teams} />}
        </div>
      </div>
    );
  }

  // ---- ADVANCED ----
  return (
    <div className="space-y-5">
      <div className="flex justify-end">{viewSwitch}</div>

      {view === "teams" ? (
        <TeamTable rows={teams} />
      ) : (
        <>
          {/* lap-time trend */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
              Lap-time trend (outliers, in/out laps &amp; neutralized laps excluded)
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
                        {p.tyre_limited && (
                          <Term term="tyre-limited"><Badge tone="bad">tyre-limited</Badge></Term>
                        )}
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
        </>
      )}
    </div>
  );
}

/* ---- simple-mode bars ---- */
function DriverBars({ rows, session }: { rows: DriverPaceSummary[]; session: RaceSession }) {
  const fastest = rows[0];
  const maxGap = Math.max(0.001, ...rows.map(
    (p) => (p.clean_air_pace ?? 0) - (fastest?.clean_air_pace ?? 0)));
  return (
    <div className="space-y-2">
      {rows.map((p) => {
        const gap = (p.clean_air_pace ?? 0) - (fastest?.clean_air_pace ?? 0);
        return (
          <div key={p.driver} className="flex items-center gap-2">
            <DriverBadge driver={session.drivers.find((d) => d.code === p.driver)}
              code={p.driver} name={p.name} team={p.team} teamColor={p.team_color}
              size={24} className="w-36 shrink-0" />
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full rounded-full"
                style={{ width: `${100 - (gap / maxGap) * 75}%`, background: p.team_color }} />
            </span>
            <span className="w-20 text-right text-xs tabular-nums text-ink-muted">
              {gap === 0 ? "fastest" : `+${gap.toFixed(2)}s`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TeamBars({ rows }: { rows: TeamPace[] }) {
  if (!rows.length) return <p className="text-sm text-ink-faint">No team pace data for this session.</p>;
  const maxGap = Math.max(0.001, ...rows.map((t) => t.gap));
  return (
    <div className="space-y-2">
      {rows.map((t) => (
        <div key={t.team} className="flex items-center gap-2">
          <span className="flex w-36 shrink-0 items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="truncate font-medium">{t.team}</span>
          </span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full"
              style={{ width: `${100 - (t.gap / maxGap) * 75}%`, background: t.color }} />
          </span>
          <span className="w-20 text-right text-xs tabular-nums text-ink-muted">
            {t.gap === 0 ? "fastest" : `+${t.gap.toFixed(2)}s`}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---- advanced-mode team view: same switching, more numbers ---- */
function TeamTable({ rows }: { rows: TeamPace[] }) {
  if (!rows.length) return <p className="text-sm text-ink-faint">No team pace data for this session.</p>;
  const maxGap = Math.max(0.001, ...rows.map((t) => t.gap));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <Th>#</Th><Th>Team</Th>
              <Th info="Mean of the team's drivers' fuel- and tyre-corrected clean-air laps — the fairest read of car speed.">Avg clean-air pace</Th>
              <Th>Gap</Th>
              <Th info="The team's quicker driver on corrected pace, with their lap.">Faster driver</Th>
              <Th>Best lap</Th>
              <Th info="Where each of the team's drivers ranks in the field on true pace.">Driver pace ranks</Th>
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

      {/* the same ranking, visually */}
      <div>
        <div className="label mb-2 flex items-center gap-1.5">
          Gap to the fastest team
          <InfoTip text="Average corrected pace deficit per lap versus the quickest team." />
        </div>
        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.team} className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-xs text-ink-muted">{t.team}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full"
                  style={{ width: `${100 - (t.gap / maxGap) * 80}%`, background: t.color }} />
              </span>
              <span className="w-20 text-right text-xs tabular-nums text-ink-muted">
                {t.gap === 0 ? "fastest" : `+${t.gap.toFixed(2)}s`}
              </span>
            </div>
          ))}
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
