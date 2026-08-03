"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, MessageSquareText, Wand2 } from "lucide-react";
import { Sparkles } from "@/components/ui/MotionIcon";
import { api } from "@/lib/api";
import type { QuestionAnswer, SessionCategory } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/format";
import { AnalysisProgress } from "./AnalysisProgress";

const MIN_THINK_MS = 1500; // makes the analysis feel considered, not instant

// Module-level store: answers survive tab switches (component unmounts) for the
// life of the page and are wiped on refresh. Keyed per session so each race
// keeps its own thread.
const askHistoryStore = new Map<string, QuestionAnswer[]>();

export function QuestionBox({
  year, gp, session, llmAvailable, category, seed,
}: {
  year: number; gp: string; session: string; llmAvailable: boolean; category: SessionCategory;
  /** A question the reader has already chosen elsewhere — see the note below. */
  seed?: string;
}) {
  const storeKey = `${year}|${gp}|${session}`;
  const [q, setQ] = useState("");
  const boxEl = useRef<HTMLDivElement | null>(null);
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

  /* -------------------------------------------------------------------- */
  /* A QUESTION THE READER ALREADY ASKED.                                  */
  /*                                                                       */
  /* The landing page offers three example questions, each of which was a  */
  /* link carrying `?q=` — and nothing on this side read it. Pressing one  */
  /* opened the Ask tab with an empty box, so the reader had to type the   */
  /* question they had just chosen. It looked like a demo and behaved like */
  /* a navigation, which is the worst of both.                             */
  /*                                                                       */
  /* Now it IS the demo: the question types itself into the real input and */
  /* submits itself against the real session, and the answer is the real   */
  /* answer. Typed rather than pasted because the point of the gesture is  */
  /* to show what happens, and a value that simply appears in a field      */
  /* shows nothing — it is the same reason the analysis takes a beat       */
  /* before it answers.                                                    */
  /*                                                                       */
  /* `done` guards the ref rather than the effect: React re-runs an effect */
  /* immediately after tearing it down in development, and a ref that was  */
  /* already marked used would swallow the second run and leave nothing    */
  /* typed at all.                                                         */
  /* -------------------------------------------------------------------- */
  const usedSeed = useRef<string | null>(null);
  useEffect(() => {
    const text = seed?.trim();
    if (!text || usedSeed.current === text) return;
    usedSeed.current = text;
    boxEl.current?.scrollIntoView({ block: "center", behavior: "smooth" });

    let done = false;
    const fire = () => { done = true; ask(text); };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (still) {
      setQ(text);
      const t = setTimeout(fire, 260);
      return () => { clearTimeout(t); if (!done) usedSeed.current = null; };
    }

    let i = 0, t = 0;
    // the whole question lands in about three quarters of a second whatever
    // its length, so a long one does not turn into a performance
    const step = Math.max(12, Math.min(34, 720 / text.length));
    const id = setInterval(() => {
      setQ(text.slice(0, ++i));
      if (i >= text.length) { clearInterval(id); t = window.setTimeout(fire, 400); }
    }, step);
    return () => {
      clearInterval(id); clearTimeout(t);
      if (!done) usedSeed.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <div>
      <div ref={boxEl} data-tour="ask-box" className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-850/80 p-2 focus-within:border-accent/40">
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-pure disabled:opacity-40">
          <CornerDownLeft size={14} /> <span className="hidden sm:inline">Ask</span>
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {thinking && <AnalysisProgress />}
        {history.map((a, i) => (
          <AnswerCard key={i} a={a} onAsk={ask} />
        ))}
        {!thinking && history.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-base-850/40 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Ask the race engineer
            </div>
            <p className="mb-3 text-sm leading-relaxed text-ink-muted">
              Every answer is built from this session&apos;s timing, strategy, tyre and
              race-control data — and it will say so honestly when the data can&apos;t support one.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS[category === "practice" ? "practice" : category === "qualifying" ? "qualifying" : "race"].map((s) => (
                <button key={s} onClick={() => ask(s)}
                  className="chip border-accent/25 text-ink-muted transition-colors hover:border-accent/50 hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Conversation starters per session type — the empty thread teaches what the
// analyst can actually answer instead of presenting a blank box.
const STARTERS: Record<string, string[]> = {
  race: [
    "Who won and how?",
    "Which strategy worked best?",
    "Why did the biggest loser lose places?",
    "How did the Safety Car change the race?",
  ],
  qualifying: [
    "Who took pole and by how much?",
    "What was the biggest surprise?",
    "Were any laps deleted?",
    "How close were the teammates?",
  ],
  practice: [
    "Who had the best long-run pace?",
    "Which compounds did constructors focus on?",
    "Who looks quickest over one lap?",
  ],
};

/**
 * One answer, two renditions, no global mode involved: every card leads with
 * the plain-English rewrite (how you'd explain it to someone new to F1) and
 * "Show deeper analysis" reveals the full analyst version — stint medians,
 * degradation, stop-by-stop costs. The toggle lives on the card itself.
 */
function AnswerCard({ a, onAsk }: { a: QuestionAnswer; onAsk?: (q: string) => void }) {
  // what the user is *currently* reading: plain or full analysis
  const [showPlain, setShowPlain] = useState(true);

  const plain = a.beginner_summary || a.short_answer || a.answer;
  const paras = a.detailed_answer?.length ? a.detailed_answer : (a.answer ? [a.answer] : []);
  const showingPlain = showPlain && !!plain;
  const paraText = paras.join(" ");
  // plain view: only short factual bullets add value (long analytical ones would
  // just repeat the answer with jargon back in); full view: skip bullets that
  // merely echo sentences already shown in the paragraphs above
  const bullets = showingPlain
    ? (a.evidence ?? [])
        .filter((e) => e.length <= 90 && !plain.includes(e.slice(0, 24)))
        .slice(0, 2)
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
        <p className="mt-0.5 text-sm leading-relaxed text-ink">{plain}</p>
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
              <ChevronDown size={11} /> Show deeper analysis
            </button>
          ) : (
            <button onClick={() => setShowPlain(true)}
              className="chip border-speed/30 text-speed hover:bg-speed/10">
              <Wand2 size={11} /> Simplify
            </button>
          )}
        </div>
      )}

      {/* the conversation continues: engine-suggested follow-ups, one tap away */}
      {onAsk && (a.follow_ups?.length ?? 0) > 0 && a.kind !== "error" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Follow up</span>
          {a.follow_ups.slice(0, 3).map((f) => (
            <button key={f} onClick={() => onAsk(f)}
              className="chip text-ink-muted transition-colors hover:border-accent/40 hover:text-ink">
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
