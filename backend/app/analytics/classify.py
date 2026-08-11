"""
Did Ask actually answer the question, and what was the question about?

NO SECOND LLM. Both answers are already inside the pipeline.

`analysis/qa.py` is a chain of ~30 deterministic handlers. Every answer it
produces already carries the evidence needed to grade it:

    kind          which handler answered ("tyre_strategy", "best_pace", …).
    confidence    high / medium / low, set by the handler that knows.
    missing_data  an explicit list of what the answer needed and did not have.
    kind=="missing"    the handler said outright that it cannot answer.
    kind=="off_topic"  the relevance gate declined (analysis/relevance.py).
    matched_handler    whether ANY handler recognised the question, or the chain
                       fell through to a best-effort session overview.

Grading with an LLM was the obvious alternative and is worse in every direction
that matters: another API call per question (cost), on the request path
(latency), producing a judgement that cannot be reproduced or tested, about a
pipeline that already knows the answer.

--------------------------------------------------------------------------- #
THE NAMES NOW SAY WHAT THEY MEAN, AND WHAT TO DO ABOUT THEM.

The old vocabulary was written from the system's point of view and read from the
dashboard as five shades of failure. But the useful question is not "how badly
did this go" — it is "what would I do about it", and those have different
answers that were being lumped together:

    unanswered      -> unsupported   A real F1 question, understood as one, that
                                     no handler covers. NOT an error. It is a
                                     FEATURE REQUEST written by a reader, and
                                     the single most valuable row in the table.
    data_unavailable-> no_data       Ask knew exactly what was asked and the
                                     session did not carry it. Nothing to build.
    error           -> failed        Something threw. A bug.
    (new)              off_topic     Not a Formula 1 question at all. These used
                                     to be `unanswered`, quietly inflating the
                                     "Ask can't do this" bucket with poems and
                                     cake recipes.

And one axis that is NOT an outcome: 👎. An answer can be `answered` — matched,
confident, complete — and still be WRONG, and only the reader can tell us that.
It is tracked separately, because "Ask produced a bad answer" and "Ask produced
no answer" need different fixes and merging them hides both.

Rows written under the old spellings are rewritten once by store._migrate(),
which keeps every query in queries.py free of alias handling.
"""
from __future__ import annotations

import re

from . import topics

# --------------------------------------------------------------------------- #
# Outcomes
# --------------------------------------------------------------------------- #
ANSWERED = "answered"
PARTIAL = "partial"
UNSUPPORTED = "unsupported"
NO_DATA = "no_data"
OFF_TOPIC = "off_topic"
FAILED = "failed"

OUTCOMES = (ANSWERED, PARTIAL, UNSUPPORTED, NO_DATA, OFF_TOPIC, FAILED)

OUTCOME_LABEL = {
    ANSWERED: "Answered",
    PARTIAL: "Answered with gaps",
    UNSUPPORTED: "Not yet supported",
    NO_DATA: "Data unavailable",
    OFF_TOPIC: "Not about F1",
    FAILED: "System error",
}

#: The definition, shown as the tooltip, so a label and its meaning live in one
#: place and cannot drift apart.
OUTCOME_HELP = {
    ANSWERED: "A handler recognised the question and answered it in full.",
    PARTIAL: "Answered, but something was missing or the confidence was low.",
    UNSUPPORTED: "A real F1 question no handler covers yet — build these next.",
    NO_DATA: "Understood, but this session does not carry the data to answer it.",
    OFF_TOPIC: "Not a Formula 1 question; Ask declined rather than guessing.",
    FAILED: "The request raised an exception. A bug, not a gap.",
}

#: What each one MEANS FOR YOU — the difference between a number and an
#: instruction. This is what the dashboard groups the outcomes by.
OUTCOME_ACTION = {
    ANSWERED: "none",
    PARTIAL: "improve",
    UNSUPPORTED: "build",
    NO_DATA: "none",
    OFF_TOPIC: "none",
    FAILED: "fix",
}

