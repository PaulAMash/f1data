"use client";
import { Award, Timer, TrendingDown, TrendingUp } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, TeamDot } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { InfoTip } from "@/components/ui/InfoTip";
import { fmtGap, fmtLap, fmtSec, netBadge, ordinal } from "@/lib/format";

export function RaceOverview({ bundle }: { bundle: RaceBundle }) {
  const { session, strategy } = bundle;
  const dotd = session.classification.find((c) => c.driver === strategy.driver_of_the_day);

  return (
    <div className="space-y-4">
      {/* headline tiles (Winner already appears in the key cards above — not repeated) */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Driver of the day" tone="speed"
          value={dotd?.name ?? strategy.driver_of_the_day ?? "—"}
          sub={strategy.dotd_reason ?? undefined}
          info="Analytical pick: gained positions, weighted by race pace and a win-from-behind bonus." />
        {strategy.avg_pit_loss != null ? (
          <StatTile label="Avg pit loss" value={fmtSec(strategy.avg_pit_loss)}
            sub={strategy.avg_pit_loss_kind === "estimated" ? "estimated" : "pit-lane time"}
            info="Average pit-lane time lost per stop across the field — the cost of a green-flag stop." />
        ) : (
          <StatTile label="Avg pit loss" value="Unavailable"
            sub="not provided by source"
            info="This session's source doesn't include pit-lane timing. OpenF1/Jolpica provide it where available." />
        )}
        <StatTile label="Race" value={`${session.total_laps} laps`}
          sub={session.circuit?.name ?? session.grand_prix} />
      </div>

      {/* strategy verdicts */}
      <div className="grid gap-3 md:grid-cols-3">
        <VerdictCard tone="good" icon={<Award size={15} />} title="Best strategy"
          driver={strategy.best_strategy?.driver} detail={strategy.best_strategy?.detail} />
        <VerdictCard tone="bad" icon={<TrendingDown size={15} />} title="Costliest strategy"
          driver={strategy.worst_strategy?.driver} detail={strategy.worst_strategy?.detail} />
        <VerdictCard tone="key" icon={<Timer size={15} />} title="Best pit timing"
          driver={strategy.best_pit_timing?.driver} detail={strategy.best_pit_timing?.detail} />
      </div>

      {/* classification + movers */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Final classification"
            info={<InfoTip label="Grid → Finish" text="The ▲/▼ badge is net positions gained or lost versus the starting grid." />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pl-5 pr-2">Pos</th><th className="py-2 pr-2">Driver</th>
                  <th className="py-2 pr-2">Grid→Fin</th><th className="py-2 pr-2">Pits</th>
                  <th className="py-2 pr-2">Best</th><th className="py-2 pr-2">Gap</th>
                  <th className="py-2 pr-5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {session.classification.map((c) => {
                  const nb = netBadge(c.grid && c.position ? c.grid - c.position : null);
                  return (
                    <tr key={c.driver} className="border-b border-white/[0.04]">
                      <td className="py-2 pl-5 pr-2 tabular-nums font-semibold">
                        {c.position ?? "DNF"}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2">
                          <TeamDot color={c.team_color} />
                          <span className="font-semibold">{c.driver}</span>
                          <span className="hidden text-xs text-ink-faint sm:inline">{c.team}</span>
                          {c.retired && <Badge tone="down">DNF</Badge>}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        {c.retired ? <span className="text-ink-faint">—</span> : (
                          <span className="inline-flex items-center gap-1.5 tabular-nums text-ink-muted">
                            P{c.grid ?? "—"}→P{c.position}
                            <span className={nb.tone === "up" ? "text-emerald-300" : nb.tone === "down" ? "text-rose-300" : "text-ink-faint"}>
                              {nb.text}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-ink-muted">{c.pit_stops}</td>
                      <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(c.best_lap)}</td>
                      <td className="py-2 pr-2 tabular-nums text-ink-faint">{c.retired ? c.status : fmtGap(c.position, c.gap)}</td>
                      <td className="py-2 pr-5 text-right tabular-nums">{c.points ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <MoverList title="Biggest gainers" icon={<TrendingUp size={15} className="text-emerald-300" />}
            rows={strategy.biggest_gainers} tone="up" />
          <MoverList title="Biggest losers" icon={<TrendingDown size={15} className="text-rose-300" />}
            rows={strategy.biggest_losers} tone="down" />
          {strategy.weather_summary && (
            <Card>
              <CardHeader title="Weather" />
              <CardBody className="text-sm capitalize text-ink-muted">{strategy.weather_summary}</CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function VerdictCard({
  tone, icon, title, driver, detail,
}: { tone: "good" | "bad" | "key"; icon: React.ReactNode; title: string; driver?: string; detail?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">{icon}{title}</span>
        {driver && <Badge tone={tone}>{driver}</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">{detail ?? "No clear signal in this race."}</p>
    </Card>
  );
}

function MoverList({
  title, icon, rows, tone,
}: { title: string; icon: React.ReactNode; rows: any[]; tone: "up" | "down" }) {
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5">{icon}{title}</span>} />
      <CardBody className="space-y-1.5">
        {rows.length ? rows.map((r) => (
          <div key={r.driver} className="flex items-center gap-2 text-sm">
            <TeamDot color={r.team_color} />
            <span className="font-semibold">{r.driver}</span>
            <span className="text-xs text-ink-faint">P{r.grid}→P{r.finish}</span>
            <span className={`ml-auto tabular-nums text-xs ${tone === "up" ? "text-emerald-300" : "text-rose-300"}`}>
              {tone === "up" ? "▲" : "▼"} {Math.abs(r.net)}
            </span>
          </div>
        )) : <p className="text-xs text-ink-faint">No notable movers.</p>}
      </CardBody>
    </Card>
  );
}
