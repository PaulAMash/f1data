"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Clock3, Flag, GitCompare, LineChart,
  MessageCircleQuestion, Radar, ShieldCheck, Sparkles, Timer,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { BetaTag } from "@/components/ui/BetaTag";
import { useReveal } from "@/lib/useReveal";
import { trackPageView } from "@/lib/analytics";
import { cx } from "@/lib/format";

/* ==========================================================================
   THE APP STORE MARKETING PAGE.

   This is the URL the App Store listing points at, which makes it the one
   page in the product read by people who have never seen it — so it argues
   the whole thesis from nothing, in the product's own voice, and every claim
   on it is one the software actually keeps.

   TWO HONESTY CONSTRAINTS SHAPED THE DESIGN, and they are worth stating
   because they are easy to erode later:

   1. THERE IS NO APP STORE LINK YET, so there is no button pretending to be
      one. The call to action says the iPhone app is in preparation and sends
      the reader to the thing that does exist today — the web app. A dead
      "Download" button on the page the App Store links to is the worst
      possible first impression, and inventing a URL is worse.

   2. THERE ARE NO IOS SCREENSHOTS IN THIS REPOSITORY (checked: no .png
      outside public/drivers and public/teams, no Swift, no Xcode project).
      So nothing here is presented as a screen capture. The device below is
      drawn from this product's own tokens and components, and what it shows
      is STRUCTURE — a position trace with unlabelled lines, real compound
      colours, the app's own section names. It asserts no lap time, no
      driver and no result, because a marketing page that invents a race
      result is a marketing page that lies about Formula 1. When real
      captures exist they replace `AppCanvas` and nothing else moves.
   ========================================================================== */

/** The web product, which is what a reader can actually use today. */
const WEB_HREF = "/explorer";

