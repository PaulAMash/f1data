"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Compass, Radar, ShieldCheck, Sparkles, Timer,
} from "lucide-react";
import { WelcomeField } from "@/components/welcome/WelcomeField";
import { usePrefs, type Mode, type Theme } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The first screen.                                                          */
/*                                                                            */
/* Three pages in this product have three different jobs, and the reason this  */
/* one exists is that the landing page was doing two of them badly:            */
/*                                                                            */
/*   WELCOME   "What is Pitwall IQ?"                                          */
/*   HOME      "This looks incredible. I want to explore."                     */
/*   EXPLORER  "Now teach me the race."                                        */
/*                                                                            */
/* TWO ACTS, ONE SCREEN. The introduction earns the setup; the setup is not    */
/* asked for until somebody knows what they are setting up. But they are acts, */
/* not pages: no route change, no scroll, no back button to get lost in — the  */
/* first lets go and the second arrives in its place. A wizard that spreads    */
/* four decisions over four URLs is the thing every onboarding worth copying   */
/* spent years learning not to build.                                          */
/*                                                                            */
/* EVERY CHOICE IS PRE-ANSWERED. The primary control is live from the first    */
/* frame of the second act, because a setup screen that refuses to let you     */
/* leave until you have touched three things is a form with a progress bar.    */
/* The defaults are the ones we would pick: Simple, whichever theme the        */
/* browser is already in, and yes to the tour.                                 */
/*                                                                            */
/* AND ONE OF THEM IS FELT RATHER THAN DESCRIBED. Choosing the theme changes   */
/* THIS screen, immediately, through the same circular reveal Settings uses.   */
/* It is the single most convincing thing a first run can do: the product      */
/* responds before it has been entered.                                        */
/*                                                                            */
/* IT IS NOT A GATE ANYBODY CAN BE TRAPPED BEHIND. It renders once, and the    */
/* moment the answers are stored it is unreachable — all three are changed in  */
/* Settings afterwards, which is where a preference lives.                     */
/* -------------------------------------------------------------------------- */

