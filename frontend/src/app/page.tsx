"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, Database, MessageSquareText, Timer, Trophy,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";

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

// Curated example sessions — link straight into the Explorer.
const EXAMPLES = [
  { label: "2025 Australian GP", year: 2025, gp: "Australian Grand Prix" },
  { label: "2024 Monaco GP", year: 2024, gp: "Monaco Grand Prix" },
  { label: "2024 British GP", year: 2024, gp: "British Grand Prix" },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pt-24">
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

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-faint">Jump to an example:</span>
              {EXAMPLES.map((e) => (
                <Link key={e.label}
                  href={`/explorer?year=${e.year}&gp=${encodeURIComponent(e.gp)}&session=Race`}
                  className="chip hover:border-white/20 hover:text-ink">{e.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Self-demonstrating Ask card + honest coverage strip */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <AskDemo />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-ink-faint">
          <span>Coverage 1950 – today</span>
          <span className="hidden sm:inline text-white/10">·</span>
          <span>1,100+ Grands Prix</span>
          <span className="hidden sm:inline text-white/10">·</span>
          <span>Lap-by-lap detail for recent seasons</span>
          <span className="hidden sm:inline text-white/10">·</span>
          <span>8 analysis modules</span>
        </div>
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

// The homepage silently demonstrates the product: a question types itself, the
// data-backed answer fades in, and it cycles. No clicks required.
const DEMO_QA = [
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
    q: "How did the top 2 compare?",
    a: "Verstappen beat Norris by 2.0s on track with a 0.3s/lap edge in underlying pace. Norris matched him on strategy — the difference was pure speed.",
    tags: ["Final gap 2.0s", "Same 2-stop strategy", "Pace decided it"],
  },
  {
    q: "What could Antonelli have done better?",
    a: "Cover the undercut. He had podium pace, but staying out through the cheap-stop window dropped him into traffic he never cleared.",
    tags: ["P3 pace, P15 result", "Missed VSC window", "Traffic after rejoin"],
  },
];

function AskDemo() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const item = DEMO_QA[idx];

  useEffect(() => {
    setTyped(0); setShowAnswer(false);
    const typeTimer = setInterval(() => {
      setTyped((t) => {
        if (t >= DEMO_QA[idx].q.length) { clearInterval(typeTimer); setShowAnswer(true); return t; }
        return t + 1;
      });
    }, 34);
    const nextTimer = setTimeout(() => setIdx((i) => (i + 1) % DEMO_QA.length), 7000);
    return () => { clearInterval(typeTimer); clearTimeout(nextTimer); };
  }, [idx]);

  return (
    <div className="card overflow-hidden p-1.5">
      <div className="rounded-xl bg-base-950/60 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="label">Ask the race</span>
          <span className="flex gap-1.5">
            {DEMO_QA.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Example ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-accent-soft" : "w-1.5 bg-white/15 hover:bg-white/30"}`} />
            ))}
          </span>
        </div>

        {/* the "input" with a typing question */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 px-3.5 py-2.5">
          <MessageSquareText size={15} className="shrink-0 text-ink-faint" />
          <span className="min-h-[1.25rem] text-sm text-ink">
            {item.q.slice(0, typed)}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent-soft align-middle" />
          </span>
        </div>

        {/* the answer */}
        <div className={`mt-4 transition-all duration-500 ${showAnswer ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink">{item.a}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
        </div>

        <div className="mt-5 border-t border-white/[0.05] pt-3 text-xs text-ink-faint">
          Every answer is computed from real timing data — try your own on any race.
        </div>
      </div>
    </div>
  );
}
