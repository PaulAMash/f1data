"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CalendarRange, Database, Flag, FlaskConical, Gauge,
  Layers, MessageSquareText, Pause, Play, Timer, Trophy,
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

// how many sample variants each scene can draw from (index-aligned with SCENES)
const VARIANT_COUNTS = [3, 3, 3, 2, 3];

function ProductShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [variants, setVariants] = useState<number[]>([0, 0, 0, 0, 0]);
  const scene = SCENES[idx];

  // every visit to a scene shows a different race — never the same one twice
  const goTo = (next: number) => {
    setVariants((v) => {
      const copy = [...v];
      const count = VARIANT_COUNTS[next] ?? 1;
      if (count > 1) {
        let r = Math.floor(Math.random() * count);
        if (r === copy[next]) r = (r + 1) % count;
        copy[next] = r;
      }
      return copy;
    });
    setIdx(next);
  };

  // auto-advance is controlled ONLY by the Play/Pause button — hovering to
  // read a scene doesn't silently stop the tour
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => goTo((idx + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, paused]);

  const v = variants[idx];

  return (
    <div className="card overflow-hidden p-1.5">
      <div className="rounded-xl bg-base-950/60 p-4 sm:p-6">
        {/* scene tabs — every module of the product, one click (or wait) away */}
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Product tour">
          {SCENES.map((s, i) => (
            <button key={s.id} role="tab" aria-selected={i === idx} onClick={() => goTo(i)}
              className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                i === idx ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:text-ink"}`}>
              <s.icon size={14} className={i === idx ? "text-accent-soft" : ""} />
              {s.label}
              {i === idx && (
                <span aria-hidden key={`${idx}-${v}`} className="absolute inset-x-0 bottom-0 h-[2px] bg-accent-soft/70"
                  style={{ animation: `progress ${SCENE_MS}ms linear both`,
                           animationPlayState: paused ? "paused" : "running" }} />
              )}
            </button>
          ))}
          {/* make the auto-rotation explicit — nobody should have to guess */}
          <span className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-ink-faint sm:inline-flex"
              title="This preview uses illustrative sample data — the product runs on real timing data.">
              <FlaskConical size={11} /> Sample data
            </span>
            <button onClick={() => setPaused((p) => !p)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                paused ? "border-white/15 bg-white/[0.04] text-ink-muted"
                       : "border-accent/30 bg-accent/[0.08] text-accent-soft"}`}
              title={paused ? "Resume the tour" : "The tour advances automatically — click to pause"}>
              {paused ? <><Pause size={11} /> Paused</> : <><Play size={11} /> Auto-playing</>}
            </button>
          </span>
        </div>

        {/* the scene itself — fixed height so rotation never shifts the page */}
        <div className="mt-4 min-h-[260px] sm:min-h-[230px]" aria-live="polite">
          <div key={`${scene.id}-${v}`} className="animate-fade-in">
            {scene.id === "story" && <StoryScene v={v} />}
            {scene.id === "ask" && <AskScene v={v} />}
            {scene.id === "pace" && <PaceScene v={v} />}
            {scene.id === "strategy" && <StrategyScene v={v} />}
            {scene.id === "history" && <HistoryScene v={v} />}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end border-t border-white/[0.05] pt-3">
          <Link href={scene.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft hover:text-accent">
            {scene.cta} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- scene 1: the race story (a different Grand Prix each pass) ---- */
const STORY_VARIANTS = [
  {
    label: "2025 Australian GP · Race Story",
    lede: "Verstappen won from pole, running a two-stop race — but the VSC on lap 34 decided the podium behind him.",
    lines: ["Leclerc had the second-fastest car but a third stop dropped him to P4.",
            "Albon was the day's biggest mover, up 6 places to P9."],
    chips: ["Winner · Verstappen", "Turning point · VSC lap 34", "Biggest mover · Albon +6"],
  },
  {
    label: "2024 Monaco GP · Race Story",
    lede: "Leclerc finally won at home — an early red flag handed the field a free tyre change, and track position did the rest.",
    lines: ["Piastri shadowed him within three seconds, but Monaco offered nowhere to pass.",
            "The entire top ten finished on a single effective stop."],
    chips: ["Winner · Leclerc", "Turning point · Red flag lap 1", "One-stop race"],
  },
  {
    label: "2024 British GP · Race Story",
    lede: "Hamilton won a wet-dry Silverstone thriller — the timing of the final stop for slicks decided it.",
    lines: ["Norris led mid-race but a late tyre call dropped him to P3.",
            "Verstappen recovered to P2 despite damage through the rain phase."],
    chips: ["Winner · Hamilton", "Rain · laps 20–35", "Norris P3"],
  },
];

function StoryScene({ v }: { v: number }) {
  const s = STORY_VARIANTS[v % STORY_VARIANTS.length];
  return (
    <div>
      <div className="label mb-2 text-accent-soft">{s.label}</div>
      <p className="max-w-2xl text-[17px] font-medium leading-relaxed text-ink">{s.lede}</p>
      <div className="mt-3 max-w-2xl space-y-1.5 border-l-2 border-white/[0.07] pl-4">
        {s.lines.map((l) => (
          <p key={l} className="text-sm leading-relaxed text-ink-muted">{l}</p>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {s.chips.map((c) => <span key={c} className="chip">{c}</span>)}
      </div>
    </div>
  );
}

/* ---- scene 2: ask the race (types itself; question varies) ---- */
const ASK_VARIANTS = [
  {
    q: "Why did Leclerc finish P4?",
    a: "He had the second-fastest true pace, but a third stop cost ~20s of pit-lane time and dropped him behind the two-stoppers. The VSC on lap 34 sealed it.",
    tags: ["P2 pace, P4 result", "3 stops vs 2", "VSC lap 34–37"],
  },
  {
    q: "Who had the best race pace?",
    a: "Verstappen — quickest once fuel and tyres are corrected, about 0.16s per lap faster than Leclerc, and he converted it into the win.",
    tags: ["Clean-air pace", "+0.16s/lap margin", "Pole → win"],
  },
  {
    q: "What could Antonelli have done better?",
    a: "Cover the undercut. He had podium pace, but staying out through the cheap-stop window dropped him into traffic he never cleared.",
    tags: ["P3 pace, P15 result", "Missed VSC window", "Traffic after rejoin"],
  },
];

function AskScene({ v }: { v: number }) {
  const item = ASK_VARIANTS[v % ASK_VARIANTS.length];
  const [typed, setTyped] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setTyped((n) => {
        if (n >= item.q.length) { clearInterval(t); setShowAnswer(true); return n; }
        return n + 1;
      });
    }, 30);
    return () => clearInterval(t);
  }, [item.q]);

  return (
    <div>
      <div className="label mb-2 text-accent-soft">Ask the race</div>
      <div className="flex max-w-2xl items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 px-3.5 py-2.5">
        <MessageSquareText size={15} className="shrink-0 text-ink-faint" />
        <span className="min-h-[1.25rem] text-sm text-ink">
          {item.q.slice(0, typed)}
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-soft align-middle" />
        </span>
      </div>
      <div className={`mt-3.5 max-w-2xl transition-all duration-500 ${showAnswer ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
        <p className="text-[15px] leading-relaxed text-ink">{item.a}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
      </div>
    </div>
  );
}

