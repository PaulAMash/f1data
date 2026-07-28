"use client";
import { Crown, Flag, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Term } from "@/components/ui/Term";
import { InsightCard, InsightGrid } from "@/components/ui/InsightCard";
import { StoryPanel, type StoryHighlight } from "@/components/ui/StoryPanel";
import { Meter, PositionShift } from "@/components/ui/Visuals";
import { fmtGap } from "@/lib/format";
import { deriveWindows } from "@/lib/raceEvents";
import { TrackConditionsPanel } from "@/components/charts/TrackConditions";
import { RaceOverview } from "./RaceOverview";
import { RaceTimeline } from "./RaceTimeline";

/**
 * The race overview, in two depths that share one design language:
 *  - Simple: plain-English summary, podium-level timeline, the four key
 *    cards, and a points-scorers classification with movers + weather.
 *  - Advanced: the analyst summary (margins, pace deltas, pit economics),
 *    top-10 timeline, Driver of the Day / pit-loss / laps tiles, strategy
 *    verdicts, and the full-field classification with DNF detail.
 * Identity (portraits + full names) is identical in both.
 */
export function RaceStory({ bundle, onJump }: { bundle: RaceBundle; onJump?: (tab: string) => void }) {
  const simple = useIsSimple();
  const { session, strategy } = bundle;
  const cls = session.classification;
  const driverOf = (code?: string | null) => session.drivers.find((d) => d.code === code) ?? null;
  const winner = cls.find((c) => c.driver === strategy.winner);
  const runnerUp = cls.find((c) => c.position === 2);
  const topPace = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99))[0];
  const secondPace = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99))[1];
  const loser = strategy.biggest_losers[0];
  const turningPoint = strategy.turning_points[0] ?? strategy.insights.find((i) => i.severity === "key");
  const story = (!simple && strategy.story_advanced?.length)
    ? strategy.story_advanced : strategy.story;

  const finishers = cls.filter((c) => !c.retired).length;
  const retirements = cls.length - finishers;
  const windows = deriveWindows(session);
  const paceGap = topPace?.clean_air_pace != null && secondPace?.clean_air_pace != null
    ? secondPace.clean_air_pace - topPace.clean_air_pace : null;
  const maxNet = Math.max(1, ...[...strategy.biggest_gainers, ...strategy.biggest_losers]
    .map((m: any) => Math.abs(m?.net ?? 0)));
  // the field's pace spread gives every pace bar on this page one honest scale
  const paceValues = bundle.pace.map((p) => p.clean_air_pace).filter((v): v is number => v != null);
  const paceSpread = paceValues.length >= 2
    ? Math.max(...paceValues) - Math.min(...paceValues) : 0.6;

  const highlights: StoryHighlight[] = [
    { label: "Winner", value: lastName(winner?.name ?? winner?.driver ?? "—"), tone: "accent" },
    ...(runnerUp
      ? [{ label: "Margin", term: "margin", value: fmtGap(2, runnerUp.gap),
           sub: `to ${runnerUp.driver}`, tone: "speed" as const }] : []),
    { label: "Finishers", term: "finishers", value: `${finishers}/${cls.length}`, sub: "still running at the flag" },
    ...(retirements
      ? [{ label: "Retirements", term: "retirements", value: retirements, tone: "bad" as const }] : []),
    {
      label: "Neutralisations",
      term: "neutralisations",
      value: windows.length || "None",
      sub: windows.length
        ? windows.map((w) => `L${w.start}–${w.end}`).slice(0, 2).join(", ")
        : "green flag throughout",
      tone: (windows.length ? "amber" : "good") as StoryHighlight["tone"],
    },
  ];

  return (
    <div className="space-y-4">
      {/* the race, told rather than listed */}
      <StoryPanel
        icon={<Sparkles size={14} />}
        kicker={`${session.session_type} · ${session.grand_prix}`}
        story={story}
        highlights={highlights}
      >
        <RaceTimeline bundle={bundle} />
      </StoryPanel>

      {/* Conditions sit in the same place on every session type: the wide panel
          directly under the story. Nobody should have to re-find them. */}
      <TrackConditionsPanel session={session} fallback={strategy.weather_summary} />

      {/* answer-first key cards (clickable → the tab with the detail) */}
      <InsightGrid cols={4}>
        <InsightCard icon={<Crown size={14} />} iconAnim="shimmer" tone="accent" label="Winner"
          value={winner?.name ?? winner?.driver ?? "—"} sub={winner?.team}
          driver={driverOf(winner?.driver)}
          // a shift of zero isn't a visual — a lights-to-flag win is its own fact
          visual={winner?.grid && winner.position && winner.grid !== winner.position ? (
            <PositionShift from={winner.grid} to={winner.position} />
          ) : winner?.grid === 1 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent-soft">
              Led from pole
            </span>
          ) : undefined}
          takeaway={runnerUp ? `${fmtGap(2, runnerUp.gap)} clear of ${runnerUp.driver}.`
            : "Took the chequered flag first."}
          detail={
            <p>
              {winner?.name} started P{winner?.grid ?? "?"} and finished P1
              {winner?.pit_stops != null ? ` after ${plural(winner.pit_stops, "stop")}` : ""}.
              The track-position chart shows exactly where the race was won.
            </p>
          }
          action={{ label: "See the position chart", onClick: () => onJump?.("charts") }} />

        <InsightCard icon={<TrendingUp size={14} />} iconAnim="rise" tone="speed" label="Best race pace"
          value={driverOf(topPace?.driver)?.name ?? topPace?.driver ?? "—"}
          sub={<>fastest <Term>clean-air pace</Term></>}
          driver={driverOf(topPace?.driver)}
          visual={paceGap != null && secondPace ? (
            <Meter label="Clear of the next car" labelTerm="clean-air pace" tone="speed"
              value={`${paceGap.toFixed(3)}s`}
              pct={Math.min(100, (paceGap / Math.max(0.001, paceSpread)) * 100)}
              scaleMin="Level" scaleMax={`${paceSpread.toFixed(2)}s — front to back`}
              hint={`Per lap versus ${secondPace.driver}, once fuel load and tyre age are corrected for.`} />
          ) : undefined}
          takeaway={topPace?.driver === strategy.winner
            ? "The quickest car also won the race."
            : "Quickest car — but not the winner."}
          detail={
            <p>
              Clean-air pace strips out traffic, safety cars and pit laps, then corrects for fuel
              burn and tyre age. It answers &ldquo;who had the fastest car today?&rdquo; rather
              than &ldquo;who finished where?&rdquo;
            </p>
          }
          action={{ label: "Open pace analysis", onClick: () => onJump?.("pace") }} />

        <InsightCard icon={<Flag size={14} />} iconAnim="wave" tone="amber" label="Turning point"
          value={turningPoint ? turningPoint.title.split("(")[0].trim() : "—"}
          sub={turningPoint?.lap_range ? `Lap ${turningPoint.lap_range.join("–")}` : undefined}
          visual={turningPoint?.lap_range?.length && session.total_laps ? (
            <Meter label="When it happened" labelTerm="turning point" tone="amber"
              value={`Lap ${turningPoint.lap_range[0]}`}
              pct={(turningPoint.lap_range[0] / session.total_laps) * 100}
              scaleMin="Lights out" scaleMax={`Lap ${session.total_laps}`}
              hint="Early events reshape the whole strategy; late ones decide the result directly." />
          ) : undefined}
          takeaway="The moment that most shaped the result."
          detail={turningPoint?.detail ? <p>{turningPoint.detail}</p> : undefined}
          action={{ label: "Explain the race", onClick: () => onJump?.("strategy") }} />

        <InsightCard icon={<TrendingDown size={14} />} iconAnim="fall" tone="bad" label="Biggest loss"
          value={driverOf(loser?.driver)?.name ?? loser?.driver ?? "—"}
          sub={loser?.team}
          driver={driverOf(loser?.driver)}
          visual={loser ? <PositionShift from={loser.grid} to={loser.finish} /> : undefined}
          takeaway={loser ? `Lost ${plural(Math.abs(loser.net), "place")} against the grid.`
            : "Nobody lost meaningful ground."}
          detail={
            <p>
              Measured against where they started, not against expectation — so a bad start, a
              slow stop and a lost strategy gamble all land here. Ask the assistant why, and it
              will read the lap data back to you.
            </p>
          }
          action={{ label: "Ask what went wrong", onClick: () => onJump?.("ask") }} />
      </InsightGrid>

      {/* classification + movers + weather — points scorers in Simple,
          the full field with strategy verdicts in Advanced */}
      <RaceOverview bundle={bundle} simple={simple} maxNet={maxNet} />
    </div>
  );
}

const lastName = (name: string) => name.split(" ").slice(-1)[0] || name;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
