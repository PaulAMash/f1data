"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, Compass, Lock, Radar, ShieldCheck, Sparkles, Sun, Timer,
} from "lucide-react";
import { WelcomeField } from "@/components/welcome/WelcomeField";
import { Instruments } from "@/components/welcome/Instruments";
import { usePrefs, type Mode, type Theme } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Booting into Pitwall IQ.                                                    */
/*                                                                            */
/* Three pages, three jobs — WELCOME says what this is, HOME makes you want to */
/* explore, EXPLORER teaches the race — and this one has fifteen seconds to    */
/* make its case before anybody has pressed anything.                          */
/*                                                                            */
/* SO IT IS BUILT AS A ROOM WITH INSTRUMENTS IN IT, not as a page with a       */
/* picture behind it. Seven layers, and the order is the whole design:         */
/*                                                                            */
/*   1  the room          drifting lamps, additive on black, subtractive on    */
/*                        paper                                                */
/*   2  the feed          telemetry traces, packets, a ghosted circuit, a      */
/*                        radar sweep — erased out of the middle               */
/*   3  the fog           a scrim under the type, so the centre is calm         */
/*   4  the instruments   seven glass panels at the edges, ticking              */
/*   5  the cursor        one soft light that follows the pointer               */
/*   6  the hardware      three panels that look machined rather than styled    */
/*   7  the type          which is the only thing anybody has to read           */
/*                                                                            */
/* TWO ACTS, ONE SCREEN. The introduction earns the setup; the setup is not    */
/* asked for until somebody knows what they are setting up. But they are acts, */
/* not routes: no page load, no scroll, no history entry to get stranded in.   */
/*                                                                            */
/* EVERY QUESTION ARRIVES ANSWERED, because a setup screen that will not let   */
/* you leave until you have touched three things is a form with a progress     */
/* bar. And the theme is FELT rather than described: pressing it changes this  */
/* screen, canvas included, through the same reveal Settings uses.             */
/* -------------------------------------------------------------------------- */

const PILLARS = [
  {
    icon: Timer,
    title: "It reads the whole session",
    line: "Every lap of timing, every stint, every stop, the weather and the race-control log — for any Grand Prix back to 1950.",
  },
  {
    icon: Compass,
    title: "It tells you what decided it",
    line: "Not just who won. The undercut that worked, the stop that came a lap too late, the safety car that rewrote the order.",
  },
  {
    icon: ShieldCheck,
    title: "It never guesses",
    line: "Every figure names the source it came from, and anything that could not be loaded is said out loud rather than filled in.",
  },
];

