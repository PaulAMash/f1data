"use client";
import { useState } from "react";
import { Award, Timer, TrendingDown, TrendingUp } from "lucide-react";
import type { ClassificationRow, RaceBundle } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, TeamDot } from "@/components/ui/Badge";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { StatTile } from "@/components/ui/StatTile";
import { InfoTip } from "@/components/ui/InfoTip";
import { fmtGap, fmtLap, fmtSec, netBadge, ordinal } from "@/lib/format";

export function RaceOverview({ bundle, simple = false }: { bundle: RaceBundle; simple?: boolean }) {
  const { session, strategy } = bundle;
  const dotd = session.classification.find((c) => c.driver === strategy.driver_of_the_day);
  // Everyone sees the whole field, DNFs included — Simple just reads it with
  // fewer, friendlier columns (like a TV results graphic) while Advanced keeps
  // the full grid/pits/best-lap detail.
  const rows = session.classification;

  return (
    <div className="space-y-4">
      {/* headline tiles + strategy verdicts are analyst material — Advanced only
          (Winner already appears in the key cards above and is never repeated) */}
      {!simple && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Driver of the day"
            value={
              <span className="flex items-center gap-2.5">
                <DriverAvatar size={34}
                  driver={session.drivers.find((d) => d.code === strategy.driver_of_the_day) ?? null} />
                <span className="truncate">{dotd?.name ?? strategy.driver_of_the_day ?? "—"}</span>
              </span>
            }
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
      )}

      {/* strategy verdicts — cards with no data are hidden, never shown empty */}
      {!simple && (
        <div className="grid gap-3 md:grid-cols-3">
          {strategy.best_strategy && (
            <VerdictCard tone="good" icon={<Award size={15} />} title="Best strategy"
              driver={strategy.best_strategy.driver} detail={strategy.best_strategy.detail} />
          )}
          {strategy.worst_strategy && (
            <VerdictCard tone="bad" icon={<TrendingDown size={15} />} title="Costliest strategy"
              driver={strategy.worst_strategy.driver} detail={strategy.worst_strategy.detail} />
          )}
          {strategy.best_pit_timing && (
            <VerdictCard tone="key" icon={<Timer size={15} />} title="Best pit timing"
              driver={strategy.best_pit_timing.driver} detail={strategy.best_pit_timing.detail} />
          )}
        </div>
      )}

      {/* classification + movers */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Final classification"
            info={<InfoTip label={simple ? "Reading the results" : "Grid → Finish"} text={simple
              ? "Every car, in finishing order. Time is how far behind the winner they finished; cars that retired show why (hover the DNF badge for the lap)."
              : "The ▲/▼ badge is net positions gained or lost versus the starting grid."} />} />
          <div className="overflow-x-auto">
            <table className={cxTable(simple)}>
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pl-5 pr-2">Pos</th><th className="py-2 pr-2">Driver</th>
                  {simple ? (
                    <th className="py-2 pr-2">Time / Retired</th>
                  ) : (
                    <>
                      <th className="py-2 pr-2">Grid→Fin</th><th className="py-2 pr-2">Pits</th>
                      <th className="py-2 pr-2">Best</th><th className="py-2 pr-2">Gap</th>
                    </>
                  )}
                  <th className="py-2 pr-5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const nb = netBadge(c.grid && c.position ? c.grid - c.position : null);
                  const timeOrRetired = c.retired
                    ? (c.retirement_reason && !/^\s*(dnf|dns|dsq|retired)\s*$/i.test(c.retirement_reason)
                        ? c.retirement_reason : "Retired")
                    : fmtGap(c.position, c.gap);
                  return (
                    <tr key={c.driver} className="border-b border-white/[0.04]">
                      <td className="py-2 pl-5 pr-2 tabular-nums font-semibold">
                        {c.position ?? "DNF"}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2">
                          <DriverBadge driver={session.drivers.find((d) => d.code === c.driver)}
                            code={c.driver} name={c.name} team={c.team} teamColor={c.team_color}
                            size={26} />
                          {c.retired && <DnfBadge row={c} />}
                        </span>
                      </td>
                      {simple ? (
                        <td className="py-2 pr-2 tabular-nums text-ink-muted">{timeOrRetired}</td>
                      ) : (
                        <>
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
                          <td className="py-2 pr-2 tabular-nums text-ink-faint">{timeOrRetired}</td>
                        </>
                      )}
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

// the simple table has 4 columns and fits narrow screens without scrolling
function cxTable(simple: boolean) {
  return simple ? "w-full min-w-[420px] text-sm" : "w-full min-w-[560px] text-sm";
}

/**
 * Interactive DNF badge: hover (desktop) or tap (mobile) explains the
 * retirement — official reason, the lap they stopped, and where the reason
 * came from — without sending the user off to search elsewhere.
 */
function DnfBadge({ row }: { row: ClassificationRow }) {
  const [open, setOpen] = useState(false);
  // a reason only counts if it says something ("Hydraulics"), never the
  // generic "Retired"/"DNF" — that would just repeat the badge
  const raw = row.retirement_reason ?? row.status;
  const reason = raw && !/^\s*(dnf|dns|dsq|retired)\s*$/i.test(raw) ? raw : null;
  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={`Retired${reason ? `: ${reason}` : ""}`}
        className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300 underline decoration-rose-300/40 decoration-dotted underline-offset-2">
        DNF
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-44 -translate-x-1/2 rounded-lg border border-white/10 bg-base-900 p-2.5 text-left text-xs shadow-glow">
          {reason && <span className="block font-semibold text-ink">{reason}</span>}
          {row.laps_completed != null && row.laps_completed > 0 ? (
            <span className="mt-0.5 block text-ink-muted">Retired after lap {row.laps_completed}</span>
          ) : !reason ? (
            <span className="block text-ink-muted">Retired — no official reason in this session&apos;s data.</span>
          ) : null}
        </span>
      )}
    </span>
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
            <span className="min-w-0 truncate font-semibold">{r.name ?? r.driver}</span>
            <span className="shrink-0 text-xs text-ink-faint">P{r.grid}→P{r.finish}</span>
            <span className={`ml-auto shrink-0 tabular-nums text-xs ${tone === "up" ? "text-emerald-300" : "text-rose-300"}`}>
              {tone === "up" ? "▲" : "▼"} {Math.abs(r.net)}
            </span>
          </div>
        )) : <p className="text-xs text-ink-faint">No notable movers.</p>}
      </CardBody>
    </Card>
  );
}
