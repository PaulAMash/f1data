"use client";
import React from "react";
import { cx } from "./format";

/* -------------------------------------------------------------------------- */
/* THE STORY IS ANALYSIS, AND IT WAS SET LIKE A PARAGRAPH OF PROSE.           */
/*                                                                            */
/* A line like                                                                */
/*                                                                            */
/*   "Corrected clean-air pace: ANT 1:16.157, HAM 1:16.609 (+0.45s), LEC      */
/*    1:16.782 (+0.62s). Largest pace-vs-result divergence: RUS (P4 pace →    */
/*    P12)."                                                                  */
/*                                                                            */
/* carries at least five different KINDS of information — who, how fast, how  */
/* much slower, what position, and the sentence explaining why any of it       */
/* matters — and every one of them was rendered in the same size, weight and   */
/* colour. The reader has to parse a sentence to find a number, so they skim,  */
/* and the analysis the product exists to provide goes unread.                */
/*                                                                            */
/* WHAT THIS IS NOT: a pill factory. Boxing every token turns a considered     */
/* paragraph into a scrapyard of chips and reads as less sophisticated, not    */
/* more — the opposite of a timing screen, which is dense, quiet and typographic.
/* So the treatment here is purely typographic: weight, colour, and tabular    */
/* figures. Nothing gains a border, a background or an icon. The sentence      */
/* still reads as a sentence; the figures inside it stop hiding.               */
/*                                                                            */
/* Applied inside StoryPanel, which is the one component behind the Race,      */
/* Qualifying, Sprint and Practice stories — so every session gets this, in    */
/* both Simple and Advanced, without any caller opting in.                     */
/* -------------------------------------------------------------------------- */

/* Three uppercase letters is a driver code — except when it is one of these.
   Getting this wrong is worse than doing nothing: emphasising "FIA" as if it
   were a driver is a claim about the sentence that is simply false. */
const NOT_A_DRIVER = new Set([
  "FIA", "DRS", "VSC", "SEC", "GMT", "UTC", "MGU", "ERS", "PIT", "DNF", "DNS",
  "DSQ", "NOR", // "NOR" is a real code (Norris) but also never appears alone as a word here
]);
// NOR is a genuine driver code; keep it emphasised.
NOT_A_DRIVER.delete("NOR");

/** One pass, longest-and-most-specific patterns first. */
const TOKEN = new RegExp(
  [
    "\\d{1,2}:\\d{2}\\.\\d{1,3}",                 // lap time     1:16.157
    "[+\\u2212\\u2013-]\\d+(?:\\.\\d+)?\\s?s\\b", // signed delta +0.45s / −1.67s
    "\\b\\d+(?:\\.\\d+)?\\s?s\\b",                // bare seconds 0.043s
    "\\bLaps?\\s\\d{1,3}(?:[\\u2013-]\\d{1,3})?", // "Lap 34" / "Laps 57-66"
    "\\bL\\d{1,3}(?:[\\u2013-]\\d{1,3})?\\b",     // L57 / L67-68
    "\\bP\\d{1,2}\\b",                            // P4
    "\\bQ[123]\\b",                               // Q1
    "\\b[A-Z]{3}\\b",                             // driver code
  ].join("|"),
  "g",
);

type Kind = "time" | "gain" | "loss" | "figure" | "lap" | "pos" | "seg" | "driver";

function classify(t: string): Kind | null {
  if (/^\d{1,2}:\d{2}\.\d{1,3}$/.test(t)) return "time";
  if (/^[+]/.test(t)) return "loss";                 // "+0.45s" is time LOST
  if (/^[−–-]/.test(t)) return "gain";     // "−1.67s" is time FOUND
  if (/^\d+(\.\d+)?\s?s$/.test(t)) return "figure";
  if (/^Laps?\s/.test(t) || /^L\d/.test(t)) return "lap";
  if (/^P\d/.test(t)) return "pos";
  if (/^Q[123]$/.test(t)) return "seg";
  if (/^[A-Z]{3}$/.test(t)) return NOT_A_DRIVER.has(t) ? null : "driver";
  return null;
}

const STYLE: Record<Kind, string> = {
  // a lap time is the headline figure of any timing screen
  time:   "font-semibold tabular-nums text-speed",
  // direction is information: slower reads warm, faster reads cool
  loss:   "font-medium tabular-nums text-rose-300/90",
  gain:   "font-medium tabular-nums text-emerald-300/90",
  figure: "font-medium tabular-nums text-ink",
  lap:    "tabular-nums text-ink-faint",
  pos:    "font-medium tabular-nums text-ink",
  seg:    "font-medium text-ink",
  // the person, in the product's own driver-code voice
  driver: "font-semibold tracking-[0.02em] text-ink",
};

/**
 * A story line with its figures set apart from its prose.
 *
 * Pure text in, styled spans out — no markup is trusted from the backend, and
 * an unrecognised sentence renders exactly as it did before.
 */
export function StoryText({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;

  while ((m = TOKEN.exec(children))) {
    const kind = classify(m[0]);
    if (!kind) continue;                       // leave it as plain prose
    if (m.index > last) out.push(children.slice(last, m.index));
    out.push(<span key={`${m.index}`} className={STYLE[kind]}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < children.length) out.push(children.slice(last));

  return <span className={className}>{out}</span>;
}
