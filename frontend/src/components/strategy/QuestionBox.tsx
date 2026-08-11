"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, MessageSquareText, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { Sparkles } from "@/components/ui/MotionIcon";
import { api } from "@/lib/api";
import { recallFeedback, sendAskFeedback, visitorId, visitSessionId } from "@/lib/analytics";
import type { QuestionAnswer, SessionCategory } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { BetaTag } from "@/components/ui/BetaTag";
import { cx } from "@/lib/format";
import { AnalysisProgress } from "./AnalysisProgress";

const MIN_THINK_MS = 1500; // makes the analysis feel considered, not instant

// Module-level store: answers survive tab switches (component unmounts) for the
// life of the page and are wiped on refresh. Keyed per session so each race
// keeps its own thread.
const askHistoryStore = new Map<string, AskEntry[]>();

/* -------------------------------------------------------------------------- */
/* EVERY ANSWER NEEDS AN IDENTITY OF ITS OWN, AND THIS IS WHY.                */
/*                                                                            */
/* The thread was rendered `history.map((a, i) => <AnswerCard key={i} …>)`     */
/* over a list that new answers are PREPENDED to. React reconciles by key, so  */
/* the component instance at key 0 is reused for whatever answer is at index 0 */
/* — and its state comes with it. The sequence that produced the reported bug: */
/*                                                                            */
/*   1. Ask Q1. Press the thumbs-down. The Rate at key 0 sets sent=false and   */
/*      renders its acknowledgement. Correct so far.                           */
/*   2. Ask Q2. Q2 becomes index 0. React keeps the same Rate instance, which  */
/*      still holds sent=false — so Q2 renders as ALREADY RATED, with its      */
/*      buttons gone, and nobody ever clicked anything.                        */
/*                                                                            */
/* One bug, both reported symptoms: controls that vanish, and answers showing  */
/* a feedback state the reader never chose. `showPlain` leaked the same way,   */
/* silently.                                                                   */
/*                                                                            */
/* A local id rather than `ask_ref`: the ref is absent when analytics is off   */
/* and on the client-side error card, and a key that is sometimes undefined is */
/* the same bug with extra steps.                                              */
/* -------------------------------------------------------------------------- */
type AskEntry = { id: string; answer: QuestionAnswer };

