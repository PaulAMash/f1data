"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquareText, Timer, Trophy } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { HeroField } from "@/components/landing/HeroField";
import { FeaturedRace } from "@/components/landing/FeaturedRace";
import { Flag, Gauge, LineChart } from "@/components/ui/MotionIcon";
import { usePrefs } from "@/lib/prefs";
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
/*   THE SHOT     a Grand Prix drawn as light, full bleed, with the type       */
/*                printed on it rather than beside it, and ONE control.        */
/*   THE SCALE    figures that prove the archive is real.                      */
/*   01 READ      the most recent Grand Prix, already analysed.                */
/*   02 ENTER     three doors, each carrying a picture of what is behind it.   */
/*                                                                            */
/* HIERARCHY IS NUMBERED, NOT GUESSED — and the numbering starts at 01.        */
/* It used to start at 02, because the chapters had been renumbered when the   */
/* experience-choice band moved to its own screen and nothing was renumbered   */
/* back. A reader who notices there is no 01 has found a seam, and a seam on   */
/* the front page is worse than the ordering being useful.                     */
/*                                                                            */
/* The hero and the statistics band are deliberately NOT numbered. They are    */
/* not chapters in the argument; they are the cover.                            */
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
  const { prefs, ready } = usePrefs();
  const router = useRouter();
  const statBand = useReveal<HTMLDivElement>();
  const featureBand = useReveal<HTMLElement>();
  const doorBand = useReveal<HTMLElement>();
  const { start } = useTour();

  /* THE CHOICE HAPPENS BEFORE THIS PAGE, NOT ON IT.
     "Choose your experience" used to be a band a screen and a half down here,
     which put the first decision the product asks for underneath a headline,
     five statistics and a scroll. It is a screen of its own now — see
     app/welcome — and this page is what a reader arrives at once they have
     answered. Anyone who has not is sent there; `replace`, so Back from the
     welcome screen cannot land them in a page they have not qualified for. */
  useEffect(() => {
    if (ready && !prefs.pickedMode) router.replace("/welcome");
  }, [ready, prefs.pickedMode, router]);

  /* WHERE THE PRODUCT OPENS.
     A reader whose answer is "the Race Explorer" should not have to pass
     through the front door every time, but they must never be trapped behind
     it either — pressing Home has to bring them home. The redirect therefore
     happens once per tab, on arrival, and never again. */
  useEffect(() => {
    if (!ready || prefs.landing === "home" || !prefs.pickedMode) return;
    try {
      if (sessionStorage.getItem("pitwall-iq:opened")) return;
      sessionStorage.setItem("pitwall-iq:opened", "1");
    } catch { return; }        // private browsing: stay put rather than loop
    router.replace(prefs.landing === "explorer" ? "/explorer" : "/history");
  }, [ready, prefs.landing, prefs.pickedMode, router]);

  /* THE TOUR STARTS WHEN THE READER SAYS SO.
     It used to open itself a second and a half after the page loaded, which
     takes the page away from somebody who has not finished looking at it —
     and the first thing a landing page has to be allowed to do is be looked
     at. Pressing the primary control is an unambiguous "I am ready to begin",
     so that is where it begins. A reader who has already been taught skips
     straight through to the Explorer, which is where the tour ends anyway. */
  function begin(e: React.MouseEvent) {
    if (!ready || prefs.onboarded) return;      // let the link do its job
    e.preventDefault();
    start(TOUR, "tour");
  }

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
            {/* ONE CONTROL.
                The hero has had a second button in every version and it has
                never earned its place: first a question about one driver in
                one race, then a scroll dressed as an answer, then a
                demonstration that duplicated the tour the primary control
                already starts. Three attempts at a job that does not exist is
                the answer — a hero that knows what it wants the reader to do
                should ask for exactly that, once, and get out of the way. What
                is below the fold is one scroll away and does not need a
                button to announce it. */}
            {/* NOTHING HAPPENS TO A READER WHO ARRIVES HERE.
                Not a modal, not a popup, and — deliberately — not a highlight
                on this control either. An earlier version put a pill above it
                and a breathing ring around it to announce that a tour was
                waiting; well meant, and still wrong. This page has one job,
                which is to be looked at, and a page decorated differently
                depending on an answer given on a previous screen is a page
                apologising for itself.

                So the home page is identical whether a tour is armed or not.
                The tour is a consequence of pressing the control, not an
                advertisement wrapped around it — see `begin` above. */}
            <div className="stagger-4 mt-9 flex flex-wrap items-center gap-4">
              <Link href="/explorer" data-tour="cta" onClick={begin}
                className="cta-glow pressable-glow group/cta inline-flex items-center gap-2 rounded-xl px-7 py-4 text-[15px] font-semibold text-pure">
                Start exploring
                <ArrowRight size={17} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
              </Link>
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

      {/* ---- 3. a real race, right now ----------------------------------- */}
      <section ref={featureBand.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", featureBand.className)}>
        <SectionHead n="01" chapter="Read" title="Start with the last one"
          line="The most recent Grand Prix, already analysed." />
        <div className="mt-7">
          <FeaturedRace />
        </div>
      </section>

      {/* ---- 4. the way in ---------------------------------------------- */}
      <section ref={doorBand.ref}
        className={cx("mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-24", doorBand.className)}>
        <SectionHead n="02" chapter="Enter" title="Three ways in"
          line="Pick the one that matches the question you arrived with." />
        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <Door href="/explorer" icon={<Timer size={16} />} title="Read a race"
            line="Story, strategy, pace and tyres for any session."
            art={<ArtRace />} tint="var(--accent)" />
          <Door href="/explorer?tab=ask" icon={<MessageSquareText size={16} />} title="Ask a question"
            line="“Why did Leclerc lose places?” — answered from the data."
            art={<ArtAsk />} tint="var(--speed)" />
          <Door href="/history" icon={<Trophy size={16} />} title="Look something up"
            line="Official results and standings, 1950 to today."
            art={<ArtArchive />} tint="var(--amber)" />
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
      .then((sc) => { if (alive) setScale(sc); })
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
/**
 * A door, with a window in it.
 *
 * These were three identical icon-and-two-lines rows, then three flat SVGs, and
 * both readings were the same problem: the window looked like clip art beside a
 * hero that looks like a render. The gap between the two was the most obvious
 * unfinished thing on the page.
 *
 * A window is now built the way the hero is — as a lit room rather than as a
 * drawing on a card:
 *
 *   1. a LAMP in the door's own colour, behind everything and off-centre
 *   2. a GRID at three per cent, so the space has a floor
 *   3. a BLOOM of the artwork — the same picture, blurred and brightened, sat
 *      underneath the crisp one, which is the whole difference between a shape
 *      that is coloured and a shape that is emitting
 *   4. the ARTWORK, the only layer carrying information
 *   5. a SWEEP that crosses on a slow loop, and a VIGNETTE that closes the box
 *
 * Everything moves at rest and moves faster on hover — waking up rather than
 * switching on. All of it is transform, opacity and a filter on composited
 * layers, so three of these beside a canvas hero cost the compositor and
 * nothing else.
 */
function Door({ href, icon, title, line, art, tint }: {
  href: string; icon: React.ReactNode; title: string; line: string;
  art: React.ReactNode; tint: string;
}) {
  return (
    <Link href={href}
      className="group/door pressable panel art-host relative flex flex-col overflow-hidden"
      style={{ ["--door" as string]: tint }}>
      <span className="relative block h-[132px] overflow-hidden border-b border-white/[0.06] bg-base-950/60">
        <span aria-hidden className="door-lamp pointer-events-none absolute inset-0" />
        <span aria-hidden className="door-grid pointer-events-none absolute inset-0" />
        <span aria-hidden
          className="door-bloom pointer-events-none absolute inset-0 transition-transform duration-[--dur-4] ease-[--ease-out] group-hover/door:scale-[1.05]">
          {art}
        </span>
        <span aria-hidden
          className="absolute inset-0 transition-transform duration-[--dur-4] ease-[--ease-out] group-hover/door:scale-[1.05]">
          {art}
        </span>
        <span aria-hidden className="art-scan pointer-events-none absolute inset-y-0 w-20" />
        <span aria-hidden className="door-vignette pointer-events-none absolute inset-0" />
      </span>

      <span className="flex items-start gap-3 p-4">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-[--dur-3] ease-[--ease-spring] group-hover/door:scale-110"
          style={{ background: `rgb(${tint} / .13)`, color: `rgb(${tint})` }}>
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

/**
 * Position traces crossing.
 *
 * The same picture the Race Explorer draws and the same one the hero draws:
 * four cars, and the moment two of them swap. The marker sits on the crossing
 * because that is the only point in a position chart worth marking.
 */
function ArtRace() {
  const LINES = [
    { d: "M0 46 C 40 44, 70 18, 110 22 S 180 40, 240 14", c: "rgb(var(--accent))", o: 0.95, w: 2.2 },
    { d: "M0 30 C 44 32, 72 52, 116 50 S 182 24, 240 30", c: "rgb(var(--speed))", o: 0.8, w: 2 },
    { d: "M0 62 C 46 58, 78 66, 120 62 S 186 70, 240 58", c: "rgb(var(--best))", o: 0.55, w: 1.8 },
    { d: "M0 76 C 50 80, 84 74, 128 78 S 190 86, 240 74", c: "rgb(var(--amber))", o: 0.4, w: 1.6 },
  ];
  return (
    <svg className={ART} viewBox="0 0 240 100" preserveAspectRatio="none" fill="none" aria-hidden>
      {LINES.map((l, i) => (
        <path key={l.d} d={l.d} stroke={l.c} strokeWidth={l.w} strokeLinecap="round"
          opacity={l.o} vectorEffect="non-scaling-stroke"
          className="art-drift" style={{ ["--i" as string]: i }} />
      ))}
      <circle cx="110" cy="22" r="7" fill="rgb(var(--accent))" opacity="0.18" className="art-halo" />
      <circle cx="110" cy="22" r="2.8" fill="rgb(var(--accent))" />
    </svg>
  );
}

/**
 * Three pieces of evidence converging on one answer.
 *
 * A stack of grey bars was the first draft, which is indistinguishable from a
 * loading skeleton — the one thing a landing page must never look like. This
 * draws the product's actual claim: separate measurements, each in its own
 * colour, each arriving on its own beat, resolving into a single conclusion.
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
          {/* the route, then the packet travelling along it */}
          <path d={`M34 ${f.y} C 74 ${f.y}, 106 50, 146 50`} stroke={f.c} strokeWidth="1.4"
            opacity="0.16" strokeLinecap="round" />
          <path d={`M34 ${f.y} C 74 ${f.y}, 106 50, 146 50`} stroke={f.c} strokeWidth="1.8"
            opacity="0.7" strokeLinecap="round"
            className="art-feed" style={{ ["--i" as string]: i }} />
          <circle cx="26" cy={f.y} r="4" fill={f.c} opacity="0.9"
            className="art-blink" style={{ ["--i" as string]: i }} />
        </g>
      ))}
      <circle cx="158" cy="50" r="19" fill="rgb(var(--accent))" opacity="0.12" className="art-halo" />
      <circle cx="158" cy="50" r="11" fill="rgb(var(--accent))" opacity="0.22" />
      <circle cx="158" cy="50" r="5" fill="rgb(var(--accent))" />
      <path d="M177 50 H 212" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeLinecap="round"
        opacity="0.7" />
      <path d="M204 44.5 L 212 50 L 204 55.5" stroke="rgb(var(--accent))" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

/**
 * The seasons, and a podium at the end of them.
 *
 * Same reasoning: a fake results table drawn in grey reads as a table that
 * failed to load. A podium is legible in a quarter of a second and cannot be
 * mistaken for anything else. The seasons behind it light one at a time, which
 * is what an archive being read looks like.
 */
function ArtArchive() {
  const STEPS = [
    { x: 96, w: 36, h: 30, c: "rgb(var(--speed))", o: 0.55 },   // 2nd
    { x: 136, w: 36, h: 46, c: "rgb(var(--accent))", o: 0.95 }, // 1st
    { x: 176, w: 36, h: 20, c: "rgb(var(--amber))", o: 0.6 },   // 3rd
  ];
  return (
    <svg className={ART} viewBox="0 0 240 100" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden>
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
      <circle cx="154" cy="24" r="4.5" fill="rgb(var(--accent))" />
      <path d="M147 32 C 147 27, 161 27, 161 32 Z" fill="rgb(var(--accent))" />
      <line x1="16" y1="79.25" x2="224" y2="79.25" stroke="rgb(var(--tint))" strokeWidth="1.5"
        opacity="0.16" />
    </svg>
  );
}
