/* -------------------------------------------------------------------------- */
/* WHERE A RACE LIVES.                                                        */
/*                                                                            */
/* The Explorer identifies a session from the address bar — `year`, `gp` and   */
/* `session` — and it does so DELIBERATELY rather than incidentally: a link    */
/* that already names the race lets the page set its selection synchronously   */
/* on mount instead of waiting on `/api/current`, which is what stops a reader */
/* seeing somebody else's race for a round trip (see app/explorer/page.tsx,    */
/* `deepLinked`).                                                             */
/*                                                                            */
/* That convention was written out by hand at each call site. One typo in the  */
/* parameter name, or one caller forgetting to encode a Grand Prix whose name  */
/* contains a space, and the Explorer silently opens on the wrong thing — so   */
/* it is written once, here, and every link into Explore is built from it.     */
/* -------------------------------------------------------------------------- */

/** The session the Explorer opens on when a caller does not say. Matches the
 *  backend's own default for `/api/session` and the name the lifecycle uses
 *  for the race itself (backend app/schedule.py). */
export const RACE_SESSION = "Race";

export interface RaceRef {
  year: number;
  gp: string;
  /** Defaults to the race. */
  session?: string | null;
}

/** The Explorer, opened on one specific session of one specific Grand Prix.
 *
 * Equivalent to a reader choosing that season, that Grand Prix and that
 * session from the pickers by hand — the same three values, arriving by the
 * same route, so there is no second navigation mechanism to keep in step. */
export function explorerHref({ year, gp, session }: RaceRef): string {
  const params = new URLSearchParams({
    year: String(year),
    gp,
    session: session || RACE_SESSION,
  });
  return `/explorer?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */
/* ARRIVING AT THE TOP.                                                       */
/*                                                                            */
/* A reader who has scrolled to round nineteen and opened it should land at    */
/* the beginning of that race, not two thousand pixels into it. The router     */
/* does reset the scroll on a push — measured, not assumed — but that is a     */
/* default of somebody else's library, it does not apply to a same-route       */
/* navigation, and when the destination is shorter than the offset the browser */
/* clamps rather than resets, which reads as "it opened halfway down". A page  */
/* that must start at the top should say so.                                   */
/*                                                                            */
/* IT IS A ONE-SHOT REQUEST, NOT A POLICY, and that is what keeps Back         */
/* working. The flag exists only because a link asked for it, is consumed by   */
/* the first page that honours it, and is never set by a Back or a Forward —   */
/* so returning to the Schedule still restores the reader's place, and nothing */
/* here touches `history.scrollRestoration`.                                   */
/*                                                                            */
/* Deliberately NOT done by scrolling the source page before leaving it: that  */
/* would write scroll position 0 into the history entry we are leaving, and    */
/* Back would return to the top of the Schedule rather than to the round the   */
/* reader was looking at.                                                      */
/* -------------------------------------------------------------------------- */
const TOP_ON_ARRIVAL = "pitwall-iq:open-at-top";

/** Ask the next page to start at the top. Called from a link's own click. */
export function requestTopOnArrival(): void {
  try { sessionStorage.setItem(TOP_ON_ARRIVAL, "1"); } catch { /* private mode */ }
}

/** Honour a pending request, once. Returns whether it did anything. */
export function consumeTopOnArrival(): boolean {
  try {
    if (!sessionStorage.getItem(TOP_ON_ARRIVAL)) return false;
    sessionStorage.removeItem(TOP_ON_ARRIVAL);
    window.scrollTo(0, 0);
    return true;
  } catch {
    return false;
  }
}
