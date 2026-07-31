"use client";

import { ArrowUp, Building2, ChevronRight, Gavel, User } from "lucide-react";
import { AlertTriangle, ArrowDownWideNarrow, Flag, Gauge, LineChart, Medal, Ruler, Sparkles, Target, Thermometer, TrendingDown, TrendingUp, Zap } from "@/components/ui/MotionIcon";
import type { Driver, QualifyingSummary, RaceSession } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { EmptyState } from "@/components/ui/misc";
import { InsightCard, InsightGrid } from "@/components/ui/InsightCard";
import { StoryPanel } from "@/components/ui/StoryPanel";
import {
  DeltaBar, Meter, SectorChips, Sparkline, Tally, type VisualTone,
} from "@/components/ui/Visuals";
import { cx, fmtLap } from "@/lib/format";
import { deriveWindows, sessionInterruptions } from "@/lib/raceEvents";
import { TrackConditionsPanel } from "@/components/charts/TrackConditions";
import { PaceBoard } from "@/components/charts/PaceBoard";
import { derivePenalties, finalPenalties, penaltiesByDriver } from "@/lib/penalties";
import { PenaltyBadges } from "@/components/ui/PenaltyBadge";

/**
 * The Saturday experience, in two depths that share one design language:
 *  - Simple answers "who qualified where, what happened, why does it matter?"
 *    — a broadcast-style recap, the headline cards, a clean grid table.
 *  - Advanced answers "how exactly was the grid decided?" — the analyst
 *    debrief, the full card set, segment times, sector forensics.
 * Nothing here ever implies the Grand Prix has been run.
 */
export function QualifyingView({
  qualifying, session, section,
}: { qualifying: QualifyingSummary; session: RaceSession; section: "story" | "laps" | "pace" }) {
  if (!qualifying) return <EmptyState title="No qualifying data" />;
  if (section === "story") return <Story q={qualifying} session={session} />;
  if (section === "laps") return <LapAnalysis q={qualifying} session={session} />;
  return <QualiPace q={qualifying} session={session} />;
}

const driverOf = (session: RaceSession, code?: string | null): Driver | null =>
  session.drivers.find((d) => d.code === code) ?? null;
const isSprintQ = (session: RaceSession) =>
  (session.category ?? "").includes("sprint");

