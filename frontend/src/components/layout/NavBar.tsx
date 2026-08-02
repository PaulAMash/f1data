"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Radar, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useNavHistory } from "@/lib/nav";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The bar.                                                                   */
/*                                                                            */
/* Simple/Advanced used to sit here as a segmented control. It was the wrong   */
/* rank: a bar is for identity, navigation and the two controls that change    */
/* the room you are in. Display mode is a preference, and it is now stated in  */
/* the two places a preference belongs — once on the landing page, where it is */
/* explained and previewed, and permanently in Settings. Keeping a third copy  */
/* in the chrome only made the same decision look unresolved, and it stole the */
/* attention a nav bar is supposed to give away.                               */
/*                                                                            */
/* WHAT THE BAR GAINED INSTEAD: a way back. See lib/nav.tsx — the controls     */
/* appear only when there is somewhere inside the product to go, so on a first */
/* page they are absent rather than present and dead.                          */
/* -------------------------------------------------------------------------- */

export function NavBar({ active }: { active?: "home" | "explorer" | "history" | "settings" }) {
  const { canBack, canForward, back, forward } = useNavHistory();

  return (
    // 90%, not 80%: on a phone the column is narrow and the copy passes
    // directly under the bar, where 80% let it stay legible through the glass.
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-base-950/90 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-3 sm:gap-3 sm:px-6">
        <Link href="/" className="group/brand flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30 transition-transform duration-[--dur-2] ease-[--ease-out] group-hover/brand:scale-105">
            <Radar size={16} className="text-accent-soft" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Pitwall<span className="text-accent-soft"> IQ</span>
          </span>
        </Link>

        {/* The pair only exists once there is a journey to retrace. Width
            animates rather than the element appearing, so the row beside it
            does not jump when the first navigation happens. */}
        <div className={cx("flex items-center overflow-hidden transition-all duration-[--dur-3] ease-[--ease-out]",
          canBack ? "ml-1 w-auto opacity-100" : "w-0 opacity-0")}>
          <button type="button" onClick={back} disabled={!canBack}
            aria-label="Back" title="Back"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-30">
            <ArrowLeft size={15} />
          </button>
          <button type="button" onClick={forward} disabled={!canForward}
            aria-label="Forward" title="Forward"
            className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-[--dur-2]",
              canForward
                ? "text-ink-muted hover:bg-white/[0.06] hover:text-ink"
                : "pointer-events-none w-0 opacity-0")}>
            <ArrowRight size={15} />
          </button>
        </div>

        <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/" className={link(active === "home")}>Home</Link>
          <Link href="/explorer" className={link(active === "explorer")}>Explore</Link>
          <Link href="/history" className={link(active === "history")}>Historical</Link>
        </nav>

        {/* The room controls: how it looks, and everything else. */}
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/settings" aria-label="Settings" title="Settings — mode, theme, units, motion"
            data-tour="settings"
            className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all duration-[--dur-2] ease-[--ease-out]",
              active === "settings"
                ? "border-accent/30 bg-accent/10 text-accent-soft"
                : "border-white/[0.07] bg-base-850/70 text-ink-muted hover:border-white/[0.14] hover:text-ink hover:rotate-45")}>
            <Settings size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function link(active: boolean) {
  return `rounded-lg px-2.5 py-1.5 transition-colors sm:px-3 ${
    active ? "text-ink bg-white/[0.05]" : "text-ink-muted hover:text-ink hover:bg-white/[0.04]"
  }`;
}
