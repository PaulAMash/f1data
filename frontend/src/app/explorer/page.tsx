"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BookOpen, Database, GitCompareArrows, MessageSquareText,
  Gauge, Layers, LineChart, Timer, Wind, Braces, RefreshCw, AlertTriangle,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Walkthrough, type Step } from "@/components/ui/Walkthrough";
import { RaceSelector, type Selection } from "@/components/explorer/RaceSelector";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { Skeleton, EmptyState, LoadingState } from "@/components/ui/misc";
import { RaceStory } from "@/components/dashboard/RaceStory";
import { PracticeView } from "@/components/dashboard/PracticeView";
import { QualifyingView } from "@/components/dashboard/QualifyingView";
import { DataSourcesPanel } from "@/components/dashboard/DataSourcesPanel";
import { PositionChart } from "@/components/charts/PositionChart";
import { TyreStrategyChart } from "@/components/charts/TyreStrategyChart";
import { PaceAnalysis } from "@/components/charts/PaceAnalysis";
import { RaceControlWeather } from "@/components/charts/RaceControlWeather";
import { StrategyExplainer } from "@/components/strategy/StrategyExplainer";
import { QuestionBox } from "@/components/strategy/QuestionBox";
import { DriverComparison } from "@/components/driver-comparison/DriverComparison";
import { useMode } from "@/lib/mode";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import type { Meta, RaceBundle } from "@/lib/types";

