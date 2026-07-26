"use client";
import { Clock, Gauge, Repeat, Sparkles, Timer, TrendingUp } from "lucide-react";
import type { Driver, PracticeSummary, RaceSession } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DriverBadge } from "@/components/ui/DriverBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { EmptyState } from "@/components/ui/misc";
import { InsightCard, InsightGrid } from "@/components/ui/InsightCard";
import { StoryPanel } from "@/components/ui/StoryPanel";
import { Meter, Tally } from "@/components/ui/Visuals";
import { ConditionsCard, readConditions } from "@/components/charts/TrackConditions";
import { PaceBoard } from "@/components/charts/PaceBoard";
import { COMPOUND_COLOR, COMPOUND_SHORT } from "@/lib/compounds";
import { fmtLap } from "@/lib/format";

export function PracticeView({
  practice, session, section,
}: { practice: PracticeSummary; session: RaceSession; section: "story" | "pace" | "runs" }) {
  if (!practice) return <EmptyState title="No practice data" />;
  if (section === "story") return <Story practice={practice} session={session} />;
  if (section === "pace") return <Pace practice={practice} session={session} />;
  return <Runs practice={practice} session={session} />;
}

const driverOf = (session: RaceSession, code?: string | null): Driver | null =>
  session.drivers.find((d) => d.code === code) ?? null;

