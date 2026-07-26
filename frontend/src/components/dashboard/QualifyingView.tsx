"use client";
import { useState } from "react";
import {
  AlertTriangle, ArrowDownWideNarrow, Building2, ChevronRight, CloudSun, Flag, Gauge, Gavel,
  Medal, Ruler, Sparkles, Target, Thermometer, TrendingDown, TrendingUp, User, Zap,
} from "lucide-react";
import type { Driver, QualifyingSummary, RaceSession } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Term } from "@/components/ui/Term";
import { EmptyState } from "@/components/ui/misc";
import { cx, fmtLap } from "@/lib/format";
import { deriveWindows, sessionInterruptions } from "@/lib/raceEvents";
import { derivePenalties, finalPenalties, gridPenaltiesByDriver, penaltiesByDriver } from "@/lib/penalties";
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

  // biggest teammate delta (advanced card)
  const tmate = [...q.rows]
    .filter((r) => r.vs_teammate != null && r.vs_teammate < 0)
    .sort((a, b) => (a.vs_teammate ?? 0) - (b.vs_teammate ?? 0))[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> How the {isSprintQ(session) ? "Sprint grid" : "grid"} was earned</span>} />
        <CardBody className="space-y-2.5">
          {story.map((s, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink"><span className="mr-2 text-accent-soft">•</span>{s}</p>
          ))}
          {q.notes.map((n, i) => <p key={i} className="text-xs text-amber">{n}</p>)}
        </CardBody>
      </Card>

      {/* Simple: the six takeaways. Advanced: the full analyst card set. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QCard icon={<Medal size={15} />} tone="accent"
          label={<Term term="pole margin">Pole position</Term>}
          value={nameOf(q.pole_driver)} avatar={<DriverAvatar driver={driverOf(session, q.pole_driver)} size={34} />}
          sub={q.pole_lap ? fmtLap(q.pole_lap) : undefined}
          why={q.pole_margin != null ? `${q.pole_margin.toFixed(3)}s clear of the next car.` : "Quickest single lap of the session."} />
        <QCard icon={<Ruler size={15} />} tone="speed" label="Closest margin"
          value={q.closest_pair ? `${q.closest_pair.a} vs ${q.closest_pair.b}` : "—"}
          sub={q.closest_pair ? `${q.closest_pair.delta.toFixed(3)}s (${q.closest_pair.positions})` : undefined}
          why="The tightest gap anywhere in the top ten." />
        <QCard icon={<Zap size={15} />} tone="amber" label="Biggest surprise"
          value={nameOf(q.biggest_surprise?.driver)}
          avatar={q.biggest_surprise ? <DriverAvatar driver={driverOf(session, q.biggest_surprise.driver)} size={34} /> : undefined}
          why={q.biggest_surprise?.reason ? q.biggest_surprise.reason + "." : "No clear over-delivery today."} />
        <QCard icon={<TrendingDown size={15} />} tone="default" label="Biggest disappointment"
          value={nameOf(q.biggest_disappointment?.driver)}
          avatar={q.biggest_disappointment ? <DriverAvatar driver={driverOf(session, q.biggest_disappointment.driver)} size={34} /> : undefined}
          why={q.biggest_disappointment?.reason ? q.biggest_disappointment.reason + "." : "Nobody badly under-delivered."} />
        <QCard icon={<CloudSun size={15} />} tone="speed" label="Track conditions"
          value={q.conditions ?? "Unknown"}
          why="Air and track state shape how much grip everyone has to play with." />
        <QCard icon={<AlertTriangle size={15} />} tone="amber" label="Interruptions"
          value={interruptionsValue(q, session)}
          why={interruptionsWhy(q, session)} />

        {!simple && (
          <>
            <QCard icon={<Gauge size={15} />} tone="accent"
              label={<Term term="sector">Fastest sectors</Term>}
              value={nameOf(q.fastest_sector_driver)}
              avatar={q.fastest_sector_driver ? <DriverAvatar driver={driverOf(session, q.fastest_sector_driver)} size={34} /> : undefined}
              why="Owns the most session-best sectors." />
            <QCard icon={<Thermometer size={15} />} tone="amber"
              label={<Term>Track evolution</Term>}
              value={q.track_evolving ? "Getting faster" : "Stable"}
              why={q.track_evolving
                ? "Rubber built up on the racing line — late runs were worth chasing."
                : "Lap times held steady through the session."} />
            <QCard icon={<Target size={15} />} tone="speed" label="Most consistent"
              value={nameOf(q.most_consistent_driver)}
              avatar={q.most_consistent_driver ? <DriverAvatar driver={driverOf(session, q.most_consistent_driver)} size={34} /> : undefined}
              why="Smallest spread across their push laps." />
            <QCard icon={<TrendingUp size={15} />} tone="speed" label="Biggest improvement"
              value={nameOf(q.biggest_improvement_driver)}
              avatar={q.biggest_improvement_driver ? <DriverAvatar driver={driverOf(session, q.biggest_improvement_driver)} size={34} /> : undefined}
              sub={rowOf(q.biggest_improvement_driver)?.improvement ? `−${rowOf(q.biggest_improvement_driver)!.improvement!.toFixed(2)}s` : undefined}
              why="Found the most time from first run to last." />
            <QCard icon={<Flag size={15} />} tone="default"
              label={<Term term="deleted lap">Deleted laps</Term>}
              value={q.deleted_laps.length ? `${q.deleted_laps.length} deleted` : "None"}
              why={q.deleted_laps.length
                ? "Track-limits deletions — details in Lap Analysis."
                : "Nobody lost a time to track limits."} />
            <QCard icon={<ArrowDownWideNarrow size={15} />} tone="accent"
              label={<Term term="teammate delta">Teammate delta</Term>}
              value={tmate ? nameOf(tmate.driver) : "—"}
              avatar={tmate ? <DriverAvatar driver={driverOf(session, tmate.driver)} size={34} /> : undefined}
              sub={tmate?.vs_teammate ? `${Math.abs(tmate.vs_teammate).toFixed(3)}s quicker` : undefined}
              why="The biggest gap between two identical cars — the cleanest driver-vs-driver read." />
          </>
        )}
      </div>

      <GridPenaltyCallout session={session} changes={q.grid_changes} />
      <GridTable q={q} session={session} simple={simple} />
    </div>
  );
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

// Grid penalties change where these cars actually start — impossible to miss.
// Two honest sources: penalties announced during the session (race control),
// and post-session decisions verified against the official starting grid.
function GridPenaltyCallout({ session, changes }: { session: RaceSession; changes?: QualifyingSummary["grid_changes"] }) {
  const grid = gridPenaltiesByDriver(derivePenalties(session.race_control));
  const verified = (changes ?? []).filter((c) => !grid.has(c.driver));
  if (!grid.size && !verified.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-400/30 bg-violet-400/[0.07] px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
        <Gavel size={13} /> This grid will change
      </span>
      {[...grid.entries()].map(([code, pens]) => (
        <span key={code} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="font-bold text-ink">{code}</span>
          <PenaltyBadges penalties={pens} />
        </span>
      ))}
      {verified.map((c) => (
        <span key={c.driver} className="flex items-center gap-1.5 text-xs text-ink-muted"
          title={`Qualified P${c.qualified}, starts P${c.starts} on the official grid`}>
          <span className="font-bold text-ink">{c.driver}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/45 bg-violet-400/12 px-2 py-0.5 text-[10px] font-bold text-violet-300">
            <Gavel size={10} /> P{c.qualified}→P{c.starts}
          </span>
        </span>
      ))}
      <span className="text-[11px] text-ink-faint">Steward decisions apply before the race start.</span>
    </div>
  );
}

function GridTable({ q, session, simple }: { q: QualifyingSummary; session: RaceSession; simple: boolean }) {
  const pole = q.rows.find((r) => r.position === 1)?.best_lap ?? q.rows[0]?.best_lap ?? null;
  const hasSegments = q.rows.some((r) => r.q1 || r.q2 || r.q3);
  const showSegments = !simple && hasSegments;
  // classification badges show final steward decisions only — investigations
  // and deleted laps are session noise here (deleted laps live in Lap Analysis)
  const penaltyMap = penaltiesByDriver(finalPenalties(derivePenalties(session.race_control)));
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
                      size={26} className="w-48 min-w-0" />
                    <span className="w-[5.5rem] shrink-0">
                      {r.knocked_out_in && (
                        <Term term={`out in ${r.knocked_out_in.toLowerCase()}`}>
                          <Badge tone="neutral">out in {r.knocked_out_in}</Badge>
                        </Term>
                      )}
                    </span>
                    <PenaltyBadges penalties={penaltyMap.get(r.driver)} />
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

  return (
    <div className="space-y-4">
      {/* Q1 → Q2 → Q3 as a connected flow, not three lonely tiles */}
      {segs.length > 0 && (
        <Card>
          <CardHeader title={<Term term="session progression">Session progression</Term>}
            info={<InfoTip text="The best lap of each knockout segment. The benchmark falls through the session as fuel comes down, softer tyres go on and the track gains grip." />} />
          <CardBody>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {segs.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-2">
                  {i > 0 && (
                    <span className="hidden shrink-0 items-center text-ink-faint sm:flex">
                      <ChevronRight size={18} />
                    </span>
                  )}
                  <div className="flex-1 rounded-xl border border-white/[0.06] bg-base-800/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="label"><Term term={s.toLowerCase()}>{s}</Term></span>
                      {i === segs.length - 1 && <Badge tone="good">Decides Pole</Badge>}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtLap(q.segment_bests[s])}</div>
                    {i > 0 && q.segment_bests[segs[i - 1]] && (
                      <div className="mt-0.5 text-xs tabular-nums text-emerald-300">
                        ▼ {(q.segment_bests[segs[i - 1]] - q.segment_bests[s]).toFixed(3)}s faster than {segs[i - 1]}
                      </div>
                    )}
                    {!simple && (() => {
                      const sp = spreadOf(s.toLowerCase() as "q1" | "q2" | "q3");
                      return sp != null && (
                        <div className="mt-0.5 text-[11px] tabular-nums text-ink-faint">
                          top runners covered by {sp.toFixed(3)}s
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
            {q.track_evolving && (
              <p className="mt-3 text-sm text-ink-muted">
                <Term>Track evolution</Term> did part of the work — rubber built up on the racing
                line all session, so the final runs in each segment carried the most weight.
              </p>
            )}
            {!simple && q.team_progression.length > 0 && (
              <div className="mt-4 border-t border-white/[0.05] pt-3">
                <div className="label mb-2">Teams that found the most time, Q1 → final segment</div>
                <div className="flex flex-wrap gap-2">
                  {q.team_progression.slice(0, 4).map((t) => (
                    <span key={t.team} className="chip">
                      <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                      {t.team} <span className="tabular-nums text-emerald-300">−{t.gain.toFixed(3)}s</span>
                    </span>
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
          <CardHeader title={<span>Pole lap breakdown</span>}
            info={<InfoTip text="The pole sitter's best sectors against the session-best in each sector. Matching all three would make the pole lap the theoretical perfect lap." />} />
          <CardBody>
            {pb && pb.pole.some(Boolean) ? (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {pb.pole.map((s, i) => {
                  const best = pb.session_best[i];
                  const isBest = s != null && best != null && s <= best;
                  return (
                    <div key={i} className={`rounded-xl border p-4 ${isBest
                      ? "border-emerald-400/25 bg-emerald-400/[0.05]"
                      : "border-white/[0.06] bg-base-800/50"}`}>
                      <div className="label"><Term term="sector">Sector {i + 1}</Term></div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{s ? s.toFixed(3) : "—"}</div>
                      {isBest
                        ? <div className="mt-0.5 text-xs font-medium text-emerald-300">session best</div>
                        : best != null && s != null && (
                          <div className="mt-0.5 text-xs tabular-nums text-amber">+{(s - best).toFixed(3)} vs session best</div>
                        )}
                    </div>
                  );
                })}
                {theoretical != null && q.pole_lap != null && (
                  <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-4">
                    <div className="label"><Term term="theoretical lap">Theoretical best</Term></div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtLap(theoretical)}</div>
                    <div className="mt-0.5 text-xs tabular-nums text-ink-muted">
                      pole lap left {(q.pole_lap - theoretical) <= 0.001 ? "nothing" : `${(q.pole_lap - theoretical).toFixed(3)}s`} on the table
                    </div>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-ink-faint">Sector times aren&apos;t available for this session.</p>}
          </CardBody>
        </Card>
      )}

      {/* biggest improvements — the same six drivers in both modes; Advanced
          differs in depth (segment gains, %, teammate delta), not length */}
      <Card>
        <CardHeader title="Biggest improvements"
          info={<InfoTip text={simple
            ? "How much time each driver found between their early runs and their final best lap."
            : "Session-long gain from first-run best to final best. Percentage is relative to their Q1 time; segment splits show where the time actually arrived; teammate delta contextualizes the machinery."} />} />
        <CardBody>
          {improvers.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {improvers.map((r, i) => {
                const pct = r.q1 && r.improvement ? (r.improvement / r.q1) * 100 : null;
                const gainQ12 = r.q1 && r.q2 ? r.q1 - r.q2 : null;
                const gainQ23 = r.q2 && r.q3 ? r.q2 - r.q3 : null;
                return (
                  <div key={r.driver} className="rounded-xl border border-white/[0.06] bg-base-800/50 p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-ink-faint">{i + 1}</span>
                      <DriverAvatar driver={driverOf(session, r.driver)} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{r.name}</div>
                        <div className="truncate text-[11px] text-ink-faint">
                          {r.team}{r.position ? ` · qualified P${r.position}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-300">
                        −{r.improvement!.toFixed(2)}s
                      </span>
                    </div>
                    {!simple && (
                      <div className="mt-2.5 space-y-1 border-t border-white/[0.05] pt-2 text-[11px] tabular-nums text-ink-muted">
                        {r.q1 && (r.q3 || r.q2) && (
                          <div>Q1 {fmtLap(r.q1)} → {r.q3 ? "Q3 " + fmtLap(r.q3) : "Q2 " + fmtLap(r.q2)}
                            {pct != null && <span className="text-emerald-300"> ({pct.toFixed(1)}%)</span>}
                          </div>
                        )}
                        {(gainQ12 != null || gainQ23 != null) && (
                          <div>
                            Where it came:{" "}
                            {gainQ12 != null && <span>Q1→Q2 <span className="text-emerald-300">−{gainQ12.toFixed(2)}s</span></span>}
                            {gainQ12 != null && gainQ23 != null && " · "}
                            {gainQ23 != null && <span>Q2→Q3 <span className="text-emerald-300">−{gainQ23.toFixed(2)}s</span></span>}
                          </div>
                        )}
                        {r.vs_teammate != null && (
                          <div>
                            <Term term="teammate delta">vs teammate</Term>:{" "}
                            <span className={r.vs_teammate < 0 ? "text-emerald-300" : "text-rose-300"}>
                              {r.vs_teammate < 0 ? "−" : "+"}{Math.abs(r.vs_teammate).toFixed(3)}s
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-ink-faint">No meaningful in-session improvements detected.</p>}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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
  const [view, setView] = useState<"drivers" | "teams">("drivers");

  const timed = q.rows.filter((r) => r.best_lap);
  const poleT = timed[0]?.best_lap ?? 0;
  const maxDelta = Math.max(0.001, ...timed.map((r) => (r.best_lap ?? 0) - poleT));
  const teamMax = Math.max(0.001, ...q.team_ranking.map((t) => t.gap));

  const viewSwitch = (
    <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs"
      role="tablist" aria-label="Pace view">
      {([["drivers", "Drivers", User], ["teams", "Constructors", Building2]] as const).map(([id, label, Icon]) => (
        <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
          className={cx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
            view === id ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  );

  const leader = view === "drivers" ? timed[0] : null;
  const topTeam = q.team_ranking[0];

  return (
    <Card>
      <CardHeader
        title="One-lap pace"
        right={viewSwitch}
        info={<InfoTip label={view === "drivers" ? "Reading one-lap pace" : "Reading constructor pace"}
          text={view === "drivers"
            ? "Every driver's best lap of the session, ranked. Bars show how far each lap was from pole."
            : "Constructors ranked by their quickest car's best lap — the one-lap machinery order. Bars show the gap to the quickest team."} />} />
      <CardBody className="space-y-2.5">
        {/* the headline, matching the race Pace tab's "fastest car" framing */}
        {view === "drivers" && leader && (
          <div className="mb-1 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-base-800/40 p-3">
            <DriverAvatar driver={driverOf(session, leader.driver)} size={38} />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Quickest lap</div>
              <div className="truncate text-sm font-bold text-ink">{leader.name}</div>
            </div>
            <span className="ml-auto tabular-nums text-sm font-semibold text-speed">{fmtLap(leader.best_lap)}</span>
          </div>
        )}
        {view === "teams" && topTeam && (
          <div className="mb-1 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-base-800/40 p-3">
            <span className="h-8 w-1.5 rounded-full" style={{ background: topTeam.color }} />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Quickest constructor</div>
              <div className="truncate text-sm font-bold text-ink">{topTeam.team}</div>
            </div>
            <span className="ml-auto tabular-nums text-sm font-semibold text-speed">
              {fmtLap(timed.find((r) => r.team === topTeam.team)?.best_lap ?? null)}
            </span>
          </div>
        )}

        {view === "drivers" ? timed.map((r, i) => {
          const delta = (r.best_lap ?? 0) - poleT;
          return (
            <div key={r.driver} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">{i + 1}</span>
              <DriverBadge driver={driverOf(session, r.driver)} code={r.driver}
                name={r.name} team={r.team} teamColor={r.team_color}
                size={24} className="w-40 shrink-0" />
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <span className="block h-full rounded-full transition-all"
                  style={{ width: `${Math.max(6, 100 - (delta / maxDelta) * 72)}%`, background: r.team_color }} />
              </span>
              <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-ink">{fmtLap(r.best_lap)}</span>
              {!simple && (
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">
                  {i === 0 ? "pole" : `+${delta.toFixed(3)}`}
                </span>
              )}
            </div>
          );
        }) : q.team_ranking.map((t, i) => (
          <div key={t.team} className="flex items-center gap-2.5">
            <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">{i + 1}</span>
            <span className="flex w-40 shrink-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="truncate text-sm font-medium">{t.team}</span>
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <span className="block h-full rounded-full transition-all"
                style={{ width: `${Math.max(6, 100 - (t.gap / teamMax) * 72)}%`, background: t.color }} />
            </span>
            <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-ink">
              {i === 0 ? "quickest" : `+${t.gap.toFixed(3)}s`}
            </span>
            {!simple && <span className="w-14 shrink-0" />}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function QCard({ icon, label, value, sub, why, tone, avatar }: any) {
  const t = { accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink" }[tone as string];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-800/60 p-4">
      <div className="flex items-center gap-1.5 text-ink-faint"><span className={t}>{icon}</span><span className="label">{label}</span></div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {avatar}
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tracking-tight text-ink">{value}</div>
          {sub && <div className="text-xs text-ink-muted">{sub}</div>}
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-snug text-ink-faint">{why}</div>
    </div>
  );
}
