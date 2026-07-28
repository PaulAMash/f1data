/* -------------------------------------------------------------------------- */
/* Curated portraits — the one deliberate exception to "portraits come from     */
/* Formula1.com".                                                              */
/*                                                                            */
/* The provider (backend/app/adapters/headshots.py) resolves every driver from  */
/* F1's own driver-listing API, which is the right architecture: it needs no    */
/* per-driver code, it follows team changes, and new drivers appear the moment  */
/* F1 publishes them. But it can only serve what F1 has published, and a driver */
/* F1 hasn't posted an asset for yet renders as initials — correct behaviour,   */
/* and still a hole in a grid where every other face is there.                  */
/*                                                                            */
/* This map is that hole, filled by hand: an image shipped with the app, cropped */
/* to the same framing as the official portraits (head ~47% of the frame, ~7%   */
/* headroom above the hair, shoulders filling the bottom edge — measured off    */
/* the shipped assets, not guessed) so it is indistinguishable from its         */
/* neighbours at every size the app draws.                                     */
/*                                                                            */
/* It is checked FIRST, on purpose: a curated asset we can see is better than a */
/* remote one we can't. Keys are normalized full names. Keep this list short —  */
/* every entry is a promise to maintain a photo by hand, and the moment F1      */
/* publishes theirs the entry should come out.                                 */
/* -------------------------------------------------------------------------- */

const CURATED: Record<string, string> = {
  "arvid lindblad": "/drivers/arvid-lindblad.png",
};

/** Lowercase, accent-stripped, single-spaced — matches the backend's `_norm`. */
function norm(text: string | null | undefined): string {
  if (!text) return "";
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** A hand-shipped portrait for this driver, or null to use the provider's. */
export function curatedPortrait(name?: string | null): string | null {
  return CURATED[norm(name)] ?? null;
}