export default function AppMarketingPage() {
  useEffect(() => { trackPageView("/app"); }, []);

  const why = useReveal<HTMLElement>();
  const does = useReveal<HTMLElement>();
  const trust = useReveal<HTMLElement>();
  const close = useReveal<HTMLElement>();

  return (
    <div className="min-h-screen">
      <NavBar />

      {/* ---- 1. the device ------------------------------------------------
          The landing page's hero belongs to the race — a full-bleed animated
          field with the words printed on it. This one belongs to the phone,
          so the ambient treatment stays quiet and the device is the only
          bright object on the screen. Same tokens, different subject. */}
      <section className="relative isolate overflow-hidden">
        <AmbientField />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[1.05fr_auto] lg:gap-16 lg:pt-20">
          <div className="max-w-xl">
            <p className="stagger-1 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.26em] text-accent-soft">
              <span className="h-px w-8 bg-accent-soft/60" />
              Pitwall IQ for iPhone
            </p>

            {/* The product's own sentence, from the footer it has carried for
                thirty versions. A marketing page is the wrong place to invent
                a new promise. */}
            <h1 className="stagger-2 mt-5 text-[2.9rem] font-bold leading-[0.98] tracking-[-0.045em] sm:text-[4.2rem]">
              Know why,
              <br />
              not just{" "}
              <span className="relative whitespace-nowrap text-accent">
                who
                <span aria-hidden className="absolute -inset-x-3 -inset-y-2 -z-10 rounded-3xl"
                  style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .22), transparent)" }} />
              </span>
              .
            </h1>

            <p className="stagger-3 mt-6 max-w-md text-[17px] leading-snug text-ink-muted">
              Pitwall IQ reads every lap of a Grand Prix and tells you what
              actually decided it — the strategy, the tyres and the real pace
              behind the finishing order.
            </p>

            <div className="stagger-4 mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
              {/* NOT A BUTTON, because there is nowhere for it to go yet. It
                  is a status, and it is styled as one: no press affordance,
                  no hover lift, nothing that invites a tap it cannot answer. */}
              <span className="inline-flex items-center gap-2.5 rounded-xl border border-accent/25 bg-accent/[0.08] px-5 py-3.5 text-[14.5px] font-semibold text-ink">
                <Sparkles size={16} className="shrink-0 text-accent-soft" />
                Coming to the App Store
              </span>
              <Link href={WEB_HREF}
                className="group/web inline-flex items-center gap-2 text-[14.5px] font-medium text-ink-muted transition-colors hover:text-ink">
                Use it on the web today
                <ArrowRight size={15} className="transition-transform duration-[--dur-2] group-hover/web:translate-x-0.5" />
              </Link>
            </div>

            <p className="stagger-4 mt-4 text-[12.5px] leading-relaxed text-ink-faint">
              The iPhone app is in preparation for review. Everything below it
              works today at{" "}
              <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-ink-muted">pitwalliq.com</Link>.
            </p>
          </div>

          <div className="stagger-4 justify-self-center lg:justify-self-end">
            <Phone />
          </div>
        </div>

        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(var(--base-950)))" }} />
      </section>

      {/* ---- 2. the argument ---------------------------------------------
          The one section that explains why this product exists rather than
          what it contains. Everything else on the page is a list. */}
      <section ref={why.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", why.className)}>
        <SectionHead n="01" chapter="Why" title="A timing sheet is not an explanation"
          line="Every F1 app can tell you who finished where. The interesting question is the one underneath it." />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Panel
            kicker="What the data says"
            tone="raw"
            title="P4, and a median lap of 1:32.8"
            body="Raw lap times flatter whoever had clear air and a light car, and
                  penalise whoever spent the afternoon managing a lead in traffic.
                  Read literally, the timing sheet ranks circumstances."
          />
          <Panel
            kicker="What Pitwall IQ says"
            tone="read"
            title="Quicker than the two cars that beat him"
            body="We estimate the field's fuel burn and each compound's offset, then
                  normalise every clean-air lap to the same tyre at the same fuel
                  load. What is left is car speed — which is how a driver who was
                  genuinely fast can rank above the people who finished ahead of him."
          />
        </div>

        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          <Claim icon={<Flag size={15} />} title="It names the moment"
            line="Turning points, undercuts that worked, cheap stops under a safety car, and the calls that cost a position." />
          <Claim icon={<ShieldCheck size={15} />} title="It shows its working"
            line="Every finding carries the evidence it came from, and every number carries the source that produced it." />
          <Claim icon={<Radar size={15} />} title="It says when it cannot"
            line="Where the archive is thin, the app says so plainly instead of filling the gap with something plausible." />
        </ul>
      </section>

      {/* ---- 3. what it does ---------------------------------------------- */}
      <section ref={does.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", does.className)}>
        <SectionHead n="02" chapter="Explore" title="Eight ways into one Grand Prix"
          line="Pick a season, a race and a session. Everything below is built from that one session's data." />

        {/* Eight cards: two, four, and — on a wide screen — four across, so the
            grid always closes on a full row rather than leaving one orphan. */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cap icon={<Flag size={15} />} title="Race story"
            line="A plain-English account of how the Grand Prix was won and lost, answer first."
            art={<ArtStory />} />
          <Cap icon={<Timer size={15} />} title="Strategy"
            line="Undercuts and overcuts, pit windows, neutralisation periods and the decisive calls."
            art={<ArtStrategy />} />
          <Cap icon={<BarChart3 size={15} />} title="Tyres"
            line="A lap-accurate stint timeline with compounds, tyre age and how each set fell away."
            art={<ArtTyres />} />
          <Cap icon={<LineChart size={15} />} title="Pace"
            line="Fuel- and tyre-corrected clean-air pace, consistency, traffic and constructor ranking."
            art={<ArtPace />} />
          <Cap icon={<Radar size={15} />} title="Position chart"
            line="Every driver, every lap, with pit markers and safety-car windows drawn over the trace."
            art={<ArtPosition />} />
          <Cap icon={<GitCompare size={15} />} title="Compare"
            line="Two drivers, head to head — pace, stints, stops and where the gap actually came from."
            art={<ArtCompare />} />
          <Cap icon={<MessageCircleQuestion size={15} />} title="Ask" beta
            line="Questions about the session in plain English, answered from the same analysis — with an honest confidence level."
            art={<ArtAsk />} />
          <Cap icon={<Clock3 size={15} />} title="Seasons"
            line="Official classifications and final championship standings for every season back to 1950."
            art={<ArtSeasons />} />
        </div>
      </section>

      {/* ---- 4. where it comes from --------------------------------------
          A data product's marketing page has to answer "says who". This is
          the same statement the site's Data Sources panel makes, said once. */}
      <section ref={trust.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", trust.className)}>
        <SectionHead n="03" chapter="Trust" title="Real data, named sources"
          line="Nothing here is generated. Every figure traces back to a published Formula 1 record." />

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="panel p-6 sm:p-7">
            <p className="label">Built on</p>
            <ul className="mt-4 space-y-4">
              <Source name="FastF1 and the F1 timing archive"
                line="Lap-by-lap timing, tyre stints, pit stops, race control and weather — the detail that makes session analysis possible, from 2018 onward." />
              <Source name="Jolpica / Ergast"
                line="Starting grids, official results and championship standings, back to the first season in 1950." />
              <Source name="OpenF1"
                line="Pit-stop durations and session detail, where it is published." />
            </ul>
            <p className="mt-6 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-ink-muted">
              Full session analysis — laps, stints, strategy and pace — needs
              lap-by-lap timing, so it covers <strong className="font-medium text-ink">2018 to today</strong>.
              Results and championships reach back to <strong className="font-medium text-ink">1950</strong>.
              The app tells you which of the two you are looking at rather than
              blurring the line.
            </p>
          </div>

          <div className="panel p-6 sm:p-7">
            <p className="label">And what it asks of you</p>
            <ul className="mt-4 space-y-3.5">
              <Ask2 text="No account. No sign-in. Nothing to register for." />
              <Ask2 text="No cookies, no advertising, no tracking across other apps." />
              <Ask2 text="Usage is counted under a random identifier that says nothing about you." />
            </ul>
            <Link href="/privacy"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-ink-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-ink">
              Read the privacy policy
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* ---- 5. the close ------------------------------------------------- */}
      <section ref={close.ref}
        className={cx("mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-28 sm:pt-24", close.className)}>
        <div className="panel-hero px-6 py-12 text-center sm:px-10 sm:py-16">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <Radar size={21} className="text-accent-soft" />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">
            Built for people who watch the whole race
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-ink-muted">
            For the ones still arguing about the second stop an hour after the
            flag. Pitwall IQ is where that argument gets settled — with the
            laps, in front of you.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            <Link href={WEB_HREF}
              className="cta-glow pressable-glow group/cta inline-flex items-center gap-2 rounded-xl px-7 py-4 text-[15px] font-semibold text-pure">
              Read your last race
              <ArrowRight size={17} className="transition-transform duration-[--dur-2] group-hover/cta:translate-x-0.5" />
            </Link>
            <span className="text-[13px] text-ink-faint">
              iPhone app coming soon · Free, no account
            </span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ========================================================================== */
/* THE DEVICE.                                                                */
/*                                                                            */
/* A frame drawn in CSS rather than an image, so it stays sharp on every       */
/* display and costs nothing to download. See the header note for why what is  */
/* inside it is structural rather than a captured screen.                      */
/* ========================================================================== */
function Phone() {
  return (
    <div className="relative">
      {/* the light the device throws, in the accent, same as every other
          elevated surface in the product */}
      <span aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .16), transparent 70%)" }} />

      <div className="relative w-[268px] rounded-[2.4rem] border border-white/[0.10] bg-base-900 p-2.5 sm:w-[300px]"
        style={{ boxShadow: "var(--el-3)" }}>
        {/* the screen */}
        <div className="relative overflow-hidden rounded-[1.9rem] bg-base-950">
          {/* the island, drawn rather than notched — a pill is what a current
              iPhone actually shows and it reads at this size */}
          <span aria-hidden
            className="absolute left-1/2 top-2 z-10 h-[18px] w-[74px] -translate-x-1/2 rounded-full bg-black/85" />
          <AppCanvas />
        </div>
      </div>
    </div>
  );
}

/** What the screen shows. Structure and design language, no asserted result. */
function AppCanvas() {
  return (
    <div className="flex h-[560px] flex-col pt-9 sm:h-[600px]">
      {/* app header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 pb-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
          <Radar size={13} className="text-accent-soft" />
        </span>
        <span className="text-[12.5px] font-semibold tracking-tight text-ink">
          Race<span className="text-accent-soft"> Story</span>
        </span>
        <span className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          Race
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-3.5 pt-3.5">
        {/* the answer-first card the product leads every race with */}
        <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-3">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-accent-soft">
            Turning point
          </p>
          <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-ink">
            The lap the lead changed hands
          </p>
          <p className="mt-1 text-[10.5px] leading-snug text-ink-faint">
            Why it mattered, and what it cost.
          </p>
        </div>

        {/* the position trace: shape only, no driver carries a name */}
        <div className="rounded-xl border border-white/[0.06] bg-base-850/60 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Position</p>
            <p className="font-mono text-[8.5px] text-ink-faint">P1 — P10</p>
          </div>
          <TraceArt className="mt-2" />
        </div>

        {/* stints: real broadcast compound colours, no attribution */}
        <div className="rounded-xl border border-white/[0.06] bg-base-850/60 p-3">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">Tyres</p>
          <div className="mt-2 space-y-1.5">
            <StintRow widths={[42, 34, 24]} />
            <StintRow widths={[30, 46, 24]} order={[1, 0, 2]} />
            <StintRow widths={[52, 48]} order={[2, 1]} />
          </div>
        </div>

        {/* clean-air pace, which is the product's own signature measurement —
            positions on the left, bars for relative pace, nobody named */}
        <div className="rounded-xl border border-white/[0.06] bg-base-850/60 p-3">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-faint">
            Clean-air pace
          </p>
          <div className="mt-2 space-y-[5px]">
            {[["P1", 96], ["P2", 88], ["P3", 79], ["P4", 74]].map(([pos, w], i) => (
              <div key={String(pos)} className="flex items-center gap-2">
                <span className="w-4 shrink-0 font-mono text-[8px] text-ink-faint">{pos}</span>
                <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className="block h-full rounded-full"
                    style={{
                      width: `${w}%`,
                      background: i === 0 ? "rgb(var(--accent))" : "rgb(var(--ink-faint) / .5)",
                    }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* the tab bar — the app's own section names */}
      <div className="mt-auto grid grid-cols-4 border-t border-white/[0.06] bg-base-900/80 px-2 pb-4 pt-2.5">
        {[["Story", true], ["Charts", false], ["Strategy", false], ["Ask", false]].map(([label, on]) => (
          <span key={String(label)}
            className={cx("text-center text-[9px] font-medium",
              on ? "text-accent-soft" : "text-ink-faint")}>
            {String(label)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The position trace. `hero-trace` draws the lines in and is already
 *  reduced-motion aware (globals.css), so this needs no rule of its own. */
function TraceArt({ className }: { className?: string }) {
  const lines = [
    { d: "M2,26 C22,24 34,10 56,9 C78,8 96,6 118,5", c: "rgb(var(--accent))", w: 1.6, delay: ".05s" },
    { d: "M2,8 C24,10 38,20 58,22 C80,24 98,17 118,14", c: "rgb(var(--speed))", w: 1.3, delay: ".2s" },
    { d: "M2,16 C24,17 36,26 58,29 C80,32 98,26 118,23", c: "rgb(var(--ink-faint))", w: 1.1, delay: ".35s" },
    { d: "M2,34 C24,33 40,30 58,33 C80,36 98,33 118,31", c: "rgb(var(--ink-faint) / .55)", w: 1, delay: ".5s" },
  ];
  return (
    <svg viewBox="0 0 120 40" className={cx("h-[62px] w-full", className)} aria-hidden>
      {/* a neutralisation window, the one band the product always draws */}
      <rect x="52" y="0" width="17" height="40" fill="rgb(var(--amber) / .10)" />
      <line x1="52" y1="0" x2="52" y2="40" stroke="rgb(var(--amber) / .35)" strokeWidth=".5" />
      {lines.map((l) => (
        <path key={l.d} d={l.d} fill="none" stroke={l.c} strokeWidth={l.w}
          strokeLinecap="round" className="hero-trace" style={{ animationDelay: l.delay }} />
      ))}
    </svg>
  );
}

const STINT_COLORS = ["#ff3b3b", "#ffcf3f", "#e7ecf3"];   // soft / medium / hard
const STINT_LETTERS = ["S", "M", "H"];

function StintRow({ widths, order = [0, 1, 2] }: { widths: number[]; order?: number[] }) {
  return (
    <div className="flex h-3.5 gap-[3px]">
      {widths.map((w, i) => {
        const c = order[i] ?? i;
        return (
          <span key={i} style={{ width: `${w}%`, background: STINT_COLORS[c] }}
            className="grid place-items-center rounded-[3px] text-[7.5px] font-bold text-black/75">
            {STINT_LETTERS[c]}
          </span>
        );
      })}
    </div>
  );
}

/** The hero's ambient ground. Quiet on purpose — the phone is the subject. */
function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 18% 0%, rgb(var(--accent) / calc(0.11 * var(--glow-k))), transparent 62%),"
            + "radial-gradient(70% 60% at 92% 18%, rgb(var(--speed) / calc(0.05 * var(--glow-k))), transparent 60%)",
        }} />
      {/* the timing-screen rule the product uses behind data surfaces */}
      <span className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "linear-gradient(to bottom, rgb(var(--tint) / .028) 1px, transparent 1px)",
          backgroundSize: "100% 2rem",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)",
        }} />
    </div>
  );
}

/* ========================================================================== */
/* SECTION FURNITURE — the landing page's vocabulary, so the two pages read    */
/* as one site rather than as a site and its advertisement.                    */
/* ========================================================================== */
function SectionHead({ n, chapter, title, line }: {
  n: string; chapter: string; title: string; line: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
        <span className="font-mono text-accent-soft">{n}</span>
        <span className="h-px w-6 bg-white/[0.14]" />
        {chapter}
      </p>
      <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">{title}</h2>
      <p className="mt-1.5 max-w-xl text-[14.5px] text-ink-muted">{line}</p>
    </div>
  );
}

/** One half of the raw-versus-read comparison. */
function Panel({ kicker, title, body, tone }: {
  kicker: string; title: string; body: string; tone: "raw" | "read";
}) {
  const read = tone === "read";
  return (
    <div className={cx("rounded-2xl border p-6 sm:p-7",
      read ? "border-accent/20 bg-accent/[0.04]" : "border-white/[0.06] bg-base-850/40")}>
      <p className={cx("text-[10.5px] font-bold uppercase tracking-[0.18em]",
        read ? "text-accent-soft" : "text-ink-faint")}>
        {kicker}
      </p>
      <p className={cx("mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em] sm:text-[21px]",
        read ? "text-ink" : "text-ink-muted")}>
        {title}
      </p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function Claim({ icon, title, line }: { icon: React.ReactNode; title: string; line: string }) {
  return (
    <li className="tile p-5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-accent-soft">{icon}</span>
      <p className="mt-3.5 text-[14px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
    </li>
  );
}

/** One capability: a name, a sentence, and a small drawing of the real thing. */
function Cap({ icon, title, line, art, beta }: {
  icon: React.ReactNode; title: string; line: string; art: React.ReactNode; beta?: boolean;
}) {
  return (
    <div className="panel panel-hover overflow-hidden">
      <div className="border-b border-white/[0.06] bg-base-950/40 px-4 py-3.5">{art}</div>
      <div className="p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <span className="text-accent-soft">{icon}</span>
          {title}
          {beta && <BetaTag />}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
      </div>
    </div>
  );
}

function Source({ name, line }: { name: string; line: string }) {
  return (
    <li>
      <p className="text-[13.5px] font-medium text-ink">{name}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
    </li>
  );
}

function Ask2({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted">
      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent-soft" />
      {text}
    </li>
  );
}

/* ========================================================================== */
/* CAPABILITY ART.                                                            */
/*                                                                            */
/* Each one is a small, honest drawing of the surface it names — the same      */
/* shapes and the same palette the real component uses, with nothing in it     */
/* that claims to be a particular race. Fixed height so the grid's rows align  */
/* whatever the card copy does.                                               */
/* ========================================================================== */
const ART = "h-[64px] w-full";

function ArtStory() {
  return (
    <div className={cx(ART, "flex flex-col justify-center gap-1.5")}>
      <span className="h-1.5 w-2/3 rounded-full bg-accent/45" />
      <span className="h-1.5 w-full rounded-full bg-white/[0.09]" />
      <span className="h-1.5 w-5/6 rounded-full bg-white/[0.09]" />
      <span className="h-1.5 w-1/3 rounded-full bg-white/[0.06]" />
    </div>
  );
}

function ArtStrategy() {
  return (
    <svg viewBox="0 0 120 40" className={ART} aria-hidden>
      <rect x="46" y="0" width="20" height="40" fill="rgb(var(--amber) / .12)" />
      <path d="M2,30 C26,29 38,16 62,14 C84,12 100,11 118,10" fill="none"
        stroke="rgb(var(--accent))" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2,14 C26,15 40,25 62,27 C84,29 100,26 118,24" fill="none"
        stroke="rgb(var(--ink-faint))" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="46" cy="21" r="2.6" fill="rgb(var(--accent))" />
      <circle cx="66" cy="17" r="2.2" fill="rgb(var(--ink-faint))" />
    </svg>
  );
}

function ArtTyres() {
  return (
    <div className={cx(ART, "flex flex-col justify-center gap-1.5")}>
      <StintRow widths={[38, 36, 26]} />
      <StintRow widths={[28, 48, 24]} order={[1, 0, 2]} />
      <StintRow widths={[56, 44]} order={[2, 1]} />
    </div>
  );
}

function ArtPace() {
  const bars = [92, 78, 71, 64, 52, 44];
  return (
    <div className={cx(ART, "flex items-end gap-1.5")}>
      {bars.map((h, i) => (
        <span key={i} style={{ height: `${h}%` }}
          className={cx("flex-1 rounded-t-[3px]", i === 0 ? "bg-accent/70" : "bg-white/[0.10]")} />
      ))}
    </div>
  );
}

function ArtPosition() {
  return (
    <svg viewBox="0 0 120 40" className={ART} aria-hidden>
      {[8, 16, 24, 32].map((y) => (
        <line key={y} x1="0" y1={y} x2="120" y2={y} stroke="rgb(var(--tint) / .05)" strokeWidth=".6" />
      ))}
      <path d="M2,32 C24,30 36,14 60,11 C84,8 100,7 118,6" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2,10 C24,12 40,22 60,25 C82,28 100,22 118,19" fill="none" stroke="rgb(var(--speed))" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2,20 C26,21 42,29 62,31 C84,33 100,30 118,29" fill="none" stroke="rgb(var(--ink-faint) / .7)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ArtCompare() {
  return (
    <div className={cx(ART, "flex items-center gap-3")}>
      <div className="flex-1 space-y-1.5">
        <span className="block h-1.5 w-full rounded-full bg-accent/55" />
        <span className="block h-1.5 w-3/4 rounded-full bg-accent/30" />
        <span className="block h-1.5 w-1/2 rounded-full bg-accent/20" />
      </div>
      <span className="h-9 w-px bg-white/[0.10]" />
      <div className="flex-1 space-y-1.5">
        <span className="block h-1.5 w-5/6 rounded-full bg-speed/45" />
        <span className="block h-1.5 w-full rounded-full bg-speed/30" />
        <span className="block h-1.5 w-2/5 rounded-full bg-speed/20" />
      </div>
    </div>
  );
}

function ArtAsk() {
  return (
    <div className={cx(ART, "flex flex-col justify-center gap-2")}>
      <span className="w-fit max-w-full rounded-lg rounded-br-sm bg-white/[0.07] px-2.5 py-1.5 text-[9.5px] text-ink-muted">
        Why did he lose the lead?
      </span>
      <span className="ml-auto w-fit max-w-full rounded-lg rounded-bl-sm bg-accent/12 px-2.5 py-1.5 text-[9.5px] text-accent-soft">
        The stop before the safety car.
      </span>
    </div>
  );
}

function ArtSeasons() {
  return (
    <div className={cx(ART, "flex items-end gap-[3px]")}>
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} style={{ height: `${28 + ((i * 37) % 62)}%` }}
          className={cx("flex-1 rounded-t-[2px]", i > 17 ? "bg-accent/45" : "bg-white/[0.08]")} />
      ))}
    </div>
  );
}
