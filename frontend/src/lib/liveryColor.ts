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

/** Pass-through in dark, adjusted in light. The only entry point components use. */
export const livery = (hex: string | null | undefined, theme: "dark" | "light"): string => {
  if (!hex) return theme === "light" ? "#5b677e" : "#8892a6";
  return theme === "light" ? onLight(hex) : hex;
};

/* -------------------------------------------------------------------------- */
import { usePrefs } from "@/lib/prefs";
import { useCallback } from "react";

/** The livery, adjusted for whichever surface it is about to be drawn on. */
export function useLivery() {
  const theme = usePrefs().prefs.theme;
  return useCallback((hex: string | null | undefined) => livery(hex, theme), [theme]);
}
