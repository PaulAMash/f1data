"use client";
/* -------------------------------------------------------------------------- */
/* Team colours, on paper.                                                    */
/*                                                                            */
/* Formula 1's liveries are chosen to read on a dark broadcast graphic, and    */
/* several of them do not survive being put on white: Mercedes' petrol green,  */
/* Williams' pale blue and Sauber's white are all high-lightness colours that  */
/* vanish as a 2px stroke on a page whose background is 96% white. A position  */
/* chart where four of twenty cars have no visible line is not a chart.        */
/*                                                                            */
/* THE FIX IS NOT TO RECOLOUR THE TEAMS. A livery is data — it is how the      */
/* reader identifies a car without a legend, and swapping Mercedes to navy     */
/* because navy shows up better would be inventing a fact about the sport.     */
/* What is adjusted is only the LIGHTNESS, and only in the light theme, and    */
/* only far enough to clear the contrast floor. Hue is never touched, so the   */
/* car is still recognisably that team's; saturation is nudged up because a    */
/* colour that has been darkened without it reads grey.                        */
/*                                                                            */
/* Dark mode passes the livery through untouched. It was designed for a dark   */
/* surface and it works there — which is the whole point of only doing this on */
/* the theme that needs it.                                                    */
/* -------------------------------------------------------------------------- */

/** Perceived lightness, 0..1. The coefficients are the usual luma weights. */
function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * A livery that can be seen on white.
 *
 * Anything already dark enough is returned unchanged, so most of the grid is
 * untouched and the few that need it are pulled down to the same ceiling —
 * which also has the effect of making the pale teams distinguishable from each
 * other, since on white they were all converging on "very light".
 */
export function onLight(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const L = luma(r, g, b);
  const CEIL = 0.52;
  if (L <= CEIL) return hex;

  // scale toward black to hit the ceiling, then push saturation back up so the
  // result is a darker version of the same colour rather than a grey one
  const k = CEIL / L;
  const mean = (r + g + b) / 3;
  const out = [r, g, b].map((c) => {
    const scaled = c * k;
    const saturated = mean * k + (scaled - mean * k) * 1.22;
    return Math.max(0, Math.min(255, Math.round(saturated)));
  });
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The one entry point every component uses, and the order of the two
 * corrections matters.
 *
 * COLOUR VISION FIRST, because it decides what hue the colour is going to be
 * at all — mapping onto a dichromat-safe ring (see lib/palette) and then
 * checking that result against the page it will sit on is right, while
 * darkening for paper and then rotating the hue would throw the darkening away.
 *
 * SURFACE SECOND, because it is a question about contrast rather than about
 * identity: a colour that survives deuteranopia can still be a pale line on a
 * white page, and both readers exist at once.
 */
export const livery = (
  hex: string | null | undefined,
  theme: "dark" | "light",
  cvd: ColourVision = "none",
): string => {
  if (!hex) return theme === "light" ? "#5b677e" : "#8892a6";
  const safe = forColourVision(hex, cvd);
  return theme === "light" ? onLight(safe) : safe;
};

/* -------------------------------------------------------------------------- */
import { usePrefs } from "@/lib/prefs";
import { COMPOUND_COLOR } from "@/lib/compounds";
import { useCallback } from "react";
import { forColourVision, type ColourVision } from "@/lib/palette";

/** A colour, adjusted for the surface it lands on and the eye reading it.
 *  Every livery, compound, flag and key-moment colour in the product goes
 *  through this one call — which is why one preference reaches all of them. */
export function useLivery() {
  const { theme, colourVision } = usePrefs().prefs;
  return useCallback(
    (hex: string | null | undefined) => livery(hex, theme, colourVision),
    [theme, colourVision]);
}

/* -------------------------------------------------------------------------- */
/**
 * A tyre compound's colour, adapted.
 *
 * Hard is `#e7ecf3` — very nearly white, which is exactly right on a black
 * timing screen and is a blank rectangle on a white page. Soft and Medium are
 * red and yellow, which a deuteranope reads as one colour. Both problems have
 * the same answer and the product already owns it, so this is the same adapter
 * with the compound table wired into it rather than a second set of rules.
 */
export function useCompoundColour() {
  const paint = useLivery();
  return useCallback(
    (c: keyof typeof COMPOUND_COLOR | string) =>
      paint(COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR] ?? COMPOUND_COLOR.UNKNOWN),
    [paint]);
}
