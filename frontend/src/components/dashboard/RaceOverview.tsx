"use client";
import { useState } from "react";
import { Award, Flag, Timer, TrendingDown, TrendingUp } from "@/components/ui/MotionIcon";
import type { ClassificationRow, RaceBundle, RaceSession } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { StatTile } from "@/components/ui/StatTile";
import { InfoTip } from "@/components/ui/InfoTip";
import { HoverCard } from "@/components/ui/HoverCard";
import { useHoverTip } from "@/lib/useHoverTip";
import { IconTile, Meter, PositionShift, type IconAnim, type VisualTone } from "@/components/ui/Visuals";
import { InsightCard } from "@/components/ui/InsightCard";
import { cx, fmtGap, fmtLap, fmtSec, netBadge } from "@/lib/format";
import { inFinishingOrder, NOT_CLASSIFIED_HINT, positionLabel } from "@/lib/classification";
import { derivePenalties, finalPenalties, penaltiesByDriver } from "@/lib/penalties";
import { PenaltyBadges } from "@/components/ui/PenaltyBadge";

export function RaceOverview({
  bundle, simple = false, maxNet = 1,
}: { bundle: RaceBundle; simple?: boolean; maxNet?: number }) {
  const { session, strategy } = bundle;
  const dotd = session.classification.find((c) => c.driver === strategy.driver_of_the_day);
  // Everyone sees the whole field, DNFs included — Simple just reads it with
  // fewer, friendlier columns (like a TV results graphic) while Advanced keeps
  // the full grid/pits/best-lap detail. The ORDER is the shared standard: see
  // lib/classification.ts, which the Historical Explorer's table uses too.
  const rows = inFinishingOrder(session.classification);

  // Classic F1 classification timing, the way the FIA and every broadcast
  // present it: the winner carries the full classified race time, everyone
  // else shows their gap to the winner, lapped cars read "+N Lap(s)", and
  // retirements read a plain "Retired" (the lap lives in the DNF tooltip —
  // no duplication). The winner's total prefers the archive's classified
  // race_time and falls back to a lap-time sum.
  const lapSumOf = new Map<string, number>();
  {
    const sum: Record<string, number> = {}, cnt: Record<string, number> = {};
    for (const lp of session.laps) {
      if (lp.lap_time == null) continue;
      sum[lp.driver] = (sum[lp.driver] ?? 0) + lp.lap_time; cnt[lp.driver] = (cnt[lp.driver] ?? 0) + 1;
    }
    for (const c of rows) {
      if (c.retired) continue;
      const need = c.laps_completed ?? session.total_laps;
      if (sum[c.driver] != null && cnt[c.driver] >= need - 1) lapSumOf.set(c.driver, sum[c.driver]);
    }
  }
  const finishTime = (c: ClassificationRow) => {
    if (c.retired) return "Retired";
    if (c.position === 1) {
      const t = c.race_time ?? lapSumOf.get(c.driver);
      return t != null ? fmtRaceTime(t) : "Winner";
    }
    if (/lap/i.test(c.status)) return c.status;              // "+1 Lap" — off the lead lap
    return fmtGap(c.position, c.gap);                        // "+5.832" style
  };
  // Final steward decisions only, beside the driver — investigations and
  // deleted laps are session noise in a results table.
  const penaltyMap = penaltiesByDriver(finalPenalties(derivePenalties(session.race_control)));

  return (
    <div className="space-y-4">
      {/* headline tiles + strategy verdicts are analyst material — Advanced only
          (Winner already appears in the key cards above and is never repeated) */}
      {!simple && (
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <StatTile label="Standout drive" tone="accent" icon={<Award size={14} />}
            value={
              <span className="flex items-center gap-2.5">
                <DriverAvatar size={34}
                  driver={session.drivers.find((d) => d.code === strategy.driver_of_the_day) ?? null} />
                {/* tone colours the glyph, never a driver's name — a name must
                    read the same on every card in the product */}
                <span className="truncate text-xl text-ink">
                  {dotd?.name ?? strategy.driver_of_the_day ?? "—"}
                </span>
              </span>
            }
            /* Three facts, shown as three things. `dotd_reason` joins the same
               evidence with semicolons — "gained 1 place (P3 → P2); top-3 race
               pace; 2-stop execution" — which is a sentence to read where a row
               of chips is a glance. The sentence stays as the tooltip. */
            sub={strategy.dotd_factors?.length ? (
              <span className="flex flex-wrap gap-1">
                {strategy.dotd_factors.map((f) => (
                  <span key={f}
                    className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent-soft">
                    {f}
                  </span>
                ))}
              </span>
            ) : (strategy.dotd_reason ?? undefined)}
            info="Pitwall IQ's own data-driven pick: positions gained, weighted by race pace and a win-from-behind bonus. This is NOT the official fan-voted Driver of the Day — that's a public vote, which isn't part of the timing data." />
          {strategy.avg_pit_loss != null ? (
            <StatTile label="Avg pit loss" tone="speed" icon={<Timer size={14} />}
              value={fmtSec(strategy.avg_pit_loss)}
              sub={strategy.avg_pit_loss_kind === "estimated" ? "estimated" : "pit-lane time"}
              info="Average pit-lane time lost per stop across the field — the cost of a green-flag stop." />
          ) : (
            <StatTile label="Avg pit loss" icon={<Timer size={14} />} value="Unavailable"
              sub="not provided by source"
              info="This session's source doesn't include pit-lane timing. OpenF1/Jolpica provide it where available." />
          )}
          <StatTile label="Race distance" tone="violet" icon={<Flag size={14} />}
            value={`${session.total_laps} laps`}
            sub={session.circuit?.name ?? session.grand_prix} />
        </div>
      )}

      {/* strategy verdicts — cards with no data are hidden, never shown empty */}
      {!simple && (
        <div className="grid items-start gap-3 md:grid-cols-3">
          {strategy.best_strategy && (
            <VerdictCard tone="good" icon={<Award size={14} />}
              title="Best strategy" session={session}
              driver={strategy.best_strategy.driver} detail={strategy.best_strategy.detail}
              /* the verdict IS the shift: where raw pace put them, where they
                 actually finished. Two numbers and an arrow beat the sentence
                 that used to spell the same thing out. */
              visual={<PositionShift from={strategy.best_strategy.pace_rank}
                to={strategy.best_strategy.finish} fromLabel="Pace P" toLabel="Finish P" />}
              takeaway={gainText(strategy.best_strategy, "better")} />
          )}
          {strategy.worst_strategy && (
            <VerdictCard tone="bad" icon={<TrendingDown size={14} />}
              title="Costliest strategy" session={session}
              driver={strategy.worst_strategy.driver} detail={strategy.worst_strategy.detail}
              visual={<PositionShift from={strategy.worst_strategy.pace_rank}
                to={strategy.worst_strategy.finish} fromLabel="Pace P" toLabel="Finish P" />}
              takeaway={gainText(strategy.worst_strategy, "worse")} />
          )}
          {strategy.best_pit_timing && (
            <VerdictCard tone="key" icon={<Timer size={14} />} title="Best pit timing"
              session={session}
              driver={strategy.best_pit_timing.driver} detail={strategy.best_pit_timing.detail}
              visual={pitTimingVisual(strategy.best_pit_timing)}
              takeaway={strategy.best_pit_timing.saved_s != null
                ? `Lap ${strategy.best_pit_timing.lap} — a discounted stop.`
                : `Lap ${strategy.best_pit_timing.lap} — quickest of the race.`} />
          )}
        </div>
      )}

      {/* classification + movers */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Final classification"
            info={<InfoTip label={simple ? "Reading the results" : "Grid → Finish"} text={simple
              ? "Every car, in finishing order. The winner shows the full race time; everyone else shows their gap to the winner. Hover a DNF badge for the retirement lap."
              : "The winner shows the official race time; every other finisher shows the gap to the winner (the classic FIA presentation). The ▲/▼ badge is net positions gained or lost versus the starting grid."} />} />
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
                      <th className="py-2 pr-2">Best</th><th className="py-2 pr-2">Time / Retired</th>
                    </>
                  )}
                  <th className="py-2 pr-5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const nb = netBadge(c.grid && c.position ? c.grid - c.position : null);
                  return (
                    /* A retirement recedes rather than shouting. It is still a
                       full row with a real classified position in it — it is
                       simply not a result at the same level as a car that
                       reached the flag, which is how a timing screen has always
                       said so, and how the Historical Explorer already did. */
                    <tr key={c.driver}
                      className={cx("border-b border-white/[0.04]", c.retired && "opacity-60")}>
                      <td className="py-2 pl-5 pr-2 font-semibold tabular-nums">
                        {c.position == null ? (
                          <span title={NOT_CLASSIFIED_HINT} className="text-ink-faint">NC</span>
                        ) : positionLabel(c.position)}
                      </td>
                      <td className="py-2 pr-2">
                        {/* The badges get their own track rather than trailing
                            the name: two penalties on one driver used to wrap
                            onto a second line, which made that row taller than
                            every other and broke the column the rest of them
                            were aligned in. */}
                        <span className="flex items-center gap-2">
                          {/* fixed-width identity block so status badges align in a
                              clean column regardless of name length */}
                          <DriverBadge driver={session.drivers.find((d) => d.code === c.driver)}
                            code={c.driver} name={c.name} team={c.team} teamColor={c.team_color}
                            size={26} className="w-56 min-w-0" />
                          {/* NO `overflow-hidden` HERE. It was added in V67 to stop two
                              penalties on one driver wrapping onto a second line and
                              making that row taller than every other — and it also
                              clipped away both badges' hover cards, which is the whole
                              of the "penalties lost their tooltip" report. The badges
                              are portalled now, so they cannot be cropped by anything;
                              the row keeps its height because the track does not wrap. */}
                          <span className="flex min-w-0 shrink items-center gap-1.5">
                            {c.retired && <DnfBadge row={c} />}
                            <PenaltyBadges penalties={penaltyMap.get(c.driver)} />
                          </span>
                        </span>
                      </td>
                      {simple ? (
                        <td className="py-2 pr-2 tabular-nums text-ink-muted">{finishTime(c)}</td>
                      ) : (
                        <>
                          {/* A classified retirement HAS a finishing position —
                              the FIA awarded it — and hiding it behind an em
                              dash threw away a fact the same car showed in the
                              Historical Explorer. Only a car with no position
                              at all has nothing to put here. */}
                          <td className="py-2 pr-2">
                            {c.position == null ? <span className="text-ink-faint">—</span> : (
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
                          <td className="py-2 pr-2 tabular-nums text-ink">{finishTime(c)}</td>
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
          <MoverList title="Biggest gainers" tone="up" rows={strategy.biggest_gainers}
            session={session} maxNet={maxNet} />
          <MoverList title="Biggest losers" tone="down" rows={strategy.biggest_losers}
            session={session} maxNet={maxNet} />
        </div>
      </div>
    </div>
  );
}

// the simple table has 4 columns and fits narrow screens without scrolling
function cxTable(simple: boolean) {
  return simple ? "w-full min-w-[420px] text-sm" : "w-full min-w-[580px] text-sm";
}

// Total race time in seconds → "1:24:31.652" (or "58:12.340" for short races).
function fmtRaceTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Interactive DNF badge: hover (desktop) or tap (mobile) shows when the car
 * retired. Kept deliberately minimal — just the lap — so it reads the same for
 * every retirement instead of surfacing a reason for some and an awkward
 * "no reason available" for others.
 */
/* Portalled, like every other tooltip in the product — an absolutely-positioned
   card inside a results table is at the mercy of every ancestor's overflow, and
   a results table has several. See ui/HoverCard. */
function DnfBadge({ row }: { row: ClassificationRow }) {
  const { at, open, close, toggle } = useHoverTip<{ x: number; y: number }>();
  const lap = row.laps_completed != null && row.laps_completed > 0 ? row.laps_completed : null;
  // "Retired" is not a reason, it is the status this badge already carries
  const generic = /^(retired|dnf|did not finish|accident|\+\d+\s*lap)/i;
  const named = (row.retirement_reason ?? "").trim();
  const reason = named && !generic.test(named) ? named : null;
  const where = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 2 };
  };
  return (
    <span className="relative inline-flex"
      onMouseEnter={(e) => open(where(e.currentTarget))} onMouseLeave={close}>
      <button type="button" onClick={(e) => { e.stopPropagation(); toggle(where(e.currentTarget)); }}
        aria-expanded={at != null}
        aria-label={lap ? `Retired after lap ${lap}` : "Retired"}
        className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300 underline decoration-rose-300/40 decoration-dotted underline-offset-2">
        DNF
      </button>
      {at && (
        /* ONE ROW, BECAUSE THERE IS ONE FACT.
           A "Reason" row was added alongside, and for almost every car the
           source's reason IS the word "Retired" — so the card said "Retired /
           after lap 41 / Reason: Retired", which is a tooltip repeating its own
           heading back at the reader. The reason only appears when the source
           actually named one ("Hydraulics", "Collision"), and then it replaces
           the generic line rather than sitting under it. */
        <HoverCard x={at.x} y={at.y} width={214} title="Did not finish"
          accent="rgb(251 113 133)"
          rows={[{ k: reason ? reason : "Lap retired", v: lap ? `Lap ${lap}` : "not recorded" }]} />
      )}
    </span>
  );
}

/** A strategy verdict, in the shared insight-card shape. */
/** How far a strategy moved a driver from where raw pace had them. */
function gainText(v: any, dir: "better" | "worse"): string {
  const n = v?.pace_rank != null && v?.finish != null ? v.pace_rank - v.finish : null;
  if (n == null || n === 0) return "Finished where the pace said they would.";
  const places = `${Math.abs(n)} place${Math.abs(n) === 1 ? "" : "s"}`;
  return dir === "better"
    ? `${places} better than raw pace deserved.`
    : `${places} worse than the car was capable of.`;
}

/** Seconds, drawn against what a stop is actually measured against. */
function pitTimingVisual(v: any): React.ReactNode {
  if (v?.saved_s != null) {
    // a cheap stop is worth the green-flag loss it avoided — roughly 22s
    return (
      <Meter label="Saved vs a green stop" tone="amber" value={`${v.saved_s.toFixed(1)}s`}
        pct={Math.min(100, Math.max(5, (v.saved_s / 22) * 100))}
        scaleMin="0s" scaleMax="~22s — a full green-flag stop" />
    );
  }
  if (v?.stationary_s != null) {
    // 2.0s is a great stop, 4.0s a slow one — the window the sport works in
    return (
      <Meter label="Stationary time" tone="amber" value={`${v.stationary_s.toFixed(2)}s`}
        pct={Math.min(100, Math.max(5, ((4.5 - v.stationary_s) / 2.5) * 100))}
        scaleMin="Slow" scaleMax="2.0s — a great stop" />
    );
  }
  return undefined;
}

/**
 * A strategy verdict, held to the same standard as every other card in the app.
 *
 * These three were the last panels still built as title + badge + paragraph, so
 * switching into Advanced felt like walking into an older version of the
 * product: no portrait, no visual, no drawer, and a sentence to read before you
 * knew whether it was good news.
 *
 * They now say it the way the rest of the product does — the driver's face, the
 * measurement drawn, one line of consequence — with the sentence kept where a
 * sentence belongs, behind the chevron.
 */
function VerdictCard({
  tone, icon, iconAnim, title, driver, detail, visual, takeaway, session,
}: {
  tone: "good" | "bad" | "key"; icon: React.ReactNode; iconAnim?: IconAnim; title: string;
  driver?: string; detail?: string; visual?: React.ReactNode; takeaway?: React.ReactNode;
  session: RaceSession;
}) {
  const d = session.drivers.find((x) => x.code === driver) ?? null;
  const visualTone: VisualTone = tone === "good" ? "good" : tone === "bad" ? "bad" : "amber";
  return (
    <InsightCard
      icon={icon} iconAnim={iconAnim} tone={visualTone} label={title}
      value={d?.name ?? driver ?? "—"} sub={d?.team}
      driver={d} visual={visual} takeaway={takeaway}
      detail={detail ? <p>{detail}</p> : undefined} />
  );
}

/**
 * Movers, shown as movement. Each driver gets their portrait, the shift drawn
 * the way a broadcast draws it, and a bar scaled against the biggest swing in
 * the race — so "gained 15" and "lost 3" are instantly comparable, and the
 * gainers and losers panels share one scale rather than each normalising to
 * their own top row.
 */
function MoverList({
  title, rows, tone, session, maxNet,
}: {
  title: string; rows: any[]; tone: "up" | "down"; session: RaceBundle["session"]; maxNet: number;
}) {
  const up = tone === "up";
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <IconTile tone={up ? "good" : "bad"} size={26}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </IconTile>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{title}</span>
      </div>
      {rows.length ? (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.driver} className="flex items-center gap-2.5">
              <DriverAvatar driver={session.drivers.find((d) => d.code === r.driver) ?? null} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight text-ink">
                  {r.name ?? r.driver}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cx("h-full rounded-full transition-[width] duration-500",
                    up ? "bg-emerald-400/80" : "bg-rose-400/80")}
                    style={{ width: `${Math.max(6, (Math.abs(r.net) / maxNet) * 100)}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cx("text-sm font-bold leading-none tabular-nums",
                  up ? "text-emerald-300" : "text-rose-300")}>
                  {up ? "▲" : "▼"} {Math.abs(r.net)}
                </div>
                <div className="mt-1 text-[11px] tabular-nums text-ink-faint">P{r.grid}→P{r.finish}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-ink-faint">No notable movers.</p>}
    </div>
  );
}
