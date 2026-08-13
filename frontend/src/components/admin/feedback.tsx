"use client";
import { useMemo, useState } from "react";
import { Bug, Inbox, Lightbulb, Sparkles, Trash2 } from "lucide-react";
import { cx } from "@/lib/format";
import { Empty, Scroll, Section, Stat, Sub, SplitBar, fmtWhen } from "./kit";

/* ========================================================================== */
/* WHAT READERS WROTE DOWN.                                                   */
/*                                                                            */
/* THIS IS A DIFFERENT KIND OF PANEL FROM EVERY OTHER ONE ON THE PAGE, and it */
/* is laid out differently on purpose. Everything else here is a measurement   */
/* that has to be interpreted — a count, a percentage, a percentile — and the  */
/* design work is in making the number mean something. A bug report is already */
/* a sentence about what to do. The design work is getting out of its way.     */
/*                                                                            */
/* So the reports themselves are the largest thing in the section, set at      */
/* reading size rather than table size, and the classification is furniture     */
/* around them: chips to narrow the list, an area scoreboard to say where the  */
/* weight is, and the page/session the reader was on so nothing has to be      */
/* asked back.                                                                */
/*                                                                            */
/* BUGS AND SUGGESTIONS NEVER SHARE A LIST. They are answered by different     */
/* work — one is a defect to fix, the other a decision about what to build —   */
/* and the same reasoning already separates "what to teach Ask next" from      */
/* "answers people rejected" in the Ask panel above.                           */
/* ========================================================================== */

const KIND_COLOR: Record<string, string> = {
  bug: "var(--adm-rose)",
  suggestion: "var(--adm-violet)",
};

/** Blocking / degraded / cosmetic, in the order they should be worked. */
const SEVERITY_TONE: Record<string, string> = {
  high: "text-accent",
  medium: "text-amber",
  low: "text-ink-faint",
};

type Row = {
  ts: string; ref: string; kind: string; kind_label: string; message: string;
  area: string; area_label: string; severity?: string | null;
  severity_label?: string | null; junk: boolean;
  path?: string | null; page?: string | null; context?: string | null;
  feature_label?: string | null;
};

