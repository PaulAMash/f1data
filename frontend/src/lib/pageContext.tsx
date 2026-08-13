"use client";
import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from "react";

/* -------------------------------------------------------------------------- */
/* WHERE THE READER IS, FOR ANYTHING THAT HAS TO KNOW.                        */
/*                                                                            */
/* The feedback box is mounted once, in the root layout, above the router — it */
/* has to be, because it appears on every page and must survive a navigation   */
/* with a half-typed report in it. That puts it three routes away from the     */
/* only component that knows which race is open, and "which race were you      */
/* looking at" is the single most useful thing a bug report can carry.         */
/*                                                                            */
/* Three ways to close that gap, and only one of them is cheap:                */
/*                                                                            */
/*   READ THE URL. The Race Explorer keeps its selection in component state,   */
/*   not in the query string, so there is nothing to read.                     */
/*                                                                            */
/*   LIFT THE EXPLORER'S STATE into a global store. That is a page's whole     */
/*   view model hoisted above the router for the benefit of one button, and it */
/*   makes every future piece of session state a two-file change.              */
/*                                                                            */
/*   LET THE PAGE SAY. One hook, one object, published when it changes and     */
/*   withdrawn when the page unmounts. The page owns its state exactly as      */
/*   before and simply announces the four fields worth announcing.             */
/*                                                                            */
/* Same reasoning as `useTourDrive` in lib/tour.tsx, which solves the mirror   */
/* image of this problem — and, like that one, a page that never calls it is   */
/* not broken. It just reports without a race attached, which is correct for   */
/* Home and Settings, where there is no race to attach.                        */
/* -------------------------------------------------------------------------- */

export interface PageContext {
  year?: number;
  gp?: string;
  session?: string;
  /** Which tab or view was open — "charts", "ask", "strategy"… */
  feature?: string;
}

const Ctx = createContext<PageContext>({});
const SetCtx = createContext<(c: PageContext) => void>(() => {});

export function PageContextProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<PageContext>({});
  return (
    <SetCtx.Provider value={setCtx}>
      <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
    </SetCtx.Provider>
  );
}

/** What the reader currently has open. `{}` when that is nothing. */
export const usePageContext = () => useContext(Ctx);

/**
 * Publish this page's context. Call it with whatever is known; pass `undefined`
 * for anything that is not.
 *
 * The value is compared as JSON rather than by identity because callers build
 * the object inline on every render — depending on the object itself would
 * publish on every keystroke anywhere on the page. Cleared on unmount, so a
 * report filed from Settings never claims to be about the last race read.
 */
export function useReportContext(next: PageContext) {
  const set = useContext(SetCtx);
  const key = JSON.stringify([next.year ?? null, next.gp ?? null,
                              next.session ?? null, next.feature ?? null]);
  const last = useRef<string>("");
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const [year, gp, session, feature] = JSON.parse(key) as [
      number | null, string | null, string | null, string | null];
    set({
      year: year ?? undefined, gp: gp ?? undefined,
      session: session ?? undefined, feature: feature ?? undefined,
    });
  }, [key, set]);
  useEffect(() => () => set({}), [set]);
}

/** The context as one line — "2026 Miami Grand Prix · Race" — or null. */
export function useContextLabel(): string | null {
  const ctx = usePageContext();
  return useMemo(() => {
    const race = [ctx.year, ctx.gp].filter(Boolean).join(" ").trim();
    if (!race) return null;
    return ctx.session ? `${race} · ${ctx.session}` : race;
  }, [ctx.year, ctx.gp, ctx.session]);
}
