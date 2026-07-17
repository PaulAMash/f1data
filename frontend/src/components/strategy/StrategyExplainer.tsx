"use client";
import { useState } from "react";
import {
  Award, ChevronDown, Flag, GitBranch, TrendingDown, Zap,
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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const insights = filter === "key"
    ? strategy.insights.filter((i) => i.severity === "key" || i.severity === "bad" || i.severity === "good")
    : strategy.insights;

  // Two *independent* column stacks (not grid rows): expanding a card only
  // pushes down its own column, so the layout never tears open a gap next to
  // it. Split sequentially so the single-column mobile order stays ranked.
  const mid = Math.ceil(insights.length / 2);
  const columns = [insights.slice(0, mid), insights.slice(mid)];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-faint">Tap a card for the full explanation</span>
        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs">
          {(["all", "key"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setOpenKey(null); }}
              className={cx("rounded-md px-2.5 py-1 font-medium",
                filter === f ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
              {f === "all" ? "All" : "Decisive only"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2">
        {columns.map((col, ci) => (
          <div key={ci} className="min-w-0 space-y-3">
            {col.map((ins) => {
              const key = `${ins.kind}|${ins.title}`;
              return (
                <InsightCard key={key} ins={ins} onFocus={onFocusDrivers}
                  open={openKey === key}
                  onToggle={() => setOpenKey((k) => (k === key ? null : key))} />
              );
            })}
          </div>
        ))}
      </div>
      {!insights.length && <p className="text-sm text-ink-faint">No insights generated for this session.</p>}
    </div>
  );
}

/**
 * Collapsed by default: title + tag + a clear chevron affordance. Clicking
 * expands to the what (detail), the WHY (explanation), and the focus actions —
 * so the page scans clean but the depth is one click away. Only one card is
 * open at a time (true accordion), keeping the layout compact.
 */
function InsightCard({ ins, open, onToggle, onFocus }: {
  ins: RaceInsight; open: boolean; onToggle: () => void; onFocus?: (c: string[]) => void;
}) {
  const style = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
  return (
    <div className={cx("rounded-xl border bg-base-850/50 transition-colors", style.border,
      open && "bg-base-800/60")}>
      <button onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-white/[0.02]">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          {style.icon}<span className="truncate">{ins.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={style.badge}>{KIND_LABEL[ins.kind] ?? ins.kind}</Badge>
          <ChevronDown size={15}
            className={cx("text-ink-faint transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="animate-fade-in border-t border-white/[0.05] p-4 pt-3">
          <p className="text-sm leading-relaxed text-ink-muted">{ins.detail}</p>
          {ins.explanation && (
            <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-base-900/40 p-3">
              <div className="label mb-1">Why it mattered</div>
              <p className="text-sm leading-relaxed text-ink-muted">{ins.explanation}</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ins.lap_range && ins.lap_range.length > 0 && (
              <span className="chip"><Flag size={11} /> Lap {ins.lap_range.join("–")}</span>
            )}
            {ins.drivers.length > 0 && onFocus && (
              <button className="chip hover:text-ink" onClick={() => onFocus(ins.drivers.slice(0, 6))}>
                Show on position chart
              </button>
            )}
            <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-faint">
              {ins.confidence} confidence
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