/* ------------------------------ story ---------------------------------- */
function Story({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const simple = useIsSimple();
  const nameOf = (code?: string | null) =>
    driverOf(session, code)?.name ?? q.rows.find((r) => r.driver === code)?.name ?? code ?? "—";
  const rowOf = (code?: string | null) => q.rows.find((r) => r.driver === code);
  const story = simple ? q.story : (q.story_advanced.length ? q.story_advanced : q.story);
  const sprint = isSprintQ(session);

  // biggest teammate delta (advanced card)
  const tmate = [...q.rows]
    .filter((r) => r.vs_teammate != null && r.vs_teammate < 0)
    .sort((a, b) => (a.vs_teammate ?? 0) - (b.vs_teammate ?? 0))[0];
  const tmatePartner = tmate
    ? q.rows.find((r) => r.team === tmate.team && r.driver !== tmate.driver)
    : undefined;

  const timed = q.rows.filter((r) => r.best_lap != null);
  // the top-10 spread gives every margin on this page a shared, honest scale:
  // "how big is this gap, for this session?" rather than an abstract number
  const topSpread = spreadOf(timed.slice(0, 10).map((r) => r.best_lap!));
  const { stoppages, localYellows } = interruptionEpisodes(q, session);
  const segs = ["Q1", "Q2", "Q3"].map((s) => q.segment_bests[s]).filter((v): v is number => v != null);
  const sectorOwner = rowOf(q.fastest_sector_driver);
  const bestSectors = sectorsOwned(q, q.fastest_sector_driver);
  const improver = rowOf(q.biggest_improvement_driver);
  const gains = q.rows.map((r) => r.improvement ?? 0).filter((v) => v > 0);
  const maxImprovement = Math.max(0.001, ...gains, 0);
  const avgImprovement = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
  const segLabels = ["Q1", "Q2", "Q3"].filter((k) => q.segment_bests[k] != null);

  return (
    <div className="space-y-4">
      <StoryPanel
        icon={<Sparkles size={14} />}
        kicker={`${sprint ? "Sprint qualifying" : "Qualifying"} · ${session.grand_prix}`}
        story={story}
        notes={q.notes}
        highlights={[
          { label: "Pole", value: shortName(nameOf(q.pole_driver)), tone: "accent" },
          ...(q.pole_lap != null ? [{ label: "Time", value: fmtLap(q.pole_lap) }] : []),
          ...(q.pole_margin != null
            ? [{ label: "Margin", term: "margin", value: `${q.pole_margin.toFixed(3)}s`,
                 tone: "speed" as const, sub: "pole to P2" }] : []),
          { label: "Cars timed", value: timed.length, term: "cars timed" },
          {
            label: "Stoppages",
            term: "stoppages",
            value: stoppages || "None",
            sub: localYellows ? `+${localYellows} local yellow${localYellows > 1 ? "s" : ""}` : undefined,
            tone: (stoppages ? "bad" : "good") as VisualTone,
          },
        ]}
      />

      {/* Conditions sit in the same place on every session type: the wide panel
          directly under the story. Nobody should have to re-find them. */}
      <TrackConditionsPanel session={session} fallback={q.conditions} />

      {/* Simple: the six takeaways. Advanced: the full analyst card set.
          Every card carries its number as a shape, not as a sentence. */}
      <InsightGrid cols={3}>
        <InsightCard feature icon={<Medal size={14} />} tone="accent"
          label={<Term term="pole margin">Pole position</Term>}
          value={nameOf(q.pole_driver)} driver={driverOf(session, q.pole_driver)}
          sub={q.pole_lap ? `${fmtLap(q.pole_lap)} · ${rowOf(q.pole_driver)?.team ?? ""}` : undefined}
          visual={q.pole_margin != null && topSpread ? (
            <Meter label="Margin" labelTerm="margin" value={`${q.pole_margin.toFixed(3)}s`} tone="accent"
              pct={(q.pole_margin / topSpread) * 100}
              scaleMin="Dead heat" scaleMax={`${topSpread.toFixed(2)}s — whole top ten`}
              hint="How far pole was clear of P2, drawn against the spread of the entire top ten." />
          ) : undefined}
          takeaway={q.pole_margin == null ? "Quickest lap of the session."
            : q.pole_margin < 0.1 ? "Decided by a fraction of a corner."
              : "Comfortably clear of the front row."}
          detail={
            <>
              <p>
                Pole is the fastest single lap anyone set. The bar puts that margin on the
                scale of the session: full width would mean the gap to P2 was as large as the
                gap from P1 to P10.
              </p>
              {q.pole_lap != null && rowOf(q.pole_driver)?.q1 != null && (
                <p className="tabular-nums">
                  Route to pole: Q1 {fmtLap(rowOf(q.pole_driver)!.q1)} →{" "}
                  Q2 {fmtLap(rowOf(q.pole_driver)!.q2)} → Q3 {fmtLap(rowOf(q.pole_driver)!.q3)}.
                </p>
              )}
            </>
          } />

        <InsightCard icon={<Ruler size={14} />} tone="speed" label="Closest margin"
          value={q.closest_pair ? `${q.closest_pair.a} vs ${q.closest_pair.b}` : "—"}
          sub={q.closest_pair?.positions}
          visual={q.closest_pair && topSpread ? (
            <DeltaBar left={q.closest_pair.a} right={q.closest_pair.b}
              leftColor={teamColor(q, q.closest_pair.a)} rightColor={teamColor(q, q.closest_pair.b)}
              lean={0.5 + Math.min(0.45, (q.closest_pair.delta / topSpread) * 0.5)}
              value={`${q.closest_pair.delta.toFixed(3)}s`} unit="apart"
              leftSub={posLabel(q, q.closest_pair.a)} rightSub={posLabel(q, q.closest_pair.b)} />
          ) : undefined}
          takeaway={q.closest_pair
            ? "The tightest fight in the top ten."
            : "No comparable pair in the top ten."}
          detail={
            <p>
              The smallest gap between any two neighbouring cars inside the top ten. A split
              that sits close to the middle of the bar means the two were near-inseparable;
              the further it leans, the more one had in hand.
            </p>
          } />

        <InsightCard icon={<Zap size={14} />} tone="amber" label="Biggest surprise"
          value={nameOf(q.biggest_surprise?.driver)}
          driver={q.biggest_surprise ? driverOf(session, q.biggest_surprise.driver) : undefined}
          sub={q.biggest_surprise && rowOf(q.biggest_surprise.driver)?.position
            ? `Qualified P${rowOf(q.biggest_surprise.driver)!.position}` : undefined}
          visual={mateBar(q, q.biggest_surprise?.driver, topSpread)}
          takeaway={q.biggest_surprise ? "Beat the other car in the same machinery."
            : "No clear over-delivery today."}
          detail={
            <p>
              Two drivers in identical cars is the only genuinely fair comparison in Formula 1.
              Whoever beats their teammate by the widest margin has done the most with what
              they were given — regardless of where that put them on the grid.
            </p>
          } />

        <InsightCard icon={<TrendingDown size={14} />} tone="bad" label="Biggest disappointment"
          value={nameOf(q.biggest_disappointment?.driver)}
          driver={q.biggest_disappointment ? driverOf(session, q.biggest_disappointment.driver) : undefined}
          sub={q.biggest_disappointment && rowOf(q.biggest_disappointment.driver)?.position
            ? `Qualified P${rowOf(q.biggest_disappointment.driver)!.position}` : undefined}
          visual={mateBar(q, q.biggest_disappointment?.driver, topSpread)}
          takeaway={q.biggest_disappointment ? "Lost out to the sister car."
            : "Nobody badly under-delivered."}
          detail={q.biggest_disappointment
            ? <p>{sentence(q.biggest_disappointment.reason)} The same car reached a later
                segment, so the machinery wasn&apos;t the limit.</p>
            : undefined} />

        <InsightCard icon={<AlertTriangle size={14} />} tone={stoppages ? "bad" : "good"}
          label="Interruptions" value={interruptionsValue(q, session)}
          visual={
            <div className="space-y-2.5">
              <Tally count={stoppages} tone="bad" label={stoppages === 1 ? "red flag" : "red flags"}
                emptyLabel="Never stopped"
                meaning="One mark = the session halted and every car returned to the pit lane." />
              <Tally count={localYellows} tone="amber"
                label={localYellows === 1 ? "local yellow" : "local yellows"}
                emptyLabel="No yellows shown"
                meaning="One mark = a sector under yellow. Drivers must slow through it, ruining the lap, but the session keeps running." />
            </div>
          }
          takeaway={stoppages ? "Runs were compressed — timing got risky."
            : localYellows ? "Never stopped, but laps were spoiled."
              : "Everyone got their runs in."}
          detail={<p>{interruptionsWhy(q, session)}</p>} />

        {!simple && (
          <>
            <InsightCard icon={<Gauge size={14} />} tone="accent"
              label={<Term term="sector">Fastest sectors</Term>}
              value={nameOf(q.fastest_sector_driver)}
              driver={q.fastest_sector_driver ? driverOf(session, q.fastest_sector_driver) : undefined}
              sub={sectorOwner?.position ? `Qualified P${sectorOwner.position}` : undefined}
              visual={<SectorChips owned={bestSectors} deltas={sectorDeltas(q, q.fastest_sector_driver)} />}
              takeaway={`Owns ${bestSectors.filter(Boolean).length} of the 3 session-best sectors.`}
              detail={
                <p>
                  A lit sector is the fastest anyone went through it; the figure beneath each
                  chip is how far off that best this driver was. Owning sectors without owning
                  pole means the perfect lap was there but never strung together.
                </p>
              } />

            <InsightCard icon={<Thermometer size={14} />} tone="amber"
              label={<Term>Track evolution</Term>}
              value={q.track_evolving ? "Getting faster" : "Stable"}
              visual={segs.length >= 2 ? (
                <div className="flex items-end justify-between gap-3">
                  <Sparkline points={segs} tone="amber" fluid
                    labels={[segLabels[0], segLabels[segLabels.length - 1]]}
                    valueFmt={(v) => fmtLap(v)} />
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tabular-nums text-emerald-300">
                      −{(segs[0] - segs[segs.length - 1]).toFixed(3)}s
                    </div>
                    <div className="text-[9.5px] leading-none text-ink-faint">benchmark fell</div>
                  </div>
                </div>
              ) : undefined}
              takeaway={q.track_evolving ? "Late runs were worth chasing."
                : "When a driver ran barely mattered."}
              detail={
                <p>
                  Each segment&apos;s best lap, start to finish, against a dashed line at where the
                  session began. Rubber builds on the racing line all afternoon, so the benchmark
                  usually falls — and anyone forced to run early is chasing a moving target.
                </p>
              } />

            <InsightCard icon={<Target size={14} />} tone="speed" label="Most consistent"
              value={nameOf(q.most_consistent_driver)}
              driver={q.most_consistent_driver ? driverOf(session, q.most_consistent_driver) : undefined}
              sub={rowOf(q.most_consistent_driver)?.team}
              visual={rowOf(q.most_consistent_driver)?.consistency_score != null ? (
                <Meter label="Steadiness" labelTerm="steadiness" tone="speed"
                  value={`${rowOf(q.most_consistent_driver)!.consistency_score!.toFixed(0)}/100`}
                  pct={rowOf(q.most_consistent_driver)!.consistency_score!}
                  scaleMin="Erratic" scaleMax="Metronomic"
                  hint="100 is the tightest lap-to-lap spread anyone managed today." />
              ) : undefined}
              takeaway="Repeated the same lap time most closely."
              detail={
                <p>
                  Scored on the spread between a driver&apos;s push laps, then judged only among
                  those who reached the deepest segment on competitive pace — so a slow-but-tidy
                  Q1 exit can&apos;t win it.
                </p>
              } />

            <InsightCard icon={<TrendingUp size={14} />} tone="good" label="Biggest improvement"
              value={nameOf(q.biggest_improvement_driver)}
              driver={q.biggest_improvement_driver ? driverOf(session, q.biggest_improvement_driver) : undefined}
              visual={improver?.improvement != null ? (
                <Meter label="Time found" labelTerm="time found" tone="good"
                  value={`−${improver.improvement.toFixed(2)}s`}
                  pct={(improver.improvement / maxImprovement) * 100}
                  scaleMin="No gain" scaleMax={`−${maxImprovement.toFixed(2)}s`}
                  marker={avgImprovement != null ? (avgImprovement / maxImprovement) * 100 : undefined}
                  markerLabel={avgImprovement != null
                    ? `Field average −${avgImprovement.toFixed(2)}s` : undefined} />
              ) : undefined}
              takeaway="Found the most between first run and last."
              detail={
                <p>
                  Measured from a driver&apos;s early-run best to their final best. Most of the gain
                  is the track rubbering in, so beating the field average means they also
                  genuinely improved.
                </p>
              } />

            <InsightCard icon={<Flag size={14} />} tone={q.deleted_laps.length ? "amber" : "good"}
              label={<Term term="deleted lap">Deleted laps</Term>}
              value={q.deleted_laps.length ? `${q.deleted_laps.length} deleted` : "None"}
              visual={<Tally count={q.deleted_laps.length} tone="amber"
                emptyLabel="All laps stood" label="track limits"
                meaning="One mark = one lap time wiped for running beyond the white lines." />}
              takeaway={q.deleted_laps.length ? "Track limits cost real lap times."
                : "Nobody strayed beyond the white lines."}
              detail={
                <p>
                  Race control deletes a lap when all four wheels go beyond the white line. In
                  the elimination zone a single deletion can decide who goes through.
                </p>
              } />

            <InsightCard icon={<ArrowDownWideNarrow size={14} />} tone="violet"
              label={<Term term="teammate delta">Teammate delta</Term>}
              value={tmate ? nameOf(tmate.driver) : "—"}
              driver={tmate ? driverOf(session, tmate.driver) : undefined}
              sub={tmate?.team}
              visual={tmate?.vs_teammate != null && tmatePartner ? (
                <DeltaBar left={tmate.driver} right={tmatePartner.driver}
                  leftColor={tmate.team_color} rightColor="#5f6b84"
                  lean={0.5 + Math.min(0.4, (Math.abs(tmate.vs_teammate) / (topSpread || 1)) * 0.5)}
                  value={`${Math.abs(tmate.vs_teammate).toFixed(3)}s`} unit="quicker"
                  leftSub={posLabel(q, tmate.driver)} rightSub={posLabel(q, tmatePartner.driver)} />
              ) : undefined}
              takeaway={tmate ? "The widest gap between two identical cars."
                : "No teammate pair had comparable laps."}
              detail={
                <p>
                  Same car, same tyres, same track — so whatever separates two teammates is the
                  drivers themselves. It is the cleanest driver-versus-driver read available all
                  weekend.
                </p>
              } />
          </>
        )}
      </InsightGrid>

      <GridTable q={q} session={session} simple={simple} />
    </div>
  );
}

/**
 * A driver against their teammate — the same car, the same tyres, so the gap is
 * the driver. Both the "surprise" and the "disappointment" are decided on this
 * comparison, so the card should show it rather than assert it.
 */
function mateBar(q: QualifyingSummary, code: string | null | undefined, spread: number | null) {
  if (!code) return undefined;
  const me = q.rows.find((r) => r.driver === code);
  const mate = me ? q.rows.find((r) => r.team === me.team && r.driver !== me.driver) : undefined;
  if (!me || !mate || me.vs_teammate == null) return undefined;
  const gap = Math.abs(me.vs_teammate);
  const ahead = me.vs_teammate < 0;
  const k = Math.min(0.4, (gap / (spread || 1)) * 0.5);
  // The card's subject always holds the left of its own bar, and the lean says
  // whether they won or lost it. Putting the quicker driver on the left
  // regardless meant "Biggest disappointment: Lance Stroll" opened with
  // Alonso's name and an identical-looking bar to the Surprise card beside it.
  return (
    <DeltaBar
      left={me.driver} right={mate.driver}
      leftColor={ahead ? me.team_color : "#6b7794"}
      rightColor={ahead ? "#6b7794" : mate.team_color}
      lean={ahead ? 0.5 + k : 0.5 - k}
      value={`${gap.toFixed(3)}s`} unit={ahead ? "quicker" : "slower"}
      leftSub={posLabel(q, me.driver)} rightSub={posLabel(q, mate.driver)}
      caption={`Against ${mate.name} in the same car${mate.position ? `, who qualified P${mate.position}` : ""}.`}
    />
  );
}

/** Where a driver ended up — the context a two-sided bar needs at its ends. */
function posLabel(q: QualifyingSummary, code: string): string {
  const r = q.rows.find((x) => x.driver === code);
  if (!r) return "";
  if (r.knocked_out_in) return `Out in ${r.knocked_out_in}`;
  return r.position ? `P${r.position}` : "";
}

/** How far this driver was off the session best in each sector. */
function sectorDeltas(q: QualifyingSummary, code?: string | null): (number | null)[] {
  if (!code) return [null, null, null];
  const row = q.rows.find((r) => r.driver === code);
  if (!row) return [null, null, null];
  return [0, 1, 2].map((i) => {
    const mine = row.best_sectors?.[i];
    if (mine == null) return null;
    const best = q.rows.reduce<number | null>((b, r) => {
      const v = r.best_sectors?.[i];
      return v != null && (b == null || v < b) ? v : b;
    }, null);
    return best == null ? null : mine - best;
  });
}

/* small shared helpers for the story cards */
const spreadOf = (vals: number[]) =>
  vals.length >= 2 ? Math.max(0.001, Math.max(...vals) - Math.min(...vals)) : null;
const teamColor = (q: QualifyingSummary, code: string) =>
  q.rows.find((r) => r.driver === code)?.team_color ?? "#9aa6be";
const shortName = (name: string) => name.split(" ").slice(-1)[0] || name;
/** Backend fragments arrive lowercase ("qualified P7, …") — make them read as prose. */
const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
};
/** Which of the three sectors this driver actually owns the session best in. */
function sectorsOwned(q: QualifyingSummary, code?: string | null): boolean[] {
  if (!code) return [false, false, false];
  const row = q.rows.find((r) => r.driver === code);
  if (!row) return [false, false, false];
  return [0, 1, 2].map((i) => {
    const mine = row.best_sectors?.[i];
    if (mine == null) return false;
    const best = q.rows.reduce<number | null>((b, r) => {
      const v = r.best_sectors?.[i];
      return v != null && (b == null || v < b) ? v : b;
    }, null);
    return best != null && mine <= best + 0.0005;
  });
}

