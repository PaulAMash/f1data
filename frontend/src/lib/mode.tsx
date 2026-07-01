"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Mode = "simple" | "advanced";

const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "simple",
  setMode: () => {},
});

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

export const useMode = () => useContext(ModeCtx);
export const useIsSimple = () => useContext(ModeCtx).mode === "simple";