/* ---- scene 3: pace analysis (true speed vs results; race varies) ---- */
const PACE_VARIANTS = [
  {
    label: "2025 Australian GP · clean-air speed",
    rows: [
      { code: "VER", color: "#3671C6", gap: 0 },
      { code: "LEC", color: "#E8002D", gap: 0.16 },
      { code: "NOR", color: "#FF8000", gap: 0.21 },
      { code: "RUS", color: "#27F4D2", gap: 0.38 },
      { code: "ALO", color: "#229971", gap: 0.55 },
    ],
  },
  {
    label: "2024 Monaco GP · clean-air speed",
    rows: [
      { code: "LEC", color: "#E8002D", gap: 0 },
      { code: "PIA", color: "#FF8000", gap: 0.08 },
      { code: "SAI", color: "#E8002D", gap: 0.22 },
      { code: "NOR", color: "#FF8000", gap: 0.31 },
      { code: "RUS", color: "#27F4D2", gap: 0.49 },
    ],
  },
  {
    label: "2024 British GP · clean-air speed",
    rows: [
      { code: "HAM", color: "#27F4D2", gap: 0 },
      { code: "RUS", color: "#27F4D2", gap: 0.05 },
      { code: "NOR", color: "#FF8000", gap: 0.11 },
      { code: "VER", color: "#3671C6", gap: 0.18 },
      { code: "PIA", color: "#FF8000", gap: 0.24 },
    ],
  },
];

