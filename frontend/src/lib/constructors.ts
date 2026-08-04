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
/* public/teams/README.md.                                                    */
/*                                                                            */
/* ONE SOURCE OF TRUTH, AND WHY IT HAS TO BE THIS ONE.                        */
/*                                                                            */
/* Two providers name the same constructor differently, and both names reach  */
/* the interface. A session comes from the live-timing feed and says "Racing   */
/* Bulls", "Alpine", "Red Bull Racing"; a championship table comes from        */
/* Jolpica and says "RB F1 Team", "Alpine F1 Team", "Red Bull". Every one of   */
/* those strings used to key its own slug, its own asset lookup and its own    */
/* colour, so the SAME team rendered as a branded badge on one page and a grey */
/* placeholder shield on another — with a different name above it.             */
/*                                                                            */
/* So a provider's spelling is an INPUT, never an identity. Everything the     */
/* interface shows about a constructor — mark, colour, accent, display name —  */
/* comes from the record resolved here, and the resolution is deliberately     */
/* tolerant: exact match, then with the provider's suffix noise removed, then  */
/* by finding a known name inside a sponsor-laden one. "Oracle Red Bull        */
/* Racing", "Red Bull", "RB F1 Team" and "Racing Bulls" all land where they    */
/* should, and a name nobody has seen before still gets a usable record        */
/* instead of a hole.                                                         */
/* -------------------------------------------------------------------------- */

