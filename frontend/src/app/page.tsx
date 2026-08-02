"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MessageSquareText, Timer, Trophy } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { HeroField } from "@/components/landing/HeroField";
import { ExploreCue } from "@/components/landing/ExploreCue";
import { SampleStory } from "@/components/landing/SampleStory";
import { Flag, Gauge, LineChart, Sparkles } from "@/components/ui/MotionIcon";
import { usePrefs, type Mode } from "@/lib/prefs";
import { useTour, TOUR } from "@/lib/tour";
import { useLocale } from "@/lib/locale";
import { useReveal } from "@/lib/useReveal";
import { useCountUp } from "@/lib/useCountUp";
import { api } from "@/lib/api";
import type { ArchiveScale } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The landing experience.                                                    */
/*                                                                            */
/* Composed as a film is cut, not stacked as panels are stacked. Four beats,   */
/* each with a different weight, and a lot of air between them — the thing a   */
/* page of equal-sized cards can never buy is the sense that somebody decided  */
/* what mattered most.                                                        */
/*                                                                            */
/*   1. THE SHOT       a Grand Prix drawn as light, full bleed, with the type  */
/*                     printed on it rather than beside it.                    */
/*   2. THE SCALE      figures that prove the archive is real.                 */
/*   3. THE CHOICE     shown ONCE — see below.                                 */
/*   4. THE WAY IN     three steps, then three doors, each door carrying a     */
/*                     picture of what is behind it.                           */
/*                                                                            */
/* HIERARCHY IS NUMBERED, NOT GUESSED. The chapters below the hero all carry   */
/* the same SectionHead, and the numerals are computed rather than typed —     */
/* because the page is not the same length on every visit.                     */
/*                                                                            */
/* THE CHOICE IS PART OF ARRIVING, NOT PART OF THE PAGE.                       */
/*                                                                            */
/* "Choose your experience" used to be here on every visit. Asking a returning */
/* reader, every single time, to answer a question they answered on their      */
/* first visit does not read as helpful — it reads as a product that is not    */
/* listening. Worse, it put the most repetitive thing on the page directly     */
/* under the most impressive one. It is now shown until it is answered and     */
/* then never again, and Settings is where it lives permanently.               */
/* -------------------------------------------------------------------------- */

