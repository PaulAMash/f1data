"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Mode = "simple" | "advanced";

const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "simple",
  setMode: () => {},
});

/**
 * Global display mode. Wraps the whole app (see app/layout.tsx) so Simple/Advanced
 * changes every tab at once, and persists across reloads via localStorage.
 * Defaults to Simple for normal fans.
 */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("simple");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("pitwalliq_mode") as Mode) : null;
    if (saved === "simple" || saved === "advanced") setMode(saved);
  }, []);
  const set = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem("pitwalliq_mode", m); } catch {}
  };
  return <ModeCtx.Provider value={{ mode, setMode: set }}>{children}</ModeCtx.Provider>;
}

export const useDisplayMode = () => useContext(ModeCtx);
export const useMode = useDisplayMode;
export const useIsSimple = () => useContext(ModeCtx).mode === "simple";
export const useIsAdvanced = () => useContext(ModeCtx).mode === "advanced";

/** Render children only in Advanced mode. */
export function AdvancedOnly({ children }: { children: React.ReactNode }) {
  return useIsAdvanced() ? <>{children}</> : null;
}
/** Render children only in Simple mode. */
export function SimpleOnly({ children }: { children: React.ReactNode }) {
  return useIsSimple() ? <>{children}</> : null;
}
