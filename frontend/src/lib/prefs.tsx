"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* What the reader has told us they want.                                     */
/*                                                                            */
/* Display mode used to live in memory only, which meant a refresh threw away  */
/* a choice the reader had deliberately made — and there was nowhere to make    */
/* it except a toggle repeated on every page. Preferences are now one store,    */
/* written once, applied to <html>, and honoured everywhere without a single    */
/* component asking.                                                           */
/*                                                                            */
/* Everything here is a *stated* preference. The operating system's own         */
/* answers (prefers-reduced-motion, prefers-color-scheme) are the default and   */
/* are never overwritten silently — see resolveInitial below.                   */
/*                                                                            */
/* THE RULE FOR ADDING ONE. A preference earns its place when the product      */
/* cannot pick correctly on the reader's behalf — when two readers would want  */
/* genuinely different answers and neither is wrong. Celsius against           */
/* Fahrenheit is that. "Show tooltips" is not; tooltips should simply be good. */
/* Every key below is read by real code, and a setting that controls nothing   */
/* is a bug rather than a feature.                                             */
/* -------------------------------------------------------------------------- */

export type Mode = "simple" | "advanced";
export type Theme = "dark" | "light";
export type MotionPref = "full" | "calm";
export type Units = "metric" | "imperial";
export type Spelling = "en-GB" | "en-US";
export type Clock = "24h" | "12h";
export type Density = "comfortable" | "compact";
export type ChartSpeed = "instant" | "standard" | "cinematic";
export type TipDelay = "none" | "short" | "long";
export type Intensity = "subtle" | "standard" | "vivid";
export type Landing = "home" | "explorer" | "history";

/**
 * The accent is already a CSS variable, so letting the reader choose one costs
 * a lookup rather than a theme. Every value is checked for contrast against
 * both surfaces — an accent is used for text on panels, not only for fills.
 */
export const ACCENTS = {
  f1:      { label: "Pitwall red", dark: "255 59 59",  soft: "255 106 90",  light: "217 4 0",    lightSoft: "194 26 15" },
  amber:   { label: "Amber",       dark: "255 154 46", soft: "255 178 96",  light: "180 83 9",   lightSoft: "154 70 8" },
  teal:    { label: "Teal",        dark: "0 214 190",  soft: "94 231 214",  light: "0 138 122",  lightSoft: "0 118 105" },
  violet:  { label: "Violet",      dark: "167 139 250", soft: "196 181 253", light: "109 63 219", lightSoft: "91 50 190" },
  sky:     { label: "Sky",         dark: "96 178 255", soft: "148 205 255", light: "20 105 190", lightSoft: "16 88 160" },
} as const;
export type AccentKey = keyof typeof ACCENTS;

export interface Prefs {
  mode: Mode;
  theme: Theme;
  motion: MotionPref;
  accent: AccentKey;
  /** Scales the whole type ramp. A real accessibility control, not a toggle. */
  textScale: "normal" | "large";

  /* ---- localisation ------------------------------------------------------
     Not a translation. Formula 1 is reported in two dialects of one language,
     and a reader who says "tires" and reads Fahrenheit is not reading a
     different product — they are reading the same product spelled their way. */
  units: Units;
  spelling: Spelling;
  clock: Clock;
  /** Thousands separators. Off suits anyone pasting figures into a sheet. */
  groupDigits: boolean;

  /* ---- interface ---------------------------------------------------------- */
  /** Vertical rhythm. Compact fits a strategist's screen; comfortable reads. */
  density: Density;
  /** How long a chart takes to draw itself in. */
  chartSpeed: ChartSpeed;
  /** How long a hover waits before explaining itself. */
  tipDelay: TipDelay;
  /** How much light the accent throws. Vivid is a pit wall; subtle is a desk. */
  intensity: Intensity;

  /* ---- where the product opens ------------------------------------------- */
  landing: Landing;
  /** Season the archive opens on. 0 means "whatever is current". */
  season: number;

  /* ---- one-time gates ----------------------------------------------------- */
  /** Has the reader been through the guided tour? */
  onboarded: boolean;
  /** Has the reader chosen Simple or Advanced? Gates the landing panel. */
  pickedMode: boolean;
}

export const PREFS_KEY = "pitwall-iq:prefs";

export const DEFAULT_PREFS: Prefs = {
  mode: "simple", theme: "dark", motion: "full", accent: "f1", textScale: "normal",
  units: "metric", spelling: "en-GB", clock: "24h", groupDigits: true,
  density: "comfortable", chartSpeed: "standard", tipDelay: "short", intensity: "standard",
  landing: "home", season: 0,
  onboarded: false, pickedMode: false,
};