export default function Landing() {
  const { prefs, set, ready } = usePrefs();
  const router = useRouter();
  const [picked, setPicked] = useState(false);
  const statBand = useReveal<HTMLDivElement>();
  const modeBand = useReveal<HTMLElement>();
  const startBand = useReveal<HTMLElement>();
  const doorBand = useReveal<HTMLElement>();

  /* WHERE THE PRODUCT OPENS.
     A reader whose answer is "the Race Explorer" should not have to pass
     through the front door every time, but they must never be trapped behind
     it either — pressing the wordmark has to bring them home. The redirect
     therefore happens once per tab, on arrival, and never again, so Home is
     always reachable by the control that says Home. */
  useEffect(() => {
    if (!ready || prefs.landing === "home") return;
    try {
      if (sessionStorage.getItem("pitwall-iq:opened")) return;
      sessionStorage.setItem("pitwall-iq:opened", "1");
    } catch { return; }        // private browsing: stay put rather than loop
    router.replace(prefs.landing === "explorer" ? "/explorer" : "/history");
  }, [ready, prefs.landing, router]);

  /* THE TOUR STARTS HERE, NOT IN THE MIDDLE OF A SESSION.
     It used to run inside the Race Explorer, which meant a first-time reader
     was taught the furniture of a screen before being told what the product
     was for. It now starts on the page that answers that, and walks outward
     from it — see TOUR in lib/tour.tsx.

     The wait is not decoration: the hero's own entrance runs for about a
     second, and a spotlight that lands on a control still animating into
     place points at where it used to be. */
  const { start } = useTour();
  useEffect(() => {
    if (!ready || prefs.onboarded || prefs.landing !== "home") return;
    const t = setTimeout(() => start(TOUR, "tour"), 1400);
    return () => clearTimeout(t);
  }, [ready, prefs.onboarded, prefs.landing, start]);

  // the choice panel exists until it has been answered, and then it does not.
  // It is NOT suppressed while the tour runs: hiding it would renumber the
  // chapters underneath the reader the moment the tour ended, and the tour's
  // own scrim already settles which of the two has their attention.
  const asking = ready && !prefs.pickedMode;

  function choose(m: Mode) {
    set("mode", m);
    set("pickedMode", true);
    setPicked(true);
  }

  // chapter numerals depend on how much of the page there is
  const n = (i: number) => String(asking || picked ? i : i - 1).padStart(2, "0");

  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* ---- 1. the shot ------------------------------------------------ */}
      {/* Full bleed. The race is not inside a card beside the words — it is the
          surface the words are printed on, and a single blurred pane between
          the two carries the focal falloff from the headline out to the sharp
          right-hand edge. */}
      <section className="relative isolate min-h-[74vh] overflow-hidden sm:min-h-[80vh]">
        <HeroField />

        <div className="relative mx-auto flex min-h-[74vh] max-w-7xl items-center px-4 py-16 sm:min-h-[80vh] sm:px-6">
          <div className="max-w-2xl">
            <p className="stagger-1 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.26em] text-accent-soft">
              <span className="h-px w-8 bg-accent-soft/60" />
              Formula 1 race intelligence
            </p>
            <h1 className="stagger-2 mt-5 text-[3.1rem] font-bold leading-[0.95] tracking-[-0.045em] sm:text-[5.2rem]">
              Every lap
              <br />
              tells a{" "}
              <span className="relative whitespace-nowrap text-accent">
                story
                <span aria-hidden className="absolute -inset-x-3 -inset-y-2 -z-10 rounded-3xl"
                  style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .22), transparent)" }} />
              </span>
              .
            </h1>
            {/* One sentence. The field behind it is already making the
                argument; a paragraph here only delays the buttons. */}
            <p className="stagger-3 mt-6 max-w-md text-[17.5px] leading-snug text-ink-muted">
              We read every lap of timing data and tell you what actually
              decided the Grand&nbsp;Prix.
            </p>
            <div className="stagger-4 mt-9 flex flex-wrap items-center gap-3">
              <Link href="/explorer" data-tour="cta"
                className="cta-glow pressable-glow group/cta inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-pure">
                Start exploring
                <ArrowRight size={16} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
              </Link>
              {/* The second control guides rather than competes — see ExploreCue. */}
              <ExploreCue />
            </div>
          </div>
        </div>

        {/* the fade into the next chapter, so the hero ends rather than stops */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(var(--base-950)))" }} />
      </section>

      {/* ---- 2. the scale ------------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScaleBand ref_={statBand.ref} className={statBand.className} />
      </section>

      {/* ---- 3. the choice, on a first visit only ----------------------- */}
      {/* tabIndex -1 so the hero's cue can hand focus here: a keyboard reader
          who presses "See how it works" must arrive, not just scroll. */}
      {(asking || picked) && (
        <section id="mode" tabIndex={-1} ref={modeBand.ref}
          className={cx("mx-auto max-w-7xl scroll-mt-16 px-4 pb-4 pt-20 outline-none sm:px-6 sm:pt-24",
            modeBand.className)}>
          <SectionHead n="02" chapter="Choose" title="Choose your experience"
            line="Two ways to read the same race. You decide your depth."
            aside={<span className="chip">Asked once — change it any time in Settings</span>} />

          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            <ModeCard
              id="simple" on={picked && prefs.mode === "simple"} onPick={choose}
              title="Simple" tag="Watch the race like a commentator"
              tint="var(--speed)"
              points={["Story-first insights", "Plain English", "No jargon"]}
              preview={<SimplePreview />} />
            <ModeCard
              id="advanced" on={picked && prefs.mode === "advanced"} onPick={choose}
              title="Advanced" tag="Think like a strategist"
              tint="var(--accent)"
              points={["Every metric", "Every stint", "Every decision"]}
              preview={<AdvancedPreview />} />
          </div>

          <div aria-live="polite"
            className={cx("mt-4 flex flex-wrap items-center gap-2 text-sm transition-all duration-[--dur-3] ease-[--ease-out]",
              picked ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
            <Check size={15} className="text-emerald-400" />
            <span className="text-ink-muted">
              Saved. Every page will use {prefs.mode === "simple" ? "Simple" : "Advanced"} from now
              on, and we won&rsquo;t ask again.
            </span>
            <Link href="/explorer"
              className="inline-flex items-center gap-1 font-semibold text-accent-soft transition-colors hover:text-accent">
              Start reading <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {/* ---- 4. the way in ---------------------------------------------- */}
      <section ref={startBand.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", startBand.className)}>
        <SectionHead n={n(3)} chapter="Start" title="Quick start"
          line="Thirty seconds to get comfortable." />
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Step n={1} tint="var(--accent)" title="Read a race"
            line="The story, the key moments and the turning point." />
          <Step n={2} tint="var(--speed)" title="Compare drivers"
            line="Head-to-head pace, stints and race impact." />
          <Step n={3} tint="var(--amber)" title="Ask any question"
            line="Answered from the real lap data, not a template." />
        </div>
        {/* "Show me" is the reader's next thought once the three steps have
            said what the product does. It is answered here, quietly. */}
        <div className="mt-5">
          <SampleStory />
        </div>
      </section>

      <section ref={doorBand.ref}
        className={cx("mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-24", doorBand.className)}>
        <SectionHead n={n(4)} chapter="Enter" title="Three ways in"
          line="Pick the one that matches the question you arrived with." />
        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <Door href="/explorer" icon={<Timer size={16} />} title="Read a race"
            line="Story, strategy, pace and tyres for any session."
            art={<ArtRace />} />
          <Door href="/explorer?tab=ask" icon={<MessageSquareText size={16} />} title="Ask a question"
            line="“Why did Leclerc lose places?” — answered from the data."
            art={<ArtAsk />} />
          <Door href="/history" icon={<Trophy size={16} />} title="Look something up"
            line="Official results and standings, 1950 to today."
            art={<ArtArchive />} />
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * The chapter marker.
 *
 * One component so every section below the hero shares a rhythm: a hairline, a
 * numeral, the chapter word, then the heading. The numeral is the cheapest
 * possible progress indicator — it costs no chrome and tells the reader where
 * they are in the argument.
 */
function SectionHead({ n, chapter, title, line, aside }: {
  n: string; chapter: string; title: string; line: string; aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
          <span className="font-mono text-accent-soft">{n}</span>
          <span className="h-px w-6 bg-white/[0.14]" />
          {chapter}
        </p>
        <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">{title}</h2>
        <p className="mt-1.5 max-w-xl text-[14.5px] text-ink-muted">{line}</p>
      </div>
      {aside}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * The credibility paragraph, without the paragraph.
 *
 * EVERY FIGURE HERE IS DERIVED. They used to be literals — "2026 · Season",
 * "24 · Races", "500+ · Drivers" — and two of the three were the wrong KIND of
 * statistic before they were the wrong number. "2026 · Season" is not a claim
 * about this product; it is the date, and a reader deciding whether to trust
 * an archive learns nothing from being told what year it is.
 *
 * These answer what the band is actually being asked. How much is in here? How
 * far back does it go? Is it current? And the last two state the thing that
 * separates this from a results table: nothing is sampled, and it is read live.
 *
 * The numbers come from /api/archive/scale, which counts them — see
 * backend/app/archive_scale.py. If the backend is unreachable the band falls
 * back to the one figure a calendar alone can prove rather than to a
 * plausible-looking guess. A flourish may fail to no flourish; it may never
 * make the product wrong.
 */
function ScaleBand({ ref_, className }: {
  ref_: React.Ref<HTMLDivElement>; className: string;
}) {
  const [scale, setScale] = useState<ArchiveScale | null>(null);
  const [failed, setFailed] = useState(false);
  const { num } = useLocale();

  useEffect(() => {
    let alive = true;
    api.archiveScale()
      .then((s) => { if (alive) setScale(s); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const year = new Date().getFullYear();

  return (
    <div ref={ref_}
      className={cx("flex flex-wrap items-center gap-x-9 gap-y-5 border-b border-white/[0.06] pb-8",
        className)}>
      {scale ? (
        <>
          <Stat icon={<Trophy size={15} />} value={scale.races} label="Grands Prix analysed"
            format={num} />
          <Stat icon={<Timer size={15} />} value={scale.seasons} label="Seasons covered"
            note={`${scale.first_season}–${scale.season}`} />
          <Stat icon={<Flag size={15} />} value={scale.season_races}
            label={`Races in ${scale.season}`} />
        </>
      ) : failed ? (
        <Stat icon={<Timer size={15} />} value={year - 1949} label="Seasons covered"
          note={`1950–${year}`} />
      ) : (
        <StatSkeletons />
      )}

      <Stat icon={<Gauge size={15} />} literal="Every lap" label="Read, never sampled" />
      <Stat icon={<LineChart size={15} />} literal="Live" label="Timing · strategy · tyres" />
    </div>
  );
}

function StatSkeletons() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex items-center gap-2.5" aria-hidden>
          <span className="h-4 w-4 rounded bg-white/[0.06]" />
          <span>
            <span className="block h-[19px] w-16 rounded bg-white/[0.06]" />
            <span className="mt-1.5 block h-[9px] w-24 rounded bg-white/[0.04]" />
          </span>
        </span>
      ))}
    </>
  );
}

/** A figure that arrives rather than appears. */
function Stat({ icon, value, label, note, literal, format }: {
  icon: React.ReactNode; label: string;
  value?: number; note?: string; literal?: string;
  format?: (n: number) => string;
}) {
  const { ref, value: shown } = useCountUp(value ?? 0);
  return (
    <span className="ic-host flex items-center gap-2.5">
      <span className="text-ink-faint">{icon}</span>
      <span>
        <span ref={ref}
          className="flex items-baseline gap-1.5 text-[19px] font-bold leading-none tracking-tight tabular-nums text-ink">
          {literal ?? (format ? format(shown) : shown.toLocaleString())}
          {note && <em className="text-[11px] font-medium not-italic text-ink-faint">{note}</em>}
        </span>
        <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </span>
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
function ModeCard({
  id, on, onPick, title, tag, tint, points, preview,
}: {
  id: Mode; on: boolean; onPick: (m: Mode) => void;
  title: string; tag: string; tint: string; points: string[]; preview: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => onPick(id)} aria-pressed={on}
      data-on={on ? "true" : "false"}
      className={cx(
        "mode-card group/mode relative overflow-hidden rounded-2xl border p-5 text-left sm:p-6",
        "transition-all duration-[--dur-3] ease-[--ease-out]",
        on ? "-translate-y-0.5" : "hover:-translate-y-1")}
      // `--pick` carries the card's own colour into the stylesheet so the
      // chosen-state shadow can be tuned per theme — a bloom that reads as
      // light on black reads as spilled paint on white.
      style={{
        ["--pick" as string]: tint,
        borderColor: on ? `rgb(${tint} / .5)` : "rgb(var(--tint) / .07)",
        background: `linear-gradient(155deg, rgb(${tint} / ${on ? ".10" : ".045"}), rgb(var(--base-900) / .8) 58%)`,
      }}>
      {/* the light in the card's own colour, brightening as you reach for it */}
      <span aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full transition-opacity duration-[--dur-4]"
        style={{
          background: `radial-gradient(closest-side, rgb(${tint} / .3), transparent)`,
          opacity: on ? 0.9 : 0.35,
        }} />

      <span className="relative flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-[--dur-3] ease-[--ease-spring] group-hover/mode:scale-110"
          style={{ background: `rgb(${tint} / .16)`, color: `rgb(${tint})` }}>
          <Sparkles size={17} />
        </span>
        <span className="text-[22px] font-bold tracking-tight text-ink">{title}</span>
        <span className={cx("ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-[--dur-3] ease-[--ease-spring]",
          on ? "scale-100 text-pure" : "scale-90 border-white/15 text-transparent")}
          style={on ? { background: `rgb(${tint})`, borderColor: `rgb(${tint})` } : undefined}>
          <Check size={13} strokeWidth={3} />
        </span>
      </span>

      <span className="relative mt-3 block text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: `rgb(${tint})` }}>
        {tag}
      </span>

      <ul className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="h-1 w-1 rounded-full" style={{ background: `rgb(${tint})` }} />{p}
          </li>
        ))}
      </ul>

      {/* the actual panel this mode produces — the argument, shown */}
      <span className="relative mt-5 block overflow-hidden rounded-xl border border-white/[0.07] bg-base-950/75 p-3.5">
        {preview}
      </span>
    </button>
  );
}

function SimplePreview() {
  return (
    <span className="block">
      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-speed">
        The race in a line
      </span>
      <span className="mt-2 block text-[15.5px] font-semibold leading-snug text-ink">
        “Norris wins a dramatic race in mixed conditions.”
      </span>
      <span className="mt-3.5 flex items-end gap-6">
        <span className="block">
          <span className="block text-[10px] uppercase tracking-wider text-ink-faint">Turning point</span>
          <span className="block text-[13px] font-bold text-ink">Virtual Safety Car</span>
        </span>
        <span className="block">
          <span className="block text-[10px] uppercase tracking-wider text-ink-faint">Laps</span>
          <span className="block text-[13px] font-bold tabular-nums text-ink">54–57</span>
        </span>
      </span>
    </span>
  );
}

function AdvancedPreview() {
  const ROWS = [
    { code: "NOR", c: "#FF8000", pace: "1:24.490", d: "—", w: 100 },
    { code: "PIA", c: "#FF8000", pace: "1:24.730", d: "+0.240", w: 74 },
    { code: "ANT", c: "#27F4D2", pace: "1:24.902", d: "+0.412", w: 55 },
  ];
  return (
    <span className="block">
      <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent-soft">
        Clean-air pace
        <span className="ml-auto font-normal normal-case tracking-normal text-ink-faint">
          fuel &amp; tyre corrected
        </span>
      </span>
      <span className="mt-2.5 block space-y-2">
        {ROWS.map((r) => (
          <span key={r.code} className="flex items-center gap-2.5">
            <span className="w-9 shrink-0 text-[11.5px] font-bold tabular-nums" style={{ color: r.c }}>
              {r.code}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <span className="block h-full rounded-full"
                style={{ width: `${r.w}%`, background: `linear-gradient(90deg, ${r.c}55, ${r.c})` }} />
            </span>
            <span className="w-[4.2rem] shrink-0 text-right text-[11px] tabular-nums text-ink-muted">{r.pace}</span>
            <span className="w-[3.1rem] shrink-0 text-right text-[11px] tabular-nums text-ink-faint">{r.d}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * A step in a sequence.
 *
 * These used to carry small chart doodles in the corner. Two of the three were
 * grey bars on a dark card, which is the universal picture of content that has
 * not loaded yet — a landing page cannot afford to look like it is still
 * fetching. The artwork has moved to the doors, where it can be large enough to
 * say something, and a step now looks like what it is: an ordered instruction,
 * with an oversized ghost numeral doing the decorative work and a tint that
 * tells the three apart at a glance.
 */
function Step({ n, title, line, tint }: {
  n: number; title: string; line: string; tint: string;
}) {
  return (
    <div className="panel group/step relative flex items-start gap-3 overflow-hidden p-4 sm:p-5">
      <span aria-hidden
        className="ghost-num pointer-events-none absolute -bottom-7 -right-2 select-none font-mono text-[104px] font-bold leading-none tracking-tighter transition-transform duration-[--dur-4] ease-[--ease-out] group-hover/step:-translate-y-1"
        style={{ ["--gn" as string]: tint }}>
        {n}
      </span>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-bold tabular-nums"
        style={{ background: `rgb(${tint} / .14)`, color: `rgb(${tint})` }}>
        {n}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block max-w-[16rem] text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * A door, with a window in it.
 *
 * These were three identical icon-and-two-lines rows, which told the reader
 * nothing about how the three destinations differ — the icon was decoration
 * standing in for information. Each now carries a small true picture of what
 * is on the other side.
 *
 * AND THE PICTURES ARE NEVER STILL.
 *
 * A card that only moves once you touch it has to be discovered before it can
 * invite; a card that is quietly working when you arrive has already said it
 * is a live thing. Every window carries one slow ambient loop — traces that
 * drift, indicators that pulse, a scan that passes — pitched low enough that
 * three of them side by side never compete with the copy. Hovering does not
 * start the motion, it raises it, which is the difference between a card
 * waking up and a card switching on. See `.art-*` in globals.css.
 */
function Door({ href, icon, title, line, art }: {
  href: string; icon: React.ReactNode; title: string; line: string; art: React.ReactNode;
}) {
  return (
    <Link href={href} className="group/door pressable panel art-host relative flex flex-col overflow-hidden">
      <span className="relative block h-[112px] overflow-hidden border-b border-white/[0.06] bg-base-950/50">
        <span aria-hidden
          className="absolute inset-0 transition-transform duration-[--dur-4] ease-[--ease-out] group-hover/door:scale-[1.04]">
          {art}
        </span>
        {/* the pass that says the window is a display rather than a picture */}
        <span aria-hidden className="art-scan pointer-events-none absolute inset-y-0 w-20" />
        {/* the artwork sits behind the card's own light, so it recedes */}
        <span aria-hidden className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 45%, rgb(var(--base-900) / .55))" }} />
      </span>
      <span className="flex items-start gap-3 p-4">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-soft transition-transform duration-[--dur-3] ease-[--ease-spring] group-hover/door:scale-110">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
            {title}
            <ArrowRight size={13}
              className="text-ink-faint transition-transform duration-[--dur-2] group-hover/door:translate-x-0.5 group-hover/door:text-accent-soft" />
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
        </span>
      </span>
    </Link>
  );
}

/* The three windows. Drawn at a fixed viewBox and stretched, so they fill the
   band at any column width without a media query. */
const ART = "h-full w-full";

function ArtRace() {
  const LINES = [
    { d: "M0 46 C 40 44, 70 18, 110 22 S 180 40, 240 14", c: "rgb(var(--accent))", o: 0.95 },
    { d: "M0 30 C 44 32, 72 52, 116 50 S 182 24, 240 30", c: "rgb(var(--speed))", o: 0.8 },
    { d: "M0 62 C 46 58, 78 66, 120 62 S 186 70, 240 58", c: "rgb(var(--best))", o: 0.6 },
    { d: "M0 76 C 50 80, 84 74, 128 78 S 190 86, 240 74", c: "rgb(var(--amber))", o: 0.45 },
  ];
  return (
    <svg className={ART} viewBox="0 0 240 100" preserveAspectRatio="none" fill="none" aria-hidden>
      {LINES.map((l, i) => (
        <path key={l.d} d={l.d} stroke={l.c} strokeWidth="2" strokeLinecap="round"
          opacity={l.o} vectorEffect="non-scaling-stroke"
          className="art-drift" style={{ ["--i" as string]: i }} />
      ))}
      {/* the crossing point is the only thing in a position chart worth marking */}
      <circle cx="110" cy="22" r="3" fill="rgb(var(--accent))" />
      <circle cx="110" cy="22" r="7" fill="rgb(var(--accent))" opacity="0.18" className="art-halo" />
    </svg>
  );
}

/**
 * Three pieces of evidence converging on one answer.
 *
 * The first draft of this was a stack of grey bars, which is indistinguishable
 * from a loading skeleton — and a skeleton is the one thing a landing page must
 * never look like. This draws the product's actual claim instead: separate
 * measurements, each in its own colour, resolving into a single conclusion,
 * each arriving on its own beat.
 */
function ArtAsk() {
  const FEEDS = [
    { y: 24, c: "rgb(var(--accent))" },
    { y: 50, c: "rgb(var(--speed))" },
    { y: 76, c: "rgb(var(--amber))" },
  ];
  return (
    <svg className={ART} viewBox="0 0 240 100" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden>
      {FEEDS.map((f, i) => (
        <g key={f.y}>
          <circle cx="26" cy={f.y} r="4.5" fill={f.c} opacity="0.9"
            className="art-blink" style={{ ["--i" as string]: i }} />
          <path d={`M34 ${f.y} C 74 ${f.y}, 106 50, 146 50`} stroke={f.c} strokeWidth="1.6"
            opacity="0.55" strokeLinecap="round"
            className="art-feed" style={{ ["--i" as string]: i }} />
        </g>
      ))}
      {/* the answer they arrive at */}
      <circle cx="158" cy="50" r="19" fill="rgb(var(--accent))" opacity="0.12" className="art-halo" />
      <circle cx="158" cy="50" r="11" fill="rgb(var(--accent))" opacity="0.22" />
      <circle cx="158" cy="50" r="5" fill="rgb(var(--accent))" />
      <path d="M177 50 H 214" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinecap="round"
        opacity="0.75" />
      <path d="M206 44 L 214 50 L 206 56" stroke="rgb(var(--accent))" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}

/**
 * The seasons, and a podium at the end of them.
 *
 * Same reasoning as above: a fake results table drawn in grey reads as a table
 * that failed to load. A podium is legible in a quarter of a second and cannot
 * be mistaken for anything else. The seasons behind it come up one at a time,
 * which is what an archive being read looks like.
 */
function ArtArchive() {
  const STEPS = [
    { x: 96, w: 36, h: 30, c: "rgb(var(--speed))", o: 0.55 },   // 2nd
    { x: 136, w: 36, h: 46, c: "rgb(var(--accent))", o: 0.95 }, // 1st
    { x: 176, w: 36, h: 20, c: "rgb(var(--amber))", o: 0.6 },   // 3rd
  ];
  return (
    <svg className={ART} viewBox="0 0 240 100" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden>
      {/* the seasons stretching back behind it, thinning as they recede */}
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={16 + i * 5.5} y={78 - (4 + i * 1.6)} width="2.5" height={4 + i * 1.6} rx="1.25"
          fill="rgb(var(--tint))" opacity={0.07 + i * 0.013}
          className="art-tick" style={{ ["--i" as string]: i }} />
      ))}
      {STEPS.map((s) => (
        <g key={s.x}>
          <rect x={s.x} y={78 - s.h} width={s.w} height={s.h} rx="4" fill={s.c} opacity={s.o * 0.16} />
          <rect x={s.x} y={78 - s.h} width={s.w} height="2.5" rx="1.25" fill={s.c} opacity={s.o} />
        </g>
      ))}
      {/* the winner, standing on the top step rather than floating above it */}
      <circle cx="154" cy="24" r="4.5" fill="rgb(var(--accent))" />
      <path d="M147 32 C 147 27, 161 27, 161 32 Z" fill="rgb(var(--accent))" />
      <line x1="16" y1="79.25" x2="224" y2="79.25" stroke="rgb(var(--tint))" strokeWidth="1.5"
        opacity="0.16" />
    </svg>
  );
}