/* ------------------------- interruptions & penalties --------------------- */

// ONE definition, shared with Lap Analysis and every chart: an interruption is
// a stoppage or neutralisation. The red count prefers the backend's red-flag
// analysis — the exact dataset the Interruptions panel below renders — so the
// headline card and the detail panel can never disagree. Local yellows are a
// separate, explicitly-labelled statistic; the session never stopped for them.
function interruptionEpisodes(q: QualifyingSummary, session: RaceSession) {
  const s = sessionInterruptions(session.race_control, deriveWindows(session));
  const stoppages = Math.max(q.red_flags.length, s.stoppages);
  return { ...s, stoppages, total: stoppages + s.safetyCars + s.virtualSafetyCars };
}
function interruptionsValue(q: QualifyingSummary, session: RaceSession): string {
  const { stoppages } = interruptionEpisodes(q, session);
  if (!stoppages) return "Clean session";
  return `${stoppages} red flag${stoppages > 1 ? "s" : ""}`;
}
// the same yellow statistic, worded for the detail panel
function localYellowNote(session: RaceSession): string {
  const n = sessionInterruptions(session.race_control, deriveWindows(session)).localYellows;
  return n ? ` ${n} local yellow${n > 1 ? "s" : ""} were shown without halting running.` : "";
}
function interruptionsWhy(q: QualifyingSummary, session: RaceSession): string {
  const { stoppages, localYellows } = interruptionEpisodes(q, session);
  const yellowNote = localYellows
    ? ` ${localYellows} local yellow${localYellows > 1 ? "s" : ""} also spoiled laps without stopping the session.`
    : "";
  if (stoppages) return `Stoppages compress everyone's remaining runs — timing gets risky.${yellowNote}`;
  return localYellows
    ? `The session was never stopped.${yellowNote}`
    : "No stoppages — everyone got their runs in.";
}