function Story({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  const p = practice;
  const row = (code?: string | null) => p.rows.find((r) => r.driver === code);
  const nameOf = (code?: string | null) =>
    driverOf(session, code)?.name ?? row(code)?.name ?? code ?? "—";

  const timed = p.rows.filter((r) => r.best_lap != null);
  const maxLaps = Math.max(1, ...p.rows.map((r) => r.laps_completed));
  const maxImprovement = Math.max(0.001, ...p.rows.map((r) => r.improvement ?? 0));
  const spread = timed.length >= 2
    ? Math.max(0.001, (timed[timed.length - 1].gap_to_fastest ?? 0)) : null;
  const longs = p.rows.filter((r) => r.long_run_pace != null)
    .sort((a, b) => a.long_run_pace! - b.long_run_pace!);
  const bestLong = longs[0]?.long_run_pace ?? null;
  const longSpread = longs.length >= 2
    ? Math.max(0.001, longs[longs.length - 1].long_run_pace! - bestLong!) : null;
  const conditions = readConditions(session);

  return (
    <div className="space-y-4">
      <StoryPanel
        icon={<Sparkles size={14} />}
        kicker={`${session.session_type} · ${session.grand_prix}`}
        story={p.story}
        notes={p.notes}
        highlights={[
          { label: "Fastest", value: lastName(nameOf(p.fastest_driver)), tone: "accent" },
          ...(p.fastest_lap != null ? [{ label: "Best lap", value: fmtLap(p.fastest_lap) }] : []),
          { label: "Cars timed", value: timed.length },
          { label: "Laps run", value: p.rows.reduce((s, r) => s + r.laps_completed, 0) },
          ...(conditions?.track != null
            ? [{ label: "Track", value: `${conditions.track.toFixed(0)}°`, tone: "amber" as const }] : []),
        ]}
      />

      {/* the same card set, in the same shape, as Qualifying and the Race */}
      <InsightGrid cols={3}>
        <InsightCard icon={<Gauge size={14} />} tone="accent" label="Fastest"
          value={nameOf(p.fastest_driver)} driver={driverOf(session, p.fastest_driver)}
          sub={fmtLap(p.fastest_lap)}
          visual={spread && row(p.fastest_driver) ? (
            <Meter label="Clear of P2" tone="accent"
              value={timed[1]?.gap_to_fastest != null ? `${timed[1].gap_to_fastest!.toFixed(3)}s` : "—"}
              pct={((timed[1]?.gap_to_fastest ?? 0) / spread) * 100}
              hint="Quickest single lap of the session." />
          ) : undefined}
          caption={spread ? undefined : "Quickest single lap of the session."} />

        <InsightCard icon={<TrendingUp size={14} />} tone="speed" label="Best long run"
          value={nameOf(p.best_long_run_driver)} driver={driverOf(session, p.best_long_run_driver)}
          sub={row(p.best_long_run_driver)?.long_run_pace
            ? `${fmtLap(row(p.best_long_run_driver)!.long_run_pace)} over ${row(p.best_long_run_driver)!.long_run_laps} laps`
            : undefined}
          visual={longSpread && longs[1]?.long_run_pace != null ? (
            <Meter label="Clear of next" tone="speed"
              value={`${(longs[1].long_run_pace! - bestLong!).toFixed(3)}s`}
              pct={((longs[1].long_run_pace! - bestLong!) / longSpread) * 100}
              hint="The best read on race pace, on higher fuel." />
          ) : undefined}
          caption={longSpread ? undefined : "Best read on race pace, on higher fuel."} />

        <InsightCard icon={<Repeat size={14} />} tone="violet" label="Most laps"
          value={nameOf(p.most_laps_driver)} driver={driverOf(session, p.most_laps_driver)}
          sub={row(p.most_laps_driver)?.team}
          visual={row(p.most_laps_driver) ? (
            <Meter label="Track time" tone="violet"
              value={`${row(p.most_laps_driver)!.laps_completed} laps`}
              pct={(row(p.most_laps_driver)!.laps_completed / maxLaps) * 100}
              hint="Most track time — the richest tyre and setup data." />
          ) : undefined} />

        <InsightCard icon={<Clock size={14} />} tone="good" label="Most improved"
          value={nameOf(p.most_improved_driver)} driver={driverOf(session, p.most_improved_driver)}
          visual={row(p.most_improved_driver)?.improvement != null ? (
            <Meter label="Time found" tone="good"
              value={`−${row(p.most_improved_driver)!.improvement!.toFixed(2)}s`}
              pct={(row(p.most_improved_driver)!.improvement! / maxImprovement) * 100}
              hint="Gained the most as the track rubbered in." />
          ) : undefined}
          caption={row(p.most_improved_driver)?.improvement == null
            ? "Gained the most as the track rubbered in." : undefined} />

        <InsightCard icon={<Timer size={14} />} tone={p.track_evolving ? "amber" : "neutral"}
          label="Track evolution" value={p.track_evolving ? "Getting faster" : "Stable"}
          visual={<Tally count={p.rows.filter((r) => (r.improvement ?? 0) > 0.2).length} tone="amber"
            label="drivers found real time" emptyLabel="Nobody found meaningful time" />}
          caption={p.track_evolving
            ? "Grip built through the session — later runs carried more weight."
            : "Lap times held steady across the session."} />

        {/* weather matters most in practice: it sets tyre and long-run reads */}
        <ConditionsCard session={session} />
      </InsightGrid>

      <Timesheet practice={practice} session={session} />
    </div>
  );
}

const lastName = (name: string) => name.split(" ").slice(-1)[0] || name;

function Timesheet({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
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
                <td className="py-2 pl-5 font-semibold tabular-nums">{r.best_lap_rank ?? "—"}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                      name={r.name} team={r.team} teamColor={r.team_color}
                      size={26} className="w-48 min-w-0" />
                    <span className="w-[5.5rem] shrink-0">
                      {r.low_running && <Badge tone="neutral">low laps</Badge>}
                    </span>
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
                <td className="py-2 pr-5"><Compounds list={r.compounds} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Practice pace, on the product's one pace board. The toggle here switches
 * between two genuinely different measurements rather than two cuts of the same
 * one, so it gets the prominent treatment and the subtitle always names what's
 * being measured.
 */
function Pace({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  const rows = practice.rows.filter((r) => r.best_lap);
  const fastest = rows[0]?.best_lap ?? 0;
  const longs = practice.rows.filter((r) => r.long_run_pace)
    .sort((a, b) => a.long_run_pace! - b.long_run_pace!);
  const bestLong = longs[0]?.long_run_pace ?? 0;

  return (
    <PaceBoard
      title="Practice pace"
      prominentSwitch
      views={[
        {
          id: "one-lap", label: "One-lap pace", icon: <Gauge size={13} />,
          heroLabel: "Quickest lap",
          measures: "The fastest single lap each driver set — low fuel, maximum attack.",
          info: "Fastest lap each driver set. Bars show the gap to the quickest. On low fuel this shows outright speed, not race pace.",
          entries: rows.map((r) => ({
            key: r.driver, name: r.name, sub: r.team, color: r.team_color,
            driver: driverOf(session, r.driver),
            value: fmtLap(r.best_lap), gap: (r.best_lap ?? 0) - fastest,
          })),
          emptyTitle: "No timed laps",
          emptyHint: "Nobody set a representative lap in this session.",
        },
        {
          id: "long-run", label: "Long-run pace", icon: <Timer size={13} />,
          heroLabel: "Best long run",
          measures: "Median pace over each driver's longest run — the best guide to race pace.",
          info: "Median pace over each driver's longest run. Fuel loads and engine modes are unknown, so treat this as indicative rather than exact — but it reads race pace far better than one-lap speed.",
          entries: longs.map((r) => ({
            key: r.driver, name: r.name, sub: r.team, color: r.team_color,
            driver: driverOf(session, r.driver),
            value: fmtLap(r.long_run_pace), gap: (r.long_run_pace ?? 0) - bestLong,
            note: `${r.long_run_laps}L`,
          })),
          emptyTitle: "No long runs",
          emptyHint: "No driver did a run long enough to read race pace from.",
        },
      ]}
      showNotes
    />
  );
}

function Runs({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  const maxLaps = Math.max(1, ...practice.rows.map((r) => r.laps_completed));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Constructor pace ranking"
          subtitle="Ranked by each constructor's quickest car."
          info={<InfoTip text="Constructors ranked by their quickest car's best lap." />} />
        <CardBody className="space-y-1.5">
          {practice.team_ranking.map((t, i) => (
            <div key={t.team} className="flex items-center gap-3 tile px-3 py-2">
              <span className="w-4 tabular-nums text-ink-faint">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="flex-1 truncate text-sm">{t.team}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                {i === 0 ? "quickest" : `+${t.gap.toFixed(3)}s`}
              </span>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Running & tyres"
          subtitle="How much track time each driver banked, and on what."
          info={<InfoTip text="Laps completed and compounds each driver ran." />} />
        <CardBody className="space-y-2">
          {practice.rows.map((r) => (
            <div key={r.driver} className="flex items-center gap-2.5 text-sm">
              <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                name={r.name} team={r.team} teamColor={r.team_color}
                size={24} className="w-40 shrink-0" />
              {/* laps as a bar: the eye ranks running programmes instantly */}
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <span className="block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(5, (r.laps_completed / maxLaps) * 100)}%`, background: r.team_color }} />
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.laps_completed}L</span>
              <span className="w-16 shrink-0"><Compounds list={r.compounds} /></span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function Compounds({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {list.map((c) => (
        <span key={c} className="rounded px-1 text-[10px] font-bold"
          style={{ background: COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}>
          {COMPOUND_SHORT[c as keyof typeof COMPOUND_SHORT]}
        </span>
      ))}
    </span>
  );
}