// Three purpose-built experiences: a race asks "why did it unfold this way?",
// qualifying asks "who earned the grid?", practice asks "what did we learn?".
const RACE_TABS = [
  { id: "story", label: "Race Story", icon: <BookOpen size={14} /> },
  { id: "charts", label: "Charts", icon: <LineChart size={14} /> },
  { id: "strategy", label: "Strategy", icon: <Braces size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
];
const QUALI_TABS = [
  { id: "story", label: "Qualifying Story", icon: <BookOpen size={14} /> },
  { id: "laps", label: "Lap Analysis", icon: <LineChart size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
];
const PRACTICE_TABS = [
  { id: "story", label: "Session Story", icon: <BookOpen size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "runs", label: "Runs & Tyres", icon: <Layers size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
];
// Tabs where Simple/Advanced actually changes the content — the toggle hides
// elsewhere. Race Story switches between the plain recap (top-10, podium
// timeline) and the analyst view (full field, verdicts, DOTD); Strategy/
// Compare/Sources render one view; Ask carries its own per-answer toggle.
// Practice sessions are fully mode-free.
const MODE_AWARE_TABS = new Set(["story", "charts", "pace"]);

/* Four steps, one line each, every one pointing at something already on screen
   with the reader's own race in it. Anything that needs a paragraph is a sign
   the interface underneath needs the work instead. */
const TOUR: Step[] = [
  { target: "[data-tour='selector']", title: "Pick any session",
    body: "Season, Grand Prix and session — practice and qualifying included. It opens on the most recent completed race." },
  { target: "[data-tour='tabs']", title: "One race, several readings",
    body: "Story is the recap. The others go deeper into the charts, the strategy calls, the pace and the tyres." },
  { target: "[data-tour='sources']", title: "Always checkable",
    body: "Every number says which F1 source it came from, and what wasn't available. Nothing here is invented." },
  { target: "[data-tour='mode']", title: "Change the depth whenever",
    body: "Simple reads like a commentator; Advanced shows every measurement. Your choice is remembered." },
];

export default function ExplorerPage() {
  const { mode } = useMode();
  const isAdvanced = mode === "advanced";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sel, setSel] = useState<Selection>({ year: 2026, gp: "Austrian Grand Prix", session: "Race" });
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState("story");
  const [chartTab, setChartTab] = useState("position");
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  // No session is fetched until /api/current resolves the real default — this
  // prevents the season label flashing and prevents fetching a race that hasn't
  // happened yet (the backend now picks the latest *completed* Grand Prix).
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const qYear = q?.get("year"); const qGp = q?.get("gp"); const qSession = q?.get("session");
    const qTab = q?.get("tab");
    if (qTab) setTab(qTab);
    api.current().then((cur) => {
      setCurrentSeason(cur.year);
      if (qGp) setSel({ year: qYear ? Number(qYear) : cur.year, gp: qGp, session: qSession || "Race" });
      else if (cur.gp) setSel({ year: cur.year, gp: cur.gp, session: "Race" });
    }).catch(() => {
      if (qGp) setSel({ year: qYear ? Number(qYear) : 2025, gp: qGp, session: qSession || "Race" });
    }).finally(() => setBooted(true));
  }, []);

  const load = useCallback((refresh: boolean) => {
    setLoading(true); setError(null);
    api.session(sel.year, sel.gp, sel.session, refresh)
      .then((b) => { setBundle(b); setSelected([]); })
      .catch((e) => { setBundle(null); setError(e instanceof ApiError ? e : new ApiError(String(e?.message ?? e))); })
      .finally(() => setLoading(false));
  }, [sel.year, sel.gp, sel.session]);

  useEffect(() => {
    if (!booted) return;
    load(refreshKey > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, sel.year, sel.gp, sel.session, refreshKey]);

  const session = bundle?.session;
  const category = bundle?.category ?? "race";
  const isQuali = category === "qualifying" || category === "sprint_qualifying";
  const isRaceLike = category === "race" || category === "sprint";
  const tabs = category === "practice" ? PRACTICE_TABS : isQuali ? QUALI_TABS : RACE_TABS;

  useEffect(() => {
    // "data" is a valid view reached via the Sources button, not a tab
    if (tab !== "data" && !tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isAdvanced]);

  /* Changing what you're looking at returns you to its Story.
   *
   * The tab id was being preserved across sessions because "pace" happens to
   * exist in all three tab sets — so choosing Qualifying after reading Practice
   * pace dropped you into a qualifying pace table with no idea what had
   * happened in the session. Every session is a new narrative and the Story is
   * its front door; the deeper tabs are things you go to next, not things you
   * arrive in. The same applies to changing Grand Prix or season, which is a
   * bigger context switch again.
   *
   * The very first render is exempt so a shared ?tab= link still opens where it
   * points. */
  const lastSel = useRef<string | null>(null);
  useEffect(() => {
    // arm only once the real default has resolved, so resolving it doesn't
    // itself count as a change and throw away a ?tab= deep link
    if (!booted) return;
    const key = `${sel.year}|${sel.gp}|${sel.session}`;
    if (lastSel.current !== null && lastSel.current !== key) {
      setTab("story");
      setChartTab("position");
    }
    lastSel.current = key;
  }, [booted, sel.year, sel.gp, sel.session]);

  const subtitle = useMemo(() => {
    if (!session) return "";
    return [session.year, session.session_type, session.circuit?.name].filter(Boolean).join(" · ");
  }, [session]);

  return (
    <div className="min-h-screen">
      <NavBar active="explorer" />
      {/* Only once the session is actually on screen: a tour that spotlights a
          skeleton teaches the shape of a loading state. */}
      <Walkthrough steps={TOUR} enabled={!!bundle && !loading} />
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        {/* clean header — the race is the hero */}
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              {session ? session.grand_prix : loading ? "Loading…" : "Race Explorer"}
            </h1>
            {bundle?.source === "mock" && <DemoChip />}
            {bundle?.source !== "mock" && session?.partial && <PartialChip onClick={() => setTab("data")} />}
          </div>
          {(session || loading) && (
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          )}
        </div>

        {/* compact controls, grouped so they read as one unit */}
        <div data-tour="selector" className="mb-4 rounded-xl border border-white/[0.05] bg-base-850/40 p-3">
          <RaceSelector value={sel} onChange={setSel} loading={loading}
            onRefresh={() => setRefreshKey((k) => k + 1)} />
        </div>

        {currentSeason && sel.year < currentSeason && (
          <p className="mb-4 rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-3 py-1.5 text-xs text-sky-300/90">
            You&apos;re viewing a previous season ({sel.year}). Full past-season browsing lives in{" "}
            <a href="/history" className="underline decoration-dotted">Historical</a>.
          </p>
        )}

        {/* honest demo note (only when the backend is explicitly in demo mode) */}
        {session?.notes?.length && bundle?.source === "mock" ? (
          <p className="mb-4 rounded-lg border border-amber/15 bg-amber/[0.04] px-3 py-1.5 text-xs text-amber/90">
            {session.notes[0]}
          </p>
        ) : null}

        {/* tell the user exactly what's missing instead of a bare "Partial data" */}
        {bundle?.source !== "mock" && session?.partial &&
          (session.source_report?.missing?.length ?? 0) > 0 && !loading && (
          <p className="mb-4 rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-3 py-1.5 text-xs text-sky-300/90">
            The sources couldn&apos;t provide{" "}
            {session.source_report!.missing.slice(0, 6).map(humanFacet).join(", ")} for this
            session — the tabs that need them will be limited.{" "}
            {/* When the backend knows *why*, say why. "Partial data" with no
                cause reads as a fault in the app; naming the source that
                wasn't answering makes it a fact about the session. */}
            {session.source_report?.missing_reason ? (
              <span className="text-sky-200/75">{session.source_report.missing_reason} </span>
            ) : null}
            <button onClick={() => setTab("data")} className="underline decoration-dotted">
              See exactly what&apos;s available
            </button>
          </p>
        )}

        {(bundle || loading) && (
          <div className="mb-5 flex items-center gap-2">
            <Tabs items={tabs} active={tab} onChange={setTab} className="min-w-0 flex-1" data-tour="tabs" />
            {/* Data provenance lives apart from the analysis tabs on purpose */}
            <button data-tour="sources" onClick={() => setTab(tab === "data" ? tabs[0].id : "data")}
              title="Where this session's data comes from"
              className={cx("inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors",
                tab === "data"
                  ? "border-accent/30 bg-accent/10 text-accent-soft"
                  : "border-white/[0.06] bg-base-850/60 text-ink-muted hover:text-ink")}>
              <Database size={14} /> <span className="hidden sm:inline">Sources</span>
            </button>
          </div>
        )}

        {loading && <LoadingDashboard />}
        {error && !loading && (
          <DataUnavailable error={error} onRetry={() => setRefreshKey((k) => k + 1)}
            onPick={(s) => setSel(s)} onOpenData={() => setTab("data")} />
        )}

        {bundle && session && !loading && !error && (
          <div className="animate-fade-in">
            {isRaceLike && tab === "story" && <RaceStory bundle={bundle} onJump={setTab} />}
            {isRaceLike && tab === "charts" && (
              <div className="space-y-4">
                <Tabs items={[
                  { id: "position", label: "Position", icon: <Activity size={14} /> },
                  { id: "tyres", label: "Tyres", icon: <Timer size={14} /> },
                  { id: "control", label: "Race control & weather", icon: <Wind size={14} /> },
                ]} active={chartTab} onChange={setChartTab} />
                {chartTab === "position" && (
                  <Section title="Track position" info="Every driver's place, lap by lap, P1 at the top. Click any line to follow a driver, jump to key moments, and hover any lap for the full running order.">
                    <PositionChart session={session} selected={selected} onSelect={setSelected}
                      strategy={bundle.strategy} pace={bundle.pace}
                      onDeepDive={(code) => { setSelected([code]); setTab("compare"); }} />
                  </Section>
                )}
                {chartTab === "tyres" && (
                  <Section title="Tyre strategy timeline" info="Each bar is a stint, coloured by compound. ▲ marks a detected undercut; shaded bands are neutralizations. Click a driver to focus their strategy.">
                    <TyreStrategyChart session={session} undercuts={bundle.strategy.undercuts} highlight={selected} onSelect={setSelected} />
                  </Section>
                )}
                {chartTab === "control" && (
                  <Section title="Race control & weather">
                    <RaceControlWeather session={session} />
                  </Section>
                )}
              </div>
            )}
            {isRaceLike && tab === "strategy" && (
              <Section title="Explain the race">
                <StrategyExplainer strategy={bundle.strategy}
                  onFocusDrivers={(d) => { setSelected(d); setChartTab("position"); setTab("charts"); }} />
              </Section>
            )}
            {/* Pace, Qualifying and Practice all bring their own card framing —
                wrapping them in another Section would double-frame the panel */}
            {isRaceLike && tab === "pace" && (
              <PaceAnalysis session={session} pace={bundle.pace} selected={[]} />
            )}

            {isQuali && bundle.qualifying && ["story", "laps", "pace"].includes(tab) && (
              <QualifyingView qualifying={bundle.qualifying} session={session}
                section={tab as "story" | "laps" | "pace"} />
            )}

            {category === "practice" && bundle.practice && ["story", "pace", "runs"].includes(tab) && (
              <PracticeView practice={bundle.practice} session={session}
                section={tab as "story" | "pace" | "runs"} />
            )}

            {tab === "compare" && (
              <DriverComparison bundle={bundle} year={sel.year} gp={session.grand_prix}
                session={sel.session} initial={selected} />
            )}
            {tab === "ask" && (
              <Section title="Ask about this session">
                <QuestionBox year={sel.year} gp={session.grand_prix} session={sel.session}
                  llmAvailable={meta?.llm_available ?? false} category={category} />
              </Section>
            )}
            {tab === "data" && (
              <DataSourcesPanel year={sel.year} gp={session.grand_prix} session={sel.session}
                onRefetch={() => setRefreshKey((k) => k + 1)} />
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

/** Honest, reason-specific failure — no fake data. Offers quick alternatives. */
const ALTERNATIVES: { label: string; sel: Selection }[] = [
  { label: "2025 Australian GP · Race", sel: { year: 2025, gp: "Australian Grand Prix", session: "Race" } },
  { label: "2024 Monaco GP · Race", sel: { year: 2024, gp: "Monaco Grand Prix", session: "Race" } },
  { label: "2024 British GP · Race", sel: { year: 2024, gp: "British Grand Prix", session: "Race" } },
];
const REASON_HINT: Record<string, string> = {
  future_session: "This session may not have happened yet — try a completed race.",
  no_source_coverage: "This session isn't covered by our sources (it may be too old for detailed timing). Try the Historical archive for official results.",
  source_error: "The data sources were unreachable — usually a temporary network issue. Retry in a moment.",
  timeout: "The sources took too long to respond. Retry.",
  not_found: "We couldn't find this session — check the season, Grand Prix and session.",
  live_disabled: "Live data is turned off on this server.",
};

function DataUnavailable({ error, onRetry, onPick, onOpenData }: {
  error: ApiError; onRetry: () => void; onPick: (s: Selection) => void; onOpenData: () => void;
}) {
  const hint = REASON_HINT[error.reason] ?? "";
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-amber/10 ring-1 ring-amber/25">
          <AlertTriangle size={20} className="text-amber" />
        </span>
        <div>
          <h3 className="text-base font-semibold">We couldn&apos;t load this session</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{error.message}</p>
          {hint && <p className="mx-auto mt-1 max-w-md text-xs text-ink-faint">{hint}</p>}
        </div>

        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {error.retryable && (
            <button onClick={onRetry} className="pill-btn"><RefreshCw size={14} /> Retry</button>
          )}
          <a href="/history" className="pill-btn"><BookOpen size={14} /> Open Historical results</a>
          <button onClick={onOpenData} className="pill-btn"><Database size={14} /> Check data sources</button>
        </div>

        <div className="mt-2 w-full max-w-md">
          <div className="label mb-1.5">Try a known session</div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {ALTERNATIVES.map((a) => (
              <button key={a.label} onClick={() => onPick(a.sel)}
                className="chip hover:border-white/20 hover:text-ink">{a.label}</button>
            ))}
          </div>
        </div>

        {error.attempts?.length > 0 && (
          <details className="mt-1 text-xs text-ink-faint">
            <summary className="cursor-pointer">What we tried</summary>
            <ul className="mt-1 space-y-0.5 text-left">
              {error.attempts.slice(0, 4).map((a: any, i: number) => (
                <li key={i}>· {a.source}: {a.category}</li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

const FACET_HUMAN: Record<string, string> = {
  laps: "lap times", positions: "position history", pit_stops: "pit stops",
  stints: "tyre stints", weather: "weather", race_control: "race control",
  results: "results", overtakes: "overtakes", drivers: "the driver list",
  sectors: "sector times",
  // legacy spellings still present in sessions cached before the adapters agreed
  tyres: "tyre stints", "tyres/compounds": "tyre stints",
};
function humanFacet(key: string) {
  return FACET_HUMAN[key] ?? key.replace(/_/g, " ");
}

function DemoChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-semibold text-amber"
      title="Explicit demo mode is enabled on the backend (sample data).">
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
      {/* prominent, centered "we're working" state so a first load never looks
          frozen; skeletons hint at the layout that's coming underneath */}
      <Card><LoadingState /></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