/** What it is, why you would use it, and what makes it different. In that order. */
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

  // the answers, pre-filled with the ones we would choose
  const [mode, setMode] = useState<Mode>("simple");
  const [tour, setTour] = useState(true);

  /* THE BLOCK IS AS TALL AS THE ACT IN IT.
     Both acts stay mounted — one fading through the other is smoother than one
     unmounting and the next appearing — so the container has to be told which
     of the two heights to be. Reserving the taller left a screen of void under
     the shorter; letting the page reflow made everything below it jump.
     Measuring the live act and animating between the two heights is the only
     version where nothing moves that should not. */
  const one = useRef<HTMLDivElement | null>(null);
  const two = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = act === 0 ? one.current : two.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [act]);

  // Somebody who has already answered has no business here. `replace`, not
  // `push`, so Back from the landing page cannot bring them back to it.
  useEffect(() => {
    if (ready && prefs.pickedMode) router.replace("/");
  }, [ready, prefs.pickedMode, router]);

  /* The theme is applied the instant it is chosen, from the point that was
     pressed — the same reveal Settings uses, so the gesture is already
     familiar the first time it is met. Nothing is "saved" later; this IS the
     saving, and the screen changing around the press is the receipt. */
  function pickTheme(t: Theme, e: React.MouseEvent) {
    if (t === prefs.theme) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setThemeFrom(t, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  /* `onboarded` is the tour's gate. Leaving it armed does NOT start a tour —
     it puts a standing invitation on the Start exploring control, and the tour
     opens when the reader presses it. That is the whole point of the answer:
     they get the landing page to themselves first. */
  function enter() {
    if (leaving) return;
    setLeaving(true);
    set("mode", mode);
    set("onboarded", !tour);
    set("pickedMode", true);
    setTimeout(() => router.push("/"), 460);
  }

  return (
    <main className={cx("wc-room relative isolate grid min-h-[100svh] place-items-center overflow-hidden px-5 py-8 sm:py-10",
      "transition-opacity duration-[--dur-4] ease-[--ease-out]",
      leaving && "opacity-0")}>
      <WelcomeField />

      <div className="relative w-full max-w-3xl text-center">
        <p className="wc-1 inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
            <Radar size={13} className="text-accent-soft" />
          </span>
          Pitwall IQ
        </p>

        <div className="relative mt-6 transition-[height] duration-[--dur-4] ease-[--ease-out]"
          style={{ height: h }}>

          {/* ================= ACT ONE — what this is ===================== */}
          <div ref={one} aria-hidden={act === 1}
            className={cx("absolute inset-x-0 top-0 transition-all duration-[--dur-4] ease-[--ease-out]",
              act === 1 && "pointer-events-none -translate-y-3 opacity-0")}>
            <h1 className="wc-2 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[3.7rem]">
              Formula 1,
              <br className="hidden sm:block" />{" "}
              <span className="relative whitespace-nowrap text-accent">
                explained
                <span aria-hidden className="absolute -inset-x-3 -inset-y-2 -z-10 rounded-3xl"
                  style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .2), transparent)" }} />
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
                <li key={title} className="wc-pillar rounded-2xl border border-white/[0.07] p-4"
                  style={{ ["--i" as string]: i }}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 ring-1 ring-accent/25">
                    <Icon size={15} className="text-accent-soft" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-semibold leading-snug text-ink">{title}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
                </li>
              ))}
            </ul>

            <div className="wc-5 mt-10 flex flex-col items-center gap-3">
              <button type="button" onClick={() => setAct(1)}
                className="cta-glow pressable-glow group/go inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-4 text-[15px] font-semibold text-pure">
                Get started
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/go:translate-x-0.5" />
              </button>
              <span className="text-[12px] text-ink-faint">Three questions. About twenty seconds.</span>
            </div>
          </div>

          {/* ================= ACT TWO — three quick choices ============== */}
          <div ref={two} aria-hidden={act === 0}
            className={cx("absolute inset-x-0 top-0 transition-all duration-[--dur-4] ease-[--ease-out]",
              act === 0 ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100")}>
            <h2 className="text-[1.9rem] font-bold leading-tight tracking-[-0.035em] text-ink sm:text-[2.4rem]">
              Set it up your way
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
              All three are answered sensibly already. Change any of them now — or
              any of them later, in Settings.
            </p>

            <div className="mt-6 space-y-4 text-left">
              {/* ---- 1. depth ------------------------------------------- */}
              <Row n={1} label="How would you like to read it?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Pick on={mode === "simple"} onClick={() => setMode("simple")}
                    title="Simple" tag="Like a commentator"
                    line="The story of the race in plain English — what happened, when it turned, and why."
                    tint="var(--speed)" art={<ArtSimple />} />
                  <Pick on={mode === "advanced"} onClick={() => setMode("advanced")}
                    title="Advanced" tag="Like a strategist"
                    line="Every measurement behind it — corrected pace, stint by stint, call by call."
                    tint="var(--accent)" art={<ArtAdvanced />} />
                </div>
              </Row>

              {/* ---- 2. the room ---------------------------------------- */}
              <Row n={2} label="Which room are you in?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Swatch on={prefs.theme === "dark"} onClick={(e) => pickTheme("dark", e)}
                    title="Dark" tag="Pit wall at night"
                    bg="#0b0e16" panel="#141926" fg="#e8ecf5" accent="#ff3b3b" />
                  <Swatch on={prefs.theme === "light"} onClick={(e) => pickTheme("light", e)}
                    title="Light" tag="Daylight in the garage"
                    bg="#f0f2f6" panel="#ffffff" fg="#0d1522" accent="#d90400" />
                </div>
              </Row>

              {/* ---- 3. the tour ---------------------------------------- */}
              <Row n={3} label="Would you like a guided tour?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle on={tour} onClick={() => setTour(true)}
                    title="Yes, show me around"
                    line="Eight stops on the Race Explorer, about a minute. It waits until you press Start exploring." />
                  <Toggle on={!tour} onClick={() => setTour(false)}
                    title="No, I'll explore on my own"
                    line="Straight into the most recent Grand Prix. You can start the tour from Settings whenever you like." />
                </div>
              </Row>
            </div>

            <div className="mt-8 flex flex-col items-center gap-2.5">
              <button type="button" onClick={enter} disabled={leaving}
                className="cta-glow pressable-glow group/enter inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-4 text-[15px] font-semibold text-pure">
                {tour ? <Sparkles size={15} /> : null}
                Continue
                <ArrowRight size={16}
                  className="transition-transform duration-[--dur-2] group-hover/enter:translate-x-0.5" />
              </button>
              <button type="button" onClick={() => setAct(0)}
                className="text-[12.5px] text-ink-faint transition-colors hover:text-ink-muted">
                ← Back to the introduction
              </button>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/** One question, numbered, with its answers under it. */
function Row({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <section className="wc-row" style={{ ["--i" as string]: n - 1 }}>
      <p className="mb-3 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[10px] font-bold tabular-nums text-ink-muted">
          {n}
        </span>
        {label}
      </p>
      {children}
    </section>
  );
}

/**
 * One of the two doors.
 *
 * The artwork is the argument: a picture of the thing itself rather than a
 * bulleted list of adjectives. Both stay fully legible — an unchosen option
 * that fades out is a decision the screen has made on the reader's behalf, and
 * on a screen whose whole job is asking, that is the wrong gesture.
 */
function Pick({ on, onClick, title, tag, line, tint, art }: {
  on: boolean; onClick: () => void;
  title: string; tag: string; line: string; tint: string; art: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        "wc-pick group/pick relative overflow-hidden rounded-2xl border p-4 text-left",
        "transition-all duration-[--dur-3] ease-[--ease-out]",
        on ? "-translate-y-0.5 border-transparent" : "border-white/[0.08] hover:-translate-y-0.5 hover:border-white/[0.18]")}
      style={{
        ["--pick" as string]: tint,
        background: `linear-gradient(160deg, rgb(${tint} / ${on ? ".14" : ".05"}), rgb(var(--base-900) / .82) 62%)`,
      }}>
      <span aria-hidden
        className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full transition-opacity duration-[--dur-4]"
        style={{
          background: `radial-gradient(closest-side, rgb(${tint} / .32), transparent)`,
          opacity: on ? 1 : 0.28,
        }} />

      <span className="relative flex h-[46px] items-end">{art}</span>

      <span className="relative mt-3.5 flex items-baseline gap-2.5">
        <span className="text-[19px] font-bold tracking-tight text-ink">{title}</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: `rgb(${tint})` }}>{tag}</span>
        <Tick on={on} />
      </span>
      <span className="relative mt-1.5 block text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
    </button>
  );
}

