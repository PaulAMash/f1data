"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, BatteryCharging, Clock3, Flag, GitCompare, Hand,
  LineChart, MessageCircleQuestion, Radar, ShieldCheck, Timer, Zap,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { BetaTag } from "@/components/ui/BetaTag";
import { PhoneMock, type PhoneScreen } from "@/components/promo/PhoneMock";
import { AppleLogo, AppStoreBadge } from "@/components/promo/AppleMark";
import { useReveal } from "@/lib/useReveal";
import { trackPageView } from "@/lib/analytics";
import { cx } from "@/lib/format";

/* ==========================================================================
   THE APP'S MARKETING PAGE — the URL the App Store listing points at.

   V98 REBUILT THIS PAGE AROUND ONE OBSERVATION from studying how serious
   product pages are actually composed: they are DEVICE-FORWARD. The screen
   does the explaining and the words only caption it — short lines, centred
   heroes, one idea per screenful, generous silence between sections. So the
   page is now a sequence of rooms of the app, each shown on the device at
   real size, with a sentence beside it; the copy total went DOWN while the
   visual surface went up.

   THE HONESTY CONSTRAINTS ARE UNCHANGED AND STILL LOAD-BEARING:

   1. THERE IS NO APP STORE LISTING YET. The badge below is Apple's own
      artwork (see components/promo/AppleMark.tsx for provenance), shown as
      a labelled coming-soon preview, never as a dead link. The day Apple
      approves the app, pass the store URL to <AppStoreBadge href=…/> at the
      two call sites on this page and the swap is done.

   2. THERE ARE NO iOS SCREENSHOTS IN THE REPOSITORY, so every screen shown
      is drawn structure (promo/PhoneMock): real section names, real
      compound colours, no lap time, no driver, no invented result.

   3. THE APP IS IN DEVELOPMENT, so app-specific claims are future tense,
      and there is no Android version — said out loud in the small print
      rather than left to be assumed.
   ========================================================================== */

const WEB_HREF = "/explorer";

