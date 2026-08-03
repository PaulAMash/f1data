"use client";
/* -------------------------------------------------------------------------- */
/* COLOUR, ADAPTED TO THE EYE READING IT.                                     */
/*                                                                            */
/* Formula 1 is a colour-coded sport. The livery IS the identifier, the        */
/* compound IS the colour of the sidewall, a green sector IS a personal best.  */
/* Roughly one man in twelve cannot separate the two hues that carry most of   */
/* that, which means for those readers a position chart is twenty grey lines   */
/* and a strategy timeline is a row of similar bars.                           */
/*                                                                            */
/* SHIFTING HUES AT RANDOM WOULD NOT FIX IT. Two colours that a protanope      */
/* confuses will still be confused after both are rotated by the same amount.  */
/* What works is mapping every colour onto a RING OF HUES CHOSEN SO THAT ITS   */
/* MEMBERS SURVIVE THAT SPECIFIC DEFICIENCY — for red/green that is the        */
/* Okabe-Ito set, which is the standard palette for exactly this and was       */
/* designed by measuring what dichromats can actually separate.                */
/*                                                                            */
/* MEANING IS PRESERVED BY KEEPING THE ORDER, NOT THE HUE. The ring is walked  */
/* in the same rotational order as the hue circle, so colours that were        */
/* adjacent stay adjacent and colours that were opposite stay opposite. Red    */
/* and green are still the two ends of "gained" and "lost" — they are simply   */
/* rendered as two ends the reader can see.                                    */
/*                                                                            */
/* AND IT IS THE LAST TRANSFORM, NOT THE ONLY ONE. Light mode's lightness      */
/* ceiling still applies afterwards, because a colour-blind reader on a white  */
/* page needs both corrections and they are answers to different questions.    */
/* -------------------------------------------------------------------------- */

export type ColourVision = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export const COLOUR_VISION_LABEL: Record<ColourVision, string> = {
  none: "Full colour",
  protanopia: "Protanopia",
  deuteranopia: "Deuteranopia",
  tritanopia: "Tritanopia",
};

export const COLOUR_VISION_NOTE: Record<ColourVision, string> = {
  none: "The sport's own colours, unaltered.",
  protanopia: "Reduced sensitivity to red. Charts, tyres and flags move onto a red-green-safe palette.",
  deuteranopia: "Reduced sensitivity to green — the most common form. Same palette, tuned for it.",
  tritanopia: "Reduced sensitivity to blue. Blues and yellows are separated onto a red-cyan axis instead.",
};

/* ---------------------------------------------------------------- conversion */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

/** Hue in degrees, saturation and lightness 0..1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0));
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/* ------------------------------------------------------------------- the rings */

/* Eight slots around the hue circle. A colour is mapped to the slot its own hue
   falls in, so the RELATIONSHIPS between colours are what is preserved.

   Red-green (protanopia and deuteranopia) uses Okabe-Ito, which is the
   published standard for dichromat-safe categorical colour. Protanopes lose
   more brightness in the reds than deuteranopes do, so their ring leans a shade
   lighter in that quadrant — the same hues, lifted where they would otherwise
   go muddy.

   Tritanopia confuses blue with green and yellow with violet, so its ring
   abandons the blue-yellow axis and carries its contrast on red-versus-cyan. */
type Ring = readonly [number, string][];   // [hue the slot owns, colour]

const OKABE_ITO: Ring = [
  [0, "#d55e00"],    // vermillion   — was red
  [30, "#e69f00"],   // orange       — was orange
  [55, "#f0e442"],   // yellow       — was yellow
  [110, "#009e73"],  // bluish green — was green
  [175, "#56b4e9"],  // sky blue     — was teal / cyan
  [225, "#0072b2"],  // blue         — was blue
  [280, "#cc79a7"],  // reddish purple — was violet
  [320, "#a05195"],  // plum         — was magenta
];

const PROTAN: Ring = [
  [0, "#e06a12"],
  [30, "#f0ab1e"],
  [55, "#f5e75c"],
  [110, "#00a884"],
  [175, "#6cc2f0"],
  [225, "#0f7fbe"],
  [280, "#d288b3"],
  [320, "#ac5ba0"],
];

const TRITAN: Ring = [
  [0, "#d81e5b"],    // crimson
  [30, "#e8663c"],   // warm orange
  [55, "#e8a33c"],   // amber, pushed away from yellow
  [110, "#00a0a0"],  // teal
  [175, "#00b6c9"],  // cyan
  [225, "#5d7fd6"],  // indigo, kept clear of cyan
  [280, "#b04ec9"],  // purple
  [320, "#e0468f"],  // pink
];

const RING: Record<Exclude<ColourVision, "none">, Ring> = {
  protanopia: PROTAN,
  deuteranopia: OKABE_ITO,
  tritanopia: TRITAN,
};

/* THE RING IS INTERPOLATED, NOT SNAPPED TO.
   Snapping each hue to its nearest slot collapses colours that were only a
   little apart: "gained" green sits at 158 degrees and "fastest" teal at 172,
   both nearest the same slot, so two things that mean opposite ends of a
   sentence came out identical. Walking the ring continuously keeps relative
   distance — colours that were adjacent stay adjacent, colours that were
   distinct stay distinct, and the whole circle still lands inside a gamut the
   reader can separate. */
function ringColour(hue: number, ring: Ring): string {
  const h = ((hue % 360) + 360) % 360;
  let i = ring.length - 1;
  for (let k = 0; k < ring.length; k++) if (h >= ring[k][0]) i = k;
  const a = ring[i], b = ring[(i + 1) % ring.length];
  const span = (((b[0] - a[0]) % 360) + 360) % 360 || 360;
  const t = Math.min(1, Math.max(0, ((((h - a[0]) % 360) + 360) % 360) / span));
  const ca = hexToRgb(a[1])!, cb = hexToRgb(b[1])!;
  return toHex(ca.map((v, k) => v + (cb[k] - v) * t));
}

/**
 * A colour a reader with this colour vision can tell apart from its neighbours.
 *
 * Greys are left alone: an unsaturated colour carries no hue to confuse, and
 * remapping it would invent a colour where the source had none. Lightness is
 * carried over from the original so a deliberately pale or deliberately deep
 * value stays pale or deep — the ring supplies the hue and the saturation, the
 * original keeps its place in the value scale.
 */
export function forColourVision(hex: string, cvd: ColourVision): string {
  if (cvd === "none") return hex;
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(...rgb);
  /* Grey in, grey out — and near-white and near-black count as grey. The hard
     compound is `#e7ecf3`, which HSL calls 28% saturated because it is a hair
     off neutral at very high lightness; remapping it produced a pale blue tyre,
     and "the white one" is the whole identity of that compound. */
  if (s < 0.18 || l > 0.88 || l < 0.1) return hex;
  const target = hexToRgb(ringColour(h, RING[cvd]));
  if (!target) return hex;
  const [th, ts] = rgbToHsl(...target);
  // hue and saturation from the safe ring; lightness nudged toward it so a
  // colour that was pale for a reason stays pale without going invisible
  const tl = rgbToHsl(...target)[2];
  return toHex(hslToRgb(th, Math.max(ts * 0.85, Math.min(1, s * 0.9)), l * 0.6 + tl * 0.4));
}
