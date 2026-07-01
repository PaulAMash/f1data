"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, BarChart3, Braces, Gauge, GitCompareArrows, LayoutDashboard,
  MessageSquareText, TestTube, Timer, Wind,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { RaceSelector, type Selection } from "@/components/explorer/RaceSelector";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { InfoTip } from "@/components/ui/InfoTip";
import { Skeleton, ErrorState, EmptyState } from "@/components/ui/misc";
import { RaceOverview } from "@/components/dashboard/RaceOverview";
import { PositionChart } from "@/components/charts/PositionChart";
import { TyreStrategyChart } from "@/components/charts/TyreStrategyChart";
import { PaceAnalysis } from "@/components/charts/PaceAnalysis";
import { RaceControlWeather } from "@/components/charts/RaceControlWeather";
import { StrategyExplainer } from "@/components/strategy/StrategyExplainer";
import { QuestionBox } from "@/components/strategy/QuestionBox";
import { DriverComparison } from "@/components/driver-comparison/DriverComparison";
import { SimulatorLite } from "@/components/strategy/SimulatorLite";
import { api } from "@/lib/api";
import type { Meta, RaceBundle } from "@/lib/types";

const TABS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { id: "position", label: "Position", icon: <Activity size={14} /> },
  { id: "tyres", label: "Tyres", icon: <Timer size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "control", label: "Race control", icon: <Wind size={14} /> },
  { id: "explain", label: "Explain", icon: <Braces size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "simulate", label: "Simulator", icon: <TestTube size={14} /> },
];

export default function Explorer() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sel, setSel] = useState<Selection>({ year: 2026, gp: "Austrian Grand Prix", session: "Race", mock: false });
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      setSel((s) => ({ ...s, year: m.default_year, mock: m.mock_mode }));
    }).catch(() => setMeta(null));
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

  return (
    <div className="min-h-screen">
      <NavBar active="explorer" />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* header + selector */}
        <div className="mb-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div>
              <div className="label">Race Explorer</div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {session ? session.grand_prix : "Loading race…"}
                <span className="ml-2 text-base font-normal text-ink-faint">
                  {session ? `${session.year} · ${session.session_type}` : ""}
                </span>
              </h1>
            </div>
            {bundle && <DataSourceBadge source={bundle.source} />}
          </div>
          <RaceSelector value={sel} onChange={setSel} loading={loading}
            onRefresh={() => setRefreshKey((k) => k + 1)} />
          {session?.notes?.map((n, i) => (
            <p key={i} className="mt-2 rounded-lg border border-amber/20 bg-amber/[0.05] px-3 py-1.5 text-xs text-amber/90">
              {n}
            </p>
          ))}
        </div>

        {/* tabs */}
        <Tabs items={TABS} active={tab} onChange={setTab} className="mb-5" />

        {loading && <LoadingDashboard />}
        {error && !loading && (
          <Card><ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} /></Card>
        )}

        {bundle && session && !loading && !error && (
          <div className="animate-fade-in">
            {tab === "overview" && <RaceOverview bundle={bundle} />}

            {tab === "position" && (
              <Section title="Track position" info="One line per driver, P1 at the top. Shaded bands are VSC / safety-car windows; hover any lap for tyre, gap and pit detail.">
                <PositionChart session={session} selected={selected} onSelect={setSelected} />
              </Section>
            )}

            {tab === "tyres" && (
              <Section title="Tyre strategy timeline" info="Each bar is a stint, coloured by compound and labelled with its length. VSC/SC windows sit behind the bars; ▲ marks a detected undercut.">
                <TyreStrategyChart session={session} undercuts={bundle.strategy.undercuts} highlight={selected} />
              </Section>
            )}

            {tab === "pace" && (
              <Section title="Pace analysis" info="Separates real speed from track position using fuel- and tyre-corrected clean-air pace.">
                <PaceAnalysis session={session} pace={bundle.pace} selected={selected} />
              </Section>
            )}

            {tab === "control" && (
              <Section title="Race control & weather" info="Flags, neutralizations and conditions — and which drivers converted a cheap stop in each window.">
                <RaceControlWeather session={session} />
              </Section>
            )}

            {tab === "explain" && (
              <Section title="Explain the race">
                <StrategyExplainer strategy={bundle.strategy} onFocusDrivers={(d) => { setSelected(d); setTab("position"); }} />
              </Section>
            )}

            {tab === "ask" && (
              <Section title="Ask about this race" info="Answered from the computed race data. Works with no API key.">
                <QuestionBox year={sel.year} gp={session.grand_prix} session={sel.session}
                  mock={bundle.source === "mock"} llmAvailable={meta?.llm_available ?? false} />
              </Section>
            )}

            {tab === "compare" && (
              <Section title="Driver comparison">
                <DriverComparison bundle={bundle} year={sel.year} gp={session.grand_prix}
                  session={sel.session} mock={bundle.source === "mock"} initial={selected} />
              </Section>
            )}

            {tab === "simulate" && (
              <Section title="Strategy simulator (lite)" info="A directional what-if estimate grounded in the real race — clearly not an exact result.">
                <SimulatorLite bundle={bundle} year={sel.year} gp={session.grand_prix}
                  session={sel.session} mock={bundle.source === "mock"} />
              </Section>
            )}
          </div>
        )}

        {!bundle && !loading && !error && (
          <Card><EmptyState title="Pick a race to begin" hint="Choose a season, Grand Prix and session above." /></Card>
        )}
      </div>
    </div>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" /><Skeleton className="h-48" />
      </div>
    </div>
  );
}
