"use client";
import { useState } from "react";
import { CornerDownLeft, MessageSquareText, Sparkles, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import type { QuestionAnswer, SessionCategory } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/misc";

const RACE_SUGGESTIONS = [
  "Explain the race simply",
  "How did the top 2 compare?",
  "Why did LEC lose so many places?",
  "Who had the best race pace?",
  "Who benefited most from the VSC?",
  "Which driver lost the most time in the pits?",
  "Did the extra stop make sense?",
];
const PRACTICE_SUGGESTIONS = [
  "Who was fastest?",
  "Who had the best long run?",
  "Who did the most laps?",
  "Was Ferrari quick?",
  "Compare McLaren and Red Bull",
  "Explain this session simply",
];

export function QuestionBox({
  year, gp, session, mock, llmAvailable, category,
}: {
  year: number; gp: string; session: string; mock: boolean;
  llmAvailable: boolean; category: SessionCategory;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QuestionAnswer[]>([]);
  const suggestions = category === "practice" ? PRACTICE_SUGGESTIONS : RACE_SUGGESTIONS;

  async function ask(question: string, simple = false) {
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setQ("");
    try {
      const res = await api.ask({ year, gp, session, question: text, mock, simple });
      setHistory((h) => [res, ...h]);
    } catch (e: any) {
      setHistory((h) => [{
        question: text, answer: e.message ?? "Something went wrong.", kind: "error",
        used_llm: false, confidence: "low", supporting: {}, missing_data: [],
        entities: {}, follow_ups: [], simple: false,
      }, ...h]);
    } finally {
      setLoading(false);
    }
  }

  function onFollow(fu: string, prev: QuestionAnswer) {
    if (/simpl|explain simply|eli5|new to f1/i.test(fu)) ask(prev.question, true);
    else ask(fu);
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 p-2 focus-within:border-accent/40">
        <MessageSquareText size={16} className="ml-1.5 text-ink-faint" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder={category === "practice"
            ? "Ask about this session…  e.g. who had the best long run?"
            : "Ask about this race…  e.g. how did George overtake Max?"}
          className="flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <button onClick={() => ask(q)} disabled={loading || !q.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {loading ? <Spinner size={14} /> : <CornerDownLeft size={14} />} Ask
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={loading}
            className="chip hover:border-white/20 hover:text-ink disabled:opacity-40">{s}</button>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Answers come from the loaded session data.{" "}
        {llmAvailable ? "An LLM may polish the wording — the facts are computed."
          : "No API key needed — plain-English answers from the analysis engine."}
      </p>

      <div className="mt-4 space-y-3">
        {history.map((a, i) => (
          <div key={i} className="animate-fade-in rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{a.question}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {a.used_llm && <Badge tone="speed"><Sparkles size={10} /> polished</Badge>}
                <Badge tone={a.confidence === "high" ? "good" : a.confidence === "low" ? "bad" : "neutral"}>{a.confidence}</Badge>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">{a.answer}</p>
            {a.missing_data.length > 0 && a.kind === "missing" && (
              <p className="mt-1.5 text-xs text-amber">What's missing: {a.missing_data.join(", ")}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {!a.simple && (
                <button onClick={() => ask(a.question, true)}
                  className="chip border-speed/30 text-speed hover:bg-speed/10">
                  <Wand2 size={11} /> Simplify
                </button>
              )}
              {a.follow_ups.filter((f) => !/simpl/i.test(f)).slice(0, 3).map((fu) => (
                <button key={fu} onClick={() => onFollow(fu, a)}
                  className="chip hover:border-white/20 hover:text-ink">{fu}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
