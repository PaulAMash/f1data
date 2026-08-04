/* -------------------------------------------------------------------------- */
/* Constructor identity.                                                      */
/*                                                                            */
/* Teams need to be recognised before they are read. The gallery used to spend */
/* its header on the words "2 cars" — true of every constructor on the grid    */
/* since 1950, and therefore information about none of them.                   */
/*                                                                            */
/* TWO TIERS, AND THE LINE BETWEEN THEM IS WHETHER THE ASSET EXISTS.          */
/*                                                                            */
/* Tier one is the constructor's own mark, shipped at /teams/<id>.webp. Tier   */
/* two, for every team that has no file — a 1998 Jordan, a 2019 Renault — is a */
/* drawn emblem: a motorsport shield in the constructor's own livery carrying  */
/* its short code. Colour is how anyone actually identifies an F1 car at       */
/* 300km/h, and the second colour is what separates two teams who share a      */
/* first one.                                                                 */
/*                                                                            */
/* WHY ASSET EXISTENCE IS THE RIGHT GATE, and not a season number. The lookup  */
/* is keyed on the constructor's NAME, and a constructor's name changing is    */
/* precisely when its identity changed: "Kick Sauber" and "Audi" are different */
/* keys, so a 2024 row can never wear a 2026 badge. A 2019 Mercedes row wears  */
/* the Mercedes mark because it genuinely is the same constructor with the     */
/* same mark. No cutoff year has to be invented, and none can go stale.        */
/*                                                                            */
/* DROP-IN READY. Nothing here enumerates which teams have files. Put a new    */
/* mark at /teams/<id>.webp and it is used on the next load, in every surface  */
/* at once — exactly the way the curated driver portrait works. See            */
/* public/teams/README.md and scripts/fetch-team-logos.sh.                     */
/* -------------------------------------------------------------------------- */

export interface TeamIdentity {
  /** Stable slug — also the asset filename under /public/teams. */
  id: string;
  /** Short mark. Initials collide (Red Bull Racing vs Racing Bulls), so these
   *  are explicit wherever a naive abbreviation would name the wrong team. */
  code: string;
  /** The second livery colour, used for the emblem's accent bar. */
  accent?: string;
  /** The primary livery. Sessions carry this per driver; standings do not —
   *  a championship table is a list of names and points, and without this it
   *  is a list of names and points in grey. */
  colour?: string;
}

const TEAMS: Record<string, TeamIdentity> = {
  "mclaren":          { id: "mclaren", code: "MCL", accent: "#47c7fc", colour: "#ff8000" },
  "ferrari":          { id: "ferrari", code: "SF", accent: "#fff200", colour: "#e8002d" },
  "scuderia ferrari": { id: "ferrari", code: "SF", accent: "#fff200", colour: "#e8002d" },
  "red bull racing":  { id: "red-bull", code: "RBR", accent: "#ffc906", colour: "#3671c6" },
  "red bull":         { id: "red-bull", code: "RBR", accent: "#ffc906", colour: "#3671c6" },
  "mercedes":         { id: "mercedes", code: "MER", accent: "#c8cdd4", colour: "#27f4d2" },
  "aston martin":     { id: "aston-martin", code: "AMR", accent: "#cedc00", colour: "#229971" },
  "alpine":           { id: "alpine", code: "ALP", accent: "#0090ff", colour: "#ff87bc" },
  "williams":         { id: "williams", code: "WIL", accent: "#e8ecf5", colour: "#64c4ff" },
  "racing bulls":     { id: "racing-bulls", code: "RB", accent: "#e8002d", colour: "#6692ff" },
  "rb":               { id: "racing-bulls", code: "RB", accent: "#e8002d", colour: "#6692ff" },
  "kick sauber":      { id: "sauber", code: "SAU", accent: "#e8ecf5", colour: "#52e252" },
  "sauber":           { id: "sauber", code: "SAU", accent: "#e8ecf5", colour: "#52e252" },
  "haas f1 team":     { id: "haas", code: "HAA", accent: "#e6002b", colour: "#b6babd" },
  "haas":             { id: "haas", code: "HAA", accent: "#e6002b", colour: "#b6babd" },
  "audi":             { id: "audi", code: "AUD", accent: "#e8ecf5", colour: "#52e252" },
  "cadillac":         { id: "cadillac", code: "CAD", accent: "#ffc906", colour: "#b6babd" },
  "alphatauri":       { id: "alphatauri", code: "AT", accent: "#e8ecf5", colour: "#5e8faa" },
  "alfa romeo":       { id: "alfa-romeo", code: "ALF", accent: "#e8ecf5", colour: "#c92d4b" },
};

