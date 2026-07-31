"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, MessageSquareText, Timer, Trophy } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { usePrefs, type Mode } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The landing experience.                                                    */
/*                                                                            */
/* The old one led with a rotating feature showcase, four feature cards, a     */
/* stats strip and two buttons — a product explaining itself in paragraphs,    */
/* which is what a page writes when it isn't sure of itself. This is three     */
/* beats and nothing else:                                                    */
/*                                                                            */
/*   1. WHAT IT IS      one line, over a telemetry trace that draws itself.   */
/*   2. HOW YOU WANT IT the mode choice, made by looking at two live previews  */
/*                      rather than by reading two descriptions.               */
/*   3. WHERE TO GO     three ways in, one line each.                          */
/*                                                                            */
/* The mode choice is the point of the page. It used to be a two-state toggle  */
/* repeated on every screen, which asked the reader to guess what "Advanced"   */
/* meant and then forgot their answer on refresh. Here it is a decision made   */
/* once, by seeing the actual difference, and it persists.                     */
/* -------------------------------------------------------------------------- */

export default function Landing() {
  const { prefs, set, ready } = usePrefs();
  const [picked, setPicked] = useState(false);

  function choose(m: Mode) {
    set("mode", m);
    setPicked(true);
  }

  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* ---- 1. what it is --------------------------------------------- */}
      <section className="relative overflow-hidden">
        <TelemetryBackdrop />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28">
          <p className="stagger-1 text-[12px] font-semibold uppercase tracking-[0.24em] text-accent-soft">
            Formula 1 race intelligence
          </p>
          <h1 className="stagger-2 mt-4 max-w-4xl text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-7xl">
            Every race
            <br />
            <span className="bg-gradient-to-br from-ink via-ink to-ink-faint bg-clip-text text-transparent">
              has a reason.
            </span>
          </h1>
          <p className="stagger-3 mt-6 max-w-lg text-[17px] leading-relaxed text-ink-muted">
            Pitwall IQ reads the lap-by-lap timing data and tells you what
            actually decided the Grand Prix — not just who finished where.
          </p>

          <div className="stagger-4 mt-9 flex flex-wrap items-center gap-3">
            <Link href="/explorer"
              className="pressable-glow group/cta inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-pure shadow-glow">
              Open the latest race
              <ArrowRight size={16} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
            </Link>
            <a href="#mode"
              className="pressable inline-flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/70 px-5 py-3.5 text-sm font-medium text-ink-muted transition-colors hover:border-white/20 hover:text-ink">
              Choose how you read it
            </a>
          </div>
        </div>
      </section>

      {/* ---- 2. how you want it ---------------------------------------- */}
      <section id="mode" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-1">
          <h2 className="text-[22px] font-bold tracking-tight sm:text-[26px]">Pick your depth</h2>
          <p className="text-sm text-ink-muted">
            Same data, two readings. Change it any time in Settings.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ModeCard
            id="simple" on={ready && prefs.mode === "simple"} onPick={choose}
            title="Simple" tag="Storytelling first"
            line="The race explained the way a good commentator would."
            preview={<SimplePreview />} />
          <ModeCard
            id="advanced" on={ready && prefs.mode === "advanced"} onPick={choose}
            title="Advanced" tag="Everything, measured"
            line="Full field, clean-air pace, stint deltas and pit economics."
            preview={<AdvancedPreview />} />
        </div>

        {/* the confirmation nudges onward; it never blocks the page */}
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

      {/* ---- 3. where to go -------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
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
/* The backdrop: the product's own primary chart, drawing itself.             */
/*                                                                            */
/* A stock hero image would be decoration. This is a position trace — the same */
/* shape the Explorer draws for a real Grand Prix — at low contrast, drawing   */
/* in over two seconds and then STOPPING. It says what the product is before a */
/* word of the headline is read, and it doesn't loop, because a background     */
/* that keeps moving competes with the text sitting on top of it.              */
/* -------------------------------------------------------------------------- */
function TelemetryBackdrop() {
  const LINES = [
    { d: "M0 78 C 90 74, 150 42, 240 40 S 380 62, 470 30 S 620 22, 760 34", c: "var(--l1)", w: 1.6 },
    { d: "M0 96 C 110 92, 170 70, 250 66 S 400 34, 500 58 S 640 52, 760 48", c: "var(--l2)", w: 1.4 },
    { d: "M0 60 C 80 66, 160 96, 260 88 S 390 96, 480 76 S 630 84, 760 66", c: "var(--l3)", w: 1.2 },
    { d: "M0 120 C 100 118, 180 104, 280 110 S 420 118, 520 96 S 660 106, 760 88", c: "var(--l4)", w: 1.1 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        ["--l1" as string]: "rgb(var(--accent) / 0.55)",
        ["--l2" as string]: "rgb(var(--speed) / 0.45)",
        ["--l3" as string]: "rgb(var(--amber) / 0.35)",
        ["--l4" as string]: "rgb(var(--ink-faint) / 0.35)",
      }}>
      {/* Masked, not just positioned. The traces are wider than the space to
          the right of the headline, so without this they run straight through
          the words — text over a stroke of the same weight is unreadable at any
          opacity. The mask dissolves them before they reach the text column. */}
      <svg className="absolute -right-24 top-0 h-full w-[130%] max-w-none sm:right-0 sm:w-[72%]"
        viewBox="0 0 760 150" fill="none" preserveAspectRatio="none"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.3) 30%, #000 58%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.3) 30%, #000 58%)",
        }}>
        {LINES.map((l, i) => (
          <path key={i} d={l.d} stroke={l.c} strokeWidth={l.w} strokeLinecap="round"
            pathLength={100} className="hero-trace"
            style={{ animationDelay: `${0.15 + i * 0.13}s` }} />
        ))}
      </svg>
      {/* the wash the traces sit in, so they read as depth rather than as a
          drawing pinned to the page */}
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(80% 60% at 78% 0%, rgb(var(--accent) / 0.07), transparent 62%)" }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function ModeCard({
  id, on, onPick, title, tag, line, preview,
}: {
  id: Mode; on: boolean; onPick: (m: Mode) => void;
  title: string; tag: string; line: string; preview: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => onPick(id)} aria-pressed={on}
      className={cx(
        "group/mode relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ease-out",
        on
          ? "border-accent/45 bg-accent/[0.05]"
          : "border-white/[0.07] bg-base-900/60 hover:-translate-y-1 hover:border-white/[0.16] hover:bg-base-850/80")}
      style={on ? { boxShadow: "0 0 0 1px rgb(var(--accent) / 0.3), 0 20px 50px -24px rgb(var(--accent) / 0.5)" } : undefined}>
      <span aria-hidden
        className={cx("pointer-events-none absolute inset-0 transition-opacity duration-500",
          on ? "opacity-100" : "opacity-0 group-hover/mode:opacity-60")}
        style={{ background: "radial-gradient(120% 80% at 0% 0%, rgb(var(--accent) / 0.12), transparent 58%)" }} />

      <span className="relative flex items-center gap-2.5">
        <span className="text-xl font-bold tracking-tight text-ink">{title}</span>
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {tag}
        </span>
        <span className={cx("ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-300",
          on ? "scale-100 border-accent bg-accent text-pure" : "scale-90 border-white/15 text-transparent")}>
          <Check size={13} strokeWidth={3} />
        </span>
      </span>
      <span className="relative mt-1.5 block text-[13.5px] leading-relaxed text-ink-muted">{line}</span>

      {/* The whole argument for this mode, shown rather than listed. A bullet
          list describing "more detail" is a promise; a miniature of the actual
          panel is the thing itself. */}
      <span className="relative mt-4 block overflow-hidden rounded-xl border border-white/[0.06] bg-base-950/70 p-3">
        {preview}
      </span>
    </button>
  );
}

