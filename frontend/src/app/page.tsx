"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, MessageSquareText, Timer, Trophy } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { Flag, Gauge, LineChart, Sparkles } from "@/components/ui/MotionIcon";
import { usePrefs, type Mode } from "@/lib/prefs";
import { useReveal } from "@/lib/useReveal";
import { useCountUp } from "@/lib/useCountUp";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The landing experience.                                                    */
/*                                                                            */
/* Composed as a film is cut, not stacked as panels are stacked. Four beats,   */
/* each with a different weight, and a lot of air between them — the thing a   */
/* page of equal-sized cards can never buy is the sense that somebody decided  */
/* what mattered most.                                                        */
/*                                                                            */
/*   1. THE SHOT       an oversized line beside a Grand Prix drawn as light.  */
/*                     The type and the image share the row, so neither is     */
/*                     decoration for the other.                               */
/*   2. THE SCALE      five numbers that count themselves in — the credibility */
/*                     paragraph, without the paragraph.                       */
/*   3. THE CHOICE     two large cards, tinted to their own character, each     */
/*                     showing the actual panel it produces.                   */
/*   4. THE WAY IN     three steps, then three doors.                          */
/*                                                                            */
/* Everything below the fold arrives as it is scrolled to, so the page has     */
/* pacing rather than a single load.                                           */
/* -------------------------------------------------------------------------- */

