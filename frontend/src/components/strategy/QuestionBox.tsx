"use client";
import { useState } from "react";
import { CornerDownLeft, MessageSquareText, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { QuestionAnswer } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/misc";

const SUGGESTIONS = [
  "Why did LEC lose so many places?",
  "Who had the best race pace?",
  "Who benefited most from the VSC?",
  "Which driver lost the most time in the pits?",
  "Compare Ferrari and Red Bull strategy",
  "Did the extra stop make sense?",
  "Who had the strongest final stint?",
  "Which team made the worst strategy call?",
];

export function QuestionBox({
  year, gp, session, mock, llmAvailable,
}: { year: number; gp: string; session: string; mock: boolean; llmAvailable: boolean }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QuestionAnswer[]>([]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setQ("");
    try {
      const res = await api.ask({ year, gp, session, question: text, mock });
      setHistory((h) => [res, ...h]);
    } catch (e: any) {
      setHistory((h) => [{
        question: text, answer: e.message ?? "Something went wrong.", kind: "error",
        used_llm: false, confidence: "low", supporting: {}, missing_data: [],
      }, ...h]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 p-2 focus-within:border-accent/40">
        <MessageSquareText size={16} className="ml-1.5 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder="Ask about this race…  e.g. why did Leclerc lose places?"
          className="flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          onClick={() => ask(q)}
          disabled={loading || !q.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? <Spinner size={14} /> : <CornerDownLeft size={14} />} Ask
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={loading}
            className="chip hover:border-white/20 hover:text-ink disabled:opacity-40">{s}</button>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Answers are computed from the loaded race data.
        {llmAvailable
          ? " An LLM key is configured — wording may be polished, but facts come from the data."
          : " No LLM key needed — deterministic answers from the analysis engine."}
      </p>

      <div className="mt-4 space-y-3">
        {history.map((a, i) => (
          <div key={i} className="animate-fade-in rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{a.question}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {a.used_llm && <Badge tone="speed"><Sparkles size={10} /> LLM-polished</Badge>}
                <Badge tone={a.confidence === "high" ? "good" : a.confidence === "low" ? "bad" : "neutral"}>
                  {a.confidence}
                </Badge>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">{a.answer}</p>
            {a.missing_data.length > 0 && (
              <p className="mt-1.5 text-xs text-amber">Missing: {a.missing_data.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
