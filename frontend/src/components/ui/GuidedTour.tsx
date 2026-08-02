"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTour } from "@/lib/tour";
import { usePrefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The tour, drawn.                                                           */
/*                                                                            */
/* Three rules, and they are what separate this from a tutorial nobody reads:  */
/*                                                                            */
/*   IT POINTS AT REAL THINGS. Each beat spotlights an element that is already */
/*   on screen, with the reader's own session in it. A modal describing the    */
/*   tabs teaches nothing; a hole cut around the actual tabs teaches by         */
/*   pointing.                                                                 */
/*                                                                            */
/*   IT IS SHORTER THAN THE PATIENCE FOR IT. One line per beat. If a beat      */
/*   needs a paragraph, the interface underneath it needs the work instead.     */
/*                                                                            */
/*   IT IS TRIVIAL TO LEAVE. Escape, the backdrop, and a permanent Skip. A     */
/*   beat whose target isn't on screen is skipped rather than pointing at      */
/*   nothing, and the scrim never blocks the page it is teaching — the hole is */
/*   a real hole, so the control being explained can still be pressed.          */
/* -------------------------------------------------------------------------- */

interface Box { top: number; left: number; width: number; height: number; }

export function GuidedTour() {
  const { beats, index, running, ready, next, prev, stop } = useTour();
  const { prefs } = usePrefs();
  const [box, setBox] = useState<Box | null>(null);
  const [el, setEl] = useState<Element | null>(null);
  const beat = running ? beats[index] : undefined;

  /* FIND THE TARGET — AND WAIT FOR IT.
     A beat that arrives before its page has finished fetching does not have a
     missing target; it has a target that has not rendered yet. The first cut
     could not tell the two apart and skipped on the first miss, so the entire
     Race Explorer half of the tour was skipped whenever the session took more
     than a moment to load — which, on a page whose whole job is fetching a
     session, is most of the time.

     It waits three seconds, which is longer than any render and shorter than
     anyone's patience, and only then treats the target as genuinely absent.
     A control that was removed still gets skipped rather than pointed at. */
  useEffect(() => {
    if (!beat?.target || !ready) { setEl(null); return; }
    const sel = beat.target;
    const now = document.querySelector(sel);
    if (now) { setEl(now); return; }
    let tries = 0;
    const id = setInterval(() => {
      const found = document.querySelector(sel);
      if (found) { clearInterval(id); setEl(found); }
      else if (++tries > 25) { clearInterval(id); next(); }
    }, 120);
    return () => clearInterval(id);
  }, [beat, ready, next]);

  /* Measure, and keep measuring. The spotlight is drawn in viewport
     coordinates, so it has to follow the page rather than be painted once. */
  useLayoutEffect(() => {
    if (!el) { setBox(null); return; }

    // bring it into view before measuring, or the first frame points off-screen
    el.scrollIntoView({
      block: "center", behavior: prefs.motion === "calm" ? "auto" : "smooth",
    });

    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [el, prefs.motion]);

  // auto-advance, for the demonstration script
  useEffect(() => {
    if (!beat?.hold || !ready) return;
    const t = setTimeout(next, beat.hold);
    return () => clearTimeout(t);
  }, [beat, ready, next]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "Enter" || e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, next, prev, stop]);

  // a beat with a target is not shown until that target has been found: a card
  // that appears before its spotlight points at nothing for a frame
  if (!running || !beat || !ready || typeof document === "undefined") return null;
  if (beat.target && !box) return null;

  const PAD = 8;
  const hole = box && {
    top: box.top - PAD, left: box.left - PAD,
    width: box.width + PAD * 2, height: box.height + PAD * 2,
  };
  const last = index === beats.length - 1;

  /* WHERE THE CARD GOES.
     Three cases, and the third is the one that broke: a target taller than the
     window. "Below the target" is then off the bottom of the screen and "above
     it" is off the top, and the card was placed at a negative offset — present
     in the DOM, invisible, and un-pressable. A tour that cannot be advanced is
     worse than no tour.

     So a large target is not something the card sits outside of. It sits over
     it, docked to the corner nearest the reader, which is what every tour that
     has ever explained a whole panel does. Small targets keep the pointing
     relationship, clamped so the card is always fully on screen. */
  const CARD_H = 190, CARD_W = 368, EDGE = 16;
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  const bulky = !hole || hole.height > vh * 0.55 || hole.width > vw * 0.9;

  let place: React.CSSProperties;
  if (!hole) {
    place = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (bulky) {
    place = { bottom: EDGE + 8, left: EDGE + 8 };
  } else {
    const below = hole.top + hole.height + CARD_H < vh;
    place = {
      top: below
        ? Math.min(hole.top + hole.height + 12, vh - CARD_H - EDGE)
        : Math.max(EDGE, hole.top - CARD_H - 12),
      left: Math.max(EDGE, Math.min(hole.left, vw - CARD_W)),
    };
  }

  return createPortal(
    // pointer-events-none on the wrapper, auto on the card: the scrim covers
    // the whole viewport, and without this it would swallow every click meant
    // for the control the tour is currently pointing at.
    <div className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-modal="false"
      aria-label={`Guided tour, step ${index + 1} of ${beats.length}`}>
      {/* The scrim is one element with a hole punched through it by box-shadow,
          rather than four rectangles around the target — so it can animate from
          one beat to the next as a single moving spotlight, and the target
          inside the hole stays live. */}
      {hole ? (
        <div onClick={stop}
          className="absolute rounded-xl transition-all duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)]"
          style={{
            top: hole.top, left: hole.left, width: hole.width, height: hole.height,
            boxShadow: "0 0 0 9999px rgb(var(--base-950) / 0.84)",
            outline: "1.5px solid rgb(var(--accent) / 0.75)",
            pointerEvents: "none",
          }} />
      ) : (
        <div onClick={stop} className="pointer-events-auto absolute inset-0 bg-base-950/84" />
      )}

      <div
        className="pointer-events-auto absolute w-[min(23rem,calc(100vw-2rem))] animate-fade-in rounded-xl border border-white/[0.12] bg-base-900 p-4 shadow-glow"
        style={place}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold tracking-tight text-ink">{beat.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{beat.body}</p>
          </div>
          <button onClick={stop} aria-label="Leave the tour"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink">
            <X size={14} />
          </button>
        </div>

        {/* On an auto-advancing beat the bar IS the control's promise: it says
            how long you have before it moves, so nobody has to guess whether
            they are about to lose their place. */}
        {beat.hold && (
          <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div key={index} className="h-full rounded-full bg-accent/70"
              style={{ animation: `tour-hold ${beat.hold}ms linear both` }} />
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          {/* progress as marks, not "3 of 10": the eye counts dots faster than
              it parses a fraction */}
          <div className="flex gap-1">
            {beats.map((_, n) => (
              <span key={n} className={cx("h-1.5 rounded-full transition-all duration-300",
                n === index ? "w-4 bg-accent" : n < index ? "w-1.5 bg-accent/45" : "w-1.5 bg-white/15")} />
            ))}
          </div>
          <button onClick={prev} disabled={index === 0} aria-label="Previous"
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-25">
            <ArrowLeft size={13} />
          </button>
          <button onClick={stop}
            className="text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
            Skip
          </button>
          <button onClick={next}
            className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-pure">
            {last ? "Done" : "Next"}
            {!last && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