let askSeq = 0;
const nextAskId = () => `ask-${Date.now().toString(36)}-${++askSeq}`;

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
  const [history, setHistoryState] = useState<AskEntry[]>(
    () => askHistoryStore.get(storeKey) ?? []);
  const setHistory = (fn: (h: AskEntry[]) => AskEntry[]) => {
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
      const res = await api.ask({ year, gp, session, question: text,
                                  visitor: visitorId(), visit: visitSessionId() });
      const elapsed = Date.now() - started;
      if (elapsed < MIN_THINK_MS) await new Promise((r) => setTimeout(r, MIN_THINK_MS - elapsed));
      setHistory((h) => [{ id: nextAskId(), answer: res }, ...h]);
    } catch (e: any) {
      setHistory((h) => [{ id: nextAskId(), answer: {
        question: text, answer: e?.message ?? "Something went wrong.", kind: "error",
        used_llm: false, confidence: "low", supporting: {}, missing_data: [],
        entities: {}, follow_ups: [], simple: false, answer_title: "Couldn't answer",
        short_answer: e?.message ?? "Something went wrong.", detailed_answer: [], evidence: [],
        beginner_summary: null, advanced_notes: [], related_drivers: [], related_laps: [], analysis_steps: [],
      } as QuestionAnswer }, ...h]);
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
      <BetaNotice />
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
        {history.map((entry) => (
          <AnswerCard key={entry.id} a={entry.answer} onAsk={ask} />
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

/* -------------------------------------------------------------------------- */
/* WAS THAT ANY USE?                                                          */
/*                                                                            */
/* The analytics behind Ask can already tell, deterministically, when it could */
/* not answer or had to leave something out — that comes free from the         */
/* pipeline's own `kind`, `confidence` and `missing_data` (see                 */
/* backend/app/analytics/classify.py). What it can NEVER see is the case that  */
/* matters most: an answer that was complete, confident, and wrong. Only the   */
/* reader knows that, so this is the one thing worth asking them.              */
/*                                                                            */
/* Two icons on the end of a row that already exists. No new row, no modal, no */
/* "tell us more" box, and it disappears once pressed — a control that keeps   */
/* asking after it has been answered is nagging, and a reader who has to think */
/* about the instrument is not thinking about the race.                        */
/* -------------------------------------------------------------------------- */
function Rate({ refId }: { refId?: string | null }) {
  /* THE STATE IS SEEDED FROM THE REF, NOT FROM NOTHING.
     `useState(initial)` reads its argument only on an instance's first render —
     exactly right here, because the instance is now per-answer (see the AskEntry
     note above) and the initial value is looked up by THAT answer's own ref. Two
     consequences, both required: a rating survives a tab switch that unmounts
     this card, and a rating can never appear against an answer it was not given
     for. */
  const [sent, setSent] = useState<null | boolean>(() => recallFeedback(refId) ?? null);

  /* A ref that changes identity means a different answer, so any inherited
     opinion is not this answer's. Belt and braces against the exact class of bug
     this control had: even if React reuses this instance for a different card,
     the state re-seeds from the new ref rather than persisting. */
  const seededFor = useRef<string | null | undefined>(refId);
  useEffect(() => {
    if (seededFor.current === refId) return;
    seededFor.current = refId;
    setSent(recallFeedback(refId) ?? null);
  }, [refId]);

  // No handle means analytics is off on this deployment; then there is nothing
  // to attach an opinion to and the control has no business being on screen.
  if (!refId) return null;

  const rate = (helpful: boolean) => {
    if (sent !== null) return;          // answered once; not a toggle
    setSent(helpful);
    sendAskFeedback(refId, helpful);
  };

  /* ANSWERED: the state is confirmed IN PLACE rather than replaced by a line of
     grey text. Keeping the pressed icon visible is what makes it read as "you
     said this" instead of "something happened here". */
  if (sent !== null) {
    return (
      <span className={cx(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium",
        sent ? "border-speed/30 bg-speed/[0.08] text-speed"
             : "border-amber/30 bg-amber/[0.08] text-amber")}>
        {sent ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
        {sent ? "Marked helpful" : "Thanks — we'll look at this"}
      </span>
    );
  }

  /* NOT YET ANSWERED. The old version was two 13px icons in the faintest ink the
     palette has, at the end of a row of chips — present, and genuinely easy to
     miss, which is what the ask was about. This is a bordered group with a label
     and 28px hit targets: it reads as one control, it is obviously pressable,
     and it still sits inside a row that already existed rather than becoming a
     banner. Not a "RATE THIS ANSWER" prompt — asked once, quietly, in the place
     the eye already ends up. */
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.12]
                     bg-base-900/50 py-0.5 pl-2.5 pr-0.5">
      <span className="mr-1 text-[11.5px] font-medium text-ink-muted">Helpful?</span>
      <button onClick={() => rate(true)} aria-label="This answer was helpful"
        title="This answer was helpful"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted
                   transition-colors hover:bg-speed/15 hover:text-speed
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-speed">
        <ThumbsUp size={14} />
      </button>
      <button onClick={() => rate(false)} aria-label="This answer was not helpful"
        title="This answer was not helpful"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted
                   transition-colors hover:bg-amber/15 hover:text-amber
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
        <ThumbsDown size={14} />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* THE ONE THING WORTH SAYING BEFORE SOMEONE ASKS.                            */
/*                                                                            */
/* This sits above the input rather than under it, because it is context for   */
/* the question you are about to type, not a footnote to the answer. It is one */
/* strip and three clauses — what Ask is, what is getting better, and what we  */
/* want back — because a disclaimer long enough to need reading is a           */
/* disclaimer nobody reads.                                                    */
/*                                                                            */
/* It leads with the same BETA pill that marks the tab, so arriving here       */
/* explains the mark you just pressed. Accent, not amber: the product uses     */
/* amber for demo data and for things that are wrong, and Ask is neither. The  */
/* register is "this is good and getting sharper", never "this may not work" — */
/* a reader who leaves this box trusting the answers less than they should has */
/* been badly served by a notice that was meant to be honest.                  */
/*                                                                            */
/* Mode-independent by construction: QuestionBox is the one Ask surface, so    */
/* Simple and Advanced both get it without either being asked to remember.     */
/* -------------------------------------------------------------------------- */
function BetaNotice() {
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-accent/[0.18] bg-accent/[0.05] px-3 py-2.5">
      <BetaTag tone="on" className="mt-[3px] shrink-0" />
      {/* the panel is as wide as the page; a line of prose should not be. */}
      <p className="max-w-[86ch] text-[12.5px] leading-relaxed text-ink-muted">
        <span className="font-medium text-ink">Ask is new, and getting sharper.</span>{" "}
        It already reasons over this session&apos;s real timing, strategy and race-control
        data — and we&apos;re actively deepening how much context it brings to an answer.
        If there&apos;s something you wish it could tell you, ask it anyway: what people
        reach for is what we build next.
      </p>
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

      {/* THE ACTION ROW IS UNCONDITIONAL, AND THAT IS A FIX.
          It used to be wrapped in `{!!plain && …}`, so an answer with no summary
          text — no beginner_summary, no short_answer, no answer — lost the
          rating control along with the toggle that condition was actually for.
          The toggle needs `plain`; the thumbs never did. `Rate` decides for
          itself whether it has anything to attach an opinion to. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!!plain && (showingPlain ? (
          <button onClick={() => setShowPlain(false)}
            className="chip border-accent/30 text-accent-soft hover:bg-accent/10">
            <ChevronDown size={11} /> Show deeper analysis
          </button>
        ) : (
          <button onClick={() => setShowPlain(true)}
            className="chip border-speed/30 text-speed hover:bg-speed/10">
            <Wand2 size={11} /> Simplify
          </button>
        ))}
        {/* Into the row that already exists rather than a row of its own —
            the ask was for a signal, not for furniture. */}
        <span className="ml-auto"><Rate refId={a.ask_ref} /></span>
      </div>

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