/**
 * Which preferences belong to which panel of Settings.
 *
 * Declared here rather than in the page because "reset this section" has to
 * mean exactly the same set of keys the section shows — two lists that drift
 * apart produce a reset button that quietly misses one control.
 */
export const PREF_GROUPS = {
  experience:    ["mode"],
  appearance:    ["theme", "accent", "intensity"],
  localisation:  ["units", "spelling", "clock", "groupDigits"],
  interface:     ["density", "chartSpeed", "tipDelay", "landing", "season"],
  motion:        ["motion"],
  accessibility: ["textScale"],
} as const satisfies Record<string, readonly (keyof Prefs)[]>;
export type PrefGroup = keyof typeof PREF_GROUPS;

/**
 * The script that runs before first paint.
 *
 * Reading preferences in an effect means the first frame is painted with the
 * defaults and then corrected — a white flash on a dark theme, which is the
 * single most common way a themed app gives itself away. This is injected into
 * <head> and applies the stored answer synchronously, before anything renders.
 *
 * IT ALSO OWNS THE FIRST-RUN GATE, and it has to.
 *
 * The gate used to be a React effect on the landing page: render, hydrate,
 * notice nobody has been welcomed, redirect. Every one of those steps happens
 * AFTER the browser has painted, so a brand-new visitor saw the home page —
 * headline, hero canvas and all — and was then yanked off it. The welcome
 * screen was not the first thing anybody saw; it was the second.
 *
 * A parser-blocking script in <head> runs before the body is parsed, let alone
 * painted, and `location.replace` from there aborts the document load. Nothing
 * of the home page is ever built, so there is nothing to flash.
 *
 * Only the root is gated. A first-time visitor who followed somebody's link to
 * a specific race should land on that race — dragging them to a welcome screen
 * would throw away the thing they actually clicked, and they will meet it the
 * first time they press Home. "Opening Pitwall IQ" means the front door.
 *
 * Kept as a string on purpose: it must run in the document, not in React.
 */
