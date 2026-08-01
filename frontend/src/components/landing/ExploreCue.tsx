"use client";
import { ChevronDown } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* The second button.                                                         */
/*                                                                            */
/* It used to open a demo — "Why did Verstappen win?" — which asked a first-   */
/* time reader to care about a specific driver in a specific race before they  */
/* knew what the product was. A hero's second control has one job: tell the    */
/* people who are not ready to commit where to go next. So it does exactly     */
/* that, and it says so.                                                      */
/*                                                                            */
/* It scrolls rather than navigates, so nothing is lost and the reader stays   */
/* in the page they were reading. The chevron is the whole affordance: it      */
/* rests, and it drops on hover, which is the same gesture the click performs. */
/* -------------------------------------------------------------------------- */

/** Matches `scroll-mt-16` on the target: clears the 56px sticky bar with air. */
const HEADROOM = 64;

export function ExploreCue() {
  const go = () => {
    const target = document.getElementById("mode");
    if (!target) return;
    const calm = document.documentElement.dataset.motion === "calm"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const top = target.getBoundingClientRect().top + window.scrollY - HEADROOM;
    // The section is what the reader asked for, so it takes focus — a keyboard
    // user who presses this must not be left behind at the top of the page.
    const land = () => target.focus({ preventScroll: true });

    if (calm) { window.scrollTo(0, top); land(); return; }

    /* Measured, not delegated. scrollIntoView would also work, but it decides
       the resting position from scroll-margin, and focus() during a smooth
       scroll moves the scroll anchor — two things that have to agree with each
       other for the landing to be exact. Driving the offset here and focusing
       only once the scroll has finished leaves nothing to agree about. */
    window.scrollTo({ top, behavior: "smooth" });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", finish);
      land();
    };
    // `scrollend` is not everywhere yet, so the timer is the floor, not the plan
    window.addEventListener("scrollend", finish);
    window.setTimeout(finish, 900);
  };

  return (
    <button type="button" onClick={go}
      className="pressable group/cue inline-flex items-center gap-2.5 rounded-xl border border-white/[0.10] bg-base-850/60 px-5 py-3.5 text-sm font-medium text-ink backdrop-blur-md">
      Explore the experience
      {/* The chevron drifts down on a slow loop. It is the page's only idle
          motion below the headline, and it exists to answer the one question a
          first-time reader has at the fold: is there more? */}
      <span className="cue-bob grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent-soft transition-colors duration-[--dur-2] group-hover/cue:bg-accent/30 group-hover/cue:text-accent">
        <ChevronDown size={14} strokeWidth={2.5} />
      </span>
    </button>
  );
}
