"use client";
import { createContext, useContext, useState } from "react";

export type Mode = "simple" | "advanced";

const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "simple",
  setMode: () => {},
});

/**
 * Global display mode. Wraps the whole app (see app/layout.tsx) so Simple/Advanced
 * changes every tab at once. Deliberately in-memory only: the choice sticks
 * while browsing (tab to tab, page to page), but a refresh or a fresh browser
 * tab always starts back in Simple — the friendly default for normal fans.
 */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("simple");
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>;
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