/**
 * The starting slot a driver actually takes, shown on their own grid row.
 *
 * A gavel means a steward decision was taken against this driver. A driver who
 * simply inherited a better slot because someone ahead was penalised gets the
 * quieter treatment — they earned nothing, so the row shouldn't shout.
 */
function StartsCell({ change, penalties }: {
  change?: NonNullable<QualifyingSummary["grid_changes"]>[number];
  penalties?: ReturnType<typeof derivePenalties>;
}) {
  const drop = penalties?.find((p) => p.kind === "grid");
  if (!change && !drop) return <span className="text-ink-faint">—</span>;

  if (change?.kind === "pit_lane") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap"
        title={`Qualified P${change.qualified} · starts from the pit lane`}>
        <Gavel size={11} className="shrink-0 text-violet-300" />
        <span className="text-ink-faint line-through tabular-nums">P{change.qualified}</span>
        <ChevronRight size={11} className="text-violet-300" />
        <span className="font-bold text-violet-200">PIT</span>
      </span>
    );
  }

  if (change) {
    const promoted = change.kind === "promotion";
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap"
        title={promoted
          ? `Qualified P${change.qualified} · promoted to P${change.starts} after penalties ahead`
          : `Qualified P${change.qualified} · starts P${change.starts} on the official grid`}>
        {promoted
          ? <ArrowUp size={11} className="shrink-0 text-emerald-300/80" />
          : <Gavel size={11} className="shrink-0 text-violet-300" />}
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="text-ink-faint line-through">P{change.qualified}</span>
          <ChevronRight size={11} className={promoted ? "text-emerald-300/60" : "text-violet-300"} />
          <span className={cx("font-bold", promoted ? "text-emerald-200" : "text-violet-200")}>
            P{change.starts}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={drop!.detail}>
      <Gavel size={11} className="shrink-0 text-violet-300" />
      <span className="font-bold text-violet-200">{drop!.label}</span>
    </span>
  );
}