/**
 * The theme, as the theme.
 *
 * A miniature of the actual interface rather than the word "dark" — and
 * pressing it changes the screen it is sitting on, so the preview and the
 * result are the same object.
 */
function Swatch({ on, onClick, title, tag, bg, panel, fg, accent }: {
  on: boolean; onClick: (e: React.MouseEvent) => void;
  title: string; tag: string; bg: string; panel: string; fg: string; accent: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("wc-pick is-quiet group/sw relative overflow-hidden rounded-2xl border p-4 text-left",
        "transition-all duration-[--dur-3] ease-[--ease-out]",
        on ? "-translate-y-0.5 border-accent/40" : "border-white/[0.08] hover:-translate-y-0.5 hover:border-white/[0.18]")}
      style={{ background: "rgb(var(--base-900) / .72)" }}>
      <span aria-hidden className="block overflow-hidden rounded-lg ring-1 ring-black/20"
        style={{ background: bg }}>
        <span className="flex items-center gap-1 px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          <span className="h-1 w-6 rounded-full" style={{ background: fg, opacity: 0.4 }} />
          <span className="ml-auto h-1 w-3 rounded-full" style={{ background: fg, opacity: 0.2 }} />
        </span>
        <span className="mx-2 mb-2 block rounded-md px-2 py-2" style={{ background: panel }}>
          <span className="block h-1.5 w-12 rounded-full" style={{ background: fg, opacity: 0.75 }} />
          <span className="mt-1.5 block h-1 w-full rounded-full" style={{ background: fg, opacity: 0.18 }} />
          <span className="mt-1 block h-1 w-2/3 rounded-full" style={{ background: accent, opacity: 0.85 }} />
        </span>
      </span>
      <span className="mt-3 flex items-baseline gap-2">
        <span className="text-[15px] font-bold tracking-tight text-ink">{title}</span>
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{tag}</span>
        <Tick on={on} />
      </span>
    </button>
  );
}

