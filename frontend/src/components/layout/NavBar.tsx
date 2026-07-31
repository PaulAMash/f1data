"use client";
import Link from "next/link";
import { Radar, Settings } from "lucide-react";
import { useMode } from "@/lib/mode";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cx } from "@/lib/format";

export function NavBar({ active }: { active?: "home" | "explorer" | "history" | "settings" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-base-950/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-3 sm:gap-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
            <Radar size={16} className="text-accent-soft" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Pitwall<span className="text-accent-soft"> IQ</span>
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/explorer" className={link(active === "explorer")}>Explore</Link>
          <Link href="/history" className={link(active === "history")}>Historical</Link>
        </nav>

        {/* Global controls live together, once, at the end of the bar. Mode
            used to be repeated inside every page that respected it, which made
            a product-wide preference look like a per-page widget. */}
        <div className="ml-auto flex items-center gap-1.5">
          <ModeToggle />
          <ThemeToggle />
          <Link href="/settings" aria-label="Settings" title="Settings"
            className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors duration-200",
              active === "settings"
                ? "border-accent/30 bg-accent/10 text-accent-soft"
                : "border-white/[0.07] bg-base-850/70 text-ink-muted hover:border-white/[0.14] hover:text-ink")}>
            <Settings size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The one global mode switch.
 *
 * Hidden below `sm`: on a phone the bar has room for identity and navigation or
 * for a segmented control, not both, and Settings is one tap away.
 */
export function ModeToggle() {
  const { mode, setMode } = useMode();
  const items: { id: "simple" | "advanced"; label: string; hint: string }[] = [
    { id: "simple", label: "Simple", hint: "Plain-English race story" },
    { id: "advanced", label: "Advanced", hint: "Detailed analytics" },
  ];
  return (
    <div data-tour="mode"
      className="hidden items-center rounded-lg border border-white/[0.07] bg-base-850/70 p-0.5 text-xs sm:flex"
      title={mode === "simple" ? "Plain-English race story" : "Detailed analytics"}>
      {items.map((it) => (
        <button key={it.id} onClick={() => setMode(it.id)} title={it.hint}
          className={cx("rounded-md px-2 py-1 font-medium transition-colors sm:px-3",
            mode === it.id ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function link(active: boolean) {
  return `rounded-lg px-2.5 py-1.5 transition-colors sm:px-3 ${
    active ? "text-ink bg-white/[0.05]" : "text-ink-muted hover:text-ink hover:bg-white/[0.04]"
  }`;
}
