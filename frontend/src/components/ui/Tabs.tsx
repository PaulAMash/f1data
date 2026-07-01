"use client";
import { cx } from "@/lib/format";

export interface TabItem { id: string; label: string; icon?: React.ReactNode; }

export function Tabs({
  items, active, onChange, className,
}: { items: TabItem[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-base-850/60 p-1", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            active === t.id
              ? "bg-accent/15 text-accent-soft ring-1 ring-accent/30"
              : "text-ink-muted hover:bg-white/[0.04] hover:text-ink",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
