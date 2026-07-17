"use client";
import { Crown, Flag, Sparkles, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Term } from "@/components/ui/Term";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { RaceOverview } from "./RaceOverview";
import { RaceTimeline } from "./RaceTimeline";
import { fmtGap, pitLabel } from "@/lib/format";

/**
 * The default, user-friendly overview. Leads with a plain-English story, then a
 * few answer-first cards. In advanced mode it also shows the full classification.
 */
export function RaceStory({ bundle, onJump }: { bundle: RaceBundle; onJump?: (tab: string) => void }) {
  const simple = useIsSimple();
  const { session, strategy } = bundle;
  const cls = session.classification;
  const driverOf = (code?: string | null) => session.drivers.find((d) => d.code === code) ?? null;
  const winner = cls.find((c) => c.driver === strategy.winner);
  const topPace = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99))[0];
  const loser = strategy.biggest_losers[0];
  const gainer = strategy.biggest_gainers[0];
  const turningPoint = strategy.turning_points[0] ?? strategy.insights.find((i) => i.severity === "key");
  // Advanced readers get the analyst's telling — margins, corrected-pace
  // deltas, pit economics — while Simple keeps the plain-English recap.
  const story = (!simple && strategy.story_advanced?.length)
    ? strategy.story_advanced : strategy.story;

  return (
    <div className="space-y-4">
      {/* narrative — reads like a short race report: lede, then supporting lines */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> The story of the race</span>} />
        <CardBody>
          {story.length ? (
            <div>
              <p className="text-[17px] font-medium leading-relaxed text-ink">{story[0]}</p>
              {story.length > 1 && (
                <div className="mt-3 space-y-2 border-l-2 border-white/[0.07] pl-4">
                  {story.slice(1).map((s, i) => (
                    <p key={i} className="text-sm leading-relaxed text-ink-muted">{s}</p>
                  ))}
                </div>
              )}
              <div className="mt-5">
                <RaceTimeline bundle={bundle} />
              </div>
            </div>
          ) : <p className="text-sm text-ink-muted">Load a race to see its story.</p>}
        </CardBody>
      </Card>

      {/* answer-first key cards (clickable → the tab with the detail) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KeyCard icon={<Crown size={15} />} tone="accent" label="Winner"
          value={winner?.name ?? winner?.driver ?? "—"} sub={winner?.team}
          avatar={<DriverAvatar driver={driverOf(winner?.driver)} size={34} />}
          why="Took the chequered flag first." onClick={() => onJump?.("charts")} />
        <KeyCard icon={<TrendingUp size={15} />} tone="speed" label="Best race pace"
          value={driverOf(topPace?.driver)?.name ?? topPace?.driver ?? "—"}
          sub={<>fastest <Term>clean-air pace</Term></>}
          avatar={<DriverAvatar driver={driverOf(topPace?.driver)} size={34} />}
          why="Quickest once fuel and tyres are accounted for. Tap to open Pace."
          onClick={() => onJump?.("pace")} />
        <KeyCard icon={<Flag size={15} />} tone="amber" label="Turning point"
          value={turningPoint ? turningPoint.title.split("(")[0].trim() : "—"}
          sub={turningPoint?.lap_range ? `Lap ${turningPoint.lap_range.join("–")}` : undefined}
          why="The moment that most shaped the result. Tap for Strategy." onClick={() => onJump?.("strategy")} />
        <KeyCard icon={<TrendingDown size={15} />} tone="default" label="Biggest loss"
          value={driverOf(loser?.driver)?.name ?? loser?.driver ?? "—"}
          sub={loser ? `P${loser.grid}→P${loser.finish}` : undefined}
          avatar={<DriverAvatar driver={driverOf(loser?.driver)} size={34} />}
          why="Lost the most places. Tap to ask why." onClick={() => onJump?.("ask")} />
      </div>

      {/* podium + movers (simple) or full overview (advanced) */}
      {simple ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Top 5" info={undefined} />
            <CardBody className="space-y-2">
              {cls.filter((c) => c.position && c.position <= 5).map((c) => (
                <div key={c.driver} className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-ink-muted">{c.position}</span>
                  <DriverBadge driver={driverOf(c.driver)} code={c.driver} name={c.name}
                    team={c.team} teamColor={c.team_color} className="flex-1" />
                  <span className="tabular-nums text-xs text-ink-muted">{fmtGap(c.position, c.gap)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
          <div className="space-y-4">
            <MiniMover title="Biggest mover" mover={gainer} driver={driverOf(gainer?.driver)} tone="up" />
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
  icon, label, value, sub, why, tone, onClick, avatar,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode;
  why: string; tone: "accent" | "speed" | "amber" | "default"; onClick?: () => void;
  avatar?: React.ReactNode;
}) {
  const toneClass = { accent: "text-accent-soft", speed: "text-speed", amber: "text-amber", default: "text-ink" }[tone];
  return (
    <button onClick={onClick} disabled={!onClick}
      className="group rounded-xl border border-white/[0.06] bg-base-800/60 p-4 text-left transition-colors enabled:hover:border-white/[0.14]">
      <div className="flex items-center gap-1.5 text-ink-faint">
        <span className={toneClass}>{icon}</span>
        <span className="label">{label}</span>
      </div>
      {/* value text is always white — tone colour lives in the icon/label only,
          so a driver's name never changes colour from card to card */}
      <div className="mt-1.5 flex items-center gap-2.5">
        {avatar}
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tracking-tight text-ink">{value}</div>
          {sub && <div className="text-xs text-ink-muted">{sub}</div>}
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-snug text-ink-faint">{why}</div>
    </button>
  );
}

function MiniMover({ title, mover, driver, tone }: {
  title: string; mover: any; driver: any; tone: "up" | "down";
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {mover ? (
          <div className="flex items-center gap-2">
            <DriverBadge driver={driver} code={mover.driver} team={mover.team}
              teamColor={mover.team_color} size={26} className="flex-1" />
            <span className="text-xs text-ink-faint">P{mover.grid}→P{mover.finish}</span>
            <span className={`font-semibold ${tone === "up" ? "text-emerald-300" : "text-rose-300"}`}>
              {tone === "up" ? "▲" : "▼"} {Math.abs(mover.net)}
            </span>
          </div>
        ) : <p className="text-xs text-ink-faint">No notable movers.</p>}
      </CardBody>
    </Card>
  );
}

function PitStrip({ bundle }: { bundle: RaceBundle }) {
  const stops = bundle.session.pit_stops;
  // Never imply a stop count when the source has no trustworthy pit data.
  if (!stops.length || bundle.session.pit_data_reliable === false) {
    return (
      <Card>
        <CardHeader title={<span className="flex items-center gap-1.5"><Wrench size={14} /> Pit stops</span>} />
        <CardBody>
          <p className="text-xs text-ink-faint">
            Pit-stop data isn&apos;t available from this session&apos;s source.
          </p>
        </CardBody>
      </Card>
    );
  }
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