function norm(team: string): string {
  return team.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Identity for any constructor — including one that doesn't exist yet.
 *
 * A new entrant must not render as a hole in the grid, so an unknown name still
 * yields a slug and a sensible mark rather than an empty badge.
 */
export function teamIdentity(team: string): TeamIdentity {
  const key = norm(team);
  const known = TEAMS[key];
  if (known) return known;
  const words = key.replace(/\bf1 team\b/g, "").trim().split(/\s+/).filter(Boolean);
  const code = words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  return { id: key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team", code };
}

/** Where a constructor's mark lives. Absent by default; used the moment it exists. */
export function logoSrc(team: string): string {
  return `/teams/${teamIdentity(team).id}.webp`;
}

/* -------------------------------------------------------------------------- */
/* OPTICAL WEIGHT, WHICH IS NOT THE SAME AS SIZE.                             */
/*                                                                            */
/* "Mercedes shouldn't look tiny while Ferrari fills the container" is a real  */
/* problem and `object-fit: contain` does not solve it: contain guarantees     */
/* nothing OVERFLOWS, which means a wide mark touches both side edges while a  */
/* tall one touches top and bottom, and the wide one reads as half the size.   */
/*                                                                            */
/* The badge normalises in two regimes, decided by the asset's own aspect      */
/* ratio at load — no per-team table, because a table is a promise to hand-    */
/* tune every future asset:                                                    */
/*                                                                            */
/*   NEAR-SQUARE (0.86–1.16) is a mark that already carries its own padding —  */
/*   a roundel, a shield, a composed badge. It gets the whole container, so it */
/*   aligns with the circle rather than floating inside a second one.          */
/*                                                                            */
/*   ANYTHING ELSE is a bare emblem or wordmark, and it is fitted so its       */
/*   LONGEST edge occupies a fixed fraction of the badge. Equal longest edges  */
/*   is what the eye actually reads as equal size.                            */
/*                                                                            */
/* `opticalScale` is the escape hatch for the handful of marks that still read */
/* wrong once you can see them — a mark with baked-in whitespace, or one whose */
/* ink is concentrated in a corner. It multiplies the fitted size. Default 1,  */
/* and every entry should be justified by looking at the badge next to its     */
/* neighbours rather than at the file.                                        */
/* -------------------------------------------------------------------------- */

/** Longest edge of a near-square emblem, as a fraction of the badge. */
export const LOGO_FIT = 0.74;
/** Longest edge a thin mark may reach, once it is thin enough to be safe. */
export const LOGO_FIT_THIN = 0.92;
/** Aspect band treated as "already a badge" and allowed to fill the container. */
export const LOGO_SQUARE_BAND: readonly [number, number] = [0.86, 1.16];

/**
 * How much of the badge this mark's longest edge should occupy.
 *
 * A CIRCLE IS NOT A SQUARE, and this is where that pays. A square emblem has
 * to stay inside the inscribed square or its corners cut the rim, which is what
 * 0.74 is. A thin one has no corners to cut — it lives along the diameter,
 * where there is materially more room — so it is allowed to grow toward the
 * full width as it gets thinner. Without this a 3:1 wordmark set to the same
 * 74% reads as half the size of the roundel next to it, which is exactly the
 * complaint this release started from.
 */
export function logoFit(aspect: number): number {
  const longSide = Math.max(aspect, 1 / aspect);
  const t = Math.min(1, Math.max(0, (longSide - 1) / 2)); // 1:1 → 0, 3:1 → 1
  return LOGO_FIT + (LOGO_FIT_THIN - LOGO_FIT) * t;
}

const OPTICAL: Record<string, number> = {
  /* Empty on purpose. Add an entry only after seeing the mark rendered beside
     the others at 24px — the automatic fit is right for every asset shipped so
     far, and a speculative correction is a bug you cannot see. */
};

/** Per-mark optical correction, multiplying the automatic fit. */
export function opticalScale(team: string): number {
  return OPTICAL[teamIdentity(team).id] ?? 1;
}

/**
 * A constructor's primary livery, by name.
 *
 * Session data carries `team_color` per driver, but a championship standings
 * row does not — Jolpica returns a name, points and wins, and nothing about
 * what colour that team is. Without this a standings table is a grey list, and
 * a grey list is the one place in an F1 product where the reader most wants to
 * find their team at a glance.
 *
 * An unknown constructor gets a neutral rather than a guess: a wrong colour is
 * worse than no colour, because it names a different team.
 */
export function teamColour(team: string | null | undefined): string {
  if (!team) return "#8892a6";
  return teamIdentity(team).colour ?? "#8892a6";
}
