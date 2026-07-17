"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CalendarRange, Database, Flag, Gauge, Layers,
  MessageSquareText, Timer, Trophy,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { COMPOUND_COLOR } from "@/lib/compounds";

const FEATURES = [
  { icon: BookOpen, title: "Race Story", href: "/explorer",
    body: "Who won, why, the turning point, and who gained or lost — the whole race in a plain-English recap." },
  { icon: Timer, title: "Strategy timeline", href: "/explorer?tab=strategy",
    body: "Tyre stints, pit windows and undercuts laid out visually, with the decisive calls explained." },
  { icon: MessageSquareText, title: "Ask the race", href: "/explorer?tab=ask",
    body: "“Why did Leclerc lose places?” “What could Max have done better?” Answered from the real data." },
  { icon: Trophy, title: "Historical archive", href: "/history",
    body: "Look up official results, qualifying and championship standings from 1950 to today." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
          <div className="animate-fade-in">
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Understand any <span className="text-accent-soft">F1 race</span>.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
              Pick a race, read the story, and ask why it unfolded that way — from real Formula 1 data.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/explorer"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5">
                Analyze a race <ArrowRight size={16} />
              </Link>
              <Link href="/history"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-base-800 px-5 py-3 text-sm font-medium text-ink hover:border-white/20">
                <Trophy size={16} /> Explore F1 history
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Self-demonstrating product tour + credibility highlights */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <ProductShowcase />
        <StatHighlights />
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-6">
          <div className="label mb-2">What you can do</div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The race, explained — for fans and analysts alike.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="card card-hover group p-5">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                <f.icon size={17} className="text-accent-soft" />
              </div>
              <h3 className="flex items-center gap-1 text-sm font-semibold text-ink">
                {f.title}
                <ArrowRight size={13} className="opacity-0 transition-opacity group-hover:opacity-70" />
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </Link>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 text-xs text-ink-faint">
          <Database size={13} /> Real data from OpenF1, FastF1 and Jolpica · no API key needed · not affiliated with Formula 1.
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-ink-faint sm:flex-row sm:px-6">
          <span>Pitwall IQ · understand any F1 race.</span>
          <Link href="/explorer" className="hover:text-ink">Analyze a race →</Link>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Credibility highlights — product facts, styled as first-class stats */
/* ------------------------------------------------------------------ */
const STATS = [
  { icon: CalendarRange, tone: "text-accent-soft bg-accent/10 ring-accent/25",
    value: "1950 → today", label: "Every F1 season covered" },
  { icon: Flag, tone: "text-speed bg-speed/10 ring-speed/25",
    value: "1,100+", label: "Grands Prix on record" },
  { icon: Timer, tone: "text-amber bg-amber/10 ring-amber/25",
    value: "Lap-by-lap", label: "Timing detail for recent seasons" },
  { icon: Layers, tone: "text-accent-soft bg-accent/10 ring-accent/25",
    value: "8 modules", label: "Story, pace, strategy, Ask & more" },
];

function StatHighlights() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STATS.map((s) => (
        <div key={s.label}
          className="flex items-center gap-3.5 rounded-xl border border-white/[0.06] bg-base-850/60 px-4 py-3.5">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${s.tone}`}>
            <s.icon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">
              {s.value}
            </span>
            <span className="block text-xs leading-snug text-ink-muted">{s.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product showcase — one card that rotates through the core modules   */
/* so a first-time visitor sees the whole product in ~30 seconds.      */
/* ------------------------------------------------------------------ */
const SCENE_MS = 6500;

const SCENES = [
  { id: "story", label: "Race Story", icon: BookOpen, href: "/explorer", cta: "Read a race story" },
  { id: "ask", label: "Ask", icon: MessageSquareText, href: "/explorer?tab=ask", cta: "Ask about a race" },
  { id: "pace", label: "Pace", icon: Gauge, href: "/explorer?tab=pace", cta: "Open pace analysis" },
  { id: "strategy", label: "Strategy", icon: Timer, href: "/explorer?tab=strategy", cta: "Explain the strategy" },
  { id: "history", label: "History", icon: Trophy, href: "/history", cta: "Browse 75 seasons" },
] as const;

function ProductShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const scene = SCENES[idx];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [idx, paused]);

  return (
    <div className="card overflow-hidden p-1.5"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="rounded-xl bg-base-950/60 p-4 sm:p-6">
        {/* scene tabs — every module of the product, one click (or wait) away */}
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Product tour">
          {SCENES.map((s, i) => (
            <button key={s.id} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)}
              className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                i === idx ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:text-ink"}`}>
              <s.icon size={14} className={i === idx ? "text-accent-soft" : ""} />
              {s.label}
              {i === idx && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-accent-soft/70"
                  style={{ animation: `progress ${SCENE_MS}ms linear both`,
                           animationPlayState: paused ? "paused" : "running" }} />
              )}
            </button>
          ))}
        </div>

        {/* the scene itself — fixed height so rotation never shifts the page */}
        <div className="mt-4 min-h-[260px] sm:min-h-[230px]" aria-live="polite">
          <div key={scene.id} className="animate-fade-in">
            {scene.id === "story" && <StoryScene />}
            {scene.id === "ask" && <AskScene />}
            {scene.id === "pace" && <PaceScene />}
            {scene.id === "strategy" && <StrategyScene />}
            {scene.id === "history" && <HistoryScene />}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
          <span className="text-xs text-ink-faint">
            Preview with sample data — every module runs on real timing data.
          </span>
          <Link href={scene.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft hover:text-accent">
            {scene.cta} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- scene 1: the race story ---- */
function StoryScene() {
  return (
    <div>
      <div className="label mb-2 text-accent-soft">2025 Australian GP · Race Story</div>
      <p className="max-w-2xl text-[17px] font-medium leading-relaxed text-ink">
        Verstappen won from pole, running a two-stop race — but the VSC on lap 34
        decided the podium behind him.
      </p>
      <div className="mt-3 max-w-2xl space-y-1.5 border-l-2 border-white/[0.07] pl-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          Leclerc had the second-fastest car but a third stop dropped him to P4.
        </p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Albon was the day&apos;s biggest mover, up 6 places to P9.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="chip">Winner · Verstappen</span>
        <span className="chip">Turning point · VSC lap 34</span>
        <span className="chip">Biggest mover · Albon +6</span>
      </div>
    </div>
  );
}

/* ---- scene 2: ask the race (types itself) ---- */
const ASK_Q = "Why did Leclerc finish P4?";
const ASK_A = "He had the second-fastest true pace, but a third stop cost ~20s of pit-lane time and dropped him behind the two-stoppers. The VSC on lap 34 sealed it.";

function AskScene() {
  const [typed, setTyped] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setTyped((n) => {
        if (n >= ASK_Q.length) { clearInterval(t); setShowAnswer(true); return n; }
        return n + 1;
      });
    }, 30);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="label mb-2 text-accent-soft">Ask the race</div>
      <div className="flex max-w-2xl items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 px-3.5 py-2.5">
        <MessageSquareText size={15} className="shrink-0 text-ink-faint" />
        <span className="min-h-[1.25rem] text-sm text-ink">
          {ASK_Q.slice(0, typed)}
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-soft align-middle" />
        </span>
      </div>
      <div className={`mt-3.5 max-w-2xl transition-all duration-500 ${showAnswer ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
        <p className="text-[15px] leading-relaxed text-ink">{ASK_A}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["P2 pace, P4 result", "3 stops vs 2", "VSC lap 34–37"].map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- scene 3: pace analysis (true speed vs results) ---- */
const PACE_DEMO = [
  { code: "VER", name: "Verstappen", color: "#3671C6", gap: 0 },
  { code: "LEC", name: "Leclerc", color: "#E8002D", gap: 0.16 },
  { code: "NOR", name: "Norris", color: "#FF8000", gap: 0.21 },
  { code: "RUS", name: "Russell", color: "#27F4D2", gap: 0.38 },
  { code: "ALO", name: "Alonso", color: "#229971", gap: 0.55 },
];

function PaceScene() {
  const max = PACE_DEMO[PACE_DEMO.length - 1].gap;
  return (
    <div>
      <div className="label mb-2 text-accent-soft">Pace analysis · clean-air speed</div>
      <div className="max-w-2xl space-y-2">
        {PACE_DEMO.map((p, i) => (
          <div key={p.code} className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-xs font-semibold text-ink">{p.code}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full origin-left animate-grow-x rounded-full"
                style={{ width: `${100 - (p.gap / max) * 70}%`, background: p.color,
                         animationDelay: `${i * 90}ms` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-muted">
              {p.gap === 0 ? "fastest" : `+${p.gap.toFixed(2)}s`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
        True one-lap speed once fuel and tyres are corrected — so you can see who was
        genuinely quick, not just who finished ahead.
      </p>
    </div>
  );
}

/* ---- scene 4: strategy timeline (tyre stints + the cheap-stop window) ---- */
const STRAT_DEMO: { code: string; stints: { c: keyof typeof COMPOUND_COLOR; laps: number }[] }[] = [
  { code: "VER", stints: [{ c: "MEDIUM", laps: 30 }, { c: "HARD", laps: 28 }] },
  { code: "NOR", stints: [{ c: "MEDIUM", laps: 34 }, { c: "HARD", laps: 24 }] },
  { code: "LEC", stints: [{ c: "SOFT", laps: 18 }, { c: "MEDIUM", laps: 22 }, { c: "SOFT", laps: 18 }] },
];
const STRAT_TOTAL = 58;

function StrategyScene() {
  return (
    <div>
      <div className="label mb-2 text-accent-soft">Strategy · tyre stints & pit windows</div>
      <div className="max-w-2xl space-y-2">
        {STRAT_DEMO.map((d) => (
          <div key={d.code} className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-xs font-semibold text-ink">{d.code}</span>
            <span className="relative flex h-4 flex-1 gap-[3px]">
              {d.stints.map((s, i) => (
                <span key={i} className="h-full rounded-[4px]"
                  style={{ width: `${(s.laps / STRAT_TOTAL) * 100}%`, background: COMPOUND_COLOR[s.c],
                           opacity: 0.85 }} />
              ))}
              {/* the VSC window overlay */}
              <span className="pointer-events-none absolute inset-y-[-3px] rounded-sm bg-amber/20 ring-1 ring-amber/40"
                style={{ left: "57%", width: "6%" }} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.SOFT }} />Soft</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.MEDIUM }} />Medium</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.HARD }} />Hard</span>
        <span><i className="mr-1.5 inline-block h-2 w-3.5 rounded-[2px] bg-amber/25 align-middle ring-1 ring-amber/40" />VSC window</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every stint, stop and undercut mapped out — with the decisive calls explained
        in plain English.
      </p>
    </div>
  );
}

/* ---- scene 5: the historical archive ---- */
const CHAMP_DEMO = [
  { name: "M. Verstappen", team: "Red Bull", pts: 437, color: "#3671C6" },
  { name: "L. Norris", team: "McLaren", pts: 374, color: "#FF8000" },
  { name: "C. Leclerc", team: "Ferrari", pts: 356, color: "#E8002D" },
];

function HistoryScene() {
  const max = CHAMP_DEMO[0].pts;
  return (
    <div>
      <div className="label mb-2 text-accent-soft">Historical archive · 2024 standings</div>
      <div className="max-w-2xl space-y-2.5">
        {CHAMP_DEMO.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-right text-sm font-bold tabular-nums text-ink-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {r.name} <span className="text-xs text-ink-faint">{r.team}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">{r.pts} pts</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full origin-left animate-grow-x rounded-full"
                  style={{ width: `${(r.pts / max) * 100}%`, background: r.color,
                           animationDelay: `${i * 90}ms` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Official results, qualifying and championship standings for every season
        since 1950 — searchable in seconds.
      </p>
    </div>
  );
}
