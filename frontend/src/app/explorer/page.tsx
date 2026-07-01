"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, BookOpen, Database, GitCompareArrows, MessageSquareText,
  Gauge, Layers, LineChart, Timer, Wind, Braces, TestTube,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { RaceSelector, type Selection } from "@/components/explorer/RaceSelector";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { Skeleton, ErrorState, EmptyState } from "@/components/ui/misc";
import { RaceStory } from "@/components/dashboard/RaceStory";
import { PracticeView } from "@/components/dashboard/PracticeView";
import { DataSourcesPanel } from "@/components/dashboard/DataSourcesPanel";
import { PositionChart } from "@/components/charts/PositionChart";
import { TyreStrategyChart } from "@/components/charts/TyreStrategyChart";
import { PaceAnalysis } from "@/components/charts/PaceAnalysis";
import { RaceControlWeather } from "@/components/charts/RaceControlWeather";
import { StrategyExplainer } from "@/components/strategy/StrategyExplainer";
import { QuestionBox } from "@/components/strategy/QuestionBox";
import { DriverComparison } from "@/components/driver-comparison/DriverComparison";
import { SimulatorLite } from "@/components/strategy/SimulatorLite";
import { ModeProvider, useMode } from "@/lib/mode";
import { api } from "@/lib/api";
import type { Meta, RaceBundle } from "@/lib/types";
import { cx } from "@/lib/format";