export function FeedbackPanel({ feedback }: { feedback: any }) {
  const [kind, setKind] = useState<"all" | "bug" | "suggestion">("all");
  const [area, setArea] = useState<string | null>(null);
  const [showJunk, setShowJunk] = useState(false);

  const rows: Row[] = useMemo(() => feedback?.recent ?? [], [feedback]);

  const shown = useMemo(() => rows.filter((r) =>
    (showJunk ? r.junk : !r.junk)
    && (kind === "all" || r.kind === kind)
    && (!area || r.area === area)), [rows, kind, area, showJunk]);

  if (!feedback) return null;

  const severities = feedback.severities ?? {};
  const total = feedback.total ?? 0;

  const split = [
    { label: "Bug reports", n: feedback.bugs ?? 0, color: KIND_COLOR.bug },
    { label: "Suggestions", n: feedback.suggestions ?? 0, color: KIND_COLOR.suggestion },
    { label: "Discarded", n: feedback.junk ?? 0, color: "var(--adm-grey)" },
  ].filter((p) => p.n > 0);

  return (
    <Section title="Feedback" icon={<Inbox size={15} />}
      note={total
        ? `${total} submission${total === 1 ? "" : "s"} from ${feedback.people ?? 0} ${feedback.people === 1 ? "person" : "people"}`
        : "Nothing submitted yet"}>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submissions" value={total} />
        <Stat label="Bug reports" value={feedback.bugs ?? 0} tone="bad"
          help="Something a reader said was broken, wrong, or not behaving as they expected." />
        <Stat label="Suggestions" value={feedback.suggestions ?? 0} tone="opportunity"
          help="Feature requests and improvements — the backlog, written by the people using it." />
        <Stat label="Blocking" value={severities.high ?? 0}
          tone={severities.high ? "bad" : "good"}
          help="Bug reports whose wording says the product could not be used at all — crashed, blank, stuck, never loaded. Read from the report, so treat it as a first sort rather than a verdict." />
        <Stat label="Cosmetic" value={severities.low ?? 0}
          help="Typos, spacing, alignment — real, and not what to fix first." />
        <Stat label="Discarded" value={feedback.junk ?? 0}
          help="Submissions with no report in them: keyboard-mashing, one-word tests, bare links. Counted rather than deleted, and kept out of every area so the categories stay honest — press “Discarded” below to read them." />
      </div>

      {total > 0 && (
        <div className="mt-4">
          <SplitBar parts={split} total={total} />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Sub title="Every report, most recent first"
          help="Filter by kind, or click an area on the right. Each report shows the page and — when a session was open — the exact Grand Prix and session the reader was looking at.">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <Chip on={kind === "all" && !showJunk} onClick={() => { setKind("all"); setShowJunk(false); }}
              label={`All ${feedback.real ?? 0}`} />
            <Chip on={kind === "bug" && !showJunk} onClick={() => { setKind("bug"); setShowJunk(false); }}
              color={KIND_COLOR.bug} label={`Bugs ${feedback.bugs ?? 0}`} />
            <Chip on={kind === "suggestion" && !showJunk}
              onClick={() => { setKind("suggestion"); setShowJunk(false); }}
              color={KIND_COLOR.suggestion} label={`Suggestions ${feedback.suggestions ?? 0}`} />
            {(feedback.junk ?? 0) > 0 && (
              <Chip on={showJunk} onClick={() => { setShowJunk((v) => !v); setArea(null); }}
                color="var(--adm-grey)" label={`Discarded ${feedback.junk}`}
                title="Submissions the classifier found no report in" />
            )}
            {area && (
              <button onClick={() => setArea(null)}
                className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-accent/30
                           bg-accent/10 px-2 py-1 text-[11.5px] text-accent-soft">
                {rows.find((r) => r.area === area)?.area_label ?? area} ✕
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <Empty>
              {total === 0
                ? "No bug reports or suggestions have been submitted in this window."
                : "Nothing matches that filter."}
            </Empty>
          ) : (
            <Scroll>
              <ul className="max-h-[34rem] space-y-1.5 overflow-y-auto pr-1">
                {shown.map((r) => <Report key={r.ref} row={r} />)}
              </ul>
            </Scroll>
          )}
        </Sub>

        <div className="space-y-5">
          <Sub title="Where the reports are"
            help="An area with mostly bugs is a surface that does not work. One with mostly suggestions is a surface people want more from. Click to filter the list.">
            {(!feedback.areas || feedback.areas.length === 0) ? (
              <Empty>Nothing categorised yet.</Empty>
            ) : (
              <ul className="space-y-1">
                {feedback.areas.map((a: any) => (
                  <li key={a.area}>
                    <button onClick={() => { setArea(a.area === area ? null : a.area); setShowJunk(false); }}
                      className={cx("flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left",
                        "text-[12.5px] transition-colors",
                        a.area === area ? "bg-white/[0.08]" : "hover:bg-white/[0.05]")}>
                      <span className="min-w-0 flex-1 truncate text-ink">{a.label}</span>
                      {a.blocking > 0 && (
                        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-accent"
                          title={`${a.blocking} reported as unusable`}>
                          {a.blocking} blocking
                        </span>
                      )}
                      {/* Direct-labelled rather than a two-colour bar: at this
                          width a bar would be four pixels of each. */}
                      <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">
                        {a.bugs}<span className="opacity-50">b</span>
                        {" "}
                        {a.suggestions}<span className="opacity-50">s</span>
                      </span>
                      <span className="w-6 shrink-0 text-right tabular-nums text-ink">{a.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Sub>

          <Sub title="Emerging subjects"
            help="Phrases that recur across reports the area taxonomy has no category for. When one keeps appearing it has earned an area of its own in analytics/triage.py — the same mechanism the Ask topics use.">
            {(!feedback.emerging || feedback.emerging.length === 0) ? (
              <Empty>Nothing recurring outside the known areas.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {feedback.emerging.map((e: any, i: number) => (
                  <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                    <Sparkles size={12} className="shrink-0 text-accent-soft" />
                    <span className="font-medium text-ink">{e.label}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint"
                      title={e.example}>e.g. &ldquo;{e.example}&rdquo;</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{e.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Sub>
        </div>
      </div>
    </Section>
  );
}

/* One report. The message is the thing; everything else is a label on it. */
function Report({ row }: { row: Row }) {
  const bug = row.kind === "bug";
  const Icon = bug ? Bug : Lightbulb;
  return (
    <li className={cx("rounded-lg border px-3 py-2.5",
      row.junk ? "border-white/[0.05] bg-base-850/20"
        : bug ? "border-accent/20 bg-accent/[0.03]"
              : "border-violet-400/20 bg-violet-400/[0.04]")}>
      <div className="flex items-start gap-2">
        <Icon size={13} className={cx("mt-0.5 shrink-0",
          row.junk ? "text-ink-faint" : bug ? "text-accent" : "text-accent-soft")} />
        {/* `data-verbatim` because this is somebody's own sentence and the
            spelling bridge rewrites the whole document (lib/locale.tsx). A
            reader who typed "tyre spinner" must not be quoted back saying
            "tire spinner" — a report is evidence, and evidence is not
            localised. */}
        <p data-verbatim
          className={cx("min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-snug",
            row.junk ? "text-ink-faint" : "text-ink")}>
          {row.message}
        </p>
        {row.severity_label && !row.junk && (
          <span className={cx("shrink-0 text-[10.5px] font-semibold uppercase tracking-wide",
            SEVERITY_TONE[row.severity ?? ""] ?? "text-ink-faint")}>
            {row.severity_label}
          </span>
        )}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-faint">
        <span className="text-ink-muted">{row.area_label}</span>
        {row.page && <span>{row.page}</span>}
        {row.feature_label && <span>{row.feature_label}</span>}
        {/* The session context, in the accent, so a column of reports can be
            scanned for one race the same way the Ask log can. */}
        {row.context && <span className="text-accent-soft/85">{row.context}</span>}
        <span className="ml-auto font-mono tabular-nums">{fmtWhen(row.ts)}</span>
      </p>
    </li>
  );
}

function Chip({ on, onClick, label, color, title }: {
  on: boolean; onClick: () => void; label: string; color?: string; title?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px]",
        "transition-colors",
        on ? "bg-white/[0.10] text-ink" : "text-ink-muted hover:bg-white/[0.05]")}>
      {color && <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The one-line summary of what clearing feedback would remove, shown inside   */
/* the existing purge control rather than as a second destructive widget.      */
/* Exported so AdminTools can render it without importing the whole panel.     */
/* -------------------------------------------------------------------------- */
export function FeedbackScopeNote({ feedback }: { feedback: any }) {
  if (!feedback?.total) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
      <Trash2 size={11} className="shrink-0" />
      {feedback.bugs} bug report{feedback.bugs === 1 ? "" : "s"} and{" "}
      {feedback.suggestions} suggestion{feedback.suggestions === 1 ? "" : "s"} stored.
    </p>
  );
}
