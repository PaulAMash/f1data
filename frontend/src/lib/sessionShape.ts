/* -------------------------------------------------------------------------- */
/* THE ENTRY LIST IS LOAD-BEARING, SO THE UI GUARANTEES IT TOO.               */
/*                                                                            */
/* Every chart series in the product is built by walking `session.drivers`.    */
/* The Position chart takes its lines from it, the pace charts take their      */
/* colours from it, and a dozen panels resolve a name from a code through it.  */
/* When it arrives empty, none of them fail loudly: the Position chart maps    */
/* over an empty list, produces zero <Line> elements, and renders a plot with  */
/* its axes collapsed — chart chrome above and below, nothing in between. The  */
/* classification table beside it is fine, because those rows carry their own  */
/* names and colours. A reader sees a page that is mostly working with the     */
/* charts silently blank, which is the least debuggable failure available.     */
/*                                                                            */
/* The backend derives this facet, and V80 made that derivation run on the     */
/* cache-read path too. This is the same rule applied on the other side of the */
/* wire, and it is not redundant: the frontend is served a payload it did not  */
/* compute, from a deployment it does not control, and possibly from a cache   */
/* older than either. A facet that every chart depends on should be rebuilt    */
/* wherever it is missing and rebuildable, not assumed at each of fifteen call */
/* sites.                                                                     */
/*                                                                            */
/* It rebuilds only from what the session already holds, and only when there   */
/* is nothing there — a real entry list is never touched.                      */
/* -------------------------------------------------------------------------- */
import type { Driver, RaceBundle, RaceSession } from "./types";

const FALLBACK_COLOR = "#8892a6";

/** An entry list rebuilt from the classification, then from the trace. */
function deriveDrivers(session: RaceSession): Driver[] {
  const seen = new Map<string, Driver>();

  // 1. the classification: every row is already a driver record
  for (const row of session.classification ?? []) {
    if (!row.driver || seen.has(row.driver)) continue;
    seen.set(row.driver, {
      number: "", code: row.driver, name: row.name || row.driver,
      team: row.team || "", team_color: row.team_color || FALLBACK_COLOR,
      grid: row.grid ?? null,
    });
  }
  if (seen.size) return [...seen.values()];

  // 2. the trace itself. No names and no colours, but a code is enough to draw
  //    a line and label it — an unnamed line beats no chart at all.
  for (const p of session.positions ?? []) {
    if (!p.driver || seen.has(p.driver)) continue;
    seen.set(p.driver, {
      number: "", code: p.driver, name: p.driver, team: "",
      team_color: FALLBACK_COLOR, grid: null,
    });
  }
  return [...seen.values()];
}

/** A session guaranteed to carry an entry list, if one can be reconstructed. */
export function withEntryList(session: RaceSession): RaceSession {
  if (session.drivers?.length) return session;
  const drivers = deriveDrivers(session);
  return drivers.length ? { ...session, drivers } : session;
}

/** The same guarantee, applied to a bundle as it arrives from the API. */
export function normalizeBundle(bundle: RaceBundle): RaceBundle {
  if (!bundle?.session) return bundle;
  const session = withEntryList(bundle.session);
  return session === bundle.session ? bundle : { ...bundle, session };
}