const STARTS_INFO =
  "Starts is the official starting grid after penalties and steward decisions — "
  + "which is why a driver can qualify P3 and still line up P13. A gavel marks a "
  + "decision taken against that driver; a green arrow means they inherited a "
  + "better slot because someone ahead of them was penalised.";

function GridTable({ q, session, simple }: { q: QualifyingSummary; session: RaceSession; simple: boolean }) {
  const pole = q.rows.find((r) => r.position === 1)?.best_lap ?? q.rows[0]?.best_lap ?? null;
  const hasSegments = q.rows.some((r) => r.q1 || r.q2 || r.q3);
  const showSegments = !simple && hasSegments;
  // classification badges show final steward decisions only — investigations
  // and deleted laps are session noise here (deleted laps live in Lap Analysis)
  const penaltyMap = penaltiesByDriver(finalPenalties(derivePenalties(session.race_control)));
  // Grid penalties belong on the driver's own row, not in a separate panel:
  // one place to understand one driver's outcome.
  const changeOf = new Map((q.grid_changes ?? []).map((c) => [c.driver, c]));
  const hasGridChanges = changeOf.size > 0
    || q.rows.some((r) => penaltyMap.get(r.driver)?.some((p) => p.kind === "grid"));
  return (
    <Card>
      <CardHeader title={isSprintQ(session) ? "The Sprint grid" : "The grid"}
        info={<InfoTip label="Reading qualifying" text={simple
          ? "Ordered by qualifying result. Gap is how far each driver's best lap was from pole."
          : "Ordered by qualifying classification. Q1/Q2/Q3 show each knockout segment's best where the data provides it — eliminated drivers simply have no later-segment time."} />} />
      <div className="overflow-x-auto">
        <table className={`w-full ${showSegments ? "min-w-[620px]" : "min-w-[460px]"} text-sm`}>
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pl-5 pr-2">Pos</th><th className="py-2 pr-2">Driver</th>
              {showSegments ? (
                <>
                  <th className="py-2 pr-2"><Term term="q1">Q1</Term></th>
                  <th className="py-2 pr-2"><Term term="q2">Q2</Term></th>
                  <th className="py-2 pr-2"><Term term="q3">Q3</Term></th>
                </>
              ) : (
                <th className="py-2 pr-2">Best lap</th>
              )}
              <th className="py-2 pr-5">Gap to pole</th>
              {hasGridChanges && (
                <th className="py-2 pr-5">
                  <span className="inline-flex items-center gap-1">
                    Starts <InfoTip label="Starts" text={STARTS_INFO} />
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {q.rows.map((r) => (
              <tr key={r.driver} className="border-b border-white/[0.04]">
                <td className="py-2 pl-5 pr-2 tabular-nums font-semibold">{r.position ?? "—"}</td>
                <td className="py-2 pr-2">
                  {/* fixed-width identity + status columns so elimination labels
                      and penalty badges line up cleanly down the table, the same
                      way the race classification aligns its DNF badges */}
                  <span className="flex items-center gap-2">
                    <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                      name={r.name} team={r.team} teamColor={r.team_color}
                      size={26} className="w-56 min-w-0" />
                    <span className="w-[5.5rem] shrink-0">
                      {r.knocked_out_in && (
                        <Term term={`out in ${r.knocked_out_in.toLowerCase()}`}>
                          <Badge tone="neutral">out in {r.knocked_out_in}</Badge>
                        </Term>
                      )}
                    </span>
                    {/* a grid drop already has a home in the Starts column —
                        showing it beside the name too says it twice */}
                    <PenaltyBadges penalties={hasGridChanges
                      ? penaltyMap.get(r.driver)?.filter((p) => p.kind !== "grid")
                      : penaltyMap.get(r.driver)} />
                  </span>
                </td>
                {showSegments ? (
                  <>
                    <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(r.q1)}</td>
                    <td className="py-2 pr-2 tabular-nums text-ink-muted">{fmtLap(r.q2)}</td>
                    <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(r.q3)}</td>
                  </>
                ) : (
                  <td className="py-2 pr-2 tabular-nums text-speed">{fmtLap(r.best_lap)}</td>
                )}
                <td className="py-2 pr-5 tabular-nums text-ink-muted">
                  {r.best_lap && pole ? (r.best_lap === pole ? "pole" : `+${(r.best_lap - pole).toFixed(3)}`) : "—"}
                </td>
                {hasGridChanges && (
                  <td className="py-2 pr-5 text-xs">
                    <StartsCell change={changeOf.get(r.driver)} penalties={penaltyMap.get(r.driver)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------- lap analysis ------------------------------ */
function LapAnalysis({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const simple = useIsSimple();
  const segs = ["Q1", "Q2", "Q3"].filter((s) => q.segment_bests[s]);
  // both modes rank the same six drivers — Advanced differs in depth, not length
  const improvers = [...q.rows]
    .filter((r) => r.improvement && r.improvement > 0)
    .sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0)).slice(0, 6);
  const pb = q.pole_sector_breakdown;
  const theoretical = pb?.session_best?.every((s) => s != null)
    ? pb!.session_best.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) : null;
  // per-segment field spread (advanced): how tightly the runners were covered
  const spreadOf = (seg: "q1" | "q2" | "q3") => {
    const times = q.rows.map((r) => r[seg]).filter((t): t is number => t != null)
      .sort((a, b) => a - b).slice(0, 10);
    return times.length >= 3 ? times[times.length - 1] - times[0] : null;
  };

  /* The numbers this page is actually about, worked out once so the opener can
     state them and the sections below can draw them on a shared scale. */
  const steps = segs.map((s, i) => ({
    seg: s,
    time: q.segment_bests[s] as number,
    drop: i > 0 && q.segment_bests[segs[i - 1]]
      ? (q.segment_bests[segs[i - 1]] as number) - (q.segment_bests[s] as number) : null,
    spread: spreadOf(s.toLowerCase() as "q1" | "q2" | "q3"),
  }));
  const totalDrop = steps.length > 1 ? steps[0].time - steps[steps.length - 1].time : null;
  const biggestDrop = Math.max(0.001, ...steps.map((s) => s.drop ?? 0));
  const biggestStep = steps.filter((s) => s.drop != null)
    .sort((a, b) => (b.drop ?? 0) - (a.drop ?? 0))[0];
  const bestGain = Math.max(0.001, ...improvers.map((r) => r.improvement ?? 0));
  const timed = q.rows.filter((r) => r.best_lap != null).length;

  const lede = totalDrop != null && biggestStep
    ? `The benchmark fell ${totalDrop.toFixed(3)}s from ${steps[0].seg} to ${steps[steps.length - 1].seg}, and ${biggestStep.drop!.toFixed(3)}s of it arrived in ${biggestStep.seg}.`
    : q.pole_lap != null
      ? `Pole was set at ${fmtLap(q.pole_lap)}.`
      : "Segment times aren't available for this session.";

  return (
    <div className="space-y-4">
      {/* The page opens the way Race Story and Qualifying Story do: a sentence
          that says what the timesheet means, with the figures it is claiming
          alongside it. It used to open with a bare card of three times, which
          is why it read as a spreadsheet and got skimmed. */}
      <StoryPanel
        icon={<LineChart size={14} />} tone="speed"
        kicker={<Term term="session progression">Lap analysis</Term>}
        story={[
          lede,
          ...(q.track_evolving
            ? ["Rubber built up on the racing line all session, so the final run in each segment carried the most weight — a lap set early was never going to be the lap that counted."]
            : []),
          ...(improvers.length
            ? [`${improvers[0].name} found the most, taking ${improvers[0].improvement!.toFixed(3)}s off between their first run and their last.`]
            : []),
        ]}
        highlights={[
          ...(q.pole_lap != null ? [{ label: "Pole lap", value: fmtLap(q.pole_lap), tone: "accent" as const }] : []),
          ...(totalDrop != null
            ? [{ label: "Session gain", value: `−${totalDrop.toFixed(3)}s`, tone: "speed" as const,
                 sub: `${steps[0].seg} to ${steps[steps.length - 1].seg}` }] : []),
          { label: "Cars timed", value: timed, term: "cars timed" },
          { label: "Deleted laps", term: "deleted lap",
            value: q.deleted_laps.length || "None",
            tone: (q.deleted_laps.length ? "bad" : "good") as VisualTone },
        ]}
      />

      {/* Q1 → Q2 → Q3 as a staircase you can SEE descending. Every segment
          draws its step on one shared scale, so "where did the time arrive?"
          is answered by the length of a bar rather than by comparing three
          decimal numbers in your head. */}
      {segs.length > 0 && (
        <Card>
          <CardHeader title={<Term term="session progression">Session progression</Term>}
            subtitle="The benchmark lap of each knockout segment, and where the time arrived"
            info={<InfoTip text="The best lap of each knockout segment. The benchmark falls through the session as fuel comes down, softer tyres go on and the track gains grip." />} />
          <CardBody>
            <div className="grid items-start gap-2.5 sm:grid-cols-3">
              {steps.map((st, i) => {
                const last = i === steps.length - 1;
                const best = biggestStep?.seg === st.seg && st.drop != null;
                return (
                  <div key={st.seg}
                    className={cx("group/seg relative overflow-hidden rounded-xl border p-4 transition-colors duration-200",
                      best ? "border-speed/35 bg-speed/[0.05]" : "border-white/[0.07] bg-base-800/50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        <Term term={st.seg.toLowerCase()}>{st.seg}</Term>
                      </span>
                      {last && <Badge tone="good">Decides Pole</Badge>}
                      {best && !last && <Badge tone="key">Biggest step</Badge>}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtLap(st.time)}</div>

                    {/* the step itself, on the scale of the biggest step in the
                        session — the descent is a shape, not a sentence */}
                    {st.drop != null ? (
                      <div className="mt-2.5">
                        <Meter label={`Faster than ${steps[i - 1].seg}`} plainLabel
                          value={`−${st.drop.toFixed(3)}s`} tone="speed"
                          pct={(st.drop / biggestDrop) * 100}
                          scaleMin="No gain" scaleMax={`−${biggestDrop.toFixed(2)}s — biggest step`} />
                      </div>
                    ) : (
                      <div className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">
                        The opening benchmark — everything after this is measured against it.
                      </div>
                    )}

                    {!simple && st.spread != null && (
                      <div className="mt-2.5 border-t border-white/[0.06] pt-2 text-[11.5px] tabular-nums text-ink-faint">
                        Top runners covered by {st.spread.toFixed(3)}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!simple && q.team_progression.length > 0 && (
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Constructors that found the most, {steps[0]?.seg} → final segment
                </div>
                <div className="space-y-2">
                  {q.team_progression.slice(0, 4).map((t) => (
                    <div key={t.team} className="flex items-center gap-2.5">
                      <span className="flex w-32 shrink-0 items-center gap-2 sm:w-40">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="truncate text-[12.5px] text-ink-muted">{t.team}</span>
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <span className="block h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{
                            width: `${Math.max(6, (t.gain / Math.max(0.001, q.team_progression[0].gain)) * 100)}%`,
                            background: t.color,
                          }} />
                      </span>
                      <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-emerald-300">
                        −{t.gain.toFixed(3)}s
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* pole lap forensics — advanced only */}
      {!simple && (
        <Card>
          <CardHeader title="Pole lap breakdown"
            subtitle="The pole sitter's sectors against the best anyone managed"
            info={<InfoTip text="The pole sitter's best sectors against the session-best in each sector. Matching all three would make the pole lap the theoretical perfect lap." />} />
          <CardBody>
            {pb && pb.pole.some(Boolean) ? (
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pb.pole.map((s, i) => {
                  const best = pb.session_best[i];
                  const deficit = s != null && best != null ? Math.max(0, s - best) : null;
                  const isBest = deficit != null && deficit <= 0.0005;
                  // the deficits are tiny numbers; scaled against the worst of
                  // the three they become a shape you can rank at a glance
                  const worst = Math.max(0.001, ...pb.pole.map((v, j) => {
                    const b = pb.session_best[j];
                    return v != null && b != null ? Math.max(0, v - b) : 0;
                  }));
                  return (
                    <div key={i}
                      className={cx("rounded-xl border p-4 transition-colors duration-200",
                        isBest ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-white/[0.07] bg-base-800/50")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                          <Term term="sector">Sector {i + 1}</Term>
                        </span>
                        {isBest && <Badge tone="good">Session best</Badge>}
                      </div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {s ? s.toFixed(3) : "—"}
                      </div>
                      {deficit != null && !isBest && (
                        <div className="mt-2.5">
                          <Meter label="Lost to the best" plainLabel value={`+${deficit.toFixed(3)}`}
                            tone="amber" pct={(deficit / worst) * 100}
                            scaleMin="Matched it" scaleMax={`+${worst.toFixed(3)} — worst sector`} />
                        </div>
                      )}
                      {isBest && (
                        <div className="mt-2 text-[12px] leading-relaxed text-emerald-300">
                          Nobody went quicker through here all session.
                        </div>
                      )}
                    </div>
                  );
                })}
                {theoretical != null && q.pole_lap != null && (
                  <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                      <Term term="theoretical lap">Theoretical best</Term>
                    </span>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtLap(theoretical)}</div>
                    <div className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                      {(q.pole_lap - theoretical) <= 0.001
                        ? "The pole lap left nothing on the table — it was the perfect lap."
                        : `Pole left ${(q.pole_lap - theoretical).toFixed(3)}s out there. Nobody drove this lap; it is the session's best sectors added together.`}
                    </div>
                  </div>
                )}
              </div>
            ) : <p className="text-[12.5px] text-ink-muted">Sector times aren&apos;t available for this session.</p>}
          </CardBody>
        </Card>
      )}

      {/* Where the time was found. Every driver's gain is drawn against the
          biggest gain in the session, so the ranking is visible before it is
          read — and each row opens for the segment-by-segment breakdown
          instead of printing it at everyone all the time. */}
      <Card>
        <CardHeader title="Where the time was found"
          subtitle="Each driver's gain from their first run to their final best lap"
          info={<InfoTip text={simple
            ? "How much time each driver found between their early runs and their final best lap."
            : "Session-long gain from first-run best to final best. Percentage is relative to their Q1 time; segment splits show where the time actually arrived; teammate delta contextualizes the machinery."} />} />
        <CardBody>
          {improvers.length ? (
            <InsightGrid cols={3}>
              {improvers.map((r, i) => {
                const pct = r.q1 && r.improvement ? (r.improvement / r.q1) * 100 : null;
                const gainQ12 = r.q1 && r.q2 ? r.q1 - r.q2 : null;
                const gainQ23 = r.q2 && r.q3 ? r.q2 - r.q3 : null;
                return (
                  <InsightCard key={r.driver}
                    icon={<TrendingUp size={14} />} tone={i === 0 ? "speed" : "good"}
                    label={i === 0 ? "Found the most" : `#${i + 1} improver`}
                    value={r.name} driver={driverOf(session, r.driver)}
                    sub={`${r.team}${r.position ? ` · qualified P${r.position}` : ""}`}
                    visual={
                      <Meter label="Time found" labelTerm="time found"
                        value={`−${r.improvement!.toFixed(3)}s`} tone={i === 0 ? "speed" : "good"}
                        pct={(r.improvement! / bestGain) * 100}
                        scaleMin="No gain" scaleMax={`−${bestGain.toFixed(2)}s — best in session`}
                        hint={pct != null ? `That is ${pct.toFixed(1)}% off their opening time.` : undefined} />
                    }
                    takeaway={(() => {
                      // name the step and the number: six drivers all reading
                      // "most of it arrived early" looks like a bug, and tells
                      // the reader nothing they couldn't have guessed
                      if (gainQ12 == null && gainQ23 == null) return "Improved steadily through the session.";
                      if (gainQ23 == null) return `Found ${gainQ12!.toFixed(3)}s between Q1 and Q2.`;
                      if (gainQ12 == null) return `Found ${gainQ23.toFixed(3)}s between Q2 and Q3.`;
                      return gainQ23 > gainQ12
                        ? `Saved it for Q3 — ${gainQ23.toFixed(3)}s of it came there.`
                        : `Most of it in Q1 → Q2: ${gainQ12.toFixed(3)}s.`;
                    })()}
                    detail={!simple ? (
                      <div className="space-y-1 tabular-nums">
                        {r.q1 && (r.q3 || r.q2) && (
                          <p>Q1 {fmtLap(r.q1)} → {r.q3 ? `Q3 ${fmtLap(r.q3)}` : `Q2 ${fmtLap(r.q2)}`}</p>
                        )}
                        {(gainQ12 != null || gainQ23 != null) && (
                          <p>
                            Where it came:{" "}
                            {gainQ12 != null && <>Q1→Q2 <span className="text-emerald-300">−{gainQ12.toFixed(3)}s</span></>}
                            {gainQ12 != null && gainQ23 != null && " · "}
                            {gainQ23 != null && <>Q2→Q3 <span className="text-emerald-300">−{gainQ23.toFixed(3)}s</span></>}
                          </p>
                        )}
                        {r.vs_teammate != null && (
                          <p>
                            <Term term="teammate delta">vs teammate</Term>:{" "}
                            <span className={r.vs_teammate < 0 ? "text-emerald-300" : "text-rose-300"}>
                              {r.vs_teammate < 0 ? "−" : "+"}{Math.abs(r.vs_teammate).toFixed(3)}s
                            </span>
                          </p>
                        )}
                      </div>
                    ) : undefined} />
                );
              })}
            </InsightGrid>
          ) : <p className="text-[12.5px] text-ink-muted">No meaningful in-session improvements detected.</p>}
        </CardBody>
      </Card>


      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* interruptions as explained event cards, not echoed flags */}
        <Card>
          <CardHeader title="Interruptions"
            info={<InfoTip label="What counts" text="An interruption is a stoppage or neutralisation — a red flag, safety car or VSC. Local yellow flags are reported separately: the session kept running through them." />} />
          <CardBody className="space-y-2">
            {q.interruptions.length ? q.interruptions.map((it, i) => {
              const who = it.driver_name ?? it.driver;
              const plain = who
                ? `Session stopped after ${who} ${it.cause ?? "brought out the red flag"}${it.turn ? ` at ${it.turn}` : ""}.`
                : `Session stopped${it.turn ? ` after an incident at ${it.turn}` : ""}.`;
              return (
                <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-400/15">
                      <Flag size={15} className="text-rose-300" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-rose-200">Red flag</span>
                        {it.lap != null && <Badge tone="neutral">Lap {it.lap}</Badge>}
                        {it.turn && <Badge tone="neutral">{it.turn}</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs leading-relaxed text-ink-muted">{plain}</div>
                      {it.driver && (
                        <div className="mt-1.5">
                          <DriverBadge driver={driverOf(session, it.driver)} code={it.driver} size={22} />
                        </div>
                      )}
                    </div>
                  </div>
                  {!simple && (
                    <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2">
                      <p className="rounded-md bg-base-900/60 px-2 py-1 font-mono text-[11px] text-ink-muted">{it.message}</p>
                      <p className="text-[11px] leading-relaxed text-ink-faint">
                        Impact: everyone&apos;s remaining runs were compressed into less track time, and
                        the first <Term term="flying lap">flying laps</Term> after the restart came on
                        cooler tyres and a cooler track — drivers still without a banker lap at the
                        stoppage carried the elimination risk.
                      </p>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400/15">
                  <Flag size={15} className="text-emerald-300" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-emerald-200">Clean session</div>
                  <div className="text-xs text-ink-muted">
                    The session was never stopped{!simple ? ", so the timesheet reflects pure pace rather than timing luck" : ""}.
                    {localYellowNote(session)}
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* deleted laps as parsed driver cards */}
        <Card>
          <CardHeader title={<Term term="deleted lap">Deleted laps</Term>}
            info={<InfoTip text="Laps removed by race control, usually for exceeding track limits — a deleted lap can decide an elimination." />} />
          <CardBody className="space-y-2">
            {q.deleted_laps.length ? q.deleted_laps.map((m, i) => {
              const d = parseDeleted(m, session);
              return (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-base-800/50 p-3">
                  <div className="flex items-center gap-2.5">
                    <DriverBadge driver={d.driver} code={d.code ?? "?"} size={26} />
                    <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                      <Term term="track limits"><Badge tone="neutral">{d.reason}</Badge></Term>
                      {d.turn && <Badge tone="neutral">{d.turn}</Badge>}
                      {d.lap && <Badge tone="neutral">Lap {d.lap}</Badge>}
                    </span>
                  </div>
                  {!simple && d.code && (() => {
                    const row = q.rows.find((r) => r.driver === d.code);
                    return row?.knocked_out_in ? (
                      <p className="mt-1.5 text-[11px] leading-snug text-amber/90">
                        Eliminated in {row.knocked_out_in} (P{row.position}) — a deletion in the
                        danger zone can be the difference at the cut.
                      </p>
                    ) : row?.position ? (
                      <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
                        Still qualified P{row.position} — the deletion didn&apos;t prove costly.
                      </p>
                    ) : null;
                  })()}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] text-ink-faint hover:text-ink-muted">
                      Race control message
                    </summary>
                    <p className="mt-1 rounded-md bg-base-900/60 px-2 py-1 font-mono text-[11px] text-ink-muted">{m}</p>
                  </details>
                </div>
              );
            }) : <p className="text-sm text-ink-faint">No laps were deleted — everyone kept it inside the white lines.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** "CAR 4 (NOR) LAP DELETED — TRACK LIMITS AT TURN 10 LAP 15" → structured card */
function parseDeleted(msg: string, session: RaceSession) {
  const code = msg.match(/\(([A-Z]{2,3})\)/)?.[1] ?? null;
  const turn = msg.match(/TURN\s*\d+/i)?.[0] ?? null;
  const lap = msg.match(/\bLAP\s*(\d+)/i)?.[1] ?? null;
  const reason = /TRACK\s*LIMITS/i.test(msg) ? "Track limits" : "Lap deleted";
  return {
    code, lap,
    turn: turn ? turn.charAt(0) + turn.slice(1).toLowerCase() : null,
    reason,
    driver: driverOf(session, code),
  };
}

/* ------------------------------- pace ---------------------------------- */
/**
 * One-lap pace, built from the same component vocabulary as the race Pace tab:
 * a single card with a Drivers / Constructors toggle and one bar-chart
 * language, so the statistic looks the same whichever session you're in.
 * Simple keeps the clean ranking; Advanced adds the gap column and, for
 * drivers, the segment each lap came from.
 */
function QualiPace({ q, session }: { q: QualifyingSummary; session: RaceSession }) {
  const simple = useIsSimple();
  const timed = q.rows.filter((r) => r.best_lap);
  const poleT = timed[0]?.best_lap ?? 0;

  return (
    <PaceBoard
      title="One-lap pace"
      showNotes={!simple}
      views={[
        {
          id: "drivers", label: "Drivers", icon: <User size={12} />,
          heroLabel: "Quickest lap",
          measures: "Every driver's best lap of the session, ranked against pole.",
          info: "Every driver's best lap of the session, ranked. Bars show how far each lap was from pole.",
          entries: timed.map((r) => ({
            key: r.driver, name: r.name, sub: r.team, color: r.team_color,
            driver: driverOf(session, r.driver),
            value: fmtLap(r.best_lap), gap: (r.best_lap ?? 0) - poleT,
          })),
          emptyTitle: "No timed laps",
        },
        {
          id: "constructors", label: "Constructors", icon: <Building2 size={12} />,
          heroLabel: "Quickest constructor",
          measures: "Constructors ranked by their quickest car's best lap.",
          info: "Constructors ranked by their quickest car's best lap — the one-lap machinery order. Bars show the gap to the quickest constructor.",
          entries: q.team_ranking.map((t) => ({
            key: t.team, name: t.team, color: t.color,
            value: fmtLap(timed.find((r) => r.team === t.team)?.best_lap ?? null),
            gap: t.gap,
          })),
          emptyTitle: "No constructor pace",
        },
      ]}
    />
  );
}

