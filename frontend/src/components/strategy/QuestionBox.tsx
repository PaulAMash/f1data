"use client";
import { useState } from "react";
import {
  ChevronDown, CornerDownLeft, MessageSquareText, Sparkles, Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QuestionAnswer, SessionCategory } from "@/lib/types";
import { useIsSimple } from "@/lib/mode";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/format";
import { AnalysisProgress } from "./AnalysisProgress";

const MIN_THINK_MS = 1500; // makes the analysis feel considered, not instant

// Module-level store: answers survive tab switches (component unmounts) for the
// life of the page and are wiped on refresh. Keyed per session so each race
// keeps its own thread.
const askHistoryStore = new Map<string, QuestionAnswer[]>();

export function QuestionBox({
  year, gp, session, llmAvailable, category,
}: {
  year: number; gp: string; session: string; llmAvailable: boolean; category: SessionCategory;
}) {
  const simple = useIsSimple();
  const storeKey = `${year}|${gp}|${session}`;
  const [q, setQ] = useState("");
  const [thinking, setThinking] = useState(false);
  const [history, setHistoryState] = useState<QuestionAnswer[]>(
    () => askHistoryStore.get(storeKey) ?? []);
  const setHistory = (fn: (h: QuestionAnswer[]) => QuestionAnswer[]) => {
    setHistoryState((h) => {
      const next = fn(h);
      askHistoryStore.set(storeKey, next);
      return next;
    });
  };

  async function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;
    setThinking(true);
    setQ("");
    const started = Date.now();
    try {
      const res = await api.ask({ year, gp, session, question: text });
      const elapsed = Date.now() - started;
      if (elapsed < MIN_THINK_MS) await new Promise((r) => setTimeout(r, MIN_THINK_MS - elapsed));
      setHistory((h) => [res, ...h]);
    } catch (e: any) {
      setHistory((h) => [{
        question: text, answer: e?.message ?? "Something went wrong.", kind: "error",
        used_llm: false, confidence: "low", supporting: {}, missing_data: [],
        entities: {}, follow_ups: [], simple: false, answer_title: "Couldn't answer",
        short_answer: e?.message ?? "Something went wrong.", detailed_answer: [], evidence: [],
        beginner_summary: null, advanced_notes: [], related_drivers: [], related_laps: [], analysis_steps: [],
      } as QuestionAnswer, ...h]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 p-2 focus-within:border-accent/40">
        <MessageSquareText size={16} className="ml-1.5 shrink-0 text-ink-faint" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder={category === "practice"
            ? "Ask about this session… e.g. who had the best long run?"
            : "Ask about this race… e.g. why did Leclerc lose places?"}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <button onClick={() => ask(q)} disabled={thinking || !q.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          <CornerDownLeft size={14} /> <span className="hidden sm:inline">Ask</span>
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {thinking && <AnalysisProgress />}
        {history.map((a, i) => (
          <AnswerCard key={i} a={a} simple={simple} />
        ))}
      </div>
    </div>
  );
}

/**
 * One answer, two renditions — no refetch, no hidden content:
 *  - Simple mode leads with the plain-English rewrite and offers
 *    "Show deeper analysis" so beginners know more exists.
 *  - Advanced mode leads with the full analysis and offers "Simplify",
 *    an instant plain-English rewrite (names, no jargon, 3 sentences).
 */
function AnswerCard({ a, simple }: { a: QuestionAnswer; simple: boolean }) {
  // what the user is *currently* reading: plain or full analysis
  const [showPlain, setShowPlain] = useState(simple);

  const plain = a.beginner_summary || a.short_answer || a.answer;
  const paras = a.detailed_answer?.length ? a.detailed_answer : (a.answer ? [a.answer] : []);
  const showingPlain = showPlain && !!plain;
  const paraText = paras.join(" ");
  // plain view: only short factual bullets add value (long analytical ones would
  // just repeat the answer with jargon back in); full view: skip bullets that
  // merely echo sentences already shown in the paragraphs above
  const bullets = showingPlain
    ? (a.evidence ?? []).filter((e) => e.length <= 90).slice(0, 2)
    : (a.evidence ?? []).filter((e) => !paraText.includes(e.slice(0, 40))).slice(0, 6);

  return (
    <div className="animate-fade-in rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">{a.question}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {a.used_llm && <Badge tone="speed"><Sparkles size={10} /> polished</Badge>}
          <Badge tone={a.confidence === "high" ? "good" : a.confidence === "low" ? "bad" : "neutral"}>
            {a.confidence}
          </Badge>
        </span>
      </div>

      {a.answer_title && <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft/80">{a.answer_title}</div>}

      {showingPlain ? (
        <>
          <p className="mt-0.5 text-sm leading-relaxed text-ink">{plain}</p>
          {!simple && (
            <p className="mt-1 text-[11px] text-speed/80">
              <Wand2 size={10} className="mr-1 inline align-[-1px]" />
              Plain-English version — numbers unchanged.
            </p>
          )}
        </>
      ) : (
        <div className="mt-0.5 space-y-1.5">
          {paras.map((p, i) => (
            <p key={i} className={cx("text-sm leading-relaxed", i === 0 ? "text-ink" : "text-ink-muted")}>{p}</p>
          ))}
        </div>
      )}

      {bullets.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {bullets.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent-soft/70" />{e}
            </li>
          ))}
        </ul>
      )}

      {!showingPlain && a.advanced_notes?.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-base-900/40 p-2">
          <div className="label mb-1">Analyst notes</div>
          <ul className="space-y-0.5">
            {a.advanced_notes.map((n, i) => <li key={i} className="text-xs text-ink-faint">{n}</li>)}
          </ul>
        </div>
      )}

      {a.missing_data?.length > 0 && a.kind === "missing" && (
        <p className="mt-1.5 text-xs text-amber">What&apos;s missing: {a.missing_data.join(", ")}</p>
      )}

      {!!plain && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showingPlain ? (
            <button onClick={() => setShowPlain(false)}
              className="chip border-accent/30 text-accent-soft hover:bg-accent/10">
              <ChevronDown size={11} /> {simple ? "Show deeper analysis" : "Show full analysis"}
            </button>
          ) : (
            <button onClick={() => setShowPlain(true)}
              className="chip border-speed/30 text-speed hover:bg-speed/10">
              <Wand2 size={11} /> {simple ? "Back to the simple answer" : "Simplify"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
