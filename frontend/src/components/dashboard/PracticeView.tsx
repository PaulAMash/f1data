"use client";
import { Clock, Gauge, Repeat, Sparkles, TrendingUp } from "lucide-react";
import type { PracticeSummary, RaceSession } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, TeamDot } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { EmptyState } from "@/components/ui/misc";
import { COMPOUND_COLOR, COMPOUND_SHORT } from "@/lib/compounds";
import { cx, fmtLap } from "@/lib/format";

export function PracticeView({
  practice, session, section,
}: { practice: PracticeSummary; session: RaceSession; section: "story" | "pace" | "runs" }) {
  if (!practice) return <EmptyState title="No practice data" />;
  if (section === "story") return <Story practice={practice} session={session} />;
  if (section === "pace") return <Pace practice={practice} />;
  return <Runs practice={practice} session={session} />;
}

function Story({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  const p = practice;
  const row = (code?: string | null) => p.rows.find((r) => r.driver === code);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> {session.session_type} summary</span>}
          subtitle="Practice isn't a race — here's what actually matters." />
        <CardBody className="space-y-2.5">
          {p.story.map((s, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink"><span className="mr-2 text-accent-soft">•</span>{s}</p>
          ))}
          {p.notes.map((n, i) => <p key={i} className="text-xs text-amber">{n}</p>)}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PCard icon={<Gauge size={15} />} tone="accent" label="Fastest" value={p.fastest_driver ?? "—"}
          sub={fmtLap(p.fastest_lap)} why="Quickest single lap of the session." />
        <PCard icon={<TrendingUp size={15} />} tone="speed" label="Best long run" value={p.best_long_run_driver ?? "—"}
          sub={<>strongest <Term>long run</Term></>} why="Best read on race pace, on higher fuel." />
        <PCard icon={<Repeat size={15} />} tone="default" label="Most laps" value={p.most_laps_driver ?? "—"}
          sub={row(p.most_laps_driver) ? `${row(p.most_laps_driver)!.laps_completed} laps` : undefined}
          why="Most track time — good for tyre and setup data." />
        <PCard icon={<Clock size={15} />} tone="amber" label="Most improved" value={p.most_improved_driver ?? "—"}
          sub={row(p.most_improved_driver)?.improvement ? `−${row(p.most_improved_driver)!.improvement!.toFixed(1)}s` : undefined}
          why="Gained the most as the track rubbered in." />
      </div>

      <Timesheet practice={practice} />
    </div>
  );
}