function PaceScene({ v }: { v: number }) {
  const variant = PACE_VARIANTS[v % PACE_VARIANTS.length];
  const max = variant.rows[variant.rows.length - 1].gap;
  return (
    <div>
      <div className="label mb-2 text-accent-soft">{variant.label}</div>
      <div className="max-w-2xl space-y-2">
        {variant.rows.map((p, i) => (
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
type StratRow = { code: string; stints: { c: keyof typeof COMPOUND_COLOR; laps: number }[] };
const STRAT_VARIANTS: {
  label: string; rows: StratRow[]; total: number;
  window: { left: number; width: number; tag: string };
}[] = [
  {
    label: "2025 Australian GP · tyre stints & pit windows",
    total: 58,
    rows: [
      { code: "VER", stints: [{ c: "MEDIUM", laps: 30 }, { c: "HARD", laps: 28 }] },
      { code: "NOR", stints: [{ c: "MEDIUM", laps: 34 }, { c: "HARD", laps: 24 }] },
      { code: "LEC", stints: [{ c: "SOFT", laps: 18 }, { c: "MEDIUM", laps: 22 }, { c: "SOFT", laps: 18 }] },
    ],
    window: { left: 0.585, width: 0.06, tag: "VSC" },
  },
  {
    label: "2024 British GP · tyre stints & pit windows",
    total: 52,
    rows: [
      { code: "HAM", stints: [{ c: "MEDIUM", laps: 18 }, { c: "INTERMEDIATE", laps: 15 }, { c: "SOFT", laps: 19 }] },
      { code: "VER", stints: [{ c: "MEDIUM", laps: 17 }, { c: "INTERMEDIATE", laps: 17 }, { c: "HARD", laps: 18 }] },
      { code: "NOR", stints: [{ c: "MEDIUM", laps: 19 }, { c: "INTERMEDIATE", laps: 16 }, { c: "SOFT", laps: 17 }] },
    ],
    window: { left: 0.33, width: 0.09, tag: "RAIN" },
  },
];

function StrategyScene({ v }: { v: number }) {
  const s = STRAT_VARIANTS[v % STRAT_VARIANTS.length];
  const hasInters = s.rows.some((r) => r.stints.some((st) => st.c === "INTERMEDIATE"));
  return (
    <div>
      <div className="label mb-2 text-accent-soft">{s.label}</div>
      {/* one dash-outlined overlay spans all three cars, so the neutralization
          reads as a moment in the race, not another stint */}
      <div className="relative max-w-2xl pt-4">
        <div className="space-y-2">
          {s.rows.map((d) => (
            <div key={d.code} className="flex items-center gap-3">
              <span className="w-9 shrink-0 text-xs font-semibold text-ink">{d.code}</span>
              <span className="flex h-4 flex-1 gap-[3px]">
                {d.stints.map((st, i) => (
                  <span key={i} className="h-full rounded-[4px]"
                    style={{ width: `${(st.laps / s.total) * 100}%`, background: COMPOUND_COLOR[st.c],
                             opacity: 0.85 }} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-[-4px] top-0 rounded-md border-2 border-dashed border-amber bg-amber/[0.07]"
          style={{ left: `calc(3rem + (100% - 3rem) * ${s.window.left})`,
                   width: `calc((100% - 3rem) * ${s.window.width})` }}>
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-sm bg-base-950 px-1 text-[9px] font-bold tracking-wider text-amber">
            {s.window.tag}
          </span>
        </div>
      </div>
      <div className="mt-3 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.SOFT }} />Soft</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.MEDIUM }} />Medium</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.HARD }} />Hard</span>
        {hasInters && <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COMPOUND_COLOR.INTERMEDIATE }} />Inter</span>}
        <span><i className="mr-1.5 inline-block h-2 w-3.5 rounded-[2px] border border-dashed border-amber bg-amber/[0.07] align-middle" />{s.window.tag === "RAIN" ? "Rain window" : "VSC window"}</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every stint, stop and undercut mapped out — with the decisive calls explained
        in plain English.
      </p>
    </div>
  );
}

/* ---- scene 5: the historical archive (era varies) ---- */
const HISTORY_VARIANTS = [
  {
    label: "Historical archive · 2024 standings",
    rows: [
      { name: "M. Verstappen", team: "Red Bull", pts: 437, color: "#3671C6" },
      { name: "L. Norris", team: "McLaren", pts: 374, color: "#FF8000" },
      { name: "C. Leclerc", team: "Ferrari", pts: 356, color: "#E8002D" },
    ],
  },
  {
    label: "Historical archive · 2021 standings",
    rows: [
      { name: "M. Verstappen", team: "Red Bull", pts: 395.5, color: "#3671C6" },
      { name: "L. Hamilton", team: "Mercedes", pts: 387.5, color: "#27F4D2" },
      { name: "V. Bottas", team: "Mercedes", pts: 226, color: "#27F4D2" },
    ],
  },
  {
    label: "Historical archive · 2008 standings",
    rows: [
      { name: "L. Hamilton", team: "McLaren", pts: 98, color: "#B6BABD" },
      { name: "F. Massa", team: "Ferrari", pts: 97, color: "#E8002D" },
      { name: "K. Räikkönen", team: "Ferrari", pts: 75, color: "#E8002D" },
    ],
  },
];

function HistoryScene({ v }: { v: number }) {
  const variant = HISTORY_VARIANTS[v % HISTORY_VARIANTS.length];
  const max = variant.rows[0].pts;
  return (
    <div>
      <div className="label mb-2 text-accent-soft">{variant.label}</div>
      <div className="max-w-2xl space-y-2.5">
        {variant.rows.map((r, i) => (
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
