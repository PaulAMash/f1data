"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll, done so it can never hide content.
 *
 * The hidden resting state is applied only once this hook has mounted, so if
 * scripting fails, or an observer never fires, the section was visible the
 * whole time. A reveal animation that starts from `opacity: 0` in the stylesheet
 * is one broken script away from an empty page — which is the usual reason this
 * pattern is a bad idea, and the reason it is safe here.
 *
 * Fires once. A section that re-hides when it leaves the viewport turns a scroll
 * back up into a second performance nobody asked for.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    setArmed(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Three states, and the middle one is the only hidden one. Returning both
  // classes at once would leave the outcome to stylesheet order rather than to
  // this function.
  const className = !armed ? "" : shown ? "reveal-on" : "reveal";
  return { ref, className };
}
