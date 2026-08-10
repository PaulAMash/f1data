"""
Did Ask actually answer the question, and what was the question about?

NO SECOND LLM. Both answers are already inside the pipeline.

`analysis/qa.py` is a chain of ~30 deterministic handlers. Every answer it
produces already carries the evidence needed to grade it:

    kind          which handler answered ("tyre_strategy", "best_pace", …).
                  This is a question taxonomy that already exists and is exactly
                  as accurate as the feature it names.
    confidence    high / medium / low, set by the handler that knows.
    missing_data  an explicit list of what the answer needed and did not have.
    kind=="missing"  the handler said outright that it cannot answer.

One thing was genuinely absent, and it is the most valuable signal of the lot:
when NO handler recognises the question, `_best_effort()` falls through to
`_generic()`, which returns a session overview with `kind="overview"` — and a
generic overview served because nobody understood the question is indis-
tinguishable, after the fact, from a generic overview somebody asked for. That
case IS "Ask does not support what this person wanted", which is the whole
reason to look at this data. So `answer_question` now sets one boolean,
`matched_handler`, and nothing else about it changed.

Grading with an LLM was the obvious alternative and it is worse in every
direction that matters: another API call per question (cost), on the request
path (latency), producing a judgement that cannot be reproduced or tested,
about a pipeline that already knows the answer.
"""
from __future__ import annotations

import re

# --------------------------------------------------------------------------- #
# Outcomes
# --------------------------------------------------------------------------- #
ANSWERED = "answered"
PARTIAL = "partial"
UNANSWERED = "unanswered"
DATA_UNAVAILABLE = "data_unavailable"
ERROR = "error"

OUTCOMES = (ANSWERED, PARTIAL, UNANSWERED, DATA_UNAVAILABLE, ERROR)

OUTCOME_LABEL = {
    ANSWERED: "Successfully answered",
    PARTIAL: "Partially answered",
    UNANSWERED: "Could not answer",
    DATA_UNAVAILABLE: "Data unavailable",
    ERROR: "System error",
}


def classify_outcome(*, kind: str | None, confidence: str | None,
                     missing: list[str] | None, matched: bool | None,
                     failed: bool = False) -> str:
    """One of OUTCOMES, from what the pipeline already reported.

    `failed` is the caller's own signal that the request never got as far as an
    answer — an exception, or the session bundle raising DataUnavailableError.
    """
    if failed:
        return ERROR
    kind = (kind or "").strip()
    missing = missing or []

    # The handler said so itself.
    if kind == "missing":
        return DATA_UNAVAILABLE
    # Nothing was asked.
    if kind == "empty":
        return UNANSWERED
    # No handler recognised the question; what came back is a consolation prize.
    if matched is False:
        return UNANSWERED
    # Answered, but it had to leave something out.
    if missing:
        return PARTIAL
    if (confidence or "").lower() == "low":
        return PARTIAL
    return ANSWERED


# --------------------------------------------------------------------------- #
# Topics
# --------------------------------------------------------------------------- #
STRATEGY = "strategy"
PACE = "pace"
TYRES = "tyres"
OVERTAKES = "overtakes"
POSITIONS = "positions"
QUALIFYING = "qualifying"
WEATHER = "weather"
RESULTS = "results"
COMPARISON = "comparison"
RETIREMENTS = "retirements"
HISTORY = "history"
OTHER = "other"

TOPIC_LABEL = {
    STRATEGY: "Strategy", PACE: "Pace", TYRES: "Tyres", OVERTAKES: "Overtakes",
    POSITIONS: "Position changes", QUALIFYING: "Qualifying", WEATHER: "Weather",
    RESULTS: "Results", COMPARISON: "Driver / team comparison",
    RETIREMENTS: "Retirements", HISTORY: "Historical", OTHER: "Other",
}

