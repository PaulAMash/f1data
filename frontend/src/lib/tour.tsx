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
  stop: () => void;
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

  const stop = useCallback(() => {
    setRunning(false);
    setReady(false);
    setBeats([]);
    setIndex(0);
    // finishing or skipping both count: nobody wants to be taught twice
    if (label === "tour") set("onboarded", true);
    setLabel("");
  }, [label, set]);

  const start = useCallback((next: Beat[], what: string) => {
    setBeats(next);
    setLabel(what);
    setIndex(0);
    setRunning(true);
    setReady(false);
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
    if (beat.path !== path) { router.push(beat.path); return; }
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
 * The tour. About a minute, and it crosses the whole product.
 *
 * It deliberately starts on the landing page rather than inside the Explorer:
 * the old one opened halfway through a session, which taught the furniture of
 * a screen before the reader knew why they were on it.
 */
export const TOUR: Beat[] = [
  { path: "/", target: "[data-tour='cta']",
    title: "Start here",
    body: "Everything in Pitwall IQ hangs off one session — a practice, a qualifying or a race. This is the way in." },
  { path: "/explorer", target: "[data-tour='selector']",
    title: "Any session, back to 1950",
    body: "Season, Grand Prix, session. It opens on the most recent completed race, so there is always something to read." },
  { path: "/explorer", target: "[data-tour='tabs']", tab: "story",
    title: "One race, several readings",
    body: "Story is the recap in plain English. The tabs after it are the same race with the working shown." },
  { path: "/explorer", target: "[data-tour='panel']", tab: "strategy",
    title: "Strategy is where races are decided",
    body: "Pit windows, undercuts and what each call actually bought — measured against what would have happened anyway." },
  { path: "/explorer", target: "[data-tour='panel']", tab: "pace",
    title: "Pace, corrected",
    body: "Raw lap times flatter whoever had fresh tyres and a light car. These are corrected for both, which is the only way to compare two drivers fairly." },
  { path: "/explorer", target: "[data-tour='panel']", tab: "compare",
    title: "Two drivers, side by side",
    body: "Head to head over the same laps — where one gained, where the other answered, and what the stops did to both." },
  { path: "/explorer", target: "[data-tour='panel']", tab: "ask",
    title: "Ask it anything",
    body: "“Why did Leclerc lose places?” is answered from this session's own lap data. If the data cannot support an answer, it says so instead of inventing one." },
  { path: "/explorer", target: "[data-tour='sources']",
    title: "Always checkable",
    body: "Every figure states which F1 source it came from and what was unavailable. Nothing here is invented, and you can always see the seams." },
  { path: "/history", target: "[data-tour='history']",
    title: "The whole archive",
    body: "Official results and championship standings for every season since 1950." },
  { path: "/settings", target: "[data-tour='settings-main']",
    title: "Make it yours",
    body: "Reading depth, theme, units, spelling, density and how much the interface moves. Every choice applies everywhere and is remembered." },
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
