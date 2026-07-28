"use client";
import { cx } from "@/lib/format";

export interface TabItem { id: string; label: string; icon?: React.ReactNode; }

export function Tabs({
  items, active, onChange, className,
}: { items: TabItem[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Sections"
      className={cx(
        // one clean scrollable row on phones instead of wrapping into a blob
        "flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-base-850/60 p-1",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "group/tab inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
            "transition-all duration-200 ease-out",
            active === t.id
              ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30"
              : "text-ink-muted hover:bg-white/[0.05] hover:text-ink",
          )}
        >
          {/* the icon leads the label into place — a small cue that a tab is a
              thing you press, not a thing you read */}
          <span className={cx("inline-flex transition-transform duration-200 ease-out",
            active === t.id ? "scale-105" : "group-hover/tab:scale-110")}>
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
