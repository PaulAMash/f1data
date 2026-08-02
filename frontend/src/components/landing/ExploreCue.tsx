"use client";
import { Play } from "lucide-react";
import { useTour, DEMO } from "@/lib/tour";

/* -------------------------------------------------------------------------- */
/* The second button.                                                         */
/*                                                                            */
/* It has now been three things, and the first two were both wrong for the    */
/* same reason.                                                               */
/*                                                                            */
/*   "Why did Verstappen win?" asked a stranger to care about one driver in    */
/*   one race before they knew what the product was.                           */
/*                                                                            */
/*   "See how it works" scrolled down the page. It read as an answer and was   */
/*   a redirection: the reader asked how the product works and got a section   */
/*   heading. A control whose label is a question has to answer it.            */
/*                                                                            */
/* It answers it now. Pressing it opens a real session in the Race Explorer    */
/* and walks the five screens that take a Grand Prix apart — the same engine   */
/* the tour uses, on real data, hands-off. Twenty-five seconds, and at the end */
/* of them the reader has watched the product do the thing the headline just   */
/* claimed it does.                                                            */
/*                                                                            */
/* It also retires the duplicate: "Watch a worked example" was a second,       */
/* quieter entry to exactly this, which is one entry too many for one thing.   */
/* -------------------------------------------------------------------------- */

export function ExploreCue() {
  const { start } = useTour();
  return (
    <button type="button" onClick={() => start(DEMO, "demo")}
      className="pressable group/cue inline-flex items-center gap-2.5 rounded-xl border border-white/[0.10] bg-base-850/60 px-5 py-3.5 text-sm font-medium text-ink backdrop-blur-md">
      See how it works
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent-soft transition-all duration-[--dur-2] ease-[--ease-spring] group-hover/cue:scale-110 group-hover/cue:bg-accent/30 group-hover/cue:text-accent">
        <Play size={11} fill="currentColor" />
      </span>
    </button>
  );
}
