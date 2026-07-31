"use client";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The walkthrough.                                                           */
/*                                                                            */
/* Three rules, and they are what separate this from a tutorial nobody reads:  */
/*                                                                            */
/*   IT POINTS AT REAL THINGS. Each step spotlights an element that is already */
/*   on screen, with the reader's own session in it. A modal describing the    */
/*   tabs teaches nothing; a hole cut around the actual tabs teaches by         */
/*   pointing.                                                                 */
/*                                                                            */
/*   IT IS SHORTER THAN THE PATIENCE FOR IT. Four steps, one line each. If a   */
/*   step needs a paragraph, the interface underneath it needs the work        */
/*   instead.                                                                  */
/*                                                                            */
/*   IT IS TRIVIAL TO LEAVE. Escape, the backdrop, and a permanent Skip. It    */
/*   never runs twice unless asked for again from Settings, and a step whose   */
/*   target isn't on screen is skipped rather than pointing at nothing.        */
/* -------------------------------------------------------------------------- */

export interface Step {
  /** Any CSS selector already in the page. Missing targets are skipped. */
  target: string;
  title: string;
  body: string;
}

interface Box { top: number; left: number; width: number; height: number; }

export function Walkthrough({ steps, enabled }: { steps: Step[]; enabled: boolean }) {
  const { prefs, set, ready } = usePrefs();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [live, setLive] = useState(false);

  const run = ready && enabled && !prefs.onboarded;

  // wait for the page to settle before measuring: a target that is still
  // loading has no box, and a spotlight around nothing is worse than no tour
  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setLive(true), 900);
    return () => clearTimeout(t);
  }, [run]);

  const finish = useCallback(() => {
    setLive(false);
    set("onboarded", true);
  }, [set]);

  // find the first step from `from` whose target actually exists
  const resolve = useCallback((from: number): number => {
    for (let n = from; n < steps.length; n++) {
      if (document.querySelector(steps[n].target)) return n;
    }
    return -1;
  }, [steps]);

  useLayoutEffect(() => {
    if (!live) return;
    const n = resolve(i);
    if (n < 0) { finish(); return; }
    if (n !== i) { setI(n); return; }

    const measure = () => {
      const el = document.querySelector(steps[n].target);
      if (!el) { finish(); return; }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    // the spotlight is drawn in viewport coordinates, so it has to follow the
    // page rather than be painted once
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [live, i, steps, resolve, finish]);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" || e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function next() {
    const n = resolve(i + 1);
    if (n < 0) finish(); else setI(n);
  }

  if (!live || !box) return null;

  const PAD = 8;
  const hole = {
    top: box.top - PAD, left: box.left - PAD,
    width: box.width + PAD * 2, height: box.height + PAD * 2,
  };
  // below the target unless that would fall off the bottom, in which case above
  const below = hole.top + hole.height + 190 < window.innerHeight;
  const step = steps[i];

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true"
      aria-label={`Walkthrough, step ${i + 1} of ${steps.length}`}>
      {/* The scrim is one element with a hole punched through it by box-shadow,
          rather than four rectangles around the target — so it can animate from
          one step to the next as a single moving spotlight. */}
      <div onClick={finish}
        className="absolute rounded-xl transition-all duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)]"
        style={{
          top: hole.top, left: hole.left, width: hole.width, height: hole.height,
          boxShadow: "0 0 0 9999px rgb(var(--base-950) / 0.82)",
          outline: "1.5px solid rgb(var(--accent) / 0.75)",
          outlineOffset: 0,
        }} />

      <div
        className="absolute w-[min(21rem,calc(100vw-2rem))] animate-fade-in rounded-xl border border-white/[0.12] bg-base-900 p-4 shadow-glow"
        style={{
          top: below ? hole.top + hole.height + 12 : undefined,
          bottom: below ? undefined : window.innerHeight - hole.top + 12,
          left: Math.max(12, Math.min(hole.left, window.innerWidth - 348)),
        }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold tracking-tight text-ink">{step.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{step.body}</p>
          </div>
          <button onClick={finish} aria-label="Skip the walkthrough"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink">
            <X size={14} />
          </button>
        </div>

        <div className="mt-3.5 flex items-center gap-3">
          {/* progress as marks, not "3 of 4": the eye counts four dots faster
              than it parses a fraction */}
          <div className="flex gap-1.5">
            {steps.map((_, n) => (
              <span key={n} className={cx("h-1.5 rounded-full transition-all duration-300",
                n === i ? "w-5 bg-accent" : n < i ? "w-1.5 bg-accent/45" : "w-1.5 bg-white/15")} />
            ))}
          </div>
          <button onClick={finish}
            className="ml-auto text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
            Skip
          </button>
          <button onClick={next}
            className="pressable inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-pure">
            {i === steps.length - 1 ? "Got it" : "Next"}
            {i < steps.length - 1 && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
