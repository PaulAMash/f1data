"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Going back.                                                                */
/*                                                                            */
/* Pitwall IQ has four top-level places and no way to return from any of them. */
/* Open Settings from the middle of a race you were reading and the only exits */
/* are the wordmark, which goes home, and the two nav links, which go          */
/* somewhere else — so the reader loses the session they were in and has to    */
/* find it again. That is the difference between a set of pages and an         */
/* application, and it is the reason a browser has a back button at all.       */
/*                                                                            */
/* WHY NOT JUST `router.back()` UNCONDITIONALLY. Because `history.length` is   */
/* not the app's history: it counts every page the tab has ever visited, so a  */
/* reader who arrived from a search result and pressed Back would be sent back */
/* to the search result — out of the product entirely — by a control that looks */
/* like part of the product. This keeps its own count of navigations made      */
/* INSIDE the app, which is the only history a back button in an app should    */
/* offer to undo. With none, Back is not shown at all.                         */
/*                                                                            */
/* Forward appears only once a back has actually been taken, and disappears    */
/* the moment the reader goes somewhere new — because at that point the        */
/* browser's forward entry is gone too, and offering it would be a lie.        */
/* -------------------------------------------------------------------------- */

interface Ctx {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
}

const NavCtx = createContext<Ctx>({
  canBack: false, canForward: false, back: () => {}, forward: () => {},
});

export function NavHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [depth, setDepth] = useState(0);
  const [forwardable, setForwardable] = useState(0);
  // set immediately before a programmatic move, so the effect below can tell a
  // step through history apart from a genuinely new destination
  const moving = useRef<"back" | "forward" | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const how = moving.current;
    moving.current = null;
    if (how === "back") return;
    if (how === "forward") return;
    // a new destination: everything ahead of here is gone
    setDepth((d) => d + 1);
    setForwardable(0);
  }, [path]);

  const back = useCallback(() => {
    if (depth <= 0) return;
    moving.current = "back";
    setDepth((d) => d - 1);
    setForwardable((f) => f + 1);
    router.back();
  }, [depth, router]);

  const forward = useCallback(() => {
    if (forwardable <= 0) return;
    moving.current = "forward";
    setDepth((d) => d + 1);
    setForwardable((f) => f - 1);
    router.forward();
  }, [forwardable, router]);

  const value = useMemo(
    () => ({ canBack: depth > 0, canForward: forwardable > 0, back, forward }),
    [depth, forwardable, back, forward],
  );
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNavHistory = () => useContext(NavCtx);