export interface TeamIdentity {
  /** Stable slug — also the asset filename under /public/teams. */
  id: string;
  /** What the interface calls this team, whatever the provider called it. */
  name: string;
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

/* One record per constructor. `name` is what the interface calls the team, and
   it is not always what any provider calls it: Jolpica's "RB F1 Team" is
   nobody's idea of a team name, and "Haas F1 Team" says "F1 Team" on a page
   about Formula 1. Aliases are the spellings seen in the wild, and they exist
   only for the ones the rules below cannot reach on their own. */
const CANON: TeamIdentity[] = [
  { id: "mclaren", name: "McLaren", code: "MCL", accent: "#47c7fc", colour: "#ff8000" },
  { id: "ferrari", name: "Ferrari", code: "SF", accent: "#fff200", colour: "#e8002d" },
  { id: "red-bull", name: "Red Bull Racing", code: "RBR", accent: "#ffc906", colour: "#3671c6" },
  { id: "mercedes", name: "Mercedes", code: "MER", accent: "#c8cdd4", colour: "#27f4d2" },
  { id: "aston-martin", name: "Aston Martin", code: "AMR", accent: "#cedc00", colour: "#229971" },
  /* ALPINE IS BLUE. The pink is a sponsor's, worn over a blue car for two
     seasons, and it was filed here as the primary with Alpine's own blue
     demoted to the accent — so the badge came out a dusty rose on a page where
     the session feed was drawing the same team in blue. */
  { id: "alpine", name: "Alpine", code: "ALP", accent: "#ff87bc", colour: "#0090ff" },
  { id: "williams", name: "Williams", code: "WIL", accent: "#e8ecf5", colour: "#64c4ff" },
  { id: "racing-bulls", name: "Racing Bulls", code: "RB", accent: "#e8002d", colour: "#6692ff" },
  /* AUDI IS RED, AND WAS INHERITING KICK SAUBER'S GREEN. Audi took the Sauber
     entry over, and the record was cloned rather than written — so the official
     rings rendered on Kick Sauber's green in the championship while the session
     feed drew the same team red two tabs away. */
  { id: "audi", name: "Audi", code: "AUD", accent: "#e8ecf5", colour: "#bb0a30" },
  /* HAAS AND CADILLAC, SAMPLED FROM THE SUPPLIED REFERENCES. Both are grey and
     Cadillac is the darker of the two, which is the distinction that had been
     lost — they carried a byte-identical hex, so two teams shared one rail, one
     bar and one line on every chart. Haas keeps the cool cast its reference
     shows; Cadillac is neutral and materially darker. */
  { id: "haas", name: "Haas", code: "HAA", accent: "#e6002b", colour: "#969c9f" },
  { id: "cadillac", name: "Cadillac", code: "CAD", accent: "#ffc906", colour: "#7b7b7e" },
  /* Teams that have stopped racing under these names. They keep their records
     so a 2023 session still recognises them; they have no marks and are not
     meant to. */
  { id: "sauber", name: "Kick Sauber", code: "SAU", accent: "#e8ecf5", colour: "#52e252" },
  { id: "alphatauri", name: "AlphaTauri", code: "AT", accent: "#e8ecf5", colour: "#5e8faa" },
  { id: "alfa-romeo", name: "Alfa Romeo", code: "ALF", accent: "#e8ecf5", colour: "#c92d4b" },
];

/* Every string that should resolve to a record: its canonical name, plus the
   spellings the rules below cannot derive. Jolpica's constructorIds are here
   because a caller holding an id rather than a name should not have to care. */
const ALIASES: Record<string, string> = {
  "scuderia ferrari": "ferrari", "ferrari": "ferrari",
  "red bull": "red-bull", "red_bull": "red-bull", "oracle red bull racing": "red-bull",
  "rb": "racing-bulls", "visa cash app rb": "racing-bulls",
  "aston_martin": "aston-martin",
  "alfa romeo racing": "alfa-romeo", "alfa_romeo": "alfa-romeo",
  "kick sauber": "sauber", "stake": "sauber", "sauber": "sauber",
};

function norm(team: string): string {
  return team.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Provider suffix noise. "Alpine F1 Team" and "Alpine" are the same team, and
   "Haas F1 Team" tells a reader of a Formula 1 product nothing they did not
   already know. Stripped for lookup AND for display. */
const SUFFIX = /\s*\b(formula\s*(1|one)\s*)?(f1\s*)?team\b\s*$|\s*\bracing\s+team\b\s*$|\s*\bf1\b\s*$/g;

const BY_ID = new Map(CANON.map((t) => [t.id, t]));
/* Longest first: "red bull racing" has to beat "red bull" to the match, and
   both have to beat anything shorter that happens to appear inside them. */
const LOOKUP: [string, string][] = [
  ...CANON.map((t) => [norm(t.name), t.id] as [string, string]),
  ...Object.entries(ALIASES).map(([k, v]) => [norm(k), v] as [string, string]),
].sort((a, b) => b[0].length - a[0].length);

/** Title-case a provider string we have no record for, so it still reads as a name. */
function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Identity for any constructor — including one that does not exist yet.
 *
 * Resolution is tried in order of confidence: an exact name or alias, then the
 * same with the provider's suffix noise removed, then a known name appearing
 * inside a sponsor-laden one ("Moneygram Haas F1 Team", "BWT Alpine F1 Team").
 * A new entrant nobody has a record for must not render as a hole in the grid,
 * so it still yields a slug, a code and a readable name.
 */
export function teamIdentity(team: string): TeamIdentity {
  const raw = norm(team);
  const stripped = raw.replace(SUFFIX, "").trim();

  for (const candidate of [raw, stripped]) {
    if (!candidate) continue;
    const hit = LOOKUP.find(([k]) => k === candidate);
    if (hit) return BY_ID.get(hit[1])!;
  }
  /* Whole-word containment, longest key first. A sponsor in front of the name
     is the one shape neither exact matching nor suffix stripping can reach. */
  const inside = LOOKUP.find(([k]) =>
    new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(stripped));
  if (inside) return BY_ID.get(inside[1])!;

  const words = stripped.split(/\s+/).filter(Boolean);
  const code = words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  return {
    id: stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team",
    name: titleCase(stripped) || team,
    code: code || "?",
  };
}

/** What the interface calls this constructor, whatever the provider called it. */
export function teamName(team: string | null | undefined): string {
  if (!team) return "—";
  return teamIdentity(team).name;
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
