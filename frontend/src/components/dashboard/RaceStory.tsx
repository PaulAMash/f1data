"use client";
import { Crown, Flag, Sparkles, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, TeamDot } from "@/components/ui/Badge";
import { Term } from "@/components/ui/Term";
import { RaceOverview } from "./RaceOverview";
import { fmtLap, fmtSec, pitLabel } from "@/lib/format";

/**
 * The default, user-friendly overview. Leads with a plain-English story, then a
 * few answer-first cards. In advanced mode it also shows the full classification.
 */
export function RaceStory({ bundle, onJump }: { bundle: RaceBundle; onJump?: (tab: string) => void }) {
  const simple = useIsSimple();
  const { session, strategy } = bundle;
  const cls = session.classification;
  const winner = cls.find((c) => c.driver === strategy.winner);
  const topPace = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99))[0];
  const loser = strategy.biggest_losers[0];
  const gainer = strategy.biggest_gainers[0];
  const turningPoint = strategy.turning_points[0] ?? strategy.insights.find((i) => i.severity === "key");

  return (
    <div className="space-y-4">
      {/* narrative */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> The story of the race</span>}
          subtitle={simple ? "A plain-English recap — no jargon required." : undefined} />
        <CardBody>
          <div className="space-y-2.5">
            {strategy.story.length ? strategy.story.map((s, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-ink">
                <span className="mr-2 text-accent-soft">•</span>{s}
              </p>
            )) : <p className="text-sm text-ink-muted">Load a race to see its story.</p>}
          </div>
        </CardBody>
      </Card>

      {/* answer-first key cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KeyCard icon={<Crown size={15} />} tone="accent" label="Winner"
          value={winner?.driver ?? "—"} sub={winner?.name}
          why="Took the chequered flag first." />
        <KeyCard icon={<TrendingUp size={15} />} tone="speed" label="Best race pace"
          value={topPace?.driver ?? "—"}
          sub={<>fastest <Term>clean-air pace</Term></>}
          why="Quickest once fuel and tyres are accounted for — the true speed merchant." />
        <KeyCard icon={<Flag size={15} />} tone="amber" label="Turning point"
          value={turningPoint ? turningPoint.title.split("(")[0].trim() : "—"}
          sub={turningPoint?.lap_range ? `Lap ${turningPoint.lap_range.join("–")}` : undefined}
          why="The moment that most shaped the result." onClick={() => onJump?.("strategy")} />
        <KeyCard icon={<TrendingDown size={15} />} tone="default" label="Biggest loss"
          value={loser?.driver ?? "—"}
          sub={loser ? `P${loser.grid}→P${loser.finish}` : undefined}
          why="Lost the most places versus where they started." />
      </div>

      {/* podium + movers (simple) or full overview (advanced) */}
      {simple ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Top 5" info={undefined} />
            <CardBody className="space-y-1.5">
              {cls.filter((c) => c.position && c.position <= 5).map((c) => (
                <div key={c.driver} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-bold text-ink-muted">{c.position}</span>
                  <TeamDot color={c.team_color} />
                  <span className="font-semibold">{c.driver}</span>
                  <span className="text-ink-faint">{c.name}</span>
                  <span className="ml-auto tabular-nums text-xs text-ink-muted">{c.gap ?? "—"}</span>
                </div>
              ))}
            </CardBody>
          </Card>
          <div className="space-y-4">
            <MiniMover title="Biggest mover" mover={gainer} tone="up" />
            <PitStrip bundle={bundle} />
          </div>
        </div>
      ) : (
        <RaceOverview bundle={bundle} />
      )}
    </div>
  );
}

function KeyCard({
  icon, label, value, sub, why, tone, onClick,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode;
  why: string; tone: "accent" | "speed" | "amber" | "default"; onClick?: () => void;
}) {
  const toneClass = { accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink" }[tone];
  return (
    <button onClick={onClick} disabled={!onClick}
      className="group rounded-xl border border-white/[0.06] bg-base-800/60 p-4 text-left transition-colors enabled:hover:border-white/[0.14]">
      <div className="flex items-center gap-1.5 text-ink-faint">
        <span className={toneClass}>{icon}</span>
        <span className="label">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
      <div className="mt-2 text-[11px] leading-snug text-ink-faint">{why}</div>
    </button>
  );
}

function MiniMover({ title, mover, tone }: { title: string; mover: any; tone: "up" | "down" }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {mover ? (
          <div className="flex items-center gap-2 text-sm">
            <TeamDot color={mover.team_color} />
            <span className="font-semibold">{mover.driver}</span>
            <span className="text-xs text-ink-faint">P{mover.grid}→P{mover.finish}</span>
            <span className={`ml-auto font-semibold ${tone === "up" ? "text-emerald-300" : "text-rose-300"}`}>
              {tone === "up" ? "▲" : "▼"} {Math.abs(mover.net)}
            </span>
          </div>
        ) : <p className="text-xs text-ink-faint">No notable movers.</p>}
      </CardBody>
    </Card>
  );
}

function PitStrip({ bundle }: { bundle: RaceBundle }) {
  // fastest stop across the field, cleanly labelled
  const stops = bundle.session.pit_stops;
  if (!stops.length) return null;
  const measured = stops.filter((p) => p.stationary_time ?? p.stop_duration);
  const fastest = measured.sort((a, b) =>
    ((a.stationary_time ?? a.stop_duration)! - (b.stationary_time ?? b.stop_duration)!))[0];
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5"><Wrench size={14} /> Pit stops</span>} />
      <CardBody className="space-y-1.5 text-sm">
        <div className="flex justify-between text-ink-muted">
          <span>Total stops</span><span className="tabular-nums text-ink">{stops.length}</span>
        </div>
        {fastest && (
          <div className="flex justify-between text-ink-muted">
            <span>Fastest stop</span>
            <span className="tabular-nums text-ink">
              {fastest.driver} · {pitLabel(fastest).text}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
