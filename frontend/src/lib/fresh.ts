"use client";
import { useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/* THE ANSWER TO A QUESTION NOBODY IS ASKING ANY MORE.                        */
/*                                                                            */
/* Every picker in this product fires a fetch on change, and a fetch is not    */
/* ordered. Choose 2019, then 2021, then 2023 inside a second and three        */
/* requests are in the air at once; whichever one the network happens to       */
/* finish LAST is the one that writes the state. Switching seasons quickly     */
/* therefore left a reader looking at 2019's calendar under a picker reading   */
/* 2023 — and then, because the Grand Prix was picked from the wrong           */
/* calendar, at "no results found" for a race that ran perfectly well. If the  */
/* stale answer was an error, the page showed the error for a season that had  */
/* loaded fine, with a Retry button that fixed nothing because nothing was     */
/* broken.                                                                     */
/*                                                                            */
/* Four of the five season-keyed fetches in the app were written without a     */
/* guard, and the fifth got one by hand. That ratio is the argument for this   */
/* file: "remember to write `let alive = true`" is not a design, it is a thing */
/* to forget. One hook, and the guard is the shape of the effect.              */
/*                                                                            */
/* WHY NOT AbortController. Cancelling is the obvious move and it is the wrong */
/* one here. It does not answer the actual question — which of several answers */
/* is allowed to win — it only makes some of them never arrive, and it throws  */
/* away a response the browser's HTTP cache could have reused on the way back. */
/* These requests are cheap and now heavily cached server-side; what was       */
/* expensive was letting the wrong one land.                                   */
/* -------------------------------------------------------------------------- */

/**
 * Like `useEffect`, but the body is handed a `fresh()` predicate that is only
 * true while this run is still the current one. Check it before every
 * `setState` that follows an `await`.
 *
 * A later run of the same effect, and unmounting, both retire the previous run.
 *
 * ```ts
 * useFreshEffect((fresh) => {
 *   api.histEvents(year)
 *      .then((r) => { if (fresh()) setEvents(r.events); })
 *      .catch(() => { if (fresh()) setEvents([]); });
 * }, [year]);
 * ```
 */
export function useFreshEffect(
  run: (fresh: () => boolean) => void,
  deps: React.DependencyList,
) {
  // A counter rather than a boolean flag: the newest run needs to be able to
  // tell itself apart from every older one, not merely from "cancelled".
  const gen = useRef(0);
  useEffect(() => {
    const mine = ++gen.current;
    run(() => gen.current === mine);
    // Retiring on cleanup covers unmount as well as re-run, and it is what
    // makes React's development double-invoke harmless: the discarded first
    // run retires itself before the second one starts.
    //
    // The lint rule below warns that `gen.current` will have changed by the
    // time this cleanup runs. That is the mechanism, not a mistake: the rule is
    // about refs holding DOM nodes, and this one holds the generation counter
    // whose whole job is to move on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { gen.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
