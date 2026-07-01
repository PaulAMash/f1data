# Ask engine

The Ask tab answers plain-English questions about the loaded session using a
**deterministic analysis engine** (backend `app/analysis/qa.py`). No LLM key is
required; if `ANTHROPIC_API_KEY` is set it only polishes wording — never invents facts.

## How a question is answered

1. **Entity extraction** — fuzzy driver/team matching from the *loaded* session's
   entry list plus a nickname map (`george→RUS`, `max→VER`, `leclerc→LEC`, …), lap
   hints ("last lap", "lap 34"), tyre compound, session context.
2. **Intent routing** — ordered handlers for overtakes, "what happened to X", why-lost,
   pace, pit loss, VSC/Safety-Car benefit, undercut/overcut, tyre strategy, weather,
   driver/team comparison, practice fastest / long-run / laps, and whole-race summary.
3. **Best-effort fallback** — if no intent matches cleanly, the engine still answers
   from the available entities/data. It **never** returns "couldn't map that question";
   worst case it says *"I'm not fully certain, but the loaded data suggests…"* with an
   honest confidence level and what's missing.
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
