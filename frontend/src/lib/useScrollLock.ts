"use client";
import { useLayoutEffect } from "react";

/* -------------------------------------------------------------------------- */
/* Locking the page behind an overlay.                                        */
/*                                                                            */
/* An overlay taller than the window is the common case, not the exception —   */
/* a driver gallery on a laptop, a tour card on a phone. When the pointer is   */
/* over the overlay the wheel should move the overlay; when it reaches the end */
/* of it, nothing should happen. What actually happened was scroll chaining:   */
/* the page underneath took over, so the reader's content slid away behind a   */
/* dialog they had not dismissed and was in the wrong place when they did.     */
/*                                                                            */
/* Two halves, and both are needed:                                            */
/*                                                                            */
/*   `overflow: hidden` on <html> stops the page scrolling at all. On its own  */
/*   this shifts the whole layout left by the scrollbar's width — every fixed  */
/*   element jumps, which is a worse artefact than the one being fixed. The    */
/*   gutter is therefore paid back as padding, measured rather than assumed,   */
/*   because it is zero on overlay-scrollbar platforms and fifteen-ish on      */
/*   Windows.                                                                  */
/*                                                                            */
/*   `overscroll-behavior: contain` on the scrolling part of the overlay stops */
/*   the chain in the other direction. That belongs to the overlay's own       */
/*   stylesheet — see `.modal-scroll` — because only the overlay knows which   */
/*   of its boxes is the scrolling one.                                        */
/*                                                                            */
/* Layout effect, not effect: the lock has to be in place before the browser   */
/* paints the overlay, or the first frame shows the page scrolled.             */
/* -------------------------------------------------------------------------- */

/** How many overlays are currently open. Nested dialogs must not fight. */
let depth = 0;

export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (depth === 0) {
      const gutter = window.innerWidth - root.clientWidth;
      root.dataset.locked = "true";
      root.style.setProperty("--lock-gutter", `${gutter}px`);
    }
    depth += 1;
    return () => {
      depth -= 1;
      if (depth === 0) {
        delete root.dataset.locked;
        root.style.removeProperty("--lock-gutter");
      }
    };
  }, [active]);
}
