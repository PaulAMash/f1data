"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Going back.                                                                */
/*                                                                            */
/* This control has now been three things, and the third is the one that       */
/* matches how people actually read the product.                               */
/*                                                                            */
/*   V59  stepped through every in-app navigation. Correct, and unbounded:     */
/*        after four pages, getting home took four presses.                     */
/*   V60  always went straight to Home. Bounded and predictable, and it threw  */
/*        away the step the reader usually wanted — going from a driver         */
/*        comparison back to the race they were reading, not to the front       */
/*        door.                                                                */
/*   Now  it steps back the way a browser does, and STOPS AT HOME. Home is the */
/*        root, so there is nothing behind it, and the control disappears when */
/*        the reader gets there rather than sitting greyed out.                 */
/*                                                                            */
/* WHY NOT `history.length`. It counts every page the tab has ever visited, so */
/* a reader who arrived from a search result and pressed a control that looks  */
/* like part of the product would be sent back OUT of the product. The count   */
/* here is of navigations made INSIDE the app, which is the only history a     */
/* back button in an app should ever offer to undo — and it is why arriving    */
/* directly on /explorer shows no Back at all until you have been somewhere.   */
/* -------------------------------------------------------------------------- */

interface Ctx {
  canBack: boolean;
  back: () => void;
}

const NavCtx = createContext<Ctx>({ canBack: false, back: () => {} });

export function NavHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [depth, setDepth] = useState(0);
  // set immediately before a programmatic step, so the effect below can tell a
  // move through history apart from a genuinely new destination
  const stepping = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (stepping.current) { stepping.current = false; return; }
    /* Landing on Home is the bottom of the stack however you got there — by
       Back, by the wordmark, or by the Home link. Anything else is a step
       away from it. Without this, Home → Explore → Home (by link) would leave
       a Back control on the root page pointing at Explore. */
    setDepth((d) => (path === "/" ? 0 : d + 1));
  }, [path]);

  const back = useCallback(() => {
    if (depth <= 0) return;
    stepping.current = true;
    setDepth((d) => d - 1);
    router.back();
  }, [depth, router]);

  const value = useMemo(
    () => ({ canBack: depth > 0 && path !== "/", back }),
    [depth, path, back],
  );
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNavHistory = () => useContext(NavCtx);
