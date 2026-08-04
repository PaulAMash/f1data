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
/**
 * Opaque fraction above which a mark is treated as a composed badge.
 *
 * A circle inscribed in its square covers π/4 ≈ 0.785 of it, and a real
 * composed roundel — a disc with a mark on it — covers at least that. A bare
 * silhouette on the same square canvas covers far less: the five marks shipped
 * so far measure 0.17 to 0.41. The gap is wide enough that the threshold sits
 * in open space rather than on top of either group.
 */
export const LOGO_COMPOSED_COVERAGE = 0.7;

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

/* -------------------------------------------------------------------------- */
/* THE FIELD A MARK SITS ON.                                                  */
/*                                                                            */
/* "The logos are transparent, so use the team colour" is the right            */
/* instruction and it is not sufficient on its own, because a team colour is   */
/* whatever the team chose and a mark is whatever the mark is. Mercedes'       */
/* petronas green is luminous; its star is white. Put one on the other at full */
/* strength and you have white on near-white — the brand is correct and the    */
/* badge is empty.                                                            */
/*                                                                            */
/* So the livery sets the HUE and the mark's own ink sets how far that hue is  */
/* taken. White ink is dropped onto a deep field; dark ink is lifted onto a    */
/* pale one. Every badge lands in a contrast band rather than at a fixed       */
/* lightness, which is also why eleven teams whose colours range from Ferrari  */
/* red to Haas gunmetal come out looking like one set.                        */
/*                                                                            */
/* IT DOES NOT FOLLOW THE THEME. The mark's ink does not change when the       */
/* reader turns the lights on, so neither does the field under it. A badge     */
/* that restyled itself per theme would be a brand that restyled itself per    */
/* theme, and the one thing a constructor's mark has to be is the same mark.   */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance, 0–1. */
function relLum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Scale a colour toward black (t<1) or white (t>1), keeping its hue. */
function toward(rgb: [number, number, number], target: number): [number, number, number] {
  const cur = relLum(rgb);
  if (cur <= 0.0005) return target > cur ? [40, 40, 40] : rgb;
  /* Binary search on a simple multiply/screen rather than a full HSL round
     trip: it keeps the hue exactly and converges in a dozen steps, and the
     alternative drifts on saturated colours in precisely the reds and oranges
     half this grid is painted in. */
  let lo = 0, hi = 1, out = rgb;
  const darken = target < cur;
  for (let i = 0; i < 14; i++) {
    const t = (lo + hi) / 2;
    out = darken
      ? [rgb[0] * (1 - t), rgb[1] * (1 - t), rgb[2] * (1 - t)]
      : [rgb[0] + (255 - rgb[0]) * t, rgb[1] + (255 - rgb[1]) * t, rgb[2] + (255 - rgb[2]) * t];
    const l = relLum(out as [number, number, number]);
    if ((darken && l > target) || (!darken && l < target)) lo = t; else hi = t;
  }
  return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])];
}

/** Luminance a field must not exceed to carry white ink at ~4.5:1. */
const FIELD_DARK = 0.16;
/** Luminance a field must reach to carry black ink at ~4.5:1. */
const FIELD_LIGHT = 0.5;
/** Ink lighter than this is treated as white ink. */
const INK_LIGHT = 0.55;

/**
 * The field colour for a transparent mark, in this constructor's livery.
 *
 * `ink` is the mark's measured mean luminance (0–1), or null when it could not
 * be read — in which case the livery is taken to the dark end, because every
 * mark shipped so far is light and a dark field is the safe guess.
 */
export function markField(livery: string, ink: number | null): string {
  const rgb = hexToRgb(livery) ?? [136, 146, 166];
  const lightInk = ink == null || ink >= INK_LIGHT;
  const target = lightInk ? FIELD_DARK : FIELD_LIGHT;
  const cur = relLum(rgb);
  /* Already in the safe direction and comfortably clear? Leave the brand alone.
     Ferrari red is dark enough for a white shield as it ships, and nudging it
     for the sake of a formula would make it not-quite-Ferrari-red. */
  if (lightInk ? cur <= target : cur >= target) {
    const [r, g, b] = rgb;
    return `rgb(${r} ${g} ${b})`;
  }
  const [r, g, b] = toward(rgb, target);
  return `rgb(${r} ${g} ${b})`;
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
