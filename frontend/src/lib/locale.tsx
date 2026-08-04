"use client";
import { useCallback, useEffect, useMemo } from "react";
import { usePrefs, type Clock, type Spelling, type Units } from "@/lib/prefs";

/* -------------------------------------------------------------------------- */
/* Two dialects of one language, and two ways of measuring heat.              */
/*                                                                            */
/* Formula 1 is reported in British English and metric units almost            */
/* everywhere, and in American English and Fahrenheit by a large part of its   */
/* audience. Neither is a translation of the other and neither is wrong. The   */
/* product is written once, in British metric, and rendered in whichever of    */
/* the two the reader asked for.                                              */
/*                                                                            */
/* UNITS ARE CONVERTED AT THE POINT OF DISPLAY, NEVER IN THE DATA. Everything  */
/* upstream of a component — the API, the simulation, every comparison and     */
/* threshold — stays in Celsius and kph. A converted value that leaks back     */
/* into a calculation is the classic way a units feature becomes a bug, and    */
/* the defence against it is that nothing here has a setter.                   */
/* -------------------------------------------------------------------------- */

/* ---- temperature ---------------------------------------------------------- */

export const tempUnitOf = (u: Units) => (u === "imperial" ? "°F" : "°C");

/** Celsius in, the reader's scale out. Rounding is per-call, not global. */
export function toTemp(celsius: number, u: Units): number {
  return u === "imperial" ? celsius * 1.8 + 32 : celsius;
}

export function fmtTemp(celsius: number | null | undefined, u: Units, digits = 0): string {
  if (celsius == null || Number.isNaN(celsius)) return "—";
  return `${toTemp(celsius, u).toFixed(digits)}${tempUnitOf(u)}`;
}

/** A range, with the unit stated once: "42–50°C" rather than "42°C–50°C". */
export function fmtTempRange(a: number, b: number, u: Units, digits = 0): string {
  return `${toTemp(a, u).toFixed(digits)}–${toTemp(b, u).toFixed(digits)}${tempUnitOf(u)}`;
}

/* ---- speed ---------------------------------------------------------------- */

export const speedUnitOf = (u: Units) => (u === "imperial" ? "mph" : "kph");
export const toSpeed = (kph: number, u: Units) => (u === "imperial" ? kph * 0.621371 : kph);

/* ---- clock ---------------------------------------------------------------- */

/**
 * A wall-clock time. Session times matter to the minute and never to the
 * second, so the 12-hour form drops the seconds rather than growing a third
 * field nobody reads.
 */