/** What Simple looks like: one sentence and a couple of facts, all large. */
function SimplePreview() {
  return (
    <span className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
        The race in a line
      </span>
      <span className="mt-1.5 block text-[15px] font-semibold leading-snug text-ink">
        Norris won from pole, 15.1s clear, on a three-stop.
      </span>
      <span className="mt-3 flex items-end gap-5">
        <span className="block">
          <span className="block text-[10.5px] uppercase tracking-wider text-ink-faint">Turning point</span>
          <span className="block text-[13px] font-bold text-ink">Virtual Safety Car</span>
        </span>
        <span className="block">
          <span className="block text-[10.5px] uppercase tracking-wider text-ink-faint">Laps</span>
          <span className="block text-[13px] font-bold tabular-nums text-ink">54–57</span>
        </span>
      </span>
    </span>
  );
}

/** What Advanced looks like: the same race, as measurements. */
function AdvancedPreview() {
  const ROWS = [
    { code: "NOR", c: "#FF8000", pace: "1:24.490", d: "—", w: 100 },
    { code: "PIA", c: "#FF8000", pace: "1:24.730", d: "+0.240", w: 74 },
    { code: "ANT", c: "#27F4D2", pace: "1:24.902", d: "+0.412", w: 55 },
  ];
  return (
    <span className="block">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-speed">
        Clean-air pace
        <span className="ml-auto font-normal normal-case tracking-normal text-ink-faint">
          fuel &amp; tyre corrected
        </span>
      </span>
      <span className="mt-2 block space-y-1.5">
        {ROWS.map((r) => (
          <span key={r.code} className="flex items-center gap-2">
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
function Door({ href, icon, title, line }: {
  href: string; icon: React.ReactNode; title: string; line: string;
}) {
  return (
    <Link href={href}
      className="group/door pressable flex items-start gap-3 rounded-xl border border-white/[0.06] bg-base-900/50 p-4 transition-colors hover:border-white/[0.14] hover:bg-base-850/70">
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
