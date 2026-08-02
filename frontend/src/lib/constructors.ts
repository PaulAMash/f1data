/* -------------------------------------------------------------------------- */
/* Constructor identity.                                                      */
/*                                                                            */
/* Teams need to be recognised before they are read. The gallery used to spend */
/* its header on the words "2 cars" — true of every constructor on the grid    */
/* since 1950, and therefore information about none of them.                   */
/*                                                                            */
/* Real logos are trademarks. We do not have licensed files, and drawing an    */
/* approximation from memory produces something that is both wrong and         */
/* someone else's mark, so this builds an honest emblem instead: a motorsport  */
/* shield in the constructor's own livery, carrying its short code. Colour is   */
/* how anyone actually identifies an F1 car at 300km/h, and the second colour   */
/* is what separates two teams who share a first one.                          */
/*                                                                            */
/* DROP-IN READY. `logoSrc()` points at /teams/<id>.svg and the component      */
/* falls back to the drawn shield if the file 404s. Add a licensed asset at    */
/* that path and it is used immediately — no code change, exactly the way the  */
/* curated driver portrait works.                                              */
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

/** Where a licensed logo would live. Absent by default; used the moment it exists. */
export function logoSrc(team: string): string {
  return `/teams/${teamIdentity(team).id}.svg`;
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
