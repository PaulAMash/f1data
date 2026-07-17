"use client";
import { Crown, Flag, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { RaceBundle } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Term } from "@/components/ui/Term";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { RaceOverview } from "./RaceOverview";
import { RaceTimeline } from "./RaceTimeline";

/**
 * The race overview. One rendition for everyone — the summary, key cards and
 * classification never change with Simple/Advanced (the toggle only affects
 * analytical views like Charts and Pace), and it mirrors the practice-session
 * story layout: summary bullets → identity stat cards → classification.
 */
export function RaceStory({ bundle, onJump }: { bundle: RaceBundle; onJump?: (tab: string) => void }) {
  const { session, strategy } = bundle;
  const cls = session.classification;
  const driverOf = (code?: string | null) => session.drivers.find((d) => d.code === code) ?? null;
  const winner = cls.find((c) => c.driver === strategy.winner);
  const topPace = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99))[0];
  const loser = strategy.biggest_losers[0];
  const turningPoint = strategy.turning_points[0] ?? strategy.insights.find((i) => i.severity === "key");

  return (
    <div className="space-y-4">
      {/* narrative — reads like a short race report: lede, then supporting lines */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent-soft" /> The story of the race</span>} />
        <CardBody>
          {strategy.story.length ? (
            <div>
              <p className="text-[17px] font-medium leading-relaxed text-ink">{strategy.story[0]}</p>
              {strategy.story.length > 1 && (
                <div className="mt-3 space-y-2 border-l-2 border-white/[0.07] pl-4">
                  {strategy.story.slice(1).map((s, i) => (
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

      {/* full classification + movers — the same for every reader */}
      <RaceOverview bundle={bundle} />
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