export function fmtClock(d: Date, c: Clock): string {
  const h = d.getHours(), m = d.getMinutes();
  const mm = String(m).padStart(2, "0");
  if (c === "24h") return `${String(h).padStart(2, "0")}:${mm}`;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${ampm}`;
}

/* ---- numbers -------------------------------------------------------------- */

export const fmtNum = (n: number, group: boolean) =>
  group ? n.toLocaleString("en-GB") : String(n);

/* -------------------------------------------------------------------------- */
/* Spelling.                                                                  */
/*                                                                            */
/* Built from stems rather than typed out as pairs, because the inflections    */
/* are exactly where a hand-written list goes wrong — somebody remembers       */
/* "analyse" and forgets "analysing", and the interface ends up half-American. */
/*                                                                            */
/* WHAT IS DELIBERATELY ABSENT. Several classic pairs are excluded because     */
/* they are not bijective in the vocabulary this product actually uses:        */
/* "storey→story" would rewrite Race Story, "programme→program" and           */
/* "licence→license" both collide with words British English spells the        */
/* American way, and "practise→practice" collides with the noun. A spelling    */
/* preference that changes a proper noun has done more harm than good.         */
/* -------------------------------------------------------------------------- */

const PAIRS: [string, string][] = [];

/** A noun and its plural. */
function noun(gb: string, us: string) {
  PAIRS.push([gb, us], [gb + "s", us + "s"]);
}

/** A verb ending in -e, with the four forms English actually inflects it into. */
function verb(gb: string, us: string) {
  const g = gb.slice(0, -1), u = us.slice(0, -1);
  PAIRS.push([gb, us], [gb + "s", us + "s"], [gb + "d", us + "d"], [g + "ing", u + "ing"]);
}

/** -ise / -isation / -isable, all from one stem. */
function ise(stem: string) {
  verb(stem + "ise", stem + "ize");
  PAIRS.push(
    [stem + "isation", stem + "ization"],
    [stem + "isations", stem + "izations"],
    [stem + "isable", stem + "izable"],
  );
}

noun("tyre", "tire");
noun("kerb", "curb");
noun("metre", "meter");
noun("litre", "liter");
noun("fibre", "fiber");
noun("centre", "center");
noun("colour", "color");
noun("behaviour", "behavior");
noun("favourite", "favorite");
noun("neighbour", "neighbor");
noun("manoeuvre", "maneuver");
noun("aluminium", "aluminum");
noun("defence", "defense");
noun("offence", "offense");
noun("judgement", "judgment");
noun("windscreen", "windshield");
PAIRS.push(
  ["grey", "gray"], ["greys", "grays"], ["greyed", "grayed"],
  ["coloured", "colored"], ["colouring", "coloring"],
  ["colourful", "colorful"], ["colourless", "colorless"],
  ["centred", "centered"], ["centring", "centering"],
  ["metred", "metered"], ["favoured", "favored"], ["favouring", "favoring"],
  // the doubled consonant British English keeps before a suffix
  ["travelled", "traveled"], ["travelling", "traveling"],
  ["cancelled", "canceled"], ["cancelling", "canceling"],
  ["modelling", "modeling"], ["modelled", "modeled"],
  ["fuelled", "fueled"], ["fuelling", "fueling"],
  ["refuelled", "refueled"], ["refuelling", "refueling"],
  ["labelled", "labeled"], ["labelling", "labeling"],
  ["signalled", "signaled"], ["signalling", "signaling"],
  ["marshalled", "marshaled"], ["marshalling", "marshaling"],
);

// -yse verbs: the noun "analysis" is spelled the same both sides, so only the
// verb forms are listed — this is why the stems are expanded rather than a
// blanket s→z rule applied
verb("analyse", "analyze");
verb("paralyse", "paralyze");
verb("catalyse", "catalyze");

for (const s of [
  "custom", "personal", "optim", "organ", "real", "recogn", "summar", "priorit",
  "minim", "maxim", "visual", "normal", "util", "categor", "emphas", "apolog",
  "special", "standard", "modern", "synchron", "stabil", "penal", "local",
  // a safety car "neutralises" the race — the word appears on four surfaces and
  // was the one piece of jargon still authored American, so a British reader
  // was reading "neutralization" in an otherwise British interface
  "neutral",
]) ise(s);

/* ONE DIRECTION, ON PURPOSE.
   There is no American→British map any more. The product is WRITTEN in British
   English, so American is a rendering of it and British is the original — going
   back is a restore from the cache below, never an inverse conversion. A second
   map was a second thing that could disagree with the first, and several pairs
   genuinely are not bijective ("meter" is a British word too). */
const GB_TO_US = new Map(PAIRS);

/**
 * One alternation over every word in the map, longest first.
 *
 * Longest-first matters: without it "colour" inside "colourful" matches the
 * short entry and leaves "colorful" spelled "colourful" — the classic
 * find-and-replace bug, and invisible in exactly the words a reader notices.
 */
function alternation(map: Map<string, string>): RegExp {
  const words = [...map.keys()].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${words.join("|")})\\b`, "gi");
}
const RE_GB = alternation(GB_TO_US);

