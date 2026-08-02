"use client";
import { Play } from "lucide-react";
import { useTour, DEMO } from "@/lib/tour";

/* -------------------------------------------------------------------------- */
/* The worked example.                                                        */
/*                                                                            */
/* This used to open a modal that played a transcript of an answer being       */
/* assembled: seven beats of "reading 1,204 laps…", three pieces of evidence   */
/* and a verdict. It was a good short film about the product and it            */
/* demonstrated nothing, because not one pixel of it was the product. A        */
/* reader who watched the whole thing had still never seen the screen they     */
/* were about to be dropped into — and every figure in it was written by hand, */
/* which on a page whose whole claim is that nothing is invented was the wrong */
/* thing to have built, however well it read.                                  */
/*                                                                            */
/* Pressing it now opens a real session in the Race Explorer and walks the     */
/* five screens that answer the question, on real data, with the reader's own  */
/* preferences applied. It ends on Ask, with the box empty and their turn.     */
/* The same twenty-five seconds; at the end of them they have used the         */
/* product rather than watched a film about it. See DEMO in lib/tour.tsx.      */
/* -------------------------------------------------------------------------- */

export function SampleStory() {
  const { start } = useTour();
  return (
    <button type="button" onClick={() => start(DEMO, "demo")}
      className="group/demo inline-flex items-center gap-2.5 text-[13.5px] font-medium text-ink-muted transition-colors duration-[--dur-2] hover:text-ink">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent-soft transition-transform duration-[--dur-3] ease-[--ease-spring] group-hover/demo:scale-110">
        <Play size={11} fill="currentColor" />
      </span>
      Watch a worked example
      <span className="text-ink-faint transition-colors group-hover/demo:text-ink-muted">
        — five screens, on a real race
      </span>
    </button>
  );
}
