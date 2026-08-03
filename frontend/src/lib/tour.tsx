"use client";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePrefs } from "@/lib/prefs";

/* -------------------------------------------------------------------------- */
/* Teaching the product.                                                      */
/*                                                                            */
/* There were two things here and they were the same thing badly.             */
/*                                                                            */
/*   The TUTORIAL was four modals on the Race Explorer. It taught the Race    */
/*   Explorer's furniture — here is a picker, here are some tabs — to somebody */
/*   who had not yet been told what the product was for. Four disconnected     */
/*   slides, and nothing about asking a question, comparing two drivers,       */
/*   changing the depth, or the archive.                                       */
/*                                                                            */
/*   The WORKED EXAMPLE was a modal that played a transcript of an answer      */
/*   being assembled. It was a good film about the product and it demonstrated */
/*   nothing, because none of it was the product: a reader who watched it had  */
/*   still never seen the screen they were about to be dropped into.           */
/*                                                                            */
/* Both are now one engine driving the real interface. A tour is a list of     */
/* beats; a beat names the page it belongs to, the thing on that page it is    */
/* about, and one sentence about why that thing exists. The engine navigates   */
/* between pages, waits for the target to render, scrolls it into view and     */
/* cuts a hole in the scrim around it. Nothing is illustrated and nothing is   */
/* re-implemented, so the tour cannot drift out of date with the product — if  */
/* a control moves, the spotlight moves with it, and if a control is removed   */
/* the beat is skipped rather than pointing at nothing.                        */
/*                                                                            */
/* THE STATE LIVES ABOVE THE ROUTER. A tour that crosses pages cannot be owned */
/* by a page, because the page unmounts halfway through the sentence.          */
/* -------------------------------------------------------------------------- */

export interface Beat {
  /** Route this beat belongs to. The engine navigates there first. */
  path: string;
  /** A selector already in the page. A missing target is skipped, never faked. */
  target?: string;
  /** A tab the Race Explorer should be showing. See `useTourDrive`. */
  tab?: string;
  title: string;
  body: string;
  /** Auto-advance after this long. Omit for a beat the reader releases. */
  hold?: number;
}

/* -------------------------------------------------------------------------- */
/* Driving the Race Explorer.                                                 */
/*                                                                            */
/* A tour beat that says "this is the Strategy tab" has to be able to open the */
/* Strategy tab, and that state belongs to a page three routes away from here. */
/* Rather than lift a page's whole view state into a global store for the sake */
/* of a tour — which would make every future tab a two-file change — the tour  */
/* asks, on a named channel, and the page answers if it is listening. If it is */
/* not, the beat still runs; it simply does not switch tabs first.             */
/* -------------------------------------------------------------------------- */

const DRIVE = "pitwall-iq:tour-tab";

export function driveTo(tab: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DRIVE, { detail: tab }));
}

/** Called by the Race Explorer so a tour can move it between tabs. */
export function useTourDrive(onTab: (tab: string) => void) {
  const ref = useRef(onTab);
  ref.current = onTab;
  useEffect(() => {
    const h = (e: Event) => ref.current((e as CustomEvent<string>).detail);
    window.addEventListener(DRIVE, h);
    return () => window.removeEventListener(DRIVE, h);
  }, []);
}

/* -------------------------------------------------------------------------- */

interface Ctx {
  beats: Beat[];
  index: number;
  running: boolean;
  /** which beat the reader is on, once its page and target have resolved */
  ready: boolean;
  start: (beats: Beat[], label: string) => void;
  next: () => void;
  prev: () => void;
  stop: (opts?: { stay?: boolean }) => void;
  /** what this run was: "tour" marks onboarding done, "demo" does not */
  label: string;
}