#: A handler's identity IS the topic — it is named after the thing it answers.
_KIND_TOPIC = {
    "tyre_strategy": TYRES,
    "undercut": STRATEGY, "alt_strategy": STRATEGY, "pit_loss": STRATEGY,
    "vsc": STRATEGY,
    "best_pace": PACE, "fastest": PACE, "worst_team": PACE,
    "practice_fastest": PACE, "practice_longrun": PACE, "practice_team": PACE,
    "practice_laps": PACE,
    "overtake": OVERTAKES,
    "why_lost": POSITIONS, "gainer": POSITIONS, "loser": POSITIONS,
    "what_happened": POSITIONS, "could_better": POSITIONS,
    "pole": QUALIFYING, "knocked_out": QUALIFYING,
    "weather": WEATHER,
    "results": RESULTS, "winner": RESULTS, "explain": RESULTS, "overview": RESULTS,
    "compare_drivers": COMPARISON, "compare_teams": COMPARISON,
    "retirement": RETIREMENTS,
}

#: For questions no handler recognised — which is the set that matters most,
#: because these are the ones telling you what to build next. Ordered: the first
#: match wins, so the more specific patterns come first.
_TOPIC_PATTERNS: list[tuple[str, re.Pattern]] = [
    (TYRES, re.compile(r"\b(tyre|tire|compound|soft|medium|hard|inter(mediate)?s?|wet|"
                       r"stint|degrad|graining|blister)\w*", re.I)),
    (STRATEGY, re.compile(r"\b(strateg|pit ?stop|pitted|pit ?wall|undercut|overcut|"
                          r"one.?stop|two.?stop|three.?stop|safety ?car|vsc|"
                          r"virtual safety|red flag|box|call)\w*", re.I)),
    (QUALIFYING, re.compile(r"\b(qualif|pole|q1|q2|q3|grid|shootout|deleted lap)\w*", re.I)),
    (OVERTAKES, re.compile(r"\b(overtak|pass(ed|ing)?|drs|slipstream|dive ?bomb|"
                           r"wheel.to.wheel|defend)\w*", re.I)),
    (RETIREMENTS, re.compile(r"\b(retir|dnf|crash|collision|accident|blew|failure|"
                             r"broke down|mechanical|engine failure|puncture)\w*", re.I)),
    (WEATHER, re.compile(r"\b(weather|rain|wet|dry|temperature|track temp|humid|wind)\w*", re.I)),
    (PACE, re.compile(r"\b(pace|fast(est)?|quick(est)?|slow(est)?|lap ?time|"
                      r"long ?run|consisten|sector)\w*", re.I)),
    (COMPARISON, re.compile(r"\b(compare|versus|vs\.?|against|better than|"
                            r"team.?mate|head.to.head)\b", re.I)),
    (POSITIONS, re.compile(r"\b(position|places?|gained|lost|dropped|climbed|fell|"
                           r"P\d+|move[ds]? up|move[ds]? down)\b", re.I)),
    (HISTORY, re.compile(r"\b(championship|standings|season|career|all.time|history|"
                         r"record|ever|title)\w*", re.I)),
    (RESULTS, re.compile(r"\b(win|won|winner|podium|result|finish|classif|points?)\w*", re.I)),
]


def classify_topic(question: str, kind: str | None = None,
                   matched: bool | None = None) -> str:
    """What the question was about.

    A matched handler names its own topic, which is both free and exactly right.
    Anything else — including a handler added later that this map has not been
    taught yet — is read from the question text, so a new feature never silently
    becomes "Other".
    """
    if matched is not False and kind:
        topic = _KIND_TOPIC.get(kind)
        if topic:
            return topic
    text = question or ""
    for topic, pattern in _TOPIC_PATTERNS:
        if pattern.search(text):
            return topic
    return OTHER


def summarize_missing(missing: list[str] | None) -> str | None:
    """The one-line 'Missing: stint data' the dashboard shows under a question."""
    if not missing:
        return None
    return ", ".join(str(m) for m in missing[:4])
