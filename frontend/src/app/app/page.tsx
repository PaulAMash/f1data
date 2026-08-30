"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  Apple, ArrowRight, BarChart3, BatteryCharging, Clock3, Flag, GitCompare,
  Hand, LineChart, MessageCircleQuestion, Radar, ShieldCheck, Smartphone, Timer,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { BetaTag } from "@/components/ui/BetaTag";
import { PhoneMock, StintRow } from "@/components/promo/PhoneMock";
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
      one. The store lockup below is drawn in this product's own style, says
      "coming soon", and presses nothing. When Apple approves the app it
      becomes a real link — in that commit, not before. A dead Download
      button on the page the App Store links to is the worst possible first
      impression, and inventing a URL is worse.

   2. THERE ARE NO iOS SCREENSHOTS IN THIS REPOSITORY, so nothing here is
      presented as a screen capture. The device (components/promo/PhoneMock)
      is drawn from this product's own tokens and shows STRUCTURE — no lap
      time, no driver, no result. When real captures exist they replace the
      mock's screen and every surface that shows the phone updates together.

   There is no Android version and nothing here implies one: the page names
   iPhone and the App Store, and names nothing else.
   ========================================================================== */

/** The web product, which is what a reader can actually use today. */
const WEB_HREF = "/explorer";

export default function AppMarketingPage() {
  useEffect(() => { trackPageView("/app"); }, []);

  const why = useReveal<HTMLElement>();
  const does = useReveal<HTMLElement>();
  const hand = useReveal<HTMLElement>();
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

        <div className="relative mx-auto grid max-w-7xl items-center gap-x-16 gap-y-14 px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_auto] lg:pt-24">
          <div className="max-w-xl">
            <p className="stagger-1 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.26em] text-accent-soft">
              <span className="h-px w-8 bg-accent-soft/60" />
              Pitwall IQ for iPhone
            </p>

            {/* The product's own sentence, from the footer it has carried for
                thirty versions. A marketing page is the wrong place to invent
                a new promise. */}
            <h1 className="stagger-2 mt-5 text-[3rem] font-bold leading-[0.96] tracking-[-0.045em] sm:text-[4.6rem]">
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

            <p className="stagger-3 mt-6 max-w-md text-[17px] leading-relaxed text-ink-muted">
              Pitwall IQ reads every lap of a Grand Prix and tells you what
              actually decided it — the strategy, the tyres and the real pace
              behind the finishing order. Now being built for the phone in
              your hand on race day.
            </p>

            {/* THE STORE LOCKUP. The shape every reader already knows how to
                read — glyph left, two lines right — drawn in this product's
                own materials, wearing "coming soon" where a live one says
                "download". Not a button: no press affordance, nothing that
                invites a tap it cannot answer. It becomes a real link in the
                commit that has a real URL to give it. */}
            <div className="stagger-4 mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
              <span className="inline-flex items-center gap-3 rounded-2xl border border-white/[0.14] bg-base-900/90 py-3 pl-4 pr-6"
                style={{ boxShadow: "var(--el-2)" }}>
                <Apple size={26} className="shrink-0 -translate-y-px text-ink" aria-hidden />
                <span className="leading-none">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Coming soon to the
                  </span>
                  <span className="mt-1 block text-[17px] font-bold tracking-[-0.01em] text-ink">
                    App Store
                  </span>
                </span>
              </span>
              <Link href={WEB_HREF}
                className="group/web inline-flex items-center gap-2 text-[14.5px] font-medium text-ink-muted transition-colors hover:text-ink">
                Use it on the web today
                <ArrowRight size={15} className="transition-transform duration-[--dur-2] group-hover/web:translate-x-0.5" />
              </Link>
            </div>

            {/* Three facts, each one kept by the product and stated in the
                privacy policy. Not marketing adjectives — commitments. */}
            <ul className="stagger-4 mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-faint">
              {["Free", "No account", "No ads", "No tracking"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-accent-soft/80" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="stagger-4 app-float justify-self-center lg:justify-self-end">
            <PhoneMock />
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

      {/* ---- 4. why a phone app ------------------------------------------
          The app's own reason to exist, separate from the product's. Written
          in the future tense on purpose: the app is in development, and a
          page that claims a shipped experience it cannot show is lying. */}
      <section ref={hand.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", hand.className)}>
        <SectionHead n="03" chapter="Carry" title="Built for the hand, not the desk"
          line="Race weekends are watched with a phone in one hand. That is the screen this app is being designed for." />

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Claim icon={<Hand size={15} />} title="One thumb"
            line="Every control within reach of the hand that is holding it — built for the sofa, the grandstand and the queue for the gate, not a desk." />
          <Claim icon={<Smartphone size={15} />} title="The same intelligence"
            line="The identical analysis behind this website — same data, same methods, same honesty about confidence — presented for a screen you hold." />
          <Claim icon={<BatteryCharging size={15} />} title="Light by design"
            line="The heavy lifting runs on our servers, not on your phone. The app fetches finished analysis, which is kind to both battery and data plan." />
        </div>
      </section>

      {/* ---- 5. where it comes from --------------------------------------
          A data product's marketing page has to answer "says who". This is
          the same statement the site's Data Sources panel makes, said once. */}
      <section ref={trust.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24", trust.className)}>
        <SectionHead n="04" chapter="Trust" title="Real data, named sources"
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

      {/* ---- 6. the close ------------------------------------------------- */}
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
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
              <Apple size={13} aria-hidden className="-translate-y-px" />
              iPhone app coming soon · Free, no account
            </span>
          </div>
        </div>
      </section>

      <Footer />
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