#: Good / warning / problem, for colour. `unsupported` is deliberately NOT a
#: failure colour — it is an opportunity, and painting it red on a beta whose
#: job is discovering what to build would be reading the instrument backwards.
OUTCOME_TONE = {
    ANSWERED: "good", PARTIAL: "warn", UNSUPPORTED: "opportunity",
    NO_DATA: "info", OFF_TOPIC: "muted", FAILED: "bad",
}

#: Old spellings -> new. Applied once, by the migration.
LEGACY_OUTCOMES = {
    "unanswered": UNSUPPORTED,
    "data_unavailable": NO_DATA,
    "error": FAILED,
}

#: "Ask did not fully deliver". Named and defined in ONE place, because the old
#: dashboard showed an "unresolved" count whose definition existed only inside a
#: SQL string — and a number nobody can define is a number nobody can act on.
#: Note what is absent: off_topic (working as intended) and failed (a bug, not a
#: capability gap).
UNRESOLVED = (UNSUPPORTED, NO_DATA, PARTIAL)
UNRESOLVED_HELP = ("Questions Ask did not fully deliver on: not yet supported, "
                   "missing data, or answered with gaps. Excludes off-topic "
                   "questions (declined on purpose) and system errors (bugs).")


def classify_outcome(*, kind: str | None, confidence: str | None,
                     missing: list[str] | None, matched: bool | None,
                     failed: bool = False) -> str:
    """One of OUTCOMES, from what the pipeline already reported.

    `failed` is the caller's own signal that the request never got as far as an
    answer — an exception, or the session bundle raising DataUnavailableError.
    """
    if failed:
        return FAILED
    kind = (kind or "").strip()
    missing = missing or []

    # The relevance gate declined. Not a gap in Ask's capability.
    if kind == "off_topic":
        return OFF_TOPIC
    # The handler said so itself.
    if kind == "missing":
        return NO_DATA
    # Nothing was asked.
    if kind == "empty":
        return UNSUPPORTED
    # No handler recognised the question; what came back is a consolation prize.
    if matched is False:
        return UNSUPPORTED
    # Answered, but it had to leave something out.
    if missing:
        return PARTIAL
    if (confidence or "").lower() == "low":
        return PARTIAL
    return ANSWERED


def normalize_outcome(outcome: str | None) -> str:
    """Read-side safety net for a row written before the migration ran."""
    value = (outcome or "").strip()
    return LEGACY_OUTCOMES.get(value, value)


# --------------------------------------------------------------------------- #
# Topics — the table itself lives in topics.py, where it grew too large to sit
# beside the outcome logic. These are the names the rest of the package imports.
# --------------------------------------------------------------------------- #
OTHER = topics.OTHER
TOPIC_LABEL = topics.TOPIC_LABEL
display_topic = topics.display_label


def classify_topic(question: str, kind: str | None = None,
                   matched: bool | None = None,
                   entities: dict | None = None) -> str:
    """Backwards-compatible single-value form. Prefer `classify_topic_full`."""
    return topics.classify(question, kind, matched, entities)[0]


def classify_topic_full(question: str, kind: str | None = None,
                        matched: bool | None = None,
                        entities: dict | None = None) -> tuple[str, str | None]:
    """`(topic, hint)` — the hint is what lets new topics emerge."""
    return topics.classify(question, kind, matched, entities)


def normalize_question(question: str) -> str:
    """A stable key for "this is the same question, asked again".

    Case, punctuation and inner whitespace only. Deliberately NOT stemming or
    synonym folding: the dashboard shows the grouped question back to a human,
    and a group whose members are not visibly the same question is a group that
    cannot be trusted.
    """
    text = (question or "").lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:200]


def summarize_missing(missing: list[str] | None) -> str | None:
    """The one-line 'Missing: stint data' the dashboard shows under a question."""
    if not missing:
        return None
    return ", ".join(str(m) for m in missing[:4])
