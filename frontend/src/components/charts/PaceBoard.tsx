"use client";
import { useState } from "react";
import type { Driver } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DriverAvatar, DriverBadge } from "@/components/ui/DriverBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { EmptyState } from "@/components/ui/misc";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One pace ranking for the whole product.                                    */
/*                                                                            */
/* Practice, Qualifying and the Race each drew their own bar chart, so the     */
/* same statistic changed shape three times as you moved between sessions.     */
/* This is the single ranking: a hero for whoever set the benchmark, then the  */
/* field beneath it starting at #2 — the hero never repeats itself in its own  */
/* list — with the bars measured against the hero either way.                  */
/*                                                                            */
/* `views` is deliberately generic. Qualifying and the Race switch between     */
/* Drivers and Constructors; Practice switches between One-lap and Long-run,   */
/* which are two DIFFERENT measurements rather than two cuts of one. The       */
/* subtitle always states what the active view measures, so the toggle can     */
/* never be mistaken for the other kind.                                       */
/* -------------------------------------------------------------------------- */

export interface PaceEntry {
  /** Stable key — driver code or constructor name. */
  key: string;
  name: string;
  sub?: string;
  color: string;
  driver?: Driver | null;
  /** Formatted primary value, e.g. "1:17.207". */
  value: string;
  /** Gap to the benchmark in seconds; 0 for the leader. */
  gap: number;
  /** Optional trailing detail, shown in Advanced only. */
  note?: string;
  /** Rows whose value isn't comparable (retired, too few laps). */
  dim?: boolean;
}

export interface PaceViewDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Above the hero's name, e.g. "Quickest lap". */
  heroLabel: string;
  /** One line under the title stating what this view measures. */
  measures: string;
  info: string;
  /** A sentence of context under the hero — follows the active view. */
  heroNote?: React.ReactNode;
  entries: PaceEntry[];
  /** Formats the gap column; defaults to "+0.123s". */
  formatGap?: (gap: number, index: number) => string;
  leaderGapText?: string;
  emptyTitle?: string;
  emptyHint?: string;
}

export function PaceBoard({
  title, views, showNotes = false, prominentSwitch = false,
}: {
  title: string;
  views: PaceViewDef[];
  /** Advanced mode: reveal each row's trailing detail column. */
  showNotes?: boolean;
  /** For toggles between two different metrics rather than two cuts of one. */
  prominentSwitch?: boolean;
}) {
  const [active, setActive] = useState(views[0]?.id);
  const view = views.find((v) => v.id === active) ?? views[0];
  if (!view) return null;

  const entries = view.entries;
  const leader = entries[0];
  const rest = entries.slice(1);
  const maxGap = Math.max(0.001, ...entries.map((e) => e.gap));
  const fmtGap = view.formatGap ?? ((g: number) => `+${g.toFixed(3)}s`);
  const hasNotes = showNotes && rest.some((e) => e.note);

  const viewSwitch = views.length > 1 ? (
    <div className={cx("flex gap-1 rounded-lg border border-white/[0.06] bg-base-850/60 p-1",
      prominentSwitch ? "text-[13px]" : "text-xs")}
      role="tablist" aria-label={`${title} view`}>
      {views.map((v) => (
        <button key={v.id} role="tab" aria-selected={v.id === view.id} onClick={() => setActive(v.id)}
          className={cx("inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
            prominentSwitch ? "px-3 py-1.5" : "px-2.5 py-1",
            v.id === view.id
              ? "bg-accent/15 text-accent-soft ring-1 ring-accent/25"
              : "text-ink-muted hover:bg-white/[0.04] hover:text-ink")}>
          {v.icon} {v.label}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <Card>
      <CardHeader title={title} subtitle={view.measures} right={viewSwitch}
        info={<InfoTip label={view.label} text={view.info} />} />
      <CardBody className="space-y-2.5">
        {!entries.length ? (
          <EmptyState title={view.emptyTitle ?? "No pace data"} hint={view.emptyHint} />
        ) : (
          <>
            {leader && (
              <div className="mb-1 rounded-xl border border-white/[0.06] bg-base-800/40 p-3">
                <div className="flex items-center gap-3">
                  {leader.driver !== undefined
                    ? <DriverAvatar driver={leader.driver} size={38} />
                    : <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: leader.color }} />}
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                      {view.heroLabel}
                    </div>
                    <div className="truncate text-sm font-bold text-ink">{leader.name}</div>
                    {leader.sub && <div className="truncate text-[11px] text-ink-faint">{leader.sub}</div>}
                  </div>
                  <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-speed">
                    {leader.value}
                  </span>
                </div>
                {view.heroNote && (
                  <p className="mt-2.5 border-t border-white/[0.05] pt-2.5 text-xs leading-relaxed text-ink-muted">
                    {view.heroNote}
                  </p>
                )}
              </div>
            )}

            {/* the hero is #1 — the list continues from #2 rather than repeating them */}
            {rest.map((e, i) => (
              <div key={e.key} className={cx("flex items-center gap-2.5", e.dim && "opacity-55")}>
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">{i + 2}</span>
                {/* identity narrows on a phone so the bar and the time still
                    fit on one line instead of pushing the gap off-screen */}
                {e.driver !== undefined ? (
                  <DriverBadge driver={e.driver} code={e.key} name={e.name}
                    team={e.sub} teamColor={e.color} size={24} className="w-32 shrink-0 sm:w-44" />
                ) : (
                  <span className="flex w-32 shrink-0 items-center gap-2 sm:w-44">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                    <span className="truncate text-sm font-medium">{e.name}</span>
                  </span>
                )}
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className="block h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(6, 100 - (e.gap / maxGap) * 72)}%`, background: e.color }} />
                </span>
                <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-ink">{e.value}</span>
                {/* the note gets its own column so the gap is never displaced —
                    both numbers matter, and they must line up down the list */}
                {hasNotes && (
                  <span className="hidden w-9 shrink-0 text-right text-[11px] tabular-nums text-ink-faint sm:inline">
                    {e.note ?? ""}
                  </span>
                )}
                <span className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-ink-faint sm:inline">
                  {fmtGap(e.gap, i + 1)}
                </span>
              </div>
            ))}
            {rest.length === 0 && (
              <p className="text-xs text-ink-faint">Only one car has a comparable time in this session.</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