/** TYRE → TIRE, Tyre → Tire, tyre → tire. Anything else is left alone. */
function matchCase(sample: string, replacement: string): string {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (sample[0] === sample[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function convert(text: string, re: RegExp, map: Map<string, string>): string {
  re.lastIndex = 0;
  return text.replace(re, (w) => {
    const to = map.get(w.toLowerCase());
    return to ? matchCase(w, to) : w;
  });
}

/**
 * Spell a string the reader's way.
 *
 * Exported for the places the DOM bridge below cannot reach — chiefly text
 * painted onto a canvas, which has no text nodes to observe.
 */
export const sp = (text: string, spelling: Spelling): string =>
  spelling === "en-US" ? convert(text, RE_GB, GB_TO_US) : text;

/* -------------------------------------------------------------------------- */
/* The bridge.                                                                */
/*                                                                            */
/* Two hundred and forty-nine British spellings live in forty-one files, and   */
/* wrapping every one of them in a helper would be both a large diff and a     */
/* permanent tax: the four hundredth string somebody writes will not be        */
/* wrapped, and the interface will be half-American with nothing to catch it.  */
/*                                                                            */
/* So the transform is applied to the rendered document instead. It runs after */
/* hydration (never before — React compares text during hydration and would    */
/* report a mismatch), it caches each node's authored text so switching back   */
/* restores the original exactly rather than guessing an inverse, and it       */
/* re-applies whenever React writes over a node it has already converted.      */
/*                                                                            */
/* Cost is one regex test per changed text node. The most active surface in    */
/* the product — live timing at 11Hz — has about forty of them.                */
/* -------------------------------------------------------------------------- */

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);

/* THE AUTHORED TEXT OUTLIVES THE EFFECT, AND IT HAS TO.
 *
 * These caches used to be created inside the effect, which re-runs whenever the
 * preference changes — so the sequence was:
 *
 *   en-GB → en-US   fresh cache; every node's British text is cached and the
 *                   American text written over it. Correct.
 *   en-US → en-GB   cleanup, then a fresh EMPTY cache. `applyText` falls back to
 *                   "whatever the node says now", which by then is the AMERICAN
 *                   text — so American became the new authored baseline and the
 *                   British spelling could never come back.
 *
 * One switch worked and the other silently did nothing, which is exactly what
 * was reported. Module scope fixes it: the cache is keyed by node in a WeakMap,
 * so it is collected with the nodes and survives every re-render in between.
 */
const AUTHORED = new WeakMap<Node, string>();
const AUTHORED_ATTR = new WeakMap<Element, Map<string, string>>();

export function SpellingBridge() {
  const { prefs, ready } = usePrefs();
  const spelling = prefs.spelling;

  useEffect(() => {
    if (!ready) return;
    const root = document.body;
    const original = AUTHORED, originalAttr = AUTHORED_ATTR;

    /* ONE FUNCTION DECIDES WHAT A STRING LOOKS LIKE, and every comparison in
       here asks it rather than re-deriving the answer. The transform is
       one-way by design — British is what the product is written in, American
       is a rendering of it — so going back is a RESTORE, never an inverse
       conversion, and there is no second regex in the runtime path to get out
       of step with the first. */
    const render = (authored: string) =>
      spelling === "en-US" ? convert(authored, RE_GB, GB_TO_US) : authored;

    function applyText(node: Text) {
      const authored = original.get(node) ?? node.nodeValue ?? "";
      if (!original.has(node)) original.set(node, authored);
      const next = render(authored);
      if (next !== node.nodeValue) node.nodeValue = next;
    }

    function applyAttrs(el: Element) {
      let store = originalAttr.get(el);
      for (const name of ATTRS) {
        const current = el.getAttribute(name);
        if (current == null) continue;
        if (!store) { store = new Map(); originalAttr.set(el, store); }
        const authored = store.get(name) ?? current;
        if (!store.has(name)) store.set(name, authored);
        const next = render(authored);
        if (next !== current) el.setAttribute(name, next);
      }
    }

    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) { applyText(node as Text); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (SKIP.has(el.tagName) || el.hasAttribute("data-verbatim")) return;
      applyAttrs(el);
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          return p && !SKIP.has(p.tagName) && !p.closest("[data-verbatim]")
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      let t: Node | null;
      while ((t = tw.nextNode())) applyText(t as Text);
      for (const child of Array.from(el.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")))) {
        applyAttrs(child);
      }
    }

    walk(root);

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") {
          const n = r.target as Text;
          const p = n.parentElement;
          if (!p || SKIP.has(p.tagName) || p.closest("[data-verbatim]")) continue;
          // React just wrote this node, so whatever it wrote is the new authored
          // text — unless it wrote what we last converted it to
          const last = original.get(n);
          if (last !== undefined && render(last) === n.nodeValue) continue;
          original.delete(n);
          applyText(n);
        } else if (r.type === "attributes") {
          const el = r.target as Element;
          const name = r.attributeName!;
          const store = originalAttr.get(el);
          const current = el.getAttribute(name);
          if (store && current != null && render(store.get(name) ?? "") === current) continue;
          store?.delete(name);
          applyAttrs(el);
        } else {
          for (const added of Array.from(r.addedNodes)) walk(added);
        }
      }
    });

    mo.observe(root, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
    return () => mo.disconnect();
  }, [spelling, ready]);

  return null;
}

/* -------------------------------------------------------------------------- */
/**
 * Everything a component needs to render a value the reader's way.
 *
 * One hook rather than four, because a component that shows a temperature
 * almost always shows a speed or a time beside it, and three separate
 * subscriptions to the same store is three re-renders.
 */
export function useLocale() {
  const { prefs } = usePrefs();
  const { units, clock, groupDigits, spelling } = prefs;

  const temp = useCallback(
    (c: number | null | undefined, digits = 0) => fmtTemp(c, units, digits), [units]);
  const tempRange = useCallback(
    (a: number, b: number, digits = 0) => fmtTempRange(a, b, units, digits), [units]);
  const speed = useCallback(
    (kph: number, digits = 0) => `${toSpeed(kph, units).toFixed(digits)}`, [units]);
  const time = useCallback((d: Date) => fmtClock(d, clock), [clock]);
  const num = useCallback((n: number) => fmtNum(n, groupDigits), [groupDigits]);
  const text = useCallback((s: string) => sp(s, spelling), [spelling]);

  return useMemo(() => ({
    units, clock, spelling,
    tempUnit: tempUnitOf(units), speedUnit: speedUnitOf(units),
    temp, tempRange, speed, time, num, text,
  }), [units, clock, spelling, temp, tempRange, speed, time, num, text]);
}