const RACE_TABS = [
  { id: "story", label: "Race Story", icon: <BookOpen size={14} /> },
  { id: "charts", label: "Charts", icon: <LineChart size={14} /> },
  { id: "strategy", label: "Strategy", icon: <Braces size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
  { id: "data", label: "Data", icon: <Database size={14} /> },
];
const PRACTICE_TABS = [
  { id: "story", label: "Session Story", icon: <BookOpen size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "runs", label: "Runs & Tyres", icon: <Layers size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
  { id: "data", label: "Data", icon: <Database size={14} /> },
];

export default function ExplorerPage() {
  return (
    <ModeProvider>
      <Explorer />
    </ModeProvider>
  );
}

function Explorer() {
  const { mode, setMode } = useMode();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sel, setSel] = useState<Selection>({ year: 2026, gp: "Austrian Grand Prix", session: "Race", mock: false });
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("story");
  const [chartTab, setChartTab] = useState("position");
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.meta().then((m) => { setMeta(m); setSel((s) => ({ ...s, year: m.default_year, mock: m.mock_mode })); })
      .catch(() => setMeta(null));
  }, []);

  const load = useCallback((refresh: boolean) => {
    setLoading(true); setError(null);
    api.session(sel.year, sel.gp, sel.session, sel.mock, refresh)
      .then((b) => { setBundle(b); setSelected([]); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sel.year, sel.gp, sel.session, sel.mock]);

  useEffect(() => {
    load(refreshKey > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.year, sel.gp, sel.session, sel.mock, refreshKey]);

  const session = bundle?.session;
  const category = bundle?.category ?? "race";
  const tabs = category === "practice" ? PRACTICE_TABS : RACE_TABS;

  // keep the active tab valid when the session category changes
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const subtitle = useMemo(() => {
    if (!session) return "";
    return [session.year, session.session_type, session.circuit?.name].filter(Boolean).join(" · ");
  }, [session]);

  return (
    <div className="min-h-screen">
      <NavBar active="explorer" />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* clean header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {session ? session.grand_prix : "Loading…"}
              </h1>
              {bundle?.source === "mock" && <DemoChip />}
              {bundle?.source !== "mock" && session?.partial && <PartialChip onClick={() => setTab("data")} />}
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">
              {subtitle}
              {bundle && (
                <button onClick={() => setTab("data")}
                  className="ml-2 text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink-muted">
                  data sources
                </button>
              )}
            </p>
          </div>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        {/* compact controls */}
        <div className="mb-4">
          <RaceSelector value={sel} onChange={setSel} loading={loading}
            onRefresh={() => setRefreshKey((k) => k + 1)} />
        </div>

        {/* subtle data note only when it matters */}
        {session?.notes?.length && (bundle?.source === "mock" || session.partial) ? (
          <p className="mb-4 rounded-lg border border-amber/15 bg-amber/[0.04] px-3 py-1.5 text-xs text-amber/90">
            {session.notes[0]}
          </p>
        ) : null}

        <Tabs items={tabs} active={tab} onChange={setTab} className="mb-5" />

        {loading && <LoadingDashboard />}
        {error && !loading && <Card><ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} /></Card>}

        {bundle && session && !loading && !error && (
          <div className="animate-fade-in">
            {/* ---- race sections ---- */}
            {category !== "practice" && tab === "story" && (
              <RaceStory bundle={bundle} onJump={setTab} />
            )}
            {category !== "practice" && tab === "charts" && (
              <div className="space-y-4">
                <Tabs items={[
                  { id: "position", label: "Position", icon: <Activity size={14} /> },
                  { id: "tyres", label: "Tyres", icon: <Timer size={14} /> },
                  { id: "control", label: "Race control & weather", icon: <Wind size={14} /> },
                ]} active={chartTab} onChange={setChartTab} />
                {chartTab === "position" && (
                  <Section title="Track position" info="One line per driver, P1 at the top. Shaded bands are safety-car / VSC windows; hover any lap for tyre, gap and pit detail.">
                    <PositionChart session={session} selected={selected} onSelect={setSelected} />
                  </Section>
                )}
                {chartTab === "tyres" && (
                  <Section title="Tyre strategy timeline" info="Each bar is a stint, coloured by compound. ▲ marks a detected undercut; shaded bands are neutralizations.">
                    <TyreStrategyChart session={session} undercuts={bundle.strategy.undercuts} highlight={selected} />
                  </Section>
                )}
                {chartTab === "control" && (
                  <Section title="Race control & weather">
                    <RaceControlWeather session={session} />
                  </Section>
                )}
              </div>
            )}
            {category !== "practice" && tab === "strategy" && (
              <div className="space-y-4">
                <Section title="Explain the race">
                  <StrategyExplainer strategy={bundle.strategy}
                    onFocusDrivers={(d) => { setSelected(d); setChartTab("position"); setTab("charts"); }} />
                </Section>
                {mode === "advanced" && (
                  <Section title="Strategy simulator (lite)" info="A directional what-if estimate grounded in the real race — clearly not an exact result.">
                    <SimulatorLite bundle={bundle} year={sel.year} gp={session.grand_prix}
                      session={sel.session} mock={bundle.source === "mock"} />
                  </Section>
                )}
              </div>
            )}
            {category !== "practice" && tab === "pace" && (
              <Section title="Pace analysis" info="Separates real speed from track position using fuel- and tyre-corrected clean-air pace.">
                <PaceAnalysis session={session} pace={bundle.pace} selected={selected} />
              </Section>
            )}

            {/* ---- practice sections ---- */}
            {category === "practice" && bundle.practice && ["story", "pace", "runs"].includes(tab) && (
              <PracticeView practice={bundle.practice} session={session}
                section={tab as "story" | "pace" | "runs"} />
            )}

            {/* ---- shared sections ---- */}
            {tab === "compare" && (
              <Section title="Driver comparison">
                <DriverComparison bundle={bundle} year={sel.year} gp={session.grand_prix}
                  session={sel.session} mock={bundle.source === "mock"} initial={selected} />
              </Section>
            )}
            {tab === "ask" && (
              <Section title="Ask about this session" info="Answered from the loaded data. Works with no API key. Try messy, plain-English questions.">
                <QuestionBox year={sel.year} gp={session.grand_prix} session={sel.session}
                  mock={bundle.source === "mock"} llmAvailable={meta?.llm_available ?? false}
                  category={category} />
              </Section>
            )}
            {tab === "data" && (
              <DataSourcesPanel year={sel.year} gp={session.grand_prix} session={sel.session}
                mock={bundle.source === "mock"} onRefetch={() => setRefreshKey((k) => k + 1)} />
            )}
          </div>
        )}

        {!bundle && !loading && !error && (
          <Card><EmptyState title="Pick a session to begin" hint="Choose a season, Grand Prix and session above." /></Card>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }: { mode: string; setMode: (m: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <InfoTip label="Simple vs Advanced" text="Simple keeps it plain-English and story-first. Advanced adds full tables, raw metrics, the simulator and diagnostics." />
      <div className="flex rounded-lg border border-white/[0.06] bg-base-850/60 p-1 text-xs">
        {(["simple", "advanced"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={cx("rounded-md px-3 py-1.5 font-medium capitalize transition-colors",
              mode === m ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-semibold text-amber"
      title="Simulated demo data — shown because live F1 data wasn't fetched.">
      Demo data
    </span>
  );
}
function PartialChip({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300"
      title="Some data facets weren't available for this session — see Data.">
      Partial data
    </button>
  );
}

function Section({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} info={info ? <InfoTip text={info} /> : undefined} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
