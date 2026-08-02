"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";

/* -------------------------------------------------------------------------- */
/* Hover intent.                                                              */
/*                                                                            */
/* Every tooltip in the product opened on the first pixel of a mouseover,     */
/* which is why crossing a row of six explained metrics fired six popups in    */
/* a row. A hover only means "explain this" if the pointer stays; before that  */
/* it means "the pointer went past". One short wait turns the second into the  */
/* first, and it is the reader's own wait — see Settings → Interface.          */
/*                                                                            */
/* Leaving is never delayed. A tooltip that lingers is in the way, and there   */
/* is no ambiguity to resolve on the way out.                                  */
/* -------------------------------------------------------------------------- */

const MS = { none: 0, short: 260, long: 700 } as const;

export function useTipDelay(): number {
  return MS[usePrefs().prefs.tipDelay] ?? MS.short;
}

/**
 * `T` is whatever the caller wants to remember about the anchor — usually a
 * position read off the element that was hovered.
 */
export function useHoverTip<T>() {
  const delay = useTipDelay();
  const [at, setAt] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  /** Arm the tooltip. Pass the value already read off the element — by the
      time the timer fires, React has nulled `currentTarget`. */
  const open = useCallback((value: T) => {
    clear();
    if (delay === 0) { setAt(value); return; }
    timer.current = setTimeout(() => setAt(value), delay);
  }, [clear, delay]);

  const close = useCallback(() => { clear(); setAt(null); }, [clear]);
  /** A press is an explicit request, so it never waits. */
  const toggle = useCallback((value: T) => {
    clear();
    setAt((cur) => (cur ? null : value));
  }, [clear]);

  useEffect(() => clear, [clear]);
  return { at, open, close, toggle };
}
