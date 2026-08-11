"use client";
import { useMemo, useState } from "react";
import {
  Activity, BarChart3, Lightbulb, MessageSquareText, Sparkles, ThumbsDown, Timer,
  TrendingUp,
} from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { cx } from "@/lib/format";
import { EndpointHealth, Funnel, TopicScoreboard, TrafficChart } from "./charts";
import {
  Distribution, Empty, OUTCOME_COLOR, OUTCOME_ORDER, Pill, RankedList, Scroll,
  Section, SplitBar, Stat, Sub, TONE_TEXT, type Tone, fmtMs, fmtWhen,
} from "./kit";

/* ========================================================================== */
/* ASK — FIRST ON THE PAGE, BECAUSE IT IS THE POINT.                          */
/*                                                                            */
/* The old Ask panel was a five-bar chart, a topic list and one flat stream    */
/* headed "Where Ask fell short" that mixed four different problems with four  */
/* different fixes:                                                            */
/*                                                                            */
/*   a question no handler covers   -> BUILD IT                               */
/*   an answer somebody disliked    -> FIX THE ANSWER                         */
/*   a session with no data         -> a source problem, or nothing to do      */
/*   an exception                   -> a bug                                   */
/*                                                                            */
/* Presenting them as one list of failures buried the most valuable signal in  */
/* the product — readers writing your backlog for you — among 404s. They are   */
/* four separate panels now, ordered by what they are worth.                   */
/* ========================================================================== */
export function AskPanel({ ask }: { ask: any }) {
  const [topic, setTopic] = useState<string | null>(null);
  if (!ask) return null;
  const outcomes = ask.outcomes ?? {};
  const parts = OUTCOME_ORDER
    .map((key) => ({ label: ask.outcome_labels?.[key] ?? key,
                     n: outcomes[key] ?? 0, color: OUTCOME_COLOR[key] }))
    .filter((p) => p.n > 0);

  return (
    <Section title="Ask" icon={<MessageSquareText size={15} />}
      note={`${ask.total} question${ask.total === 1 ? "" : "s"} · ${ask.answered_pct}% of F1 questions answered outright`}>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Questions" value={ask.total} />
        <Stat label="About F1" value={ask.f1_questions}
          hint={`${(ask.total ?? 0) - (ask.f1_questions ?? 0)} off-topic`}
          help="Everything except questions the relevance gate judged not to be about Formula 1 at all." />
        <Stat label="Answered" value={`${ask.answered_pct}%`} tone="good"
          help="Share of F1 questions a handler recognised and answered in full — nothing missing, confidence not low." />
        <Stat label="Unresolved" value={ask.unresolved} tone="opportunity"
          hint={`${ask.unresolved_pct}% of F1 questions`} help={ask.unresolved_help} />
        <Stat label="Rated helpful"
          value={ask.helpful_pct === null ? "—" : `${ask.helpful_pct}%`}
          hint={`${ask.helpful} up / ${ask.unhelpful} down`}
          help="Of the answers readers rated. Only they can tell us an answer was confident and wrong." />
        <Stat label="Answer time" value={fmtMs(ask.avg_ms)} hint={`p95 ${fmtMs(ask.p95_ms)}`} />
      </div>

      {/* THE LEFT COLUMN CARRIES THREE BLOCKS, NOT ONE.
          The outcome breakdown is eight lines and the topic scoreboard is
          sixteen rows, so pairing them alone left a third of the panel empty
          while "emerging" and "asked twice" sat below in a half-width row of
          their own. Stacking the three short Ask-quality readings against the
          one tall one fills the grid and puts every "what did Ask do" figure on
          the same side of the page. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-5">
        <Sub title="What happened to each question"
          help="Six outcomes, each meaning something you would do differently about it. The action column is what to do, not how bad it was.">
          {/* legend off: the list immediately below is the same six segments
              with their definitions and their actions attached. */}
          <SplitBar parts={parts} total={ask.total} legend={false} />
          <ul className="mt-3 space-y-1">
            {OUTCOME_ORDER.map((key) => (
              <li key={key} className="flex items-baseline gap-2 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: OUTCOME_COLOR[key] }} />
                <span className="shrink-0 font-medium text-ink">
                  {ask.outcome_labels?.[key] ?? key}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-faint"
                  title={ask.outcome_help?.[key]}>{ask.outcome_help?.[key]}</span>
                <ActionChip action={ask.outcome_actions?.[key]} />
                <span className="w-6 shrink-0 text-right tabular-nums text-ink">
                  {outcomes[key] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </Sub>

        <Sub title="Emerging topics"
          help="Phrases that recur across questions the taxonomy has no category for. When one keeps appearing it has earned a topic of its own in analytics/topics.py — this is how the taxonomy grows from real traffic.">
          {(!ask.emerging || ask.emerging.length === 0) ? (
            <Empty>Nothing recurring yet outside the known topics.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ask.emerging.map((e: any, i: number) => (
                <li key={i} className="flex items-baseline gap-2 text-[13px]">
                  <Sparkles size={12} className="shrink-0 text-accent-soft" />
                  <span className="font-medium text-ink">{e.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-faint"
                    title={e.example}>e.g. &ldquo;{e.example}&rdquo;</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{e.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Sub>

        <Sub title="Asked more than once"
          help="The same question, normalised for case and punctuation. Repetition on an answered question is a candidate for a starter chip; on an unsupported one it is the loudest possible feature request.">
          {(!ask.repeats || ask.repeats.length === 0) ? (
            <Empty>No question has been asked twice yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ask.repeats.slice(0, 10).map((r: any, i: number) => (
                <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="shrink-0 tabular-nums text-ink-faint">×{r.n}</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={r.question}>
                    {r.question}
                  </span>
                  <span className={cx("shrink-0 text-[11px]",
                    r.outcome === "answered" ? "text-speed" : "text-ink-faint")}>
                    {r.outcome_label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sub>
        </div>

        <Sub title="What people ask about"
          help="Volume, success rate and feedback per topic. Topics are recognised from the question text, not from which handler answered — so a subject Ask has no handler for still gets counted under its real name. Click one to filter the question log below.">
          <TopicScoreboard topics={ask.topics} onPick={setTopic} picked={topic} />
        </Sub>
      </div>

      {/* --- THE BACKLOG THE READERS WROTE -------------------------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Sub title="What to teach Ask next"
          help="F1 questions Ask understood as F1 but has no handler for, grouped by question and ranked by how many people asked. A feature backlog, not an error log.">
          {(!ask.gaps || ask.gaps.length === 0) ? (
            <Empty>Nothing outstanding — every F1 question found a handler.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ask.gaps.slice(0, 10).map((g: any, i: number) => (
                <li key={i} className="rounded-lg border border-white/[0.06] bg-base-800/40 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-accent/15 px-1.5 py-0.5
                                     text-[11px] font-bold tabular-nums text-accent-soft">
                      ×{g.n}
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                      &ldquo;{g.question}&rdquo;
                    </p>
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-2.5 text-[11px] text-ink-faint">
                    <span>{g.topic_label}</span>
                    <span>{g.people} {g.people === 1 ? "person" : "people"}</span>
                    <span>last {fmtWhen(g.last_seen)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Sub>

        <Sub title="Answers people rejected"
          help="Ask answered these and the reader pressed the thumbs-down. A wrong answer, not a missing one — the fix is in the handler that already ran, not a new one.">
          {(!ask.disliked || ask.disliked.length === 0) ? (
            <Empty>No answers marked unhelpful in this window.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {ask.disliked.slice(0, 10).map((d: any, i: number) => (
                <li key={i} className="rounded-lg border border-amber/15 bg-amber/[0.03] px-3 py-2">
                  <div className="flex items-start gap-2">
                    <ThumbsDown size={13} className="mt-0.5 shrink-0 text-amber" />
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                      &ldquo;{d.question}&rdquo;
                    </p>
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-2.5 text-[11px] text-ink-faint">
                    <span className={TONE_TEXT[(d.outcome_tone ?? "muted") as Tone]}>
                      {d.outcome_label}
                    </span>
                    <span>{d.topic_label}</span>
                    {d.gp && <span>{d.year} {d.gp} · {d.session_type}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Sub>
      </div>

      <div className="mt-5">
        <AskLog rows={ask.recent} topic={topic} onClearTopic={() => setTopic(null)} />
      </div>
    </Section>
  );
}

function ActionChip({ action }: { action?: string }) {
  if (!action || action === "none") return <span className="w-14 shrink-0" />;
  const map: Record<string, [string, string]> = {
    build: ["Build", "text-accent-soft"],
    improve: ["Improve", "text-amber"],
    fix: ["Fix", "text-accent"],
  };
  const [text, tone] = map[action] ?? ["", "text-ink-faint"];
  return (
    <span className={cx("w-14 shrink-0 text-right text-[10.5px] font-semibold uppercase",
                        "tracking-wide", tone)}>{text}</span>
  );
}

/* THE DRILL-DOWN. Every question, filterable by outcome AND by topic, so
   "what are people actually asking about tyres" is two clicks rather than a
   database query. */
function AskLog({ rows, topic, onClearTopic }: {
  rows: any[] | undefined; topic: string | null; onClearTopic: () => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const all = useMemo(() => rows ?? [], [rows]);
  const shown = useMemo(() => all.filter(
    (r) => (filter === "all" || r.outcome === filter) && (!topic || r.topic === topic)),
    [all, filter, topic]);
  if (!all.length) return <Empty>No questions asked in this window.</Empty>;
  const present = OUTCOME_ORDER.filter((k) => all.some((r) => r.outcome === k));
  const topicLabel = topic
    ? all.find((r) => r.topic === topic)?.topic_label ?? topic : null;

  return (
    <Sub title="Every question, most recent first"
      help="Filter by outcome, or click a topic in the scoreboard above. The colour of each row's dot is its outcome.">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}
          label={`All ${all.length}`} />
        {present.map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}
            color={OUTCOME_COLOR[k]} title={k}
            label={String(all.filter((r) => r.outcome === k).length)} />
        ))}
        {topic && (
          <button onClick={onClearTopic}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-accent/30
                       bg-accent/10 px-2 py-1 text-[11.5px] text-accent-soft">
            {topicLabel} ✕
          </button>
        )}
      </div>
      <Scroll>
        <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          {shown.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5
                                   border-b border-white/[0.04] py-1.5 text-[12.5px]">
              <span className="w-28 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                {fmtWhen(r.ts)}
              </span>
              <span className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: OUTCOME_COLOR[r.outcome] }} title={r.outcome_label} />
              <span className="min-w-0 flex-1 text-ink">{r.question}</span>
              <span className="shrink-0 text-[11px] text-ink-faint">{r.topic_label}</span>
              {r.helpful === true && <span className="shrink-0 text-[11px] text-speed">▲</span>}
              {r.helpful === false && <span className="shrink-0 text-[11px] text-amber">▼</span>}
              {r.missing_summary && (
                <span className="shrink-0 text-[11px] text-ink-faint">
                  missing: {r.missing_summary}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Scroll>
      {shown.length === 0 && <Empty>Nothing matches that filter.</Empty>}
    </Sub>
  );
}

function FilterChip({ active, onClick, label, color, title }: {
  active: boolean; onClick: () => void; label: string; color?: string; title?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px]",
        "transition-colors",
        active ? "bg-white/[0.10] text-ink" : "text-ink-muted hover:bg-white/[0.05]")}>
      {color && <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}
      {label}
    </button>
  );
}

/* ========================================================================== */
/* USAGE                                                                      */
/* ========================================================================== */
export function UsagePanel({ usage, traffic, overview }: {
  usage: any; traffic: any[]; overview: any;
}) {
  if (!usage) return null;
  return (
    <Section title="What people do here" icon={<BarChart3 size={15} />}
      note={`${overview?.views_per_visit ?? 0} pages per visit · ${overview?.asks_per_visit ?? 0} questions per visit`}>

      <Sub title="Activity by day"
        help="Page views, sessions opened and Ask questions share one scale — they are all counts of something a person did, so their heights compare directly. A red diamond marks a day with reader-facing errors.">
        <TrafficChart rows={traffic} />
      </Sub>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Sub title="Where visits go"
          help="Each step is the share of visits that got that far. The number worth acting on is the biggest drop, not the final percentage.">
          <Funnel steps={usage.funnel} />
        </Sub>

        <Sub title="How deep a visit goes"
          help="Tracked actions per visit — page views, session opens and feature use. One action is a bounce; ten is somebody genuinely using the product.">
          <Distribution buckets={usage.depth?.buckets ?? []} />
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {usage.depth?.avg_actions ?? 0} actions per visit on average ·{" "}
            {usage.depth?.bounce_pct ?? 0}% did one thing and left.
          </p>
        </Sub>

        <Sub title="Do people come back"
          help="Distinct visits per anonymous visitor id in this window. Approximate by design — clearing site data or switching device reads as a new person.">
          <Distribution buckets={(usage.repeat_visitors ?? []).map((r: any) => ({
            bucket: r.bucket, pct: r.pct }))} colorFrom="var(--adm-violet)" />
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {overview?.returning_visitors ?? 0} of {overview?.visitors ?? 0} visitors had been
            here before this window opened.
          </p>
        </Sub>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Sub title="Most viewed races">
          <RankedList rows={usage.races} label={(r) => `${r.year} ${r.gp}`}
            value={(r) => r.n} suffix={(r) => `${r.people} ppl`} />
        </Sub>
        <Sub title="Seasons viewed">
          <RankedList rows={usage.seasons} label={(r) => String(r.year)} value={(r) => r.n}
            suffix={(r) => `${r.people} ppl`} limit={8} />
        </Sub>
        <Sub title="Which sessions">
          <RankedList rows={usage.sessions} label={(r) => r.session_type} value={(r) => r.n} />
        </Sub>
        <Sub title="Most used features"
          help="Race Story, Charts, Strategy, Pace, Compare, Ask and the rest — recorded when the tab is opened, however it was opened.">
          <RankedList rows={usage.features} label={(r) => r.label} value={(r) => r.n} limit={12} />
        </Sub>
        <Sub title="Time spent per feature"
          help="Average seconds between opening a tab and leaving it. Separates a feature people open from one they actually read — a popular tab with a two-second dwell is a naming problem.">
          {(usage.dwell?.length ?? 0) === 0
            ? <Empty>No dwell recorded yet — this starts collecting from V91 onward.</Empty>
            : <RankedList rows={usage.dwell} label={(r) => r.label}
                value={(r) => r.avg_s} format={(n) => fmtMs(n * 1000)}
                suffix={(r) => `${r.n}×`} limit={10} />}
        </Sub>
        <Sub title="Pages">
          <RankedList rows={usage.pages} label={(r) => r.label} value={(r) => r.n} />
        </Sub>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Sub title="Last thing before leaving"
          help="The final tracked action of each visit. A feature at the top is either the natural end of a good visit or the place people give up — read it beside the funnel.">
          <RankedList rows={usage.exits} label={(r) => r.what} value={(r) => r.n}
            suffix={(r) => r.kind} limit={8} />
        </Sub>
        <Sub title="Simple vs Advanced">
          <RankedList rows={usage.modes} label={(r) => String(r.mode ?? "—")}
            value={(r) => r.n} limit={4} />
        </Sub>
        <Sub title="Current season vs archive"
          help="Explore is the current-season surface; Seasons/Historical is the archive. Other pages (home, settings, welcome) are counted separately rather than folded into 'current'.">
          <RankedList rows={usage.eras} label={(r) => String(r.era)} value={(r) => r.n} limit={4} />
        </Sub>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* BACKEND HEALTH                                                             */
/* ========================================================================== */
export function PerformancePanel({ performance, overview }: {
  performance: any; overview: any;
}) {
  if (!performance) return null;
  const worst = performance.worst_offender;
  const noise = overview?.noise_errors ?? 0;
  return (
    <Section title="Backend health" icon={<Timer size={15} />}
      note={`${performance.requests} API requests · median ${fmtMs(performance.median_ms)} · p95 ${fmtMs(performance.p95_ms)}`}>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="API requests" value={performance.requests} />
        <Stat label="Median" value={fmtMs(performance.median_ms)}
          help="Half of all API requests were faster than this. A better summary than the average, which one cold archive fetch can dominate." />
        <Stat label="p95" value={fmtMs(performance.p95_ms)}
          help="19 of every 20 requests were faster than this. Expect seconds, not milliseconds: cold FastF1 and Jolpica fetches live in this tail by design." />
        <Stat label="Server errors" value={performance.server_errors}
          tone={performance.server_errors ? "bad" : "good"}
          hint={`${performance.server_error_pct}% of requests`}
          help="5xx responses on /api/ routes only. A 404 for a favicon is not a server error and is no longer counted as one." />
        <Stat label="Session failures" value={overview?.session_failures ?? 0}
          tone={overview?.session_failures ? "warn" : "good"}
          help="A reader chose a race and the session could not be loaded. Usually the upstream archive being unavailable." />
        <Stat label="Client errors" value={overview?.client_errors ?? 0}
          tone={overview?.client_errors ? "warn" : "good"}
          help="Caught by the browser's error boundary. Frontend bugs, invisible in the API logs." />
      </div>

      {worst && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.07]
                        bg-base-800/40 px-3.5 py-3">
          <TrendingUp size={15} className="mt-0.5 shrink-0 text-accent-soft" />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">Biggest total cost:</span>{" "}
            <span className="font-mono text-[11.5px]">{worst.path}</span> — {worst.n} calls at{" "}
            {fmtMs(worst.avg_ms)} each is {Math.round(worst.total_ms / 1000)}s of reader waiting.{" "}
            {worst.upstream
              ? "It is an upstream archive fetch, so this is the cache doing its job on cold entries rather than a regression."
              : "It is not an upstream fetch, so this one is ours to fix."}
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Sub title="Endpoints against their own budget"
          help="Upstream archive fetches (session, historical, seasons) are judged against 6s; everything else against 800ms. The white line is the budget — past it is the signal. Slowest first.">
          <EndpointHealth endpoints={performance.endpoints} />
        </Sub>

        <div className="space-y-5">
          <Sub title="Failed requests"
            help="Split by what the failure means. 4xx on an API route is the caller asking for something not there; anything outside /api/ is a browser or crawler, not a product error.">
            {(performance.failed?.length ?? 0) === 0 ? <Empty>No failed requests.</Empty> : (
              <ul className="space-y-1">
                {performance.failed.slice(0, 10).map((f: any, i: number) => (
                  <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                    <Pill tone={(f.tone ?? "muted") as Tone}>{f.status}</Pill>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink"
                      title={f.note}>{f.path}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{f.n}</span>
                  </li>
                ))}
              </ul>
            )}
            {noise > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                {noise} of these were requests for things that were never API routes —
                favicons, robots.txt, crawler probes. Shown because they are real
                traffic, excluded from the error counts above because they are not
                failures of anything.
              </p>
            )}
          </Sub>

          <Sub title="Session load failures"
            help="Recorded once, from the 503 handler, with the race that failed and why.">
            {(performance.session_failures?.length ?? 0) === 0
              ? <Empty>No session failed to load.</Empty>
              : <RankedList rows={performance.session_failures}
                  label={(r) => `${r.year ?? ""} ${r.gp ?? "?"} ${r.session_type ?? ""}`.trim()}
                  value={(r) => r.n} suffix={(r) => String(r.detail ?? "").slice(0, 40)}
                  tone={() => "warn"} />}
          </Sub>

          <Sub title="Client-side errors">
            {(performance.client_errors?.length ?? 0) === 0
              ? <Empty>No client errors.</Empty>
              : <RankedList rows={performance.client_errors}
                  label={(r) => String(r.detail ?? "unknown")} value={(r) => r.n}
                  tone={() => "warn"} />}
          </Sub>
        </div>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* WHAT TO WORK ON NEXT — the same ranking the report prints.                  */
/* ========================================================================== */
export function PrioritiesPanel({ priorities }: { priorities: any[] | undefined }) {
  const items = priorities ?? [];
  if (!items.length) return null;
  return (
    <Section title="What to work on next" icon={<Lightbulb size={15} />}
      note="Derived from the numbers on this page, ranked by how many readers it affects">
      <ol className="space-y-2.5">
        {items.map((p, i) => (
          <li key={i} className={cx("rounded-xl border px-3.5 py-3",
            p.severity === "high" ? "border-accent/25 bg-accent/[0.04]"
              : p.severity === "medium" ? "border-amber/20 bg-amber/[0.03]"
              : "border-white/[0.07] bg-base-850/50")}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-[11px] font-bold tabular-nums text-ink-faint">
                {i + 1}
              </span>
              {p.severity === "high" && (
                <AlertTriangle size={15} className="mt-px shrink-0 text-accent" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium leading-snug text-ink">{p.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{p.why}</p>
                {p.evidence?.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {p.evidence.map((e: string, j: number) => (
                      <li key={j} className="truncate text-[11.5px] text-ink-faint">· {e}</li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5
                               text-[10px] uppercase tracking-wide text-ink-faint">
                {p.kind}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ========================================================================== */
export function RecentPanel({ recent }: { recent: any[] | undefined }) {
  const rows = recent ?? [];
  return (
    <Section title="Recent activity" icon={<Activity size={15} />}>
      {rows.length === 0 ? <Empty>Nothing recorded in this window.</Empty> : (
        <Scroll>
          <ul className="space-y-0.5">
            {rows.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                <span className="w-28 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                  {fmtWhen(e.ts)}
                </span>
                <span className={cx("w-36 shrink-0 font-medium",
                  e.name?.includes("error") || e.name?.includes("failed")
                    ? "text-amber" : "text-ink")}>
                  {String(e.name).replace(/_/g, " ")}
                </span>
                <span className="min-w-0 text-ink-muted">
                  {[e.label ?? e.feature, e.path, e.gp && `${e.year ?? ""} ${e.gp}`.trim(),
                    e.session_type, e.ms != null && fmtMs(e.ms), e.detail]
                    .filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Scroll>
      )}
    </Section>
  );
}
