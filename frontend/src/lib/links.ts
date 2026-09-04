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