/** The plainest of the three questions gets the plainest of the three cards. */
function Toggle({ on, onClick, title, line }: {
  on: boolean; onClick: () => void; title: string; line: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("wc-pick is-quiet relative overflow-hidden rounded-2xl border p-4 text-left",
        "transition-all duration-[--dur-3] ease-[--ease-out]",
        on ? "-translate-y-0.5 border-accent/40 bg-accent/[0.07]" : "border-white/[0.08] bg-base-900/60 hover:-translate-y-0.5 hover:border-white/[0.18]")}>
      <span className="flex items-baseline gap-2">
        <span className="text-[14.5px] font-semibold text-ink">{title}</span>
        <Tick on={on} />
      </span>
      <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
    </button>
  );
}

/** The mark that says "this one". Same mark on all three questions. */
function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden
      className={cx("ml-auto grid h-[18px] w-[18px] shrink-0 place-items-center self-center rounded-full transition-all duration-[--dur-2] ease-[--ease-out]",
        on ? "bg-accent text-pure" : "bg-white/[0.07] text-transparent")}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M2 5.2 L4 7.2 L8 2.8" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* The two pictures. Both are drawn from the same session — the point being
   made is that these are two readings of one race, not two products. */

function ArtSimple() {
  /* NOT A STACK OF GREY BARS.
     The first draft drew the sentence as shape — three grey rules and a
     coloured one — which is the universal picture of text that has not loaded.
     Beside a card whose whole promise is "the story", looking like a skeleton
     was the worst available reading. This is the story instead: one line
     through a race, three things that happened on it, and the one that decided
     it marked. */
  return (
    <svg viewBox="0 0 220 52" className="h-full w-full" fill="none" aria-hidden
      preserveAspectRatio="xMidYMid meet">
      <path d="M2 40 C 34 40, 46 14, 74 16 S 112 40, 140 30 S 186 8, 218 12"
        stroke="rgb(var(--speed))" strokeWidth="2" strokeLinecap="round" opacity=".85"
        className="art-drift" style={{ ["--i" as string]: 0 }} />
      <circle cx="74" cy="16" r="2.4" fill="rgb(var(--speed))" opacity=".55" />
      <circle cx="140" cy="30" r="2.4" fill="rgb(var(--speed))" opacity=".55" />
      <circle cx="188" cy="11" r="8" fill="rgb(var(--speed))" opacity=".16" className="art-halo" />
      <circle cx="188" cy="11" r="3.2" fill="rgb(var(--speed))" />
      <rect x="2" y="47" width="52" height="3.5" rx="1.75" fill="rgb(var(--ink))" opacity=".22" />
      <rect x="60" y="47" width="30" height="3.5" rx="1.75" fill="rgb(var(--speed))" opacity=".6"
        className="art-blink" style={{ ["--i" as string]: 1 }} />
    </svg>
  );
}

function ArtAdvanced() {
  const BARS = [
    { w: 196, c: "rgb(var(--accent))", o: 0.9 },
    { w: 152, c: "rgb(var(--accent))", o: 0.6 },
    { w: 118, c: "rgb(var(--amber))", o: 0.55 },
    { w: 86, c: "rgb(var(--speed))", o: 0.5 },
  ];
  return (
    <svg viewBox="0 0 220 52" className="h-full w-full" fill="none" aria-hidden
      preserveAspectRatio="xMinYMid meet">
      {BARS.map((b, i) => (
        <g key={i}>
          <rect x="0" y={5 + i * 12} width="200" height="5" rx="2.5"
            fill="rgb(var(--tint))" opacity=".07" />
          <rect x="0" y={5 + i * 12} width={b.w} height="5" rx="2.5"
            fill={b.c} opacity={b.o} className="art-tick" style={{ ["--i" as string]: i }} />
          <rect x={b.w + 5} y={5 + i * 12} width="14" height="5" rx="2"
            fill="rgb(var(--ink))" opacity=".18" />
        </g>
      ))}
    </svg>
  );
}