export default function Landing() {
  const { prefs, set, ready } = usePrefs();
  const [picked, setPicked] = useState(false);
  const statBand = useReveal<HTMLDivElement>();
  const modeBand = useReveal<HTMLElement>();
  const startBand = useReveal<HTMLElement>();
  const doorBand = useReveal<HTMLElement>();

  function choose(m: Mode) {
    set("mode", m);
    setPicked(true);
  }

  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* ---- 1. the shot ------------------------------------------------ */}
      <section className="relative">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pb-14 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
            <div>
              <p className="stagger-1 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.26em] text-accent-soft">
                <span className="h-px w-8 bg-accent-soft/60" />
                Formula 1 race intelligence
              </p>
              {/* Oversized and tight. A headline at this weight is the single
                  cheapest way to say "somebody designed this" — and the tighter
                  tracking is what stops it reading as merely large. */}
              <h1 className="stagger-2 mt-5 text-[3rem] font-bold leading-[0.98] tracking-[-0.04em] sm:text-[4.5rem]">
                Every lap
                <br />
                tells a{" "}
                <span className="relative whitespace-nowrap text-accent">
                  story
                  <span aria-hidden className="absolute -inset-x-2 -inset-y-1 -z-10 rounded-2xl"
                    style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .18), transparent)" }} />
                </span>
                .
              </h1>
              <p className="stagger-3 mt-6 max-w-md text-[17px] leading-relaxed text-ink-muted">
                Pitwall IQ reads the lap-by-lap timing data and tells you what
                actually decided the Grand Prix — not just who finished where.
              </p>
              <div className="stagger-4 mt-8 flex flex-wrap items-center gap-3">
                <Link href="/explorer"
                  className="pressable-glow group/cta inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-pure"
                  style={{ boxShadow: "0 10px 34px -12px rgb(var(--accent) / .8)" }}>
                  Start exploring
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </Link>
                <a href="#mode"
                  className="pressable inline-flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/70 px-5 py-3.5 text-sm font-medium text-ink-muted">
                  See how it works
                </a>
              </div>
            </div>

            <HeroVisual className="stagger-3 aspect-[16/10] w-full lg:aspect-[16/11]" />
          </div>

          {/* ---- 2. the scale -------------------------------------------- */}
          <div ref={statBand.ref}
            className={cx("mt-12 flex flex-wrap items-center gap-x-9 gap-y-5 border-t border-white/[0.06] pt-7 sm:mt-16",
              statBand.className)}>
            <Stat icon={<Flag size={15} />} value={2026} label="Season" plain />
            <Stat icon={<Trophy size={15} />} value={24} label="Races" />
            <Stat icon={<Gauge size={15} />} value={500} suffix="+" label="Drivers" />
            <Stat icon={<Timer size={15} />} value={75} label="Years of history" />
            <Stat icon={<LineChart size={15} />} value={0} literal="Millions" label="Laps analysed" />
          </div>
        </div>
      </section>

      {/* ---- 3. the choice --------------------------------------------- */}
      <section id="mode" ref={modeBand.ref}
        className={cx("mx-auto max-w-7xl scroll-mt-20 px-4 pb-4 pt-6 sm:px-6", modeBand.className)}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[26px] font-bold tracking-tight sm:text-[32px]">Choose your experience</h2>
            <p className="mt-1 text-sm text-ink-muted">Two ways to read the same race. You decide your depth.</p>
          </div>
          <span className="chip">You can change this any time in Settings</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ModeCard
            id="simple" on={ready && prefs.mode === "simple"} onPick={choose}
            title="Simple" tag="Watch the race like a commentator"
            tint="var(--speed)"
            points={["Story-first insights", "Plain English", "No jargon"]}
            preview={<SimplePreview />} />
          <ModeCard
            id="advanced" on={ready && prefs.mode === "advanced"} onPick={choose}
            title="Advanced" tag="Think like a strategist"
            tint="var(--accent)"
            points={["Every metric", "Every stint", "Every decision"]}
            preview={<AdvancedPreview />} />
        </div>

        <div aria-live="polite"
          className={cx("mt-4 flex flex-wrap items-center gap-2 text-sm transition-all duration-300",
            picked ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
          <Check size={15} className="text-emerald-400" />
          <span className="text-ink-muted">
            Saved. Every page will use {prefs.mode === "simple" ? "Simple" : "Advanced"} from now on.
          </span>
          <Link href="/explorer"
            className="inline-flex items-center gap-1 font-semibold text-accent-soft transition-colors hover:text-accent">
            Start reading <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ---- 4. the way in ---------------------------------------------- */}
      <section ref={startBand.ref}
        className={cx("mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20", startBand.className)}>
        <h2 className="text-[26px] font-bold tracking-tight sm:text-[32px]">Quick start</h2>
        <p className="mt-1 text-sm text-ink-muted">Thirty seconds to get comfortable.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Step n={1} title="Read a race" line="The story, the key moments and the turning point."
            visual={<StepTrace />} />
          <Step n={2} title="Compare drivers" line="Head-to-head pace, stints and race impact."
            visual={<StepBars />} />
          <Step n={3} title="Ask any question" line="Answered from the real lap data, not a template."
            visual={<StepLines />} />
        </div>
      </section>

      <section ref={doorBand.ref}
        className={cx("mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20", doorBand.className)}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Door href="/explorer" icon={<Timer size={16} />} title="Read a race"
            line="Story, strategy, pace and tyres for any session." />
          <Door href="/explorer?tab=ask" icon={<MessageSquareText size={16} />} title="Ask a question"
            line="“Why did Leclerc lose places?” — answered from the data." />
          <Door href="/history" icon={<Trophy size={16} />} title="Look something up"
            line="Official results and standings, 1950 to today." />
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/** A figure that arrives rather than appears. */
function Stat({
  icon, value, label, suffix, literal, plain,
}: {
  icon: React.ReactNode; value: number; label: string;
  suffix?: string; literal?: string; plain?: boolean;
}) {
  const { ref, value: shown } = useCountUp(value);
  return (
    <span className="ic-host flex items-center gap-2.5">
      <span className="text-ink-faint">{icon}</span>
      <span>
        <span ref={ref} className="block text-[19px] font-bold leading-none tracking-tight tabular-nums text-ink">
          {literal ?? (plain ? value : shown.toLocaleString())}{suffix}
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
      className={cx(
        "group/mode relative overflow-hidden rounded-2xl border p-5 text-left sm:p-6",
        "transition-all duration-300 ease-out",
        on ? "-translate-y-0.5" : "hover:-translate-y-1")}
      style={{
        borderColor: on ? `rgb(${tint} / .5)` : "rgb(var(--tint) / .07)",
        background: `linear-gradient(155deg, rgb(${tint} / ${on ? ".10" : ".045"}), rgb(var(--base-900) / .8) 58%)`,
        boxShadow: on
          ? `0 0 0 1px rgb(${tint} / .35), 0 26px 60px -30px rgb(${tint} / .75)`
          : "var(--el-2)",
      }}>
      {/* the light in the card's own colour, brightening as you reach for it */}
      <span aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full transition-opacity duration-500"
        style={{
          background: `radial-gradient(closest-side, rgb(${tint} / .3), transparent)`,
          opacity: on ? 0.9 : 0.35,
        }} />

      <span className="relative flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover/mode:scale-110"
          style={{ background: `rgb(${tint} / .16)`, color: `rgb(${tint})` }}>
          <Sparkles size={17} />
        </span>
        <span className="text-[22px] font-bold tracking-tight text-ink">{title}</span>
        <span className={cx("ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-300",
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
function Step({ n, title, line, visual }: {
  n: number; title: string; line: string; visual: React.ReactNode;
}) {
  return (
    <div className="panel group/step relative flex items-start gap-3 overflow-hidden p-4">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/12 text-[12px] font-bold tabular-nums text-accent-soft">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block max-w-[16rem] text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
      </span>
      {/* a miniature of the thing, not an icon of the thing */}
      <span aria-hidden className="pointer-events-none absolute -bottom-1 -right-2 opacity-45 transition-all duration-500 group-hover/step:-translate-y-0.5 group-hover/step:opacity-70">
        {visual}
      </span>
    </div>
  );
}

function StepTrace() {
  return (
    <svg width="112" height="56" viewBox="0 0 112 56" fill="none" aria-hidden>
      <path d="M2 40 C 22 38, 34 16, 52 20 S 80 34, 110 8" stroke="rgb(var(--accent))"
        strokeWidth="2" strokeLinecap="round" />
      <circle cx="52" cy="20" r="2.6" fill="rgb(var(--accent))" />
      <circle cx="110" cy="8" r="2.6" fill="rgb(var(--accent))" />
    </svg>
  );
}
function StepBars() {
  return (
    <svg width="112" height="56" viewBox="0 0 112 56" fill="none" aria-hidden>
      {[[10, 44], [28, 30], [46, 36], [64, 18], [82, 26]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="10" height={50 - y} rx="3"
          fill={i % 2 ? "rgb(var(--speed))" : "rgb(var(--accent))"} opacity={0.75} />
      ))}
    </svg>
  );
}
function StepLines() {
  return (
    <svg width="112" height="56" viewBox="0 0 112 56" fill="none" aria-hidden>
      {[16, 26, 36].map((y, i) => (
        <rect key={y} x="8" y={y} width={88 - i * 22} height="5" rx="2.5"
          fill="rgb(var(--ink-faint))" opacity={0.5 - i * 0.12} />
      ))}
      <rect x="8" y="46" width="34" height="5" rx="2.5" fill="rgb(var(--accent))" opacity="0.75" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
function Door({ href, icon, title, line }: {
  href: string; icon: React.ReactNode; title: string; line: string;
}) {
  return (
    <Link href={href}
      className="group/door pressable panel flex items-start gap-3 p-4">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-soft transition-transform duration-300 group-hover/door:scale-110">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
          {title}
          <ArrowRight size={13}
            className="text-ink-faint transition-transform duration-200 group-hover/door:translate-x-0.5 group-hover/door:text-accent-soft" />
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">{line}</span>
      </span>
    </Link>
  );
}