export default function Welcome() {
  const { prefs, set, setThemeFrom, ready } = usePrefs();
  const router = useRouter();
  const [act, setAct] = useState<0 | 1>(0);
  const [leaving, setLeaving] = useState(false);

  const [mode, setMode] = useState<Mode>("simple");
  const [tour, setTour] = useState(true);

  const room = useRef<HTMLElement | null>(null);
  const one = useRef<HTMLDivElement | null>(null);
  const two = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState<number | undefined>(undefined);

  /* THE BLOCK IS AS TALL AS THE ACT IN IT. Both stay mounted — one fading
     through the other is smoother than one unmounting and the next appearing —
     so the container is told which of the two heights to be. */
  useLayoutEffect(() => {
    const el = act === 0 ? one.current : two.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [act]);

  useEffect(() => {
    if (ready && prefs.pickedMode) router.replace("/");
  }, [ready, prefs.pickedMode, router]);

  /* ONE SOFT LIGHT, FOLLOWING THE POINTER.
     Written to CSS variables on the room element rather than to React state:
     a pointermove at 120Hz through a state setter re-renders this whole tree
     twice a frame to move a gradient, which is the most expensive way to do
     the cheapest possible thing. rAF-coalesced, so at most one write a frame. */
  const pointer = useRef({ x: 0, y: 0, raf: 0 });
  const onMove = useCallback((e: React.PointerEvent) => {
    const p = pointer.current;
    p.x = e.clientX; p.y = e.clientY;
    if (p.raf) return;
    p.raf = requestAnimationFrame(() => {
      p.raf = 0;
      const el = room.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${p.x - r.left}px`);
      el.style.setProperty("--my", `${p.y - r.top}px`);
      el.style.setProperty("--ml", "1");
    });
  }, []);
  const onLeave = useCallback(() => {
    room.current?.style.setProperty("--ml", "0");
  }, []);

  function pickTheme(t: Theme, e: React.MouseEvent) {
    if (t === prefs.theme) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setThemeFrom(t, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  /* `onboarded` is the tour's gate. Leaving it armed does NOT start a tour and
     does not decorate the home page either — the tour opens when Start
     exploring is pressed, and until then nothing has happened. */
  function enter() {
    if (leaving) return;
    setLeaving(true);
    set("mode", mode);
    set("onboarded", !tour);
    set("pickedMode", true);
    setTimeout(() => router.push("/"), 520);
  }

  return (
    <main ref={room} onPointerMove={onMove} onPointerLeave={onLeave}
      className={cx("wc-room relative isolate grid min-h-[100svh] place-items-center overflow-hidden px-5 py-8 sm:py-10",
        leaving && "is-leaving")}>
      <WelcomeField />
      <Instruments />
      <span aria-hidden className="wc-cursor" />

      <div className="relative w-full max-w-3xl text-center">
        {/* the mark, and the one line of chrome that says what kind of thing
            this is before the headline says what it does */}
        <div className="wc-1 flex flex-col items-center gap-2">
          <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
              <Radar size={13} className="text-accent-soft" />
            </span>
            Pitwall IQ
          </p>
          <p className="wc-boot">Formula 1 race intelligence · v1</p>
        </div>

        <div className="relative mt-6 transition-[height] duration-[--dur-4] ease-[--ease-out]"
          style={{ height: h }}>

          {/* ================= ACT ONE — what this is ===================== */}
          <div ref={one} aria-hidden={act === 1}
            className={cx("wc-act absolute inset-x-0 top-0", act === 1 && "is-past")}>
            <h1 className="wc-2 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.048em] text-ink sm:text-[3.7rem]">
              Formula 1,
              <br className="hidden sm:block" />{" "}
              <span className="relative whitespace-nowrap text-accent">
                explained
                <span aria-hidden className="wc-mark" />
              </span>{" "}
              by the data.
            </h1>

            <p className="wc-3 mx-auto mt-6 max-w-xl text-[16.5px] leading-snug text-ink-muted">
              A Grand&nbsp;Prix leaves behind about a hundred thousand numbers.
              This reads all of them and tells you the one thing they add up to:
              why it finished the way it did.
            </p>

            <ul className="wc-4 mx-auto mt-9 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
              {PILLARS.map(({ icon: Icon, title, line }, i) => (
                <li key={title} className="wc-pillar wc-card" style={{ ["--i" as string]: i }}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 ring-1 ring-accent/25">
                    <Icon size={15} className="text-accent-soft" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-semibold leading-snug text-ink">{title}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
                </li>
              ))}
            </ul>

            <div className="wc-5 mt-10 flex flex-col items-center gap-3">
              <button type="button" onClick={() => setAct(1)} className="wc-cta group/go">
                Get started
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/go:translate-x-0.5" />
              </button>
              <span className="wc-note">Three questions. About twenty seconds.</span>
            </div>
          </div>

          {/* ================= ACT TWO — three quick choices ============== */}
          <div ref={two} aria-hidden={act === 0}
            className={cx("wc-act absolute inset-x-0 top-0", act === 0 && "is-next")}>
            <h2 className="text-[1.9rem] font-bold leading-tight tracking-[-0.038em] text-ink sm:text-[2.4rem]">
              Set it up your way
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
              All three are answered sensibly already. Change any of them now — or
              any of them later, in Settings.
            </p>

            <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
              <Card n="Q1" icon={BarChart3} title="Experience" i={0}>
                <Opt on={mode === "simple"} onClick={() => setMode("simple")}
                  title="Simple" line="The big story, clearly told." />
                <Opt on={mode === "advanced"} onClick={() => setMode("advanced")}
                  title="Advanced" line="Every layer. Every detail." />
              </Card>

              <Card n="Q2" icon={Sun} title="Appearance" i={1}>
                <Opt on={prefs.theme === "dark"} onClick={(e) => pickTheme("dark", e)}
                  title="Dark" line="For the pit wall at night." />
                <Opt on={prefs.theme === "light"} onClick={(e) => pickTheme("light", e)}
                  title="Light" line="For daylight in the garage." />
              </Card>

              <Card n="Q3" icon={Compass} title="Guided tour" i={2}>
                <Opt on={tour} onClick={() => setTour(true)}
                  title="Yes, show me around" line="A short tour to get you started." />
                <Opt on={!tour} onClick={() => setTour(false)}
                  title="No thanks" line="I'll explore on my own." />
              </Card>
            </div>

            <div className="mt-8 flex flex-col items-center gap-4">
              <button type="button" onClick={enter} disabled={leaving} className="wc-cta group/enter">
                {tour ? <Sparkles size={15} /> : null}
                Enter Pitwall IQ
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/enter:translate-x-0.5" />
              </button>
              <div className="flex flex-col items-center gap-1.5">
                <p className="wc-note inline-flex items-center gap-1.5">
                  <Lock size={11} />
                  You can change all of these later in Settings.
                </p>
                <button type="button" onClick={() => setAct(0)}
                  className="text-[11.5px] text-ink-faint/80 transition-colors hover:text-ink-muted">
                  ← Back to the introduction
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * One piece of pit-wall hardware.
 *
 * The specular sheen is the detail that makes it read as a machined object
 * rather than a rounded rectangle: a soft highlight positioned at the pointer's
 * own coordinates INSIDE this card, so the light appears to be reflecting off
 * the glass rather than being painted on it. Written to CSS variables on the
 * element for the same reason the room's light is — a state setter on
 * pointermove is a re-render per frame to move a gradient.
 */
function Card({ n, icon: Icon, title, i, children }: {
  n: string; icon: typeof Compass; title: string; i: number; children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);
  const onMove = (e: React.PointerEvent) => {
    if (raf.current) return;
    const cx0 = e.clientX, cy0 = e.clientY;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const node = el.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      node.style.setProperty("--cx", `${((cx0 - r.left) / r.width) * 100}%`);
      node.style.setProperty("--cy", `${((cy0 - r.top) / r.height) * 100}%`);
    });
  };
  return (
    <div ref={el} onPointerMove={onMove} className="wc-card wc-row" style={{ ["--i" as string]: i }}>
      <div className="wc-card-head">
        <span className="wc-card-icon"><Icon size={14} /></span>
        <span className="wc-card-n">{n}</span>
      </div>
      <p className="wc-card-title">{title}</p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

/** One answer. The lamp on the right is the state; the rest is the reason. */
function Opt({ on, onClick, title, line }: {
  on: boolean; onClick: (e: React.MouseEvent) => void; title: string; line: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("wc-opt", on && "is-on")}>
      <span className="min-w-0">
        <span className="wc-opt-title">{title}</span>
        <span className="wc-opt-line">{line}</span>
      </span>
      <span aria-hidden className="wc-opt-led">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.2 L4 7.2 L8 2.8" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
