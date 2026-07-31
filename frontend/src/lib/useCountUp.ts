"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A number that arrives rather than appears.
 *
 * Counts only once, and only when the element is on screen — a statistic that
 * animates while scrolled past has performed to nobody, and one that re-counts
 * every time it re-enters is a distraction.
 *
 * The curve is ease-out: fast to most of the value, then settling. A linear
 * count reads as a progress bar; this reads as a figure being arrived at.
 */
export function useCountUp(target: number, ms = 1100) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Starts AT the target, not at zero. The failure mode of a flourish must be
  // "no flourish", never "wrong number" — a statistic stuck at 0 because an
  // observer didn't fire is a lie about the product, and it is exactly what
  // happened when this started at zero and waited to be told to count.
  const [value, setValue] = useState(target);

  useEffect(() => {
    const el = ref.current;
    const reduced = typeof window !== "undefined"
      && (window.matchMedia("(prefers-reduced-motion: reduce)").matches
        || document.documentElement.dataset.motion === "calm");
    if (!el || reduced || typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }
    let raf = 0;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      setValue(0);
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    // Measured, not just observed. An IntersectionObserver is the right tool for
    // "scrolled into view later", but relying on it alone left figures reading
    // zero when they were on screen from the first frame — and a statistic stuck
    // at 0 is worse than one that never animated. If it is already in view,
    // count now; otherwise wait for it.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      run();
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, ms]);

  return { ref, value };
}
