"use client";
import { cx } from "@/lib/format";
import { BetaTag } from "./BetaTag";

export interface TabItem {
  id: string; label: string; icon?: React.ReactNode;
  /* A standing mark on the tab itself — not a badge that comes and goes with
     state. "beta" says the section is live and still being sharpened; the
     screen-reader label carries the same word so it isn't a sighted-only fact. */
  tag?: "beta";
}

export function Tabs({
  items, active, onChange, className, ...rest
}: {
  items: TabItem[]; active: string; onChange: (id: string) => void; className?: string;
  // Omit onChange: ours takes a tab id, the DOM's takes a FormEvent, and
  // letting them merge types the callback as both.
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">) {
  return (
    <div role="tablist" aria-label="Sections" {...rest}
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
          aria-label={t.tag ? `${t.label} (${t.tag})` : undefined}
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
          {/* after the label, never before it: the tab is still called "Ask",
              and a mark that arrives first renames it */}
          {t.tag && <BetaTag tone={active === t.id ? "on" : "off"} />}
        </button>
      ))}
    </div>
  );
}