const TourCtx = createContext<Ctx>({
  beats: [], index: 0, running: false, ready: false,
  start: () => {}, next: () => {}, prev: () => {}, stop: () => {}, label: "",
});

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { set } = usePrefs();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);

  /* LEAVING THE TOUR AND FINISHING IT ARE THE SAME EVENT.
     Both mark it done — nobody wants to be taught twice — and both land in the
     same place. The last beat used to be Settings, so a reader who saw the tour
     through was abandoned on a preferences screen holding no session, which is
     the least useful room in the product to be left standing in. Explore is
     where the tour was always taking them; Skip is a reader saying "I would
     rather just get there", and it should get them there too. */
  const stop = useCallback((opts?: { stay?: boolean }) => {
    setRunning(false);
    setReady(false);
    setBeats([]);
    setIndex(0);
    if (label === "tour") {
      set("onboarded", true);
      // `stay` is the reader having walked out of the tour by navigating
      // somewhere themselves — they have chosen a page, and marching them to
      // a different one would be the tour getting the last word.
      if (!opts?.stay) {
        /* THE TOUR PUTS THE ROOM BACK. Its last beats are about Standings, the
           archive and Settings, so whoever finishes it is standing in whichever
           tab the tour left open — reading a championship table nobody asked
           for. The reader should end where they would have BEGUN: the Race
           Explorer, on the Race Story of the most recent completed race, which
           is the state the product opens in. A tour that leaves the furniture
           where it moved it has not finished. */
        driveTo("story");
        if (path !== "/explorer") router.push("/explorer");
      }
    }
    setLabel("");
  }, [label, set, path, router]);

  // read inside the navigation effect below without making that effect depend
  // on an identity that changes every time the path does
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  /* The last page the tour actually reached. It is how "we have not navigated
     yet" is told apart from "we were here and the reader has gone elsewhere",
     which are the same comparison (`beat.path !== path`) and need opposite
     answers — push, or give up. */
  const arrivedAt = useRef<string | null>(null);

  const start = useCallback((next: Beat[], what: string) => {
    setBeats(next);
    setLabel(what);
    setIndex(0);
    setRunning(true);
    setReady(false);
    arrivedAt.current = null;
  }, []);

  const go = useCallback((to: number) => {
    if (to < 0) return;
    setReady(false);
    setIndex(to);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= beats.length) { queueMicrotask(stop); return i; }
      setReady(false);
      return i + 1;
    });
  }, [beats.length, stop]);

  const prev = useCallback(() => go(Math.max(0, index - 1)), [go, index]);

  /* Navigate to the beat's page, then let it settle. `ready` is what the
     renderer waits on — spotlighting a target that has not been laid out yet
     draws a box at the origin, which is worse than drawing nothing. */
  const beat = running ? beats[index] : undefined;
  useEffect(() => {
    if (!beat) return;
    let cancelled = false;
    if (beat.path !== path) {
      /* THE READER MAY LEAVE. The scrim is pointer-events-none so the nav bar
         stays live during a tour, which is deliberate — but the tour then saw
         a path that wasn't its own and pushed the reader straight back. The
         effect was a product that would not let go: Back appeared to do
         nothing, because every step out was answered by a step in. Walking
         away from a tour ends it. */
      if (arrivedAt.current === beat.path) { stopRef.current({ stay: true }); return; }
      router.push(beat.path);
      return;
    }
    arrivedAt.current = path;
    if (beat.tab) driveTo(beat.tab);
    // two frames for the tab switch, then a beat for anything that transitions in
    const t = setTimeout(() => { if (!cancelled) setReady(true); }, beat.tab ? 420 : 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [beat, path, router]);

  const value = useMemo(
    () => ({ beats, index, running, ready, start, next, prev, stop, label }),
    [beats, index, running, ready, start, next, prev, stop, label],
  );
  return <TourCtx.Provider value={value}>{children}</TourCtx.Provider>;
}

export const useTour = () => useContext(TourCtx);

/* -------------------------------------------------------------------------- */
/* The scripts.                                                               */
/*                                                                            */
/* Written as prose about WHY, never about WHERE. "This is the tabs bar" is a  */
/* label the reader can already read; "one race, several readings" is the      */
/* thing they could not have worked out on their own. If a beat can only be    */
/* written as a description of what is on screen, the screen is doing the      */
/* teaching and the beat should be cut.                                       */
/* -------------------------------------------------------------------------- */

/**
 * The tour. Orientation, not a product tour.
 *
 * V60's version walked the reader through Home, the Explorer, Historical and
 * Settings — ten beats and three navigations — and by the end they had been
 * driven around the product rather than shown where they were. A tour that
 * moves the reader between pages also takes control away from them, which is
 * exactly the feeling somebody trying to leave a tutorial already has.
 *
 * It stays on the Race Explorer now, because that is where the work happens,
 * and the last three beats POINT AT the navigation rather than following it:
 * "the archive is up here", "the theme is up here", "everything else is up
 * here". Knowing where a thing is is what orientation means. Going there is
 * the reader's decision, and they can make it the moment the tour ends.
 */
export const TOUR: Beat[] = [
  { path: "/explorer", target: "[data-tour='selector']",
    title: "Any session, back to 1950",
    body: "Season, Grand Prix, session. It opens on the most recent completed race, so there is always something to read." },
  { path: "/explorer", target: "[data-tour='tabs']", tab: "story",
    title: "One race, several readings",
    body: "Story is the recap in plain English. Charts, Strategy and Pace are the same race with the working shown." },
  { path: "/explorer", target: "[data-tour='compare-pickers']", tab: "compare",
    title: "Two drivers, side by side",
    body: "Pick any two cars here and the page draws the duel between them — who led when, and what the stops did to both." },
  { path: "/explorer", target: "[data-tour='ask-box']", tab: "ask",
    title: "Or just ask",
    body: "\u201cWhy did Leclerc lose places?\u201d is answered from this session's own lap data. If the data cannot support an answer, it says so instead of inventing one." },
  { path: "/explorer", target: "[data-tour='sources']",
    title: "Always checkable",
    body: "Pitwall IQ combines three open motorsport archives, and this names which one every figure came from. If a provider is down, you are told which \u2014 never handed a gap dressed up as a number." },
  { path: "/explorer", target: "[data-tour='nav-history']",
    title: "Every season is up here",
    body: "Official results for any Grand Prix since 1950 \u2014 and the championship standings, this year's included. A race tells you what happened; this is where it left the title." },
  { path: "/explorer", target: "[data-tour='settings']",
    title: "And there is far more in here",
    body: "The welcome screen asked for the few answers that change the most. Text size, density, chart pace, accent colour, colour-vision palettes, which page opens first \u2014 they all live here, and every one of them applies instantly." },
];


/**
 * The worked example — the same engine, pointed at one question.
 *
 * This one auto-advances, because it is a demonstration rather than a lesson:
 * the reader asked to be shown, so they should be able to watch it with their
 * hands off. Every beat still lands on the real screen with real data in it.
 */
export const DEMO: Beat[] = [
  { path: "/explorer", tab: "story", target: "[data-tour='panel']", hold: 5200,
    title: "Why did the leader win?",
    body: "Start with the recap. One paragraph, the turning point, and the laps it happened on — written from this session's timing data." },
  { path: "/explorer", tab: "charts", target: "[data-tour='panel']", hold: 5200,
    title: "Where the places changed",
    body: "The position trace, with the key moments marked. Every crossing on this chart is an overtake or a pit cycle resolving." },
  { path: "/explorer", tab: "strategy", target: "[data-tour='panel']", hold: 5200,
    title: "What the calls were worth",
    body: "Each stop measured against staying out — which is how you tell a race won on strategy from a race won on pace." },
  { path: "/explorer", tab: "pace", target: "[data-tour='panel']", hold: 5200,
    title: "Was he actually quickest?",
    body: "Clean-air pace, corrected for fuel and tyre age. This is the number that settles the argument." },
  { path: "/explorer", tab: "ask", target: "[data-tour='panel']", hold: 6000,
    title: "And now ask your own",
    body: "Same session, same data, your question. That is the whole product — the five screens you just watched, for any race you like." },
];
