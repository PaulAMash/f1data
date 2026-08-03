"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Going back, and coming forward again.                                      */
/*                                                                            */
/* This control has now been four things, and each change was a correction.    */
/*                                                                            */
/*   V59  stepped through every in-app navigation. Correct, and unbounded:     */
/*        after four pages, getting home took four presses.                     */
/*   V60  always went straight to Home. Bounded and predictable, and it threw  */
/*        away the step the reader usually wanted — going from a driver         */
/*        comparison back to the race they were reading, not to the front       */
/*        door.                                                                */
/*   V64  stepped back the way a browser does and STOPPED AT HOME.             */
/*   Now  it is a PAIR, and the pair is what makes it a navigation system      */
/*        rather than an escape hatch. Half of "go back" is being able to       */
/*        change your mind about it.                                           */
/*                                                                            */
/* IT IS A STACK OF PATHS, NOT A COUNTER. The counter that came before could   */
/* say how far from Home the reader was and nothing else — enough for Back,    */
/* useless for Forward, and unable to tell the browser's own Back button apart  */
/* from a new navigation (which quietly counted a browser-back as another step  */
/* AWAY from Home). Two lists of paths answer all three questions: what is      */
/* behind, what is ahead, and which of those a `popstate` just moved us to.     */
/*                                                                            */
/* WHY NOT `history.length`. It counts every page the tab has ever visited, so */
/* a reader who arrived from a search result and pressed a control that looks  */
/* like part of the product would be sent back OUT of the product. The history */
/* here is of navigations made INSIDE the app, which is the only history an    */
/* in-app control should ever offer to undo — and it is why arriving directly  */
/* on /explorer shows no controls at all until you have been somewhere.        */
/*                                                                            */
/* HOME IS STILL THE FLOOR. Arriving at Home by a LINK clears what is behind,  */
/* because Home is the root and there is nothing under the root. Arriving at   */
/* Home by pressing Back does not — that is a move through history, and the    */
/* forward step you just gave up has to still be there when you want it.       */
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

interface Stacks { behind: string[]; ahead: string[]; }

export function NavHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [stacks, setStacks] = useState<Stacks>({ behind: [], ahead: [] });

  /* The effect needs to read the CURRENT stacks to decide what a path change
     means, and state read inside an effect is the state from the render that
     scheduled it. A mirror keeps the two in step without putting the stacks in
     the dependency list, which would re-run the whole decision every time it
     changed something. */
  const live = useRef<Stacks>({ behind: [], ahead: [] });
  const here = useRef<string | null>(null);
  /* Which mechanism moved us: our own button, the browser's, or a link. They
     are indistinguishable from `usePathname` alone and they mean three
     different things. */
  const moved = useRef<"back" | "forward" | "pop" | null>(null);

  const write = useCallback((next: Stacks) => {
    live.current = next;
    setStacks(next);
  }, []);

  useEffect(() => {
    const onPop = () => { if (!moved.current) moved.current = "pop"; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const from = here.current;
    here.current = path;

    // the first render is arrival, not navigation: there is no history yet
    if (from === null) return;
    if (path === from) return;

    const how = moved.current;
    moved.current = null;
    const { behind, ahead } = live.current;

    // our own controls have already written the stacks; this is the echo
    if (how === "back" || how === "forward") return;

    if (how === "pop") {
      /* The browser's own controls. Which way it went is answerable from the
         stacks themselves — the destination is either the top of what is behind
         us or the front of what is ahead. */
      if (behind.length && behind[behind.length - 1] === path) {
        write({ behind: behind.slice(0, -1), ahead: [from, ...ahead] });
        return;
      }
      if (ahead.length && ahead[0] === path) {
        write({ behind: [...behind, from], ahead: ahead.slice(1) });
        return;
      }
      // a jump we were not part of; treat it as arriving somewhere new
    }

    /* A new destination. It truncates the forward history exactly as a browser
       does — you cannot go forward to a page you have just replaced. */
    write(path === "/" ? { behind: [], ahead: [] } : { behind: [...behind, from], ahead: [] });
  }, [path, write]);

  const back = useCallback(() => {
    const { behind, ahead } = live.current;
    if (!behind.length || here.current === null) return;
    moved.current = "back";
    write({ behind: behind.slice(0, -1), ahead: [here.current, ...ahead] });
    router.back();
  }, [router, write]);

  const forward = useCallback(() => {
    const { behind, ahead } = live.current;
    if (!ahead.length || here.current === null) return;
    moved.current = "forward";
    write({ behind: [...behind, here.current], ahead: ahead.slice(1) });
    router.forward();
  }, [router, write]);

  const value = useMemo(() => ({
    canBack: stacks.behind.length > 0,
    canForward: stacks.ahead.length > 0,
    back, forward,
  }), [stacks, back, forward]);

  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNavHistory = () => useContext(NavCtx);
