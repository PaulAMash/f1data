"use client";
import { useState } from "react";
import {
  Award, Flag, GitBranch, Sparkles, TrendingDown, TriangleAlert, Zap,
} from "lucide-react";
import type { RaceInsight, StrategySummary } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/format";

const SEV_STYLE: Record<string, { border: string; icon: React.ReactNode; badge: any }> = {
  key: { border: "border-amber/30", icon: <Zap size={15} className="text-amber" />, badge: "key" },
  good: { border: "border-emerald-400/25", icon: <Award size={15} className="text-emerald-300" />, badge: "good" },
  bad: { border: "border-rose-400/25", icon: <TrendingDown size={15} className="text-rose-300" />, badge: "bad" },
  info: { border: "border-white/[0.07]", icon: <GitBranch size={15} className="text-ink-muted" />, badge: "neutral" },
};

const KIND_LABEL: Record<string, string> = {
  turning_point: "Turning point", best_strategy: "Best call", worst_strategy: "Costly call",
  pit_timing: "Pit timing", undercut: "Undercut", overcut: "Overcut", missed_stop: "Missed window",
  tyre_risk: "Tyre risk", hidden_pace: "Hidden pace",
};

export function StrategyExplainer({
  strategy, onFocusDrivers,
}: { strategy: StrategySummary; onFocusDrivers?: (codes: string[]) => void }) {
  const [filter, setFilter] = useState<"all" | "key">("all");
  const insights = filter === "key"
    ? strategy.insights.filter((i) => i.severity === "key" || i.severity === "bad" || i.severity === "good")
    : strategy.insights;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="max-w-2xl text-sm text-ink-muted">
          <Sparkles size={13} className="mr-1 inline text-accent-soft" />
          Generated from the data with deterministic rules — no AI guesswork. Each card is backed by
          the computed pace, pit and position numbers.
        </p>
        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs">
          {(["all", "key"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cx("rounded-md px-2.5 py-1 font-medium",
                filter === f ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
              {f === "all" ? "All" : "Decisive only"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {insights.map((ins, i) => (
          <InsightCard key={i} ins={ins} onFocus={onFocusDrivers} />
        ))}
      </div>
      {!insights.length && <p className="text-sm text-ink-faint">No insights generated for this session.</p>}
    </div>
  );
}

function InsightCard({ ins, onFocus }: { ins: RaceInsight; onFocus?: (c: string[]) => void }) {
  const style = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
  return (
    <div className={cx("rounded-xl border bg-base-850/50 p-4 transition-colors hover:bg-base-800/60", style.border)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {style.icon}{ins.title}
        </span>
        <Badge tone={style.badge}>{KIND_LABEL[ins.kind] ?? ins.kind}</Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">{ins.detail}</p>
      <div className="mt-2 flex items-center gap-2">
        {ins.lap_range && ins.lap_range.length > 0 && (
          <span className="chip"><Flag size={11} /> Lap {ins.lap_range.join("–")}</span>
        )}
        {ins.drivers.length > 0 && onFocus && (
          <button className="chip hover:text-ink" onClick={() => onFocus(ins.drivers)}>
            Focus {ins.drivers.join(", ")}
          </button>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-faint">
          {ins.confidence} confidence
        </span>
      </div>
    </div>
  );
}
