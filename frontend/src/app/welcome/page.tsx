"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, MessageSquareText, Radar, Sparkles, Timer } from "lucide-react";
import { HeroField } from "@/components/landing/HeroField";
import { usePrefs, type Mode } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The first screen.                                                          */
/*                                                                            */
/* Pitwall IQ used to open on the landing page with a "Choose your experience" */
/* band a screen and a half down it — so the first decision the product asks   */
/* for was buried under a headline, five statistics and a scroll, and a reader */
/* who never scrolled never made it. The choice is the beginning of the        */
/* product, not a section of a page, so it gets a screen of its own.           */
/*                                                                            */
/* TWO DECISIONS, ONE AT A TIME.                                               */
/*                                                                            */
/* It now asks about depth and then about the tour, and the second question is */
/* not visible while the first is being answered. Putting both on screen at    */
/* once would have been one fewer interaction and a worse one: four options    */
/* in two unrelated pairs is a form, and a form is what every onboarding worth */
/* copying spent years learning not to open with. One question, two answers,   */
/* a beat, the next question — which also earns the screen a rhythm, because   */
/* the second step arrives rather than being scrolled to.                      */
/*                                                                            */
/* WHAT IS DELIBERATELY ABSENT. No navigation, no statistics, no race cards,   */
/* no scroll. A first screen has exactly one job at a time. The field behind   */
/* is the same renderer the landing hero uses, in its ambient configuration —  */
/* the instruments are the *product*, and showing them before somebody has     */
/* said what kind of reader they are is precisely the overwhelm this screen    */
/* exists to avoid.                                                            */
/*                                                                            */
/* IT IS NOT A GATE ANYBODY CAN BE TRAPPED BEHIND. It renders once, and the    */
/* moment the answers are stored it is unreachable — both are changed in       */
/* Settings afterwards, which is where a preference lives.                     */
/* -------------------------------------------------------------------------- */

/** What the product does, in three words each. Read before the paragraph is. */
const DOES = [
  { icon: Timer, text: "Reads every lap of a session" },
  { icon: Compass, text: "Explains what decided it" },
  { icon: MessageSquareText, text: "Answers what you ask of it" },
];

