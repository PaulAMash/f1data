"use client";
import { Building2, User } from "lucide-react";
import { Clock, Gauge, Repeat, Sparkles, Target, Timer, TrendingUp } from "@/components/ui/MotionIcon";
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
import { TrackConditionsPanel, readConditions } from "@/components/charts/TrackConditions";
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
  const avgLaps = p.rows.length
    ? p.rows.reduce((a, r) => a + r.laps_completed, 0) / p.rows.length : null;
  const improvedCount = p.rows.filter((r) => (r.improvement ?? 0) > 0.2).length;
  const paceAgrees = !!p.fastest_driver && p.fastest_driver === p.best_long_run_driver;
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
          { label: "Cars timed", term: "cars timed", value: timed.length },
          { label: "Laps run", value: p.rows.reduce((s, r) => s + r.laps_completed, 0),
            sub: "across the field" },
          ...(conditions?.track != null
            ? [{ label: "Track", term: "track temp", value: `${conditions.track.toFixed(0)}°`,
                 tone: "amber" as const, sub: "at the flag" }] : []),
        ]}
      />

      {/* the same slot as Qualifying and the Race — conditions never move */}
      <TrackConditionsPanel session={session} />

      {/* the same card set, in the same shape, as Qualifying and the Race */}
      <InsightGrid cols={3}>
        <InsightCard icon={<Gauge size={14} />} tone="accent" label="Fastest"
          value={nameOf(p.fastest_driver)} driver={driverOf(session, p.fastest_driver)}
          sub={fmtLap(p.fastest_lap)}
          visual={spread && row(p.fastest_driver) ? (
            <Meter label="Clear of P2" labelTerm="one-lap pace" tone="accent"
              value={timed[1]?.gap_to_fastest != null ? `${timed[1].gap_to_fastest!.toFixed(3)}s` : "—"}
              pct={((timed[1]?.gap_to_fastest ?? 0) / spread) * 100}
              scaleMin="Level" scaleMax={`${spread.toFixed(2)}s — whole field`}
              hint="How far clear their best lap was, drawn against the spread from first to last." />
          ) : undefined}
          takeaway="Quickest single lap of the session."
          detail={
            <p>
              Practice lap times mix fuel loads and engine modes, so treat one-lap pace as
              indicative rather than a grid order — but the driver on top has clearly found
              something.
            </p>
          } />

        <InsightCard icon={<TrendingUp size={14} />} tone="speed" label="Best long run"
          value={nameOf(p.best_long_run_driver)} driver={driverOf(session, p.best_long_run_driver)}
          sub={row(p.best_long_run_driver)?.long_run_pace
            ? `${fmtLap(row(p.best_long_run_driver)!.long_run_pace)} over ${row(p.best_long_run_driver)!.long_run_laps} laps`
            : undefined}
          visual={longSpread && longs[1]?.long_run_pace != null ? (
            <Meter label="Clear of next" labelTerm="long-run pace" tone="speed"
              value={`${(longs[1].long_run_pace! - bestLong!).toFixed(3)}s`}
              pct={((longs[1].long_run_pace! - bestLong!) / longSpread) * 100}
              scaleMin="Level" scaleMax={`${longSpread.toFixed(2)}s — whole field`}
              hint="Median pace over their longest run — the closest read on Sunday available from a Friday." />
          ) : undefined}
          takeaway="The best read on race pace available."
          detail={
            <p>
              Taken as the median lap of each driver&apos;s longest continuous run, so a single
              mistake or a traffic lap can&apos;t skew it. Fuel loads are unknown, which is why
              this is a guide rather than a prediction.
            </p>
          } />

        <InsightCard icon={<Repeat size={14} />} tone="violet" label="Most laps"
          value={nameOf(p.most_laps_driver)} driver={driverOf(session, p.most_laps_driver)}
          sub={row(p.most_laps_driver)?.team}
          visual={row(p.most_laps_driver) ? (
            <Meter label="Track time" labelTerm="track time" tone="violet"
              value={`${row(p.most_laps_driver)!.laps_completed} laps`}
              pct={(row(p.most_laps_driver)!.laps_completed / maxLaps) * 100}
              scaleMin="0" scaleMax={`${maxLaps} laps`}
              marker={avgLaps ? (avgLaps / maxLaps) * 100 : undefined}
              markerLabel={avgLaps ? `Field average ${avgLaps.toFixed(0)} laps` : undefined}
              hint="More laps means more tyre and setup data — and a better read on race pace." />
          ) : undefined}
          takeaway="Banked the most running of anyone."
          detail={
            <p>
              Mileage is the currency of a practice session: more laps means more tyre
              degradation data, more setup iterations and a more confident call on Sunday.
            </p>
          } />

        <InsightCard icon={<Clock size={14} />} tone="good" label="Most improved"
          value={nameOf(p.most_improved_driver)} driver={driverOf(session, p.most_improved_driver)}
          visual={row(p.most_improved_driver)?.improvement != null ? (
            <Meter label="Time found" labelTerm="time found" tone="good"
              value={`−${row(p.most_improved_driver)!.improvement!.toFixed(2)}s`}
              pct={(row(p.most_improved_driver)!.improvement! / maxImprovement) * 100}
              scaleMin="No gain" scaleMax={`−${maxImprovement.toFixed(2)}s`}
              hint="How much quicker their best lap got between their early runs and their last — mostly the track rubbering in." />
          ) : undefined}
          takeaway="Found the most as the track rubbered in."
          detail={
            <p>
              Measured from their early-run best to their final best. Some of this is the
              circuit gaining grip, which everyone benefits from — the rest is the driver and
              the setup changes actually working.
            </p>
          } />

        <InsightCard icon={<Timer size={14} />} tone={p.track_evolving ? "amber" : "neutral"}
          label="Track evolution" value={p.track_evolving ? "Getting faster" : "Stable"}
          visual={
            <Meter label="Drivers who went faster" tone="amber" plainLabel
              value={`${improvedCount} of ${p.rows.length}`}
              pct={(improvedCount / Math.max(1, p.rows.length)) * 100}
              scaleMin="Nobody" scaleMax="Every car"
              hint="Counted as any driver who found more than two tenths between their first run and their last." />
          }
          takeaway={p.track_evolving ? "Later runs carried more weight."
            : "Lap times held steady all session."}
          detail={
            <p>
              As cars run, rubber builds on the racing line and the circuit speeds up. When that
              happens, a time set early in the session is worth more than it looks — and the
              running order at the flag can flatter whoever ran last.
            </p>
          } />
        {/* six cards fill the 3-column grid exactly — five left a hole that read
            as an unfinished layout. This one is also the most useful thing a
            Friday can tell you: whether one-lap and race pace agree. */}
        <InsightCard icon={<Target size={14} />}
          tone={paceAgrees ? "good" : "amber"} label="Friday verdict"
          value={paceAgrees ? "Pace agrees" : "Split picture"}
          visual={
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-[4.75rem] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  One lap
                </span>
                <span className="truncate text-[13px] font-semibold text-ink">
                  {lastName(nameOf(p.fastest_driver))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-[4.75rem] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Long run
                </span>
                <span className="truncate text-[13px] font-semibold text-ink">
                  {lastName(nameOf(p.best_long_run_driver))}
                </span>
              </div>
            </div>
          }
          takeaway={paceAgrees
            ? "The same car leads both measures."
            : "Saturday and Sunday may reward different cars."}
          detail={
            <p>
              One-lap pace is what qualifying rewards; long-run pace is what the race
              rewards. When the same driver tops both, a Friday is about as conclusive as
              it gets. When they split, the weekend usually turns on strategy rather than
              outright speed.
            </p>
          } />
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
                      size={26} className="w-56 min-w-0" />
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

/**
 * Runs & tyres, on the same board as Pace.
 *
 * These used to be two standalone charts sitting side by side, which meant the
 * Practice pages taught a different interaction from every other analytics page
 * in the product. Now they are one panel with a Drivers / Constructors toggle —
 * the same control, in the same place, doing the same thing.
 */
function Runs({ practice, session }: { practice: PracticeSummary; session: RaceSession }) {
  const maxLaps = Math.max(1, ...practice.rows.map((r) => r.laps_completed));
  const byTeam = new Map<string, { color: string; laps: number; drivers: string[] }>();
  for (const r of practice.rows) {
    const t = byTeam.get(r.team) ?? { color: r.team_color, laps: 0, drivers: [] };
    t.laps += r.laps_completed; t.drivers.push(r.driver);
    byTeam.set(r.team, t);
  }
  const teams = [...byTeam.entries()].sort((a, b) => b[1].laps - a[1].laps);
  const maxTeamLaps = Math.max(1, ...teams.map(([, t]) => t.laps));

  return (
    <PaceBoard
      title="Runs & tyres"
      prominentSwitch
      showNotes
      views={[
        {
          id: "drivers", label: "Drivers", icon: <User size={13} />,
          heroLabel: "Most track time",
          measures: "Laps completed by each driver — the mileage behind every other number.",
          info: "How many laps each driver ran. Mileage is the currency of a practice session: more laps means more tyre-degradation data and a more confident call on Sunday.",
          entries: [...practice.rows]
            .sort((a, b) => b.laps_completed - a.laps_completed)
            .map((r) => ({
              key: r.driver, name: r.name, sub: r.team, color: r.team_color,
              driver: driverOf(session, r.driver),
              value: `${r.laps_completed}L`,
              // the board draws bars from a gap-to-leader, so mileage inverts:
              // the leader is 0 "behind", everyone else trails them
              gap: maxLaps - r.laps_completed,
              note: <Compounds list={r.compounds} />,
            })),
          formatGap: (g) => (g === 0 ? "most" : `−${g}L`),
          emptyTitle: "No running recorded",
        },
        {
          id: "constructors", label: "Constructors", icon: <Building2 size={13} />,
          heroLabel: "Most laps banked",
          measures: "Total laps run by each constructor across both cars.",
          info: "Combined mileage for both of a constructor's cars — a read on which teams prioritised programme work over one-lap headlines.",
          entries: teams.map(([team, t]) => ({
            key: team, name: team, color: t.color,
            value: `${t.laps}L`, gap: maxTeamLaps - t.laps,
            note: t.drivers.join("+"),
          })),
          formatGap: (g) => (g === 0 ? "most" : `−${g}L`),
          emptyTitle: "No running recorded",
        },
      ]}
    />
  );
}

function Compounds({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {list.map((c) => (
        <span key={c} className="rounded px-1 text-[11px] font-bold"
          style={{ background: COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}>
          {COMPOUND_SHORT[c as keyof typeof COMPOUND_SHORT]}
        </span>
      ))}
    </span>
  );
}
