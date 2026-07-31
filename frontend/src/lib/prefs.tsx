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
/* -------------------------------------------------------------------------- */

export type Mode = "simple" | "advanced";
export type Theme = "dark" | "light";
export type MotionPref = "full" | "calm";

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
  /** Has the reader been through the landing choice? Gates the walkthrough. */
  onboarded: boolean;
}

export const PREFS_KEY = "pitwall-iq:prefs";

export const DEFAULT_PREFS: Prefs = {
  mode: "simple", theme: "dark", motion: "full", accent: "f1", onboarded: false,
};

/**
 * The script that runs before first paint.
 *
 * Reading preferences in an effect means the first frame is painted with the
 * defaults and then corrected — a white flash on a dark theme, which is the
 * single most common way a themed app gives itself away. This is injected into
 * <head> and applies the stored answer synchronously, before anything renders.
 *
 * Kept as a string on purpose: it must run in the document, not in React.
 */
export const NO_FLASH_SCRIPT = `
(function () {
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)}) || "{}");
    var root = document.documentElement;
    root.dataset.theme = p.theme || "dark";
    var sysCalm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.motion = p.motion || (sysCalm ? "calm" : "full");
    if (p.accent) root.dataset.accent = p.accent;
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
 */
function resolveInitial(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  const stored = readStored();
  const sysCalm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    mode: stored.mode ?? DEFAULT_PREFS.mode,
    theme: stored.theme ?? DEFAULT_PREFS.theme,
    motion: stored.motion ?? (sysCalm ? "calm" : "full"),
    accent: (stored.accent && stored.accent in ACCENTS ? stored.accent : DEFAULT_PREFS.accent) as AccentKey,
    onboarded: stored.onboarded ?? false,
  };
}

interface Ctx {
  prefs: Prefs;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  /** Theme change with the circular reveal, anchored to whatever was pressed. */
  setThemeFrom: (theme: Theme, origin?: { x: number; y: number }) => void;
  ready: boolean;
}

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFS, set: () => {}, setThemeFrom: () => {}, ready: false,
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

  const setThemeFrom = useCallback((theme: Theme, origin?: { x: number; y: number }) => {
    const root = document.documentElement;
    const apply = () => setPrefs((p) => ({ ...p, theme }));

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    // Progressive enhancement, not a branch in the product: browsers without
    // view transitions get the swap, and it is still correct — just instant.
    if (!doc.startViewTransition || root.dataset.motion === "calm") { apply(); return; }

    if (origin) {
      root.style.setProperty("--sweep-x", `${(origin.x / window.innerWidth) * 100}%`);
      root.style.setProperty("--sweep-y", `${(origin.y / window.innerHeight) * 100}%`);
    }
    root.classList.add("theme-sweep");
    const t = doc.startViewTransition(apply);
    t.finished.finally(() => root.classList.remove("theme-sweep"));
  }, []);

  const value = useMemo(() => ({ prefs, set, setThemeFrom, ready }), [prefs, set, setThemeFrom, ready]);
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