export default function Welcome() {
  const { prefs, set, ready } = usePrefs();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [leaving, setLeaving] = useState(false);

  /* THE BLOCK IS AS TALL AS THE STEP IN IT.
     Both steps are mounted — one fading through the other is smoother than one
     unmounting and the next appearing — so the container has to be told which
     of the two heights to be. Reserving the taller left a screen's worth of
     void under the second question; letting the page reflow made the footer
     jump. Measuring the active step and animating between the two heights is
     the only version where nothing moves that should not. */
  const box = useRef<HTMLDivElement | null>(null);
  const one = useRef<HTMLDivElement | null>(null);
  const two = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = step === 0 ? one.current : two.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  // Somebody who has already answered has no business here. `replace`, not
  // `push`, so Back from the landing page cannot bring them back to it.
  useEffect(() => {
    if (ready && prefs.pickedMode) router.replace("/");
  }, [ready, prefs.pickedMode, router]);

  /* The hand-off is deliberately not instant. A choice should be seen to land —
     the card confirms, the step lets go, and the next question arrives on the
     other side of it. Four hundred milliseconds is long enough to read as an
     answer and short enough not to be a wait. */
  function pickMode(m: Mode) {
    if (mode) return;
    setMode(m);
    set("mode", m);
    setTimeout(() => setStep(1), 420);
  }

  /* `onboarded` is the tour's gate, so answering it here is the whole feature:
     yes leaves it armed and the tour opens when Start exploring is pressed —
     which is where V60 put it, so the reader still gets to look at the landing
     page first. No marks it done, and it is never offered unprompted again. */
  function pickTour(wants: boolean) {
    if (leaving) return;
    setLeaving(true);
    set("onboarded", !wants);
    set("pickedMode", true);
    setTimeout(() => router.push("/"), 460);
  }

  return (
    <main className={cx("relative isolate grid min-h-[100svh] place-items-center overflow-hidden px-5 py-10",
      "transition-opacity duration-[--dur-4] ease-[--ease-out]",
      leaving && "opacity-0")}>
      <HeroField variant="ambient" />

      <div className="relative w-full max-w-3xl text-center">
        <p className="wc-1 inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-soft">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
            <Radar size={13} className="text-accent-soft" />
          </span>
          Pitwall IQ
        </p>

        <h1 className="wc-2 mt-7 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[3.7rem]">
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
          Every lap of timing data from a Grand&nbsp;Prix, read and turned into the
          reason it finished the way it did.
        </p>

        {/* three facts, which a reader takes in before they read the sentence */}
        <ul className="wc-3 mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-x-7 gap-y-2.5">
          {DOES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-[12.5px] text-ink-faint">
              <Icon size={13} className="shrink-0 text-accent-soft/70" />
              {text}
            </li>
          ))}
        </ul>

        {/* ---- the two questions ------------------------------------------ */}
        <div ref={box}
          className="relative mt-12 transition-[height] duration-[--dur-4] ease-[--ease-out]"
          style={{ height: h }}>
          <div ref={one}
            className={cx("absolute inset-x-0 top-0 transition-all duration-[--dur-4] ease-[--ease-out]",
              step === 1 && "pointer-events-none -translate-y-2 opacity-0")}>
            <Question n={1} of={2} text="How would you like to read it?" />
            <div className="wc-5 mt-5 grid gap-3.5 sm:grid-cols-2">
              <Pick on={mode === "simple"} dimmed={!!mode && mode !== "simple"}
                onClick={() => pickMode("simple")}
                title="Simple" tag="Like a commentator"
                line="The story of the race in plain English — what happened, when it turned, and why."
                tint="var(--speed)" art={<ArtSimple />} />
              <Pick on={mode === "advanced"} dimmed={!!mode && mode !== "advanced"}
                onClick={() => pickMode("advanced")}
                title="Advanced" tag="Like a strategist"
                line="Every measurement behind it — corrected pace, stint by stint, call by call."
                tint="var(--accent)" art={<ArtAdvanced />} />
            </div>
          </div>

          <div ref={two} aria-hidden={step === 0}
            className={cx("absolute inset-x-0 top-0 transition-all duration-[--dur-4] ease-[--ease-out]",
              step === 0 ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100")}>
            <Question n={2} of={2} text="Would you like a quick tour?" />
            <p className="mx-auto mt-2.5 max-w-md text-[13px] leading-relaxed text-ink-muted">
              Eight stops on the Race Explorer, about a minute. It starts when you
              press <span className="text-ink">Start exploring</span> — so you can
              look around first.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => pickTour(true)} disabled={leaving}
                className="cta-glow pressable-glow group/yes inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-[14.5px] font-semibold text-pure">
                <Sparkles size={15} />
                Show me around
                <ArrowRight size={15}
                  className="transition-transform duration-[--dur-2] group-hover/yes:translate-x-0.5" />
              </button>
              <button type="button" onClick={() => pickTour(false)} disabled={leaving}
                className="pressable inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-base-850/60 px-5 py-3.5 text-[14px] font-medium text-ink-muted backdrop-blur-md transition-colors hover:text-ink">
                I&rsquo;ll explore on my own
              </button>
            </div>
          </div>
        </div>

        <p className="wc-6 mt-9 text-[12.5px] text-ink-faint">
          Both of these can be changed at any time in Settings.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/** The question, with its place in the sequence — two dots, not "1 of 2". */
function Question({ n, of, text }: { n: number; of: number; text: string }) {
  return (
    <div className="wc-4 flex flex-col items-center gap-3">
      <div className="flex gap-1.5" aria-label={`Step ${n} of ${of}`}>
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cx("h-1.5 rounded-full transition-all duration-[--dur-3] ease-[--ease-out]",
            i === n - 1 ? "w-5 bg-accent" : i < n - 1 ? "w-1.5 bg-accent/45" : "w-1.5 bg-white/15")} />
        ))}
      </div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{text}</p>
    </div>
  );
}

/**
 * One of the two doors.
 *
 * The artwork is the argument: a picture of the thing itself rather than a
 * bulleted list of adjectives. Whichever is not chosen recedes rather than
 * disappearing, so the moment reads as a choice being made and not as one card
 * being replaced by another.
 */
function Pick({ on, dimmed, onClick, title, tag, line, tint, art }: {
  on: boolean; dimmed: boolean; onClick: () => void;
  title: string; tag: string; line: string; tint: string; art: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        "wc-pick group/pick relative overflow-hidden rounded-2xl border p-5 text-left",
        "transition-all duration-[--dur-4] ease-[--ease-out]",
        on ? "-translate-y-1 border-transparent" : "border-white/[0.08] hover:-translate-y-1 hover:border-white/[0.18]",
        dimmed && "scale-[0.98] opacity-30")}
      style={{
        ["--pick" as string]: tint,
        background: `linear-gradient(160deg, rgb(${tint} / ${on ? ".14" : ".05"}), rgb(var(--base-900) / .82) 62%)`,
      }}>
      {/* the card's own light, in its own colour */}
      <span aria-hidden
        className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full transition-opacity duration-[--dur-4]"
        style={{
          background: `radial-gradient(closest-side, rgb(${tint} / .32), transparent)`,
          opacity: on ? 1 : 0.32,
        }} />

      <span className="relative flex h-[52px] items-end">{art}</span>

      <span className="relative mt-4 flex items-baseline gap-2.5">
        <span className="text-[20px] font-bold tracking-tight text-ink">{title}</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: `rgb(${tint})` }}>{tag}</span>
        <ArrowRight size={14}
          className="ml-auto shrink-0 self-center text-ink-faint transition-transform duration-[--dur-2] group-hover/pick:translate-x-0.5" />
      </span>
      <span className="relative mt-1.5 block text-[13px] leading-relaxed text-ink-muted">{line}</span>
    </button>
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
