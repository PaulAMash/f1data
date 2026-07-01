import Link from "next/link";
import {
  Activity, ArrowRight, Braces, Gauge, MessageSquareText, Radar,
  Timer, Trophy, Wind, Zap,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";

const FEATURES = [
  { icon: Activity, title: "Interactive position chart", body: "Lap-by-lap track position for every driver, with pit stops, VSC and safety-car windows highlighted. Toggle, highlight and hover for tyre, gap and race-control detail." },
  { icon: Timer, title: "Tyre strategy timeline", body: "A stint Gantt colour-coded by compound, with pit laps, neutralization windows and degradation — spot undercuts and overcuts at a glance." },
  { icon: Gauge, title: "Real pace analysis", body: "Fuel- and tyre-corrected clean-air pace separates who was actually quick from who was stuck in traffic or hurt by strategy." },
  { icon: Braces, title: "Deterministic strategy explainer", body: "Data-rules and templates — not AI guesswork — surface the decisive window, the best and worst calls, and the missed cheap stops." },
  { icon: MessageSquareText, title: "Ask in plain English", body: "“Why did Leclerc lose places?” “Who benefited from the VSC?” Answered from computed race data, working without any API key." },
  { icon: Wind, title: "Race control & weather", body: "A unified timeline of flags, VSC/SC, penalties and conditions — connected to the strategy decisions they triggered." },
];

const STATS = [
  { k: "1950+", v: "years of history" },
  { k: "Real", v: "F1 data via pitwall" },
  { k: "0", v: "API keys required" },
  { k: "10", v: "analysis modules" },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <NavBar active="home" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <div className="animate-fade-in">
            <span className="chip mb-5">
              <Radar size={13} className="text-accent-soft" /> Virtual pit wall · race strategy room
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Ask <span className="text-accent-soft">why</span> a race unfolded
              the way it did.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Pitwall IQ turns real Formula 1 timing data into an interactive strategy room.
              Explore pace, tyres, pit stops, weather and race control — then get a plain-English
              explanation of the decisive calls.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/explorer"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Open Race Explorer <ArrowRight size={16} />
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-base-800 px-5 py-3 text-sm font-medium text-ink hover:border-white/20"
              >
                <Trophy size={16} /> Historical mode
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.v} className="rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
                  <div className="text-2xl font-semibold text-ink">{s.k}</div>
                  <div className="text-xs text-ink-muted">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Demo preview */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <DemoPreview />
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <div className="label mb-2">What's inside</div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything a race engineer looks at — made explorable.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>

      {/* Data note + CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="card overflow-hidden">
          <div className="grid items-center gap-6 p-8 sm:grid-cols-[1.4fr_1fr] sm:p-10">
            <div>
              <div className="label mb-2">Built on real data</div>
              <h3 className="text-2xl font-semibold tracking-tight">
                Open F1 data first. Optional live telemetry token where available.
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
                Data flows through the open-source <span className="text-ink">pitwall</span> stack
                (FastF1 + the F1 live-timing archive + Jolpica/Ergast). No paid key is needed for the
                full app. When a completed session can't be fetched, a clearly-labelled realistic
                demo race keeps every feature explorable. Tokens and keys stay server-side, never in
                the browser.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Live timing", "Tyre strategy", "Pit stops", "Weather", "Race control", "Standings since 1950"].map((t) => (
                  <span key={t} className="chip">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/explorer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-glow"
              >
                <Zap size={16} /> Open Race Explorer
              </Link>
              <p className="text-center text-xs text-ink-faint">
                Free · open-source friendly · dark-mode native
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-ink-faint sm:flex-row sm:px-6">
          <span>Pitwall IQ · a virtual pit wall for exploring F1 races.</span>
          <span>Data via pitwall / FastF1 / Jolpica · not affiliated with Formula 1.</span>
        </div>
      </footer>
    </div>
  );
}

/** A static, styled preview of the dashboard so the landing sells the product. */
function DemoPreview() {
  const rows = [
    { p: 1, d: "VER", t: "#3671C6", strat: "M · H · H", net: "—" },
    { p: 2, d: "NOR", t: "#FF8000", strat: "M · H · S", net: "▲ 1" },
    { p: 3, d: "PIA", t: "#FF8000", strat: "S · M · H", net: "▲ 1" },
    { p: 4, d: "LEC", t: "#E8002D", strat: "S · M · H · M", net: "▼ 2" },
  ];
  return (
    <div className="card overflow-hidden p-1.5">
      <div className="rounded-xl bg-base-950/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="label">Race Explorer preview</div>
            <div className="text-sm font-semibold">2026 Austrian Grand Prix · Race</div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-amber">
            Demo data
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
                    <div style={{ width: "34%", background: "#ffcf3f" }} />
                    <div style={{ width: "33%", background: "#e7ecf3" }} />
                    <div style={{ width: "33%", background: "#ff3b3b" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-base-850/60 p-4">
            <div className="label mb-3">Strategy explainer</div>
            <p className="text-sm leading-relaxed text-ink-muted">
              <span className="text-ink">LEC</span> had the 2nd-fastest clean-air pace but finished
              P4 — Ferrari's <span className="text-accent-soft">third stop</span> dropped him behind
              two-stoppers. The decisive window was the{" "}
              <span className="text-amber">VSC on laps 34–37</span>, converted cheaply by PIA & RUS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
