# Ask engine

The Ask tab answers plain-English questions about the loaded session using a
**deterministic analysis engine** (backend `app/analysis/qa.py`). No LLM key is
required; if `ANTHROPIC_API_KEY` is set it only polishes wording — never invents facts.

## How a question is answered

0. **Relevance gate** (`app/analysis/relevance.py`, V91) — *is this even about
   Formula 1?* If it is positively off-domain, Ask declines with one sentence
   that names the boundary, and the interaction is recorded as `off_topic`
   rather than as a capability gap. If there is no evidence either way it falls
   through to step 1 exactly as before, because refusing a real question is far
   worse than answering a fake one. See "The relevance gate" below.
1. **Entity extraction** — fuzzy driver/team matching from the *loaded* session's
   entry list plus a nickname map (`george→RUS`, `max→VER`, `leclerc→LEC`, …), lap
   hints ("last lap", "lap 34"), tyre compound, session context.
2. **Intent routing** — ordered handlers for overtakes, "what happened to X", why-lost,
   pace, pit loss, VSC/Safety-Car benefit, undercut/overcut, tyre strategy, weather,
   driver/team comparison, practice fastest / long-run / laps, and whole-race summary.
3. **Best-effort fallback** — if no intent matches cleanly, the engine still answers
   from the available entities/data. It **never** returns "couldn't map that question";
   worst case it says *"I'm not fully certain, but the loaded data suggests…"* with an
   honest confidence level and what's missing. `matched_handler` records that
   nothing recognised the question, which is what lets analytics tell "somebody
   asked for an overview" apart from "we gave them one because we had nothing
   better" — the difference between a satisfied reader and a feature request.
4. **Structure** — every answer is returned as structured fields the UI renders:
   `answer_title`, `short_answer`, `detailed_answer[]`, `evidence[]`, `confidence`,
   `missing_data[]`, `related_drivers[]`, `related_laps[]`, `beginner_summary`,
   `advanced_notes[]`, `analysis_steps[]`, `follow_ups[]`.

## Overtake reasoning

If explicit overtake data exists (OpenF1), it's used directly. Otherwise the engine
**infers** the pass from the lap-by-lap position trace: it finds the lap where X moved
ahead of Y, checks whether either car pitted nearby, and classifies the cause as
on-track, pit-cycle, or unclear — always stating its confidence.

## Simple vs Advanced

- **Simple:** `beginner_summary` (jargon stripped) + 2–3 evidence bullets.
- **Advanced:** full `detailed_answer` paragraphs, `evidence`, `advanced_notes`
  (confidence, method, assumptions like fuel/tyre-corrected clean-air pace).

## Thinking state

The UI shows an "Analyzing…" progress panel with staged steps
(`AnalysisProgress`) for a short minimum so answers feel considered, then renders
the structured result.

## The relevance gate

`qa.py` was built on a promise — **never dead-end** — which is right for a reader
whose phrasing the handlers do not recognise, and wrong for a reader who is not
asking about Formula 1 at all. The fall-through returns a race summary, so
*"what's a good Ferrari-themed cake recipe"* got a race summary. Two costs: the
reader is told something they did not ask about, and the analytics record a
*capability gap* for a question that is not one, corrupting the one list that
decides what gets built next.

**No LLM, and the reason is not cost.** A model would decide this well and would
also put a network call in front of every question — including the ones the
handler chain already answers deterministically in single-digit milliseconds — to
decide something a lexicon decides correctly, while making the decision
unreproducible: the same question could be refused on Tuesday and answered on
Wednesday, and no test could pin it down. The gate is a pure function of the text
and the loaded session, runs in microseconds, and has a regression corpus.

### The spoofing problem, which is the whole design

A keyword test — *does this mention Ferrari / F1 / a driver* — is trivially
defeated, and defeating it is the natural thing for a bored visitor to try:

    "write me a poem about Ferrari"
    "what's the capital of Monaco"          <- a real circuit
    "how do I cook a Hamilton beach roast"

So a **mention alone is weak evidence (+1)** and can never by itself make a
question F1. What makes a question F1 is asking about session **data** — laps,
stints, positions, pace, strategy, tyres (+3). An off-domain marker (recipe,
poem, capital-of, another sport) is strong evidence *against*: enough to outvote
a spoofed entity, not enough to outvote a genuine data question.

### The asymmetry

Refusing a real question is far worse than answering a fake one: one tells a
reader their interest is invalid, the other wastes a paragraph. So:

- there are **three** verdicts — `related`, `unrelated`, `unsure`;
- a refusal happens only on **positive** evidence of being off-domain;
- `unsure` falls through to the behaviour that shipped before the gate existed;
- above the session-data threshold, off-domain evidence must win by a **margin**,
  because English borrows vocabulary constantly ("was the undercut a recipe for
  disaster", "he cooked his tyres").

### What it says

One sentence, no apology theatre, and it names the boundary so the reader knows
what *would* work — then offers follow-up chips that do. A refusal that only says
no teaches the reader nothing about the product.

The corpus — every real spoof attempt and every question that must never be
refused — is `backend/tests/test_ask_intelligence.py`.

## What Ask was asked, and how well it did

Every interaction is classified from the pipeline's own signals and shown on the
private dashboard: which subject, whether it was answered outright, what was
missing, and the reader's thumbs. Subjects are recognised from the **question
text** rather than from whichever handler answered, so a topic Ask has no handler
for is still counted under its real name — and a subject the taxonomy has never
seen keeps a name drawn from its own words instead of vanishing into "Other".
See `docs/ANALYTICS.md`.
