"use client";
import { X } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";

/* -------------------------------------------------------------------------- */
/* One focus-card identity shared by the Position and Tyre charts, so focusing */
/* a driver looks and dismisses the same everywhere. The chart supplies the    */
/* tiles and detail relevant to what it visualises; the shell owns the         */
/* premium team-colour treatment, the portrait and a clearly-visible close.    */
/* -------------------------------------------------------------------------- */

/** A consistently discoverable dismiss control — a bordered target, not a bare glyph. */
export function CloseButton({ onClick, label = "Close", className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-ink-faint transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-ink", className)}>
      <X size={15} />
    </button>
  );
}

export interface FocusTile { label: string; value: string; tone?: "good" | "bad" }

export function FocusCardShell({
  driver, eyebrow = "Focused driver", tiles, takeaway, big, onClear, onDeepDive, children,
}: {
  driver: Driver; eyebrow?: string; tiles: FocusTile[]; takeaway?: string; big?: boolean;
  onClear: () => void; onDeepDive?: (code: string) => void; children?: React.ReactNode;
}) {
  const tc = driver.team_color;
  return (
    <div className="relative overflow-hidden rounded-2xl border p-4 pl-5 animate-fade-in"
      style={{ borderColor: `${tc}55`, background: `linear-gradient(120deg, ${tc}24 0%, ${tc}0d 26%, transparent 62%)` }}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tc }} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button onClick={() => onDeepDive?.(driver.code)} disabled={!onDeepDive} className="group flex items-center gap-3.5 text-left disabled:cursor-default">
          <span className="grid place-items-center rounded-full p-[3px]" style={{ background: `${tc}26`, boxShadow: `0 0 0 2px ${tc}, 0 8px 26px -8px ${tc}` }}>
            <DriverAvatar driver={driver} size={big ? 56 : 50} ring={false} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: tc }}>{eyebrow}</div>
            <div className={cx("truncate font-extrabold leading-tight tracking-tight", big ? "text-[26px]" : "text-2xl")}>{driver.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: tc }} /> {driver.team}
            </div>
          </div>
        </button>
        <div className="flex flex-1 flex-wrap items-stretch gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="flex-1 min-w-[74px] rounded-xl border border-white/[0.07] bg-base-950/40 px-3 py-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t.label}</div>
              <div className={cx("mt-0.5 font-bold tabular-nums", big ? "text-2xl" : "text-lg",
                t.tone === "good" ? "text-speed" : t.tone === "bad" ? "text-accent-soft" : "text-ink")}>{t.value}</div>
            </div>
          ))}
        </div>
        <CloseButton onClick={onClear} label="Clear focus" className="ml-auto self-start" />
      </div>
      {takeaway && <p className={cx("mt-3 leading-snug text-ink", big ? "text-[15px] font-medium" : "text-sm text-ink-muted")}>{takeaway}</p>}
      {children}
    </div>
  );
}
