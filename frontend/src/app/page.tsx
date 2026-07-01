import Link from "next/link";
import {
  ArrowRight, BookOpen, Database, MessageSquareText, Timer, Trophy,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";

const FEATURES = [
  { icon: BookOpen, title: "Race Story", body: "Who won, why, the turning point, and who gained or lost — the whole race in a plain-English recap." },
  { icon: Timer, title: "Strategy timeline", body: "Tyre stints, pit windows and undercuts laid out visually, with the decisive calls explained." },
  { icon: MessageSquareText, title: "Ask the race", body: "“Why did Leclerc lose places?” “What could Max have done better?” Answered from the real data." },
  { icon: Trophy, title: "Historical archive", body: "Look up official results, qualifying and championship standings from 1950 to today." },
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

      {/* Example preview */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <ExamplePreview />
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
            <div key={f.title} className="card card-hover p-5">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/10">
                <f.icon size={17} className="text-accent-soft" />
              </div>
              <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </div>
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

/** A styled, non-interactive snapshot of the product (clearly an example). */
function ExamplePreview() {
  const rows = [
    { d: "VER", strat: [34, 33, 33] },
    { d: "NOR", strat: [30, 40, 30] },
    { d: "PIA", strat: [22, 40, 38] },
    { d: "LEC", strat: [20, 30, 25, 25] },
  ];
  const colors = ["#ffcf3f", "#e7ecf3", "#ff3b3b", "#e7ecf3"];
  return (
    <div className="card overflow-hidden p-1.5">
      <div className="rounded-xl bg-base-950/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="label">Race Story preview</div>
            <div className="text-sm font-semibold">Austrian Grand Prix · Race</div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-ink-muted">
            Example preview
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-lg border border-white/[0.06] bg-base-850/60 p-4">
            <div className="label mb-3">Tyre strategy</div>
            <div className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.d} className="flex items-center gap-3">
                  <span className="w-8 text-xs font-semibold text-ink-muted">{r.d}</span>
                  <div className="flex h-4 flex-1 overflow-hidden rounded">
                    {r.strat.map((w, i) => (
                      <div key={i} style={{ width: `${w}%`, background: colors[i % colors.length] }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-base-850/60 p-4">
            <div className="label mb-3">Why it happened</div>
            <p className="text-sm leading-relaxed text-ink-muted">
              <span className="text-ink">LEC</span> had the 2nd-fastest true pace but finished P4 — a{" "}
              <span className="text-accent-soft">third stop</span> dropped him behind two-stoppers.
              The turning point was the <span className="text-amber">VSC on laps 34–37</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