export default function AppMarketingPage() {
  useEffect(() => { trackPageView("/app"); }, []);

  const statement = useReveal<HTMLElement>();
  const carry = useReveal<HTMLElement>();
  const box = useReveal<HTMLElement>();
  const trust = useReveal<HTMLElement>();
  const close = useReveal<HTMLElement>();

  return (
    <div className="min-h-screen">
      <NavBar />

      {/* ================= HERO — centred, device-forward ================= */}
      <section className="relative isolate overflow-hidden">
        <AmbientField />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="stagger-1 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.26em] text-accent-soft">
            <AppleLogo size={12} className="text-ink" />
            Pitwall IQ for iPhone
          </p>

          <h1 className="stagger-2 mt-6 text-[3.2rem] font-bold leading-[0.95] tracking-[-0.045em] sm:text-[5rem]">
            Race day,
            <br />
            in your{" "}
            <span className="relative whitespace-nowrap text-accent">
              hand
              <span aria-hidden className="absolute -inset-x-3 -inset-y-2 -z-10 rounded-3xl"
                style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .22), transparent)" }} />
            </span>
            .
          </h1>

          <p className="stagger-3 mt-6 max-w-lg text-[16.5px] leading-relaxed text-ink-muted">
            The race intelligence behind pitwalliq.com — why the Grand Prix
            was won, not just who won it — designed for the phone you are
            already holding when the lights go out.
          </p>

          <div className="stagger-4 mt-9 flex flex-col items-center gap-4">
            <AppStoreBadge className="items-center" />
            <Link href={WEB_HREF}
              className="group/web inline-flex items-center gap-2 text-[14px] font-medium text-ink-muted transition-colors hover:text-ink">
              Or use it on the web today
              <ArrowRight size={14} className="transition-transform duration-[--dur-2] group-hover/web:translate-x-0.5" />
            </Link>
          </div>

          {/* Four commitments the privacy policy actually makes. */}
          <ul className="stagger-4 mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-faint">
            {["Free", "No account", "No ads", "No tracking"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-accent-soft/80" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* The device, centred and rising out of the fold — flanked on wide
            screens by two of the app's own findings, floating on offset
            phases so the composition breathes rather than bobs. */}
        <div className="relative mx-auto mt-12 flex max-w-5xl items-start justify-center px-4 sm:mt-14">
          <div aria-hidden
            className="app-float absolute left-[8%] top-16 hidden lg:block"
            style={{ animationDelay: "-2.1s" }}>
            <FloatChip label="Clean-air pace" line="Quicker than the finishing order shows" />
          </div>
          <div aria-hidden
            className="app-float absolute right-[8%] top-40 hidden lg:block"
            style={{ animationDelay: "-4.4s" }}>
            <FloatChip label="Strategy" line="An undercut, and what it cost" tone="speed" />
          </div>

          <div className="stagger-4 app-float">
            <PhoneMock />
          </div>
        </div>

        {/* the fade the device rises out of — the fold, drawn */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(var(--base-950)) 82%)" }} />
      </section>

      {/* ================= THE STATEMENT ================= */}
      <section ref={statement.ref}
        className={cx("mx-auto max-w-4xl px-4 pb-4 pt-24 text-center sm:px-6 sm:pt-32", statement.className)}>
        <p className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[40px]">
          Formula 1 is watched
          <br />
          <span className="bg-gradient-to-br from-white to-ink-muted bg-clip-text text-transparent">
            with a phone in one hand.
          </span>
        </p>
        <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-muted">
          This website was built for a desk. The app is the same intelligence,
          rebuilt for the sofa, the grandstand, and the group chat that starts
          arguing before the flag drops.
        </p>
      </section>

      {/* ================= THREE ROOMS OF THE APP ================= */}
      <Room
        n="01" chapter="Read" screen="story"
        title="The race, explained"
        line="Not a wall of timing data — an answer. Every session opens on
              what decided it, with the evidence one tap below."
        points={[
          ["Answer first", "The turning point, the best call and the costliest one, up top."],
          ["Plain English or full detail", "One switch moves the whole app between fan and analyst."],
        ]}
      />
      <Room
        n="02" chapter="See" screen="charts" flip
        title="Every lap, drawn"
        line="The whole Grand Prix in one picture — position by lap, safety
              cars shaded, pit stops marked, stints in their real colours."
        points={[
          ["Built for touch", "Charts sized and spaced for a thumb, not a mouse pointer."],
          ["Tyres tell the story", "Lap-accurate stints show the strategy without a single number."],
        ]}
      />
      <Room
        n="03" chapter="Ask" screen="ask" beta
        title="Ask it like you watched it"
        line="“Why did he lose the lead?” — answered from the session's own
              data, with the evidence named and an honest confidence level."
        points={[
          ["Grounded, not generated", "Every fact comes from the analysis, never made up to please you."],
          ["Honest when unsure", "It tells you what is missing instead of papering over it."],
        ]}
      />

      {/* ================= WHY AN APP ================= */}
      <section ref={carry.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-24 sm:px-6 sm:pt-28", carry.className)}>
        <SectionHead n="04" chapter="Carry" title="Built for the hand, not the desk"
          line="What being an app actually buys you — written in the future tense, because it is being built now." />
        <div className="panel mt-8 grid divide-y divide-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Why icon={<Hand size={16} />} title="One thumb"
            line="Every control within reach of the hand holding the phone — no desktop layout squeezed onto a small screen." />
          <Why icon={<Zap size={16} />} title="The same intelligence"
            line="The identical analysis behind this website: same data, same methods, same honesty about confidence." />
          <Why icon={<BatteryCharging size={16} />} title="Light by design"
            line="The heavy lifting runs on our servers. The app fetches finished analysis — kind to battery and data plan." />
        </div>
      </section>

      {/* ================= EVERYTHING IN THE BOX ================= */}
      <section ref={box.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-24 sm:px-6 sm:pt-28", box.className)}>
        <SectionHead n="05" chapter="Explore" title="Everything in the box"
          line="Pick a season, a race and a session — everything below is built from that one session's data." />
        <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Item icon={<Flag size={14} />} name="Race stories" line="How it was won and lost, answer first." />
          <Item icon={<Timer size={14} />} name="Strategy" line="Undercuts, pit windows, the decisive calls." />
          <Item icon={<BarChart3 size={14} />} name="Tyres" line="Stints, age, and how each set fell away." />
          <Item icon={<LineChart size={14} />} name="Pace" line="Fuel- and tyre-corrected clean-air speed." />
          <Item icon={<Radar size={14} />} name="Position chart" line="Every driver, every lap, every window." />
          <Item icon={<GitCompare size={14} />} name="Compare" line="Two drivers, and where the gap came from." />
          <Item icon={<MessageCircleQuestion size={14} />} name="Ask" line="Plain-English questions, honest answers." beta />
          <Item icon={<Clock3 size={14} />} name="Seasons" line="Results and championships back to 1950." />
        </ul>
      </section>

      {/* ================= TRUST ================= */}
      <section ref={trust.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-24 sm:px-6 sm:pt-28", trust.className)}>
        <SectionHead n="06" chapter="Trust" title="Real data, honestly handled"
          line="Nothing is generated and nothing is guessed quietly. Every figure traces to a published Formula 1 record." />
        <div className="panel mt-8 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              Timing, stints, pit stops, race control and weather come from{" "}
              <span className="font-medium text-ink">FastF1 and the F1 timing archive</span>;
              grids, results and championships from{" "}
              <span className="font-medium text-ink">Jolpica / Ergast</span>; pit-stop
              durations from <span className="font-medium text-ink">OpenF1</span>.
              Full session analysis needs lap-by-lap timing, so it covers{" "}
              <span className="font-medium text-ink">2018 to today</span> — results and
              championships reach back to <span className="font-medium text-ink">1950</span>,
              and the app tells you which of the two you are looking at.
            </p>
          </div>
          <div className="border-t border-white/[0.06] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <ul className="space-y-3">
              {["No account, no sign-in, nothing to register for.",
                "No cookies, no ads, no tracking across other apps.",
                "Usage counted under a random identifier that says nothing about you."]
                .map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent-soft" />
                    {t}
                  </li>
                ))}
            </ul>
            <p className="mt-5 text-[12.5px] text-ink-faint">
              <Link href="/privacy" className="underline decoration-dotted underline-offset-4 transition-colors hover:text-ink">Privacy policy</Link>
              <span className="px-2">·</span>
              <Link href="/support" className="underline decoration-dotted underline-offset-4 transition-colors hover:text-ink">Support</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ================= CLOSE ================= */}
      <section ref={close.ref}
        className={cx("mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6 sm:pb-28 sm:pt-28", close.className)}>
        <div className="panel-hero px-6 py-14 text-center sm:px-10 sm:py-20">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <Radar size={21} className="text-accent-soft" />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[38px]">
            Be on the pit wall
            <br className="sm:hidden" /> for the next one
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-muted">
            The iPhone app is in preparation for App Store review. Until it
            lands, everything it does is live on the web.
          </p>
          <div className="mt-9 flex flex-col items-center gap-5">
            <AppStoreBadge className="items-center" />
            <Link href={WEB_HREF}
              className="cta-glow pressable-glow group/cta inline-flex items-center gap-2 rounded-xl px-7 py-4 text-[15px] font-semibold text-pure">
              Read your last race
              <ArrowRight size={17} className="transition-transform duration-[--dur-2] group-hover/cta:translate-x-0.5" />
            </Link>
          </div>
          <p className="mx-auto mt-8 max-w-lg text-[11.5px] leading-relaxed text-ink-faint">
            iPhone only for now — there is no Android version yet. Apple, the
            Apple logo and App&nbsp;Store are trademarks of Apple&nbsp;Inc.
            Pitwall&nbsp;IQ is not affiliated with or endorsed by Apple.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ========================================================================== */
/* ONE ROOM OF THE APP: the device showing it, a heading beside it, and two    */
/* short points. Alternates sides on wide screens; on a phone the words come   */
/* first and the device follows, full width, which is the order a reader on a  */
/* phone actually wants.                                                       */
/* ========================================================================== */
function Room({ n, chapter, title, line, points, screen, flip, beta }: {
  n: string; chapter: string; title: string; line: string;
  points: [string, string][]; screen: PhoneScreen; flip?: boolean; beta?: boolean;
}) {
  const band = useReveal<HTMLElement>();
  return (
    <section ref={band.ref}
      className={cx("mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28", band.className)}>
      <div className="grid items-center gap-x-20 gap-y-10 lg:grid-cols-2">
        <div className={cx("max-w-md", flip && "lg:order-2 lg:justify-self-end")}>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            <span className="font-mono text-accent-soft">{n}</span>
            <span className="h-px w-6 bg-white/[0.14]" />
            {chapter}
          </p>
          <h2 className="mt-3 flex items-center gap-2.5 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">
            {title}
            {beta && <BetaTag className="translate-y-1" />}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{line}</p>
          <ul className="mt-6 space-y-4">
            {points.map(([head, body]) => (
              <li key={head} className="border-l-2 border-accent/30 pl-4">
                <p className="text-[13.5px] font-semibold text-ink">{head}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className={cx("justify-self-center", flip && "lg:order-1 lg:justify-self-start")}>
          <PhoneMock screen={screen} />
        </div>
      </div>
    </section>
  );
}

/** A finding of the app's, floating beside the hero device. Category labels
 *  only — no numbers, no drivers, nothing pretending to be a result. */
function FloatChip({ label, line, tone = "accent" }: {
  label: string; line: string; tone?: "accent" | "speed";
}) {
  return (
    <span className="block w-[190px] rounded-xl border border-white/[0.09] bg-base-900/90 p-3 backdrop-blur-sm"
      style={{ boxShadow: "var(--el-2)" }}>
      <span className={cx("block text-[9px] font-bold uppercase tracking-[0.16em]",
        tone === "accent" ? "text-accent-soft" : "text-speed")}>
        {label}
      </span>
      <span className="mt-1 block text-[12px] font-medium leading-snug text-ink">{line}</span>
    </span>
  );
}

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

function Why({ icon, title, line }: { icon: React.ReactNode; title: string; line: string }) {
  return (
    <div className="p-6 sm:p-7">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent-soft ring-1 ring-accent/20">
        {icon}
      </span>
      <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{line}</p>
    </div>
  );
}

function Item({ icon, name, line, beta }: {
  icon: React.ReactNode; name: string; line: string; beta?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-accent-soft">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
          {name}
          {beta && <BetaTag />}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{line}</span>
      </span>
    </li>
  );
}

/** The hero's ambient ground. Quiet on purpose — the phone is the subject. */
function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 55% at 50% 0%, rgb(var(--accent) / calc(0.10 * var(--glow-k))), transparent 62%),"
            + "radial-gradient(60% 45% at 85% 30%, rgb(var(--speed) / calc(0.045 * var(--glow-k))), transparent 60%)",
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
