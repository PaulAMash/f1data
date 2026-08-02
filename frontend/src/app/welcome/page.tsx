"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Radar } from "lucide-react";
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
/* WHAT IS DELIBERATELY ABSENT. No navigation, no statistics, no race cards,   */
/* no scroll. A first screen has exactly one job, and every additional thing   */
/* on it is competing with that job. The field behind is the same renderer the */
/* landing hero uses, in its ambient configuration — the instruments are the   */
/* *product*, and showing them before somebody has said what kind of reader    */
/* they are is precisely the overwhelm this screen exists to avoid.            */
/*                                                                            */
/* IT IS NOT A GATE ANYBODY CAN BE TRAPPED BEHIND. It renders once, and the    */
/* moment the answer is stored it is unreachable — a reader who wants to       */
/* change their mind does it in Settings, which is where a preference lives.   */
/* -------------------------------------------------------------------------- */

export default function Welcome() {
  const { prefs, set, ready } = usePrefs();
  const router = useRouter();
  const [chosen, setChosen] = useState<Mode | null>(null);

  // Somebody who has already answered has no business here. `replace`, not
  // `push`, so Back from the landing page cannot bring them back to it.
  useEffect(() => {
    if (ready && prefs.pickedMode) router.replace("/");
  }, [ready, prefs.pickedMode, router]);

  /* The hand-off is deliberately not instant. A choice this consequential
     should be seen to land — the card confirms, the screen lets go, and the
     landing page arrives on the other side of it. Four hundred milliseconds is
     long enough to read as an answer and short enough not to be a wait. */
  function choose(m: Mode) {
    if (chosen) return;
    setChosen(m);
    set("mode", m);
    set("pickedMode", true);
    setTimeout(() => router.push("/"), 420);
  }

  return (
    <main className={cx("relative isolate grid min-h-[100svh] place-items-center overflow-hidden px-5 py-10",
      "transition-opacity duration-[--dur-4] ease-[--ease-out]",
      chosen && "opacity-0")}>
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

        <p className="wc-3 mx-auto mt-6 max-w-lg text-[16.5px] leading-snug text-ink-muted">
          Every lap of timing data, read and turned into the reason a Grand Prix
          finished the way it did.
        </p>

        <p className="wc-4 mt-12 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
          How would you like to read it?
        </p>

        <div className="wc-5 mt-5 grid gap-3.5 sm:grid-cols-2">
          <Pick on={chosen === "simple"} dimmed={!!chosen && chosen !== "simple"}
            onClick={() => choose("simple")}
            title="Simple" tag="Like a commentator"
            line="The story of the race in plain English — what happened, when it turned, and why."
            tint="var(--speed)" art={<ArtSimple />} />
          <Pick on={chosen === "advanced"} dimmed={!!chosen && chosen !== "advanced"}
            onClick={() => choose("advanced")}
            title="Advanced" tag="Like a strategist"
            line="Every measurement behind it — corrected pace, stint by stint, call by call."
            tint="var(--accent)" art={<ArtAdvanced />} />
        </div>

        <p className="wc-6 mt-7 text-[12.5px] text-ink-faint">
          You can change this at any time in Settings.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * One of the two doors.
 *
 * The artwork is the argument: a sentence and a picture of the thing itself,
 * rather than a bulleted list of adjectives. Whichever is not chosen recedes
 * rather than disappearing, so the moment reads as a choice being made and not
 * as one card being replaced by another.
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
      {/* the beats along the way */}
      <circle cx="74" cy="16" r="2.4" fill="rgb(var(--speed))" opacity=".55" />
      <circle cx="140" cy="30" r="2.4" fill="rgb(var(--speed))" opacity=".55" />
      {/* and the one that decided it */}
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
