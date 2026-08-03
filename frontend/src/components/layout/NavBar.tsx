"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Radar, Settings } from "lucide-react";
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
/*                                                                            */
/* AND WHAT IT LOST: the theme toggle, for the same reason Simple/Advanced     */
/* went. Both are now asked once, on the welcome screen, where the choice can  */
/* be explained and felt — and both live permanently in Settings. A toggle in  */
/* the chrome is a preference pretending to be a tool.                         */
/* -------------------------------------------------------------------------- */

/** One half of the step control. Disabled is a state it wears, not a state it
    hides in — a greyed arrow tells you the direction exists and is exhausted,
    which is information a missing button cannot give. */
function NavStep({ dir, onClick, enabled, shown }: {
  dir: "back" | "forward"; onClick: () => void; enabled: boolean; shown: boolean;
}) {
  const label = dir === "back" ? "Back" : "Forward";
  return (
    <button type="button" onClick={onClick} disabled={!enabled}
      tabIndex={shown && enabled ? 0 : -1}
      aria-label={label} title={label}
      className={cx("grid h-8 w-[30px] shrink-0 place-items-center transition-colors duration-[--dur-2]",
        dir === "back" ? "rounded-l-lg" : "rounded-r-lg",
        enabled
          ? "text-ink-muted hover:bg-white/[0.07] hover:text-ink"
          : "cursor-default text-ink-faint/35")}>
      {dir === "back" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
    </button>
  );
}

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

        {/* ONE CONTROL WITH TWO HALVES, not two controls that happen to be
            adjacent. They share a shell and a divider, which is what says the
            pair is a single idea — and it is why each half can be disabled
            without leaving a lonely dead button in the chrome.

            The shell itself still comes and goes: on a page reached directly
            there is no in-app history in either direction, and a navigation
            control with nothing to navigate is furniture. Width animates rather
            than the element appearing, so the row beside it does not jump. */}
        <div className={cx("flex items-center overflow-hidden transition-all duration-[--dur-3] ease-[--ease-out]",
          canBack || canForward ? "ml-1 w-[62px] opacity-100" : "w-0 opacity-0")}>
          <div className="flex shrink-0 items-center rounded-lg border border-white/[0.07] bg-base-850/70">
            <NavStep dir="back" onClick={back} enabled={canBack} shown={canBack || canForward} />
            <span aria-hidden className="h-4 w-px bg-white/[0.08]" />
            <NavStep dir="forward" onClick={forward} enabled={canForward} shown={canBack || canForward} />
          </div>
        </div>

        <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/" className={link(active === "home")}>Home</Link>
          <Link href="/explorer" className={link(active === "explorer")}>Explore</Link>
          {/* "Seasons", not "Historical". The championship standings live here — the
              current one included — and a reader who reads the label as "old stuff"
              will never look for this year's title race behind it. */}
          <Link href="/history" data-tour="nav-history" className={link(active === "history")}>Seasons</Link>
        </nav>

        {/* One control, because there is one thing here that is not navigation.
            The theme toggle used to sit beside it — see the note above: it is a
            preference, it is now asked for on the way in, and it lives in
            Settings with every other answer. A bar with two competing gestures
            in the corner is a bar that has not decided what it is for. */}
        {/* `-mr-1`, and it is optical rather than geometric. The button's BOX is
            already exactly on the layout grid — measured at 104px from the edge
            on a 1440px window, the same as the wordmark's left and the panel
            edges below it. But a 15px glyph centred in a 32px box sits 8.5px
            inside that line, so the thing the eye actually aligns to reads as
            floating short of the corner while every box near it reaches it.
            Half the difference puts the glyph where the grid appears to be
            without the hover surface visibly overhanging. */}
        <div className="ml-auto -mr-1 flex items-center">
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