export const NO_FLASH_SCRIPT = `
(function () {
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)}) || "{}");
    if (!p.pickedMode && (location.pathname === "/" || location.pathname === "")) {
      location.replace("/welcome");
      return;
    }
    var root = document.documentElement;
    root.dataset.theme = p.theme || "dark";
    var sysCalm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.motion = p.motion || (sysCalm ? "calm" : "full");
    if (p.accent) root.dataset.accent = p.accent;
    if (p.textScale) root.dataset.text = p.textScale;
    if (p.density) root.dataset.density = p.density;
    if (p.intensity) root.dataset.intensity = p.intensity;
    if (p.tipDelay) root.dataset.tip = p.tipDelay;
    if (p.chartSpeed) root.dataset.chart = p.chartSpeed;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

function readStored(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>;
  } catch {
    return {};
  }
}

/** Falls back to the default for anything stored that is not a legal value. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/**
 * Stored answer first, then a default per preference.
 *
 * Motion follows the operating system, because reduced motion is an
 * accessibility need and the OS is where people state it once for everything.
 *
 * Theme deliberately does NOT. Pitwall IQ is a dark product — the palette, the
 * chart surfaces and the broadcast colours were all built for it — so a first
 * visit opens in the identity it was designed in rather than in whatever the
 * machine happens to say. Colour scheme is a taste, not an access requirement,
 * and one click in the nav (or Settings) changes it for good.
 *
 * Spelling and units are the exception to "never guess": the browser already
 * knows the reader's locale, and opening in Fahrenheit for a reader in Ohio is
 * a better first guess than opening in Celsius. It remains a guess — one that
 * a single control overrides for good.
 */
function resolveInitial(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  const stored = readStored();
  const sysCalm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loc = (navigator.language || "en-GB").toLowerCase();
  // Fahrenheit survives in a handful of places; American English in rather more
  const usish = /^en-(us|ph)|^en$/.test(loc);
  return {
    mode: oneOf(stored.mode, ["simple", "advanced"], DEFAULT_PREFS.mode),
    theme: oneOf(stored.theme, ["dark", "light"], DEFAULT_PREFS.theme),
    motion: oneOf(stored.motion, ["full", "calm"], sysCalm ? "calm" : "full"),
    accent: oneOf(stored.accent, Object.keys(ACCENTS) as AccentKey[], DEFAULT_PREFS.accent),
    textScale: oneOf(stored.textScale, ["normal", "large"], DEFAULT_PREFS.textScale),

    units: oneOf(stored.units, ["metric", "imperial"], usish ? "imperial" : "metric"),
    spelling: oneOf(stored.spelling, ["en-GB", "en-US"], usish ? "en-US" : "en-GB"),
    clock: oneOf(stored.clock, ["24h", "12h"], usish ? "12h" : "24h"),
    groupDigits: stored.groupDigits ?? DEFAULT_PREFS.groupDigits,

    density: oneOf(stored.density, ["comfortable", "compact"], DEFAULT_PREFS.density),
    chartSpeed: oneOf(stored.chartSpeed, ["instant", "standard", "cinematic"], DEFAULT_PREFS.chartSpeed),
    tipDelay: oneOf(stored.tipDelay, ["none", "short", "long"], DEFAULT_PREFS.tipDelay),
    intensity: oneOf(stored.intensity, ["subtle", "standard", "vivid"], DEFAULT_PREFS.intensity),

    landing: oneOf(stored.landing, ["home", "explorer", "history"], DEFAULT_PREFS.landing),
    season: typeof stored.season === "number" ? stored.season : DEFAULT_PREFS.season,

    onboarded: stored.onboarded ?? false,
    pickedMode: stored.pickedMode ?? false,
  };
}

interface Ctx {
  prefs: Prefs;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  /** Theme change with the circular reveal, anchored to whatever was pressed. */
  setThemeFrom: (theme: Theme, origin?: { x: number; y: number }) => void;
  /** Put one panel of Settings back to its defaults, leaving the rest alone. */
  resetGroup: (group: PrefGroup) => void;
  resetAll: () => void;
  ready: boolean;
}

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFS, set: () => {}, setThemeFrom: () => {},
  resetGroup: () => {}, resetAll: () => {}, ready: false,
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // `ready` marks the point where the client's real answer has landed. It is
  // what stops a first render from claiming the reader has never been here.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(resolveInitial());
    setReady(true);
  }, []);

  // <html> carries the answer so CSS can act on it without a class on every node
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.motion = prefs.motion;
    root.dataset.accent = prefs.accent;
    root.dataset.text = prefs.textScale;
    root.dataset.density = prefs.density;
    root.dataset.intensity = prefs.intensity;
    root.dataset.tip = prefs.tipDelay;
    root.dataset.chart = prefs.chartSpeed;
    root.dataset.spelling = prefs.spelling;
    // written as variables rather than as a stylesheet rule per accent: five
    // accents times two themes would be ten rules that all have to stay in step
    const a = ACCENTS[prefs.accent] ?? ACCENTS.f1;
    const dark = prefs.theme === "dark";
    root.style.setProperty("--accent", dark ? a.dark : a.light);
    root.style.setProperty("--accent-soft", dark ? a.soft : a.lightSoft);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* private browsing — the session still works, it just won't persist */ }
  }, [prefs, ready]);

  const set = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => (p[key] === value ? p : { ...p, [key]: value }));
  }, []);

  const resetGroup = useCallback((group: PrefGroup) => {
    setPrefs((p) => {
      const next = { ...p };
      for (const k of PREF_GROUPS[group]) (next[k] as Prefs[typeof k]) = DEFAULT_PREFS[k];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    // the gates are deliberately left alone: "reset my preferences" is not
    // "make me sit through onboarding again", which is its own action
    setPrefs((p) => ({ ...DEFAULT_PREFS, onboarded: p.onboarded, pickedMode: p.pickedMode }));
  }, []);

  const setThemeFrom = useCallback((theme: Theme, origin?: { x: number; y: number }) => {
    const root = document.documentElement;
    const apply = () => setPrefs((p) => ({ ...p, theme }));

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    // Progressive enhancement, not a branch in the product: browsers without
    // view transitions get the swap, and it is still correct — just instant.
    if (!doc.startViewTransition) { apply(); return; }

    if (origin) {
      root.style.setProperty("--sweep-x", `${(origin.x / window.innerWidth) * 100}%`);
      root.style.setProperty("--sweep-y", `${(origin.y / window.innerHeight) * 100}%`);
    }
    root.classList.add("theme-sweep");
    const t = doc.startViewTransition(apply);
    t.finished.finally(() => root.classList.remove("theme-sweep"));
  }, []);

  const value = useMemo(
    () => ({ prefs, set, setThemeFrom, resetGroup, resetAll, ready }),
    [prefs, set, setThemeFrom, resetGroup, resetAll, ready],
  );
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);

/* --- the display-mode surface the app already speaks ----------------------- */
export const useDisplayMode = () => {
  const { prefs, set } = usePrefs();
  return { mode: prefs.mode, setMode: (m: Mode) => set("mode", m) };
};
export const useMode = useDisplayMode;
export const useIsSimple = () => usePrefs().prefs.mode === "simple";
export const useIsAdvanced = () => usePrefs().prefs.mode === "advanced";

/** Render children only in Advanced mode. */
export function AdvancedOnly({ children }: { children: React.ReactNode }) {
  return useIsAdvanced() ? <>{children}</> : null;
}
/** Render children only in Simple mode. */
export function SimpleOnly({ children }: { children: React.ReactNode }) {
  return useIsSimple() ? <>{children}</> : null;
}