function Timesheet({ practice }: { practice: PracticeSummary }) {
  return (
    <Card>
      <CardHeader title="Session classification"
        info={<InfoTip label="Reading a timesheet" text="Ordered by fastest lap. Gap is to the quickest driver. Long-run pace (where shown) is a better guide to race pace than one-lap speed." />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pl-5">#</th><th className="py-2">Driver</th>
              <th className="py-2">Best lap</th><th className="py-2">Gap</th>
              <th className="py-2">Laps</th>
              <th className="py-2"><span className="inline-flex items-center gap-1">Long run<InfoTip text="Median pace over their longest run — a race-pace indicator." /></span></th>
              <th className="py-2 pr-5">Tyres</th>
            </tr>
          </thead>
          <tbody>
            {practice.rows.map((r) => (
              <tr key={r.driver} className="border-b border-white/[0.04]">
                <td className="py-2 pl-5 tabular-nums font-semibold">{r.best_lap_rank ?? "—"}</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <TeamDot color={r.team_color} />
                    <span className="font-semibold">{r.driver}</span>
                    {r.low_running && <Badge tone="neutral">low laps</Badge>}
                  </span>
                </td>
                <td className="py-2 tabular-nums text-speed">{fmtLap(r.best_lap)}</td>
                <td className="py-2 tabular-nums text-ink-muted">
                  {r.gap_to_fastest ? `+${r.gap_to_fastest.toFixed(3)}` : "—"}
                </td>
                <td className="py-2 tabular-nums text-ink-muted">{r.laps_completed}</td>
                <td className="py-2 tabular-nums text-ink-muted">
                  {r.long_run_pace ? `${fmtLap(r.long_run_pace)} (${r.long_run_laps})` : "—"}
                </td>
                <td className="py-2 pr-5">
                  <span className="inline-flex gap-0.5">
                    {r.compounds.map((c) => (
                      <span key={c} className="rounded px-1 text-[10px] font-bold"
                        style={{ background: COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}>
                        {COMPOUND_SHORT[c as keyof typeof COMPOUND_SHORT]}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Pace({ practice }: { practice: PracticeSummary }) {
  const rows = practice.rows.filter((r) => r.best_lap);
  const fastest = rows[0]?.best_lap ?? 0;
  const maxGap = Math.max(0.001, ...rows.map((r) => r.gap_to_fastest ?? 0));
  const longs = rows.filter((r) => r.long_run_pace).sort((a, b) => a.long_run_pace! - b.long_run_pace!);
  const bestLong = longs[0]?.long_run_pace ?? 0;
  const maxLongGap = Math.max(0.001, ...longs.map((r) => (r.long_run_pace ?? 0) - bestLong));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="One-lap pace" info={<InfoTip text="Fastest lap each driver set. Bars show the gap to the quickest." />} />
        <CardBody className="space-y-2">
          {rows.map((r) => (
            <BarRow key={r.driver} color={r.team_color} label={r.driver} value={fmtLap(r.best_lap)}
              pct={100 - ((r.gap_to_fastest ?? 0) / maxGap) * 70} />
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-1.5">Long-run pace <Term>long run</Term></span>}
          info={<InfoTip text="Median pace over each driver's longest run — the best guide to race pace. Fuel and engine modes are unknown, so treat as indicative." />} />
        <CardBody className="space-y-2">
          {longs.length ? longs.map((r) => (
            <BarRow key={r.driver} color={r.team_color} label={r.driver} value={`${fmtLap(r.long_run_pace)} · ${r.long_run_laps}L`}
              pct={100 - (((r.long_run_pace ?? 0) - bestLong) / maxLongGap) * 70} />
          )) : <EmptyState title="No long runs" hint="No driver did a long enough run to read race pace." />}
        </CardBody>
      </Card>
    </div>
  );
}

function Runs({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  // team one-lap ranking + tyre usage
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Team pace ranking" info={<InfoTip text="Teams ranked by their quickest car's best lap." />} />
        <CardBody className="space-y-1.5">
          {practice.team_ranking.map((t, i) => (
            <div key={t.team} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-base-800/50 px-3 py-2">
              <span className="w-4 tabular-nums text-ink-faint">{i + 1}</span>
              <TeamDot color={t.color} />
              <span className="flex-1 text-sm">{t.team}</span>
              <span className="tabular-nums text-xs text-ink-muted">{i === 0 ? "quickest" : `+${t.gap.toFixed(3)}s`}</span>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Running & tyres" info={<InfoTip text="Laps completed and compounds each driver ran." />} />
        <CardBody className="space-y-1.5">
          {practice.rows.map((r) => (
            <div key={r.driver} className="flex items-center gap-2 text-sm">
              <TeamDot color={r.team_color} />
              <span className="w-10 font-semibold">{r.driver}</span>
              <span className="w-16 tabular-nums text-xs text-ink-muted">{r.laps_completed} laps</span>
              <span className="inline-flex gap-0.5">
                {r.compounds.map((c) => (
                  <span key={c} className="rounded px-1 text-[10px] font-bold"
                    style={{ background: COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}>
                    {COMPOUND_SHORT[c as keyof typeof COMPOUND_SHORT]}
                  </span>
                ))}
              </span>
              {r.low_running && <Badge tone="neutral">low laps</Badge>}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function PCard({ icon, label, value, sub, why, tone }: any) {
  const t = { accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink" }[tone as string];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-800/60 p-4">
      <div className="flex items-center gap-1.5 text-ink-faint"><span className={t}>{icon}</span><span className="label">{label}</span></div>
      <div className={`mt-1 text-2xl font-semibold ${t}`}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
      <div className="mt-2 text-[11px] leading-snug text-ink-faint">{why}</div>
    </div>
  );
}

function BarRow({ color, label, value, pct }: { color: string; label: string; value: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-sm font-semibold">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(6, pct)}%`, background: color }} />
      </span>
      <span className="w-28 text-right tabular-nums text-xs text-ink-muted">{value}</span>
    </div>
  );
}
