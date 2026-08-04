"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, ChevronDown, Compass, Layers, Lock, Radar, ShieldCheck,
  Sliders, Sparkles, Sun, Timer,
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
  /** Whether the quieter half of the setup is open. Closed is the default,
      because the whole argument of this screen is that it does not have to be. */
  const [more, setMore] = useState(false);

  const room = useRef<HTMLElement | null>(null);
  const fitBox = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  /** The column's own unscaled height, so its wrapper can reserve the scaled one. */
  const [natural, setNatural] = useState(0);
  /* True only when even the smallest allowed scale cannot fit the column.
     Clipping content is strictly worse than scrolling to it, so at that point
     the room gives the scroll back rather than hiding the end of the page. */
  const [overflowing, setOverflowing] = useState(false);
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

  /* Keep the column inside the room. Re-measured whenever anything changes its
     natural height — the act, the disclosure, the text scale, the window. */
  useLayoutEffect(() => {
    const el = fitBox.current;
    if (!el) return;
    const FLOOR = 0.68;   // below this the type stops being comfortable to read
    const measure = () => {
      const h0 = el.scrollHeight;
      if (!h0) return;
      const avail = window.innerHeight - 48;   // the room's own vertical padding
      const want = avail / h0;
      setNatural(h0);
      setFit(Math.min(1, Math.max(FLOOR, want)));
      setOverflowing(want < FLOOR);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

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
      className={cx("wc-room relative isolate grid place-items-center px-5 py-6",
        /* A landing screen does not scroll — until the only alternative is
           cutting the end off it. On anything desktop-shaped the column is
           scaled to fit and the room is sealed; on a phone in landscape, where
           no readable scale fits, it becomes an ordinary scrolling page. */
        overflowing ? "min-h-[100svh]" : "h-[100svh] overflow-hidden",
        leaving && "is-leaving")}>
      <WelcomeField />
      <Instruments />
      <span aria-hidden className="wc-cursor" />

      {/* A LANDING SCREEN DOES NOT SCROLL.
          `h-[100svh]` with `overflow-hidden` above makes that literally true —
          and then something has to guarantee the content actually fits, or the
          guarantee becomes a clip. Media queries cannot: the tallest state
          depends on which act is up and whether the setup is expanded, and the
          shortest viewport this runs on is not a number anybody can enumerate.

          So it measures. The column reports its natural height (layout is
          unaffected by a transform, so there is no feedback loop), and if that
          exceeds the room it is scaled down to fit — floored, because past a
          point shrinking the type is worse than the alternative. On a normal
          desktop the factor is 1 and nothing happens at all. */}
      {/* A SCALE IS A VISUAL CHANGE; THE LAYOUT DOES NOT NOTICE IT.
          Scaling the column alone left an 861px-tall box inside a 592px room —
          and a grid item taller than its cell stops being centred, so the
          visually-correct 592px sat 135px too low and clipped off the bottom.
          The wrapper reserves the SCALED height and the column scales from its
          top edge, which puts layout and pixels back in agreement and lets the
          room centre it the way it centres anything else. */}
      <div className="w-full transition-[height] duration-[--dur-3] ease-[--ease-out]"
        style={natural ? { height: Math.round(natural * fit) } : undefined}>
      <div ref={fitBox}
        className="relative mx-auto w-full max-w-3xl origin-top text-center transition-transform duration-[--dur-3] ease-[--ease-out]"
        style={fit < 1 ? { transform: `scale(${fit})` } : undefined}>
        {/* the mark, and the one line of chrome that says what kind of thing
            this is before the headline says what it does */}
        <div className="wc-1 flex flex-col items-center gap-2">
          <p className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
              <Radar size={13} className="text-accent-soft" />
            </span>
            Pitwall IQ
          </p>
          <p className="wc-boot">Formula 1 race intelligence</p>
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

            {/* ---- how it is built, and where it is in its life ------------
                ONE CARD, TWO FACTS, AND THEY BELONG TOGETHER.

                "We read several open motorsport sources and one of them is
                sometimes down" and "this is a beta and it is still growing" are
                the same sentence told from two sides: both are about a product
                being honest with a reader before it needs to be. Split across a
                banner and a footnote they read as two apologies; together they
                read as a product that knows what it is made of.

                And it is on ACT ONE, before any question is asked. A reader
                decides whether to trust software in the first fifteen seconds,
                which is well before they reach a setup screen.

                SIDE BY SIDE, because they are two subjects rather than two
                paragraphs of one — and because this screen has exactly one
                viewport to say everything in. */}
            <div className="wc-45 mx-auto mt-7 max-w-3xl">
              <div className="wc-trust">
                <div className="wc-trust-col">
                  <span className="wc-trust-icon"><Layers size={13} /></span>
                  <p className="wc-trust-h">Built on transparent data</p>
                  <p>
                    Pitwall&nbsp;IQ brings together OpenF1, the Jolpica/Ergast archive and
                    Formula&nbsp;1&rsquo;s official live timing into one experience. Every
                    insight is backed by its source — and when external data isn&rsquo;t
                    available, we tell you exactly why instead of hiding it.
                  </p>
                </div>
                <span aria-hidden className="wc-trust-rule" />
                <div className="wc-trust-col">
                  <span className="wc-trust-icon is-beta"><Sparkles size={13} /></span>
                  <p className="wc-trust-h">Beta, by design</p>
                  <p>
                    Pitwall&nbsp;IQ is growing quickly: new analysis, smarter visualisations
                    and continuous improvements land regularly. If something seems off, let
                    us know — most of it is fixable, and your feedback shapes what comes next.
                  </p>
                </div>
              </div>
            </div>

            <div className="wc-5 mt-9 flex flex-col items-center gap-3">
              <button type="button" onClick={() => setAct(1)} className="wc-cta group/go">
                Get started
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/go:translate-x-0.5" />
              </button>
              <span className="wc-note">Three quick answers, or none at all. About twenty seconds.</span>
            </div>
          </div>

          {/* ================= ACT TWO — set it up ======================= */}
          {/* IT ASKS FOR MORE AND FEELS LIKE LESS.
              V62 asked three questions on three equal cards. Ten questions laid
              out the same way is a form, and a form is the thing a first run
              must never be — so the SHAPE carries the difference rather than the
              copy. Three cards for the answers that change what the product IS,
              answered in one press each; everything else folded into one quiet
              row that opens if the reader wants it and is otherwise a sentence
              saying the defaults are already sensible.

              Which means both readers get what they came for: one press to
              enter, or thirty seconds to make it theirs. Nobody is walked
              through a wizard to reach a button they could have pressed on
              arrival. */}
          <div ref={two} aria-hidden={act === 0}
            className={cx("wc-act absolute inset-x-0 top-0", act === 0 && "is-next")}>
            <h2 className="text-[1.9rem] font-bold leading-tight tracking-[-0.038em] text-ink sm:text-[2.4rem]">
              Set it up your way
            </h2>
            <p className="mx-auto mt-2.5 max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
              Everything below is answered sensibly already — press Enter and you are in.
              Change anything you like now, or any of it later in Settings.
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

            {/* ---- the rest of it, on request ------------------------------ */}
            <div className="wc-more mt-3">
              <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
                className="wc-more-toggle">
                <Sliders size={13} />
                {more ? "Hide the rest" : "Language, units, motion and accessibility"}
                <ChevronDown size={14} className={cx("ml-auto transition-transform duration-[--dur-3]", more && "rotate-180")} />
              </button>

              {more && (
                <div className="wc-more-body grid gap-x-6 gap-y-3.5 pt-4 text-left sm:grid-cols-2">
                  <Row label="Language" hint="Not a translation — which English the interface is written in.">
                    <Pick value={prefs.spelling} onPick={(v) => set("spelling", v)} options={[
                      { v: "en-GB" as const, label: "British" }, { v: "en-US" as const, label: "American" },
                    ]} />
                  </Row>
                  <Row label="Units" hint="Track and air temperatures, and speeds.">
                    <Pick value={prefs.units} onPick={(v) => set("units", v)} options={[
                      { v: "metric" as const, label: "°C · kph" }, { v: "imperial" as const, label: "°F · mph" },
                    ]} />
                  </Row>
                  <Row label="Time" hint="Session times and clock readings.">
                    <Pick value={prefs.clock} onPick={(v) => set("clock", v)} options={[
                      { v: "24h" as const, label: "24-hour" }, { v: "12h" as const, label: "12-hour" },
                    ]} />
                  </Row>
                  <Row label="Motion" hint="The pace of the interface — not whether it has one.">
                    <Pick value={prefs.motion} onPick={(v) => set("motion", v)} options={[
                      { v: "full" as const, label: "Full" }, { v: "calm" as const, label: "Calm" },
                    ]} />
                  </Row>
                  <Row label="Text size" hint="Scales the whole interface, not just body copy.">
                    <Pick value={prefs.textScale} onPick={(v) => set("textScale", v)} options={[
                      { v: "normal" as const, label: "Default" }, { v: "large" as const, label: "Larger" },
                    ]} />
                  </Row>
                  {/* Four options rather than two, so it takes the full width.
                      Squeezed into half of it, the hint wrapped into a
                      ninety-pixel ribbon beside the control — a row whose label
                      is narrower than its own words is a broken row. */}
                  <Row wide label="Colour vision"
                    hint="Remaps every livery, tyre compound and flag onto a palette that stays separable — see Settings for what each one does.">
                    <Pick value={prefs.colourVision} onPick={(v) => set("colourVision", v)} options={[
                      { v: "none" as const, label: "Full colour" },
                      { v: "deuteranopia" as const, label: "Deutan" },
                      { v: "protanopia" as const, label: "Protan" },
                      { v: "tritanopia" as const, label: "Tritan" },
                    ]} />
                  </Row>
                </div>
              )}
            </div>

            <div className="mt-7 flex flex-col items-center gap-4">
              <button type="button" onClick={enter} disabled={leaving} className="wc-cta group/enter">
                {tour ? <Sparkles size={15} /> : null}
                Enter Pitwall IQ
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/enter:translate-x-0.5" />
              </button>
              <div className="flex flex-col items-center gap-1.5">
                {/* Settings is named, not implied. A reader who thinks this
                    screen was their only chance to personalise the product will
                    never look for the twenty other answers that live there. */}
                <p className="wc-note inline-flex flex-wrap items-center justify-center gap-1.5">
                  <Lock size={11} />
                  All of this, plus density, chart pace, accent colour and more, lives in Settings.
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

/** A quiet preference: a label, a reason, and a two-or-four-way choice.
    Deliberately NOT another hardware card — three of those said "these are the
    decisions that matter", and repeating the treatment for units and clock
    format would flatten that back into a list of ten equal things. */
function Row({ label, hint, children, wide }: {
  label: string; hint: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className={cx("flex items-center gap-4", wide && "sm:col-span-2")}>
      <span className="min-w-[8rem] flex-1">
        <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{hint}</span>
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function Pick<T extends string>({ value, onPick, options }: {
  value: T; onPick: (v: T) => void; options: readonly { v: T; label: string }[];
}) {
  return (
    <span className="wc-seg">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onPick(o.v)} aria-pressed={value === o.v}
          className={cx("wc-seg-b", value === o.v && "is-on")}>
          {o.label}
        </button>
      ))}
    </span>
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
