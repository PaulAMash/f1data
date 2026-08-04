"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BookOpen, Database, GitCompareArrows, MessageSquareText, Trophy,
  Gauge, Layers, LineChart, Timer, Wind, Braces, RefreshCw, AlertTriangle, CloudOff,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { useTourDrive } from "@/lib/tour";
import { Footer } from "@/components/layout/Footer";
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
import type { Meta, RaceBundle, RaceSession } from "@/lib/types";
import { Standings } from "@/components/history/Standings";

// Three purpose-built experiences: a race asks "why did it unfold this way?",
// qualifying asks "who earned the grid?", practice asks "what did we learn?".
const RACE_TABS = [
  { id: "story", label: "Race Story", icon: <BookOpen size={14} /> },
  { id: "charts", label: "Charts", icon: <LineChart size={14} /> },
  { id: "strategy", label: "Strategy", icon: <Braces size={14} /> },
  { id: "pace", label: "Pace", icon: <Gauge size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows size={14} /> },
  { id: "ask", label: "Ask", icon: <MessageSquareText size={14} /> },
  /* NO STANDINGS TAB, AND THE REASON IS THE WHOLE TAB ROW.

     Every tab here is a reading of ONE SESSION: the same ninety minutes, told
     as a story, as charts, as strategy, as pace, as a duel, as an answer to a
     question. A championship is not a reading of that session — it is a
     property of the season around it — and a seventh tab beside Ask said
     otherwise to every reader who found it there.

     It is a SCOPE of this page instead — the switch opposite the heading says
     whether you are reading a session in this season or the season itself,
     which is the one control high enough to govern both. One table, reached
     from the place its own subject already lives. */
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

export default function ExplorerPage() {
  const { mode } = useMode();
  const isAdvanced = mode === "advanced";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sel, setSel] = useState<Selection>({ year: 2026, gp: "Austrian Grand Prix", session: "Race" });
  const [bundle, setBundle] = useState<RaceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState("story");
  /** Which scope of the season this page is showing. */
  const [view, setView] = useState<"session" | "season">("session");
  const [chartTab, setChartTab] = useState("position");
  /** A question that arrived in the URL, for the Ask panel to ask itself. */
  const [askSeed, setAskSeed] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  // No session is fetched until /api/current resolves the real default — this
  // prevents the season label flashing and prevents fetching a race that hasn't
  // happened yet (the backend now picks the latest *completed* Grand Prix).
  const [booted, setBooted] = useState(false);

  /* A guided tour can open any tab. The Explorer answers on the tour's channel
     rather than lifting this state into a global store — see lib/tour.tsx. */
  useTourDrive(setTab);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const qYear = q?.get("year"); const qGp = q?.get("gp"); const qSession = q?.get("session");
    const qTab = q?.get("tab");
    if (qTab) setTab(qTab);

    /* A QUESTION ARRIVING FROM SOMEWHERE ELSE.
       The landing page's example questions link here with `?q=`; the Ask panel
       types it in and submits it (see QuestionBox). The parameter is stripped
       from the address bar the moment it is taken, because it describes a thing
       that HAPPENS rather than a thing the page IS — leaving it there would make
       every later Back into the page ask the question again. The state keeps
       it, so the panel still receives it once the session has loaded. */
    const qAsk = q?.get("q")?.trim();
    if (qAsk) {
      setAskSeed(qAsk);
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        {/* clean header — the race is the hero */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                {view === "season"
                  ? `${sel.year} championship`
                  : session ? session.grand_prix : loading ? "Loading…" : "Race Explorer"}
              </h1>
              {view === "session" && bundle?.source === "mock" && <DemoChip />}
              {/* NO PARTIAL CHIP. A session this product is not certain of does
                  not render at all now, so the chip has nothing left to mark —
                  and a chip that says "some of this may be wrong" was always
                  the product asking the reader to do its job. */}
            </div>
            {view === "season" ? (
              <p className="mt-1 text-sm text-ink-muted">
                Drivers&rsquo; and constructors&rsquo; standings as the season stands
                {session ? ` — after the ${session.grand_prix}` : ""}.
              </p>
            ) : (session || loading) && (
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            )}
          </div>

          {/* TWO SCOPES OF ONE SEASON, AND THE SWITCH BETWEEN THEM IS THE PAGE'S.
              The championship was a seventh tab beside Ask in V66, which said it
              was a reading of one session; V67 moved it to Seasons, which is
              right for 1974 and wrong for the title race somebody is actually
              following. It is neither: it is the OTHER thing this page is about.
              Explore already owns a season — the picker below sets it — so the
              highest control on the page is the one that says whether you are
              reading a session in that season or the season itself. It sits
              opposite the heading because it governs the heading. */}
          <ScopeSwitch value={view} onChange={setView} />
        </div>

        {/* compact controls, grouped so they read as one unit */}
        <div data-tour="selector" className="mb-4 rounded-xl border border-white/[0.05] bg-base-850/40 p-3">
          <RaceSelector value={sel} onChange={setSel} loading={loading}
            onRefresh={() => setRefreshKey((k) => k + 1)} />
        </div>

        {currentSeason && sel.year < currentSeason && (
          <p className="mb-4 rounded-lg border border-sky-400/15 bg-sky-400/[0.04] px-3 py-1.5 text-xs text-sky-300/90">
            You&apos;re viewing a previous season ({sel.year}). Every finished season, with its
            final championship, lives in{" "}
            <a href="/history" className="underline decoration-dotted">Seasons</a>.
          </p>
        )}

        {/* honest demo note (only when the backend is explicitly in demo mode) */}
        {session?.notes?.length && bundle?.source === "mock" ? (
          <p className="mb-4 rounded-lg border border-amber/15 bg-amber/[0.04] px-3 py-1.5 text-xs text-amber/90">
            {session.notes[0]}
          </p>
        ) : null}

        {/* The banner that used to explain what was missing went with the chip.
            Anything it would have had to report now means the session is not
            shown, and the unavailable screen says it properly. */}

        {view === "session" && (bundle || loading) && (
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

        {view === "season" ? (
          <div className="animate-fade-in">
            <Section title={`${sel.year} championship`}
              info="Points and wins as the season stands. The bar is the gap to the leader, not the points total — a championship table is read as 'how far behind', which is why the leader's bar is always full.">
              <Standings year={sel.year} roster={session?.drivers} portraits />
            </Section>
          </div>
        ) : (<>
        {loading && <LoadingDashboard />}
        {error && !loading && (
          <DataUnavailable error={error} session={sel} onRetry={() => setRefreshKey((k) => k + 1)}
            onPick={(s) => setSel(s)} onOpenData={() => setTab("data")} />
        )}

        {/* ONE VERDICT DECIDES WHETHER THERE IS A PAGE AT ALL.
            `complete` is false only when something the session cannot be
            reconstructed without is absent — the entry list, the results, a
            race's lap times. Rendering those anyway is how a Grand Prix came to
            show a column of car numbers under a "partial data" chip, which asks
            the reader to decide how much of it to believe. The unavailable
            screen is the honest answer and the better one. Enriching facets that
            are missing never reach here: they are explained in Sources and the
            page is still worth reading. */}
        {bundle && session && !loading && !error && session.complete === false && (
          <DataUnavailable session={sel} incomplete={session}
            onRetry={() => setRefreshKey((k) => k + 1)}
            onPick={(s) => setSel(s)} onOpenData={() => setTab("data")} />
        )}

        {bundle && session && !loading && !error && session.complete !== false && (
          <div className="animate-fade-in" data-tour="panel">
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
                  <Section title="Tyre strategy timeline" info="Each bar is a stint, coloured by compound. The Track rail above the plot shows when the race was neutralised — hover a capsule to see what it did to the strategy. A stemmed marker is a detected undercut: teal if it worked, rose if it didn't, and hovering it explains why. Click a driver to focus their strategy.">
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
                <StrategyExplainer strategy={bundle.strategy} session={session}
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
                  llmAvailable={meta?.llm_available ?? false} category={category}
                  seed={askSeed} />
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
        </>)}
      </div>

      {/* Every view ends somewhere. The line about not being affiliated with
          Formula 1 belongs on every page a reader can land on, not only on the
          one they might never scroll to. */}
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WHEN A SESSION CANNOT BE SHOWN.                                            */
/*                                                                            */
/* This was a warning triangle over an apology, three pill buttons and a       */
/* <details> called "What we tried" — which is the shape of an error page, and */
/* an error page tells a reader that something is broken. Most of the time     */
/* nothing is: a source is having an afternoon, or the season is older than    */
/* the feed, and both of those are facts about the world rather than faults in */
/* the product.                                                                */
/*                                                                            */
/* So it is a STATUS PANEL, and it answers the four questions a reader         */
/* actually has, in that order: WHICH session, WHY not, WHOSE problem it is,   */
/* and WHAT to do now. The provenance is the part that earns the trust — being */
/* told plainly that Jolpica is not answering right now is a product that      */
/* knows what it is made of, and it is the same thing the welcome screen       */
/* promises. Sources are named, states are named, and nothing is hedged.       */
/* -------------------------------------------------------------------------- */

const ALTERNATIVES: { label: string; sel: Selection }[] = [
  { label: "2025 Australian GP · Race", sel: { year: 2025, gp: "Australian Grand Prix", session: "Race" } },
  { label: "2024 Monaco GP · Race", sel: { year: 2024, gp: "Monaco Grand Prix", session: "Race" } },
  { label: "2024 British GP · Race", sel: { year: 2024, gp: "British Grand Prix", session: "Race" } },
];

/** Whose problem it is, said plainly. This is the line that builds the trust. */
const WHOSE: Record<string, { who: "provider" | "session" | "server"; line: string }> = {
  source_error: { who: "provider", line: "One of the open data providers Pitwall IQ reads from is not answering at the moment. That is upstream of us — the session is fine and will load again once the source is back." },
  timeout: { who: "provider", line: "A provider accepted the request and then took too long to answer. That is upstream of us, and it is usually brief." },
  no_source_coverage: { who: "session", line: "None of our providers publish detailed timing for this session. Older seasons carry an official classification and nothing more — that is the complete record that exists, and it is in Seasons." },
  future_session: { who: "session", line: "No provider has data for a session that has not been run yet. This page will fill itself in once it has." },
  not_found: { who: "session", line: "No provider recognised this combination of season, Grand Prix and session. Check the three pickers above." },
  live_disabled: { who: "server", line: "Live fetching is switched off on this deployment, so nothing was requested from any provider." },
};

const WHOSE_LABEL: Record<string, string> = {
  provider: "External data provider",
  session: "This session",
  server: "This deployment",
};

const SOURCE_NAME: Record<string, string> = {
  openf1: "OpenF1", jolpica: "Jolpica / Ergast", "f1-archive": "F1 live-timing archive",
  cache: "Local cache",
};
const ATTEMPT_STATE: Record<string, string> = {
  not_available: "no data for this session",
  unreachable: "not answering",
  timeout: "timed out",
  disabled: "not queried",
  error: "returned an error",
};

/* ONE SCREEN FOR BOTH WAYS A SESSION CAN BE UNAVAILABLE.
   A fetch that failed and a fetch that succeeded without the pieces the page is
   built on are the same thing to a reader: there is no race here to read. They
   used to be handled in two places and only one of them was designed — the
   other quietly rendered the race anyway with a chip on it. `incomplete` is the
   second case, and it says which feeds were the ones that did not arrive. */
const FACET_LABEL: Record<string, string> = {
  drivers: "the entry list", results: "the classification",
  laps: "the lap times", positions: "the position trace",
  stints: "the tyre stints", weather: "the weather trace",
  race_control: "the race-control log", pit_stops: "the pit stops",
  overtakes: "the overtakes",
};

/** "a, b and c" — a list a person would read out loud. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function DataUnavailable({ error, incomplete, session, onRetry, onPick, onOpenData }: {
  error?: ApiError; incomplete?: RaceSession; session: Selection;
  onRetry: () => void; onPick: (s: Selection) => void; onOpenData: () => void;
}) {
  /* Lead with the essential absences — "the entry list never arrived" is a more
     useful sentence than "something is missing" — and fall back to whatever is
     genuinely missing, so this always names something concrete. */
  const report = incomplete?.source_report;
  const missing = ((report?.essential_missing?.length ? report.essential_missing
                    : report?.missing) ?? []).map((m: string) => FACET_LABEL[m] ?? m);
  const verdict = incomplete
    ? {
        who: "provider" as const,
        line: missing.length
          ? `The session loaded, but ${listOf(missing)} never arrived — and a race cannot be read without ${missing.length > 1 ? "them" : "it"}. Rather than show you a page with holes in it, we are showing you this.`
          : "The session loaded without the data the analysis is built on. Rather than show you a page with holes in it, we are showing you this.",
      }
    : WHOSE[error?.reason ?? ""] ?? {
        who: "provider" as const,
        line: "Something upstream did not answer as expected. The session itself is fine; this page will load once the source is back.",
      };
  const upstream = verdict.who === "provider";

  return (
    <Card className="unavail">
      <CardBody className="p-0">
        {/* ---- 1. which session, and one word for the state ---------------- */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] px-6 py-5">
          <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            upstream ? "bg-amber/10 text-amber ring-1 ring-amber/25"
                     : "bg-white/[0.05] text-ink-muted ring-1 ring-white/10")}>
            {upstream ? <CloudOff size={17} /> : <AlertTriangle size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold tracking-tight text-ink">
              {session.gp} · {session.session}
            </span>
            <span className="block text-[12.5px] text-ink-faint">
              {session.year} · not available right now
            </span>
          </span>
          <span className={cx("ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]",
            upstream ? "bg-amber/10 text-amber" : "bg-white/[0.05] text-ink-muted")}>
            {WHOSE_LABEL[verdict.who]}
          </span>
        </div>

        {/* ---- 2. why, and whose problem it is ---------------------------- */}
        <div className="space-y-3 px-6 py-5">
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink">{verdict.line}</p>
          {error?.message && (
            <p className="max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{error.message}</p>
          )}

          {/* ---- 3. what each provider actually said ---------------------- */}
          {(error?.attempts?.length ?? 0) > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border border-white/[0.06] bg-base-900/40">
              <p className="border-b border-white/[0.06] px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                What each source said
              </p>
              <ul>
                {error!.attempts.slice(0, 4).map((a: any, i: number) => (
                  <li key={i}
                    className="flex items-center gap-3 border-b border-white/[0.04] px-3.5 py-2 text-[12.5px] last:border-b-0">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber/70" />
                    <span className="text-ink-muted">{SOURCE_NAME[a.source] ?? a.source}</span>
                    <span className="ml-auto text-right text-ink-faint">
                      {ATTEMPT_STATE[a.category] ?? a.category}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---- 4. what to do now ---------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(error?.retryable ?? true) && (
              <button onClick={onRetry} className="pill-btn"><RefreshCw size={14} /> Try again</button>
            )}
            <a href="/history" className="pill-btn"><BookOpen size={14} /> Official results in Seasons</a>
            <button onClick={onOpenData} className="pill-btn"><Database size={14} /> Data sources</button>
          </div>

          <div className="pt-1">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Or read one of these
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALTERNATIVES.map((a) => (
                <button key={a.label} onClick={() => onPick(a.sel)}
                  className="chip hover:border-white/20 hover:text-ink">{a.label}</button>
              ))}
            </div>
          </div>
        </div>
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

/** The page's own scope control. Two words, one rail — the same segmented
    vocabulary the rest of the product uses for a choice between two readings of
    the same thing. */
function ScopeSwitch({ value, onChange }: {
  value: "session" | "season"; onChange: (v: "session" | "season") => void;
}) {
  const items = [
    { id: "session" as const, label: "Session", icon: <Activity size={13} /> },
    { id: "season" as const, label: "Championship", icon: <Trophy size={13} /> },
  ];
  return (
    <div className="flex shrink-0 items-center rounded-xl border border-white/[0.07] bg-base-850/60 p-0.5"
      role="tablist" aria-label="What this page is showing">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx("inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-all duration-[--dur-2] ease-[--ease-out]",
            value === it.id
              ? "bg-accent/12 text-accent-soft shadow-[inset_0_0_0_1px_rgb(var(--accent)/.28)]"
              : "text-ink-muted hover:text-ink")}>
          {it.icon} {it.label}
        </button>
      ))}
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
