"""V91: Ask has to know what it is being asked.

Two problems, one file, because they are the same problem seen from both ends.

  RELEVANCE (analysis/relevance.py). "What's a good Ferrari-themed cake recipe"
  used to get a race summary, because qa.py's promise was "never dead-end" and
  its fall-through is a generic session overview. That is wrong twice: the reader
  is told something they did not ask, and analytics record a CAPABILITY GAP for a
  question that is not one — poisoning the single list that decides what gets
  built next.

  TOPICS (analytics/topics.py). Legitimate F1 questions were landing in `Other`,
  which made the dashboard's most valuable panel a shrug. `Other` is now reserved
  for what is genuinely not about the racing.

THE ASYMMETRY IS THE DESIGN. Refusing a real question is much worse than
answering a fake one: one tells a reader their interest is invalid, the other
wastes a paragraph. So a refusal requires POSITIVE evidence of being off-domain,
an entity mention alone is weak, and "no idea" falls through to the old
behaviour rather than to a refusal.

Every case below is a real question or a real spoof attempt, not a synthetic
string. The screenshot cases at the top are the ones the user reported.
"""
from __future__ import annotations

import pytest

from app.analysis import relevance
from app.analytics import classify, topics


# =========================================================================== #
# 1. The reported failures. These are the acceptance criteria.
# =========================================================================== #
REPORTED = [
    ("How many pit stops did Piastri have?", "pit_stops"),
    ("Did Max had technical issues while racing?", "technical"),
    ("Why did Collapinto and Hamilton collided?", "collisions"),
    ("Why did Lando ended the race in second place?", "results"),
    ("Who had the best strategy?", "strategy"),
    ("Were any laps deleted?", "track_limits"),
    ("Who took pole and by how much?", "qualifying"),
]


@pytest.mark.parametrize("question,expected", REPORTED)
def test_the_reported_questions_are_no_longer_other(question, expected):
    """Each of these appeared under `Other` on the live dashboard. Broken
    English is deliberate — readers type "did Max had", and a classifier that
    only handles well-formed grammar handles nothing."""
    topic, _hint = topics.classify(question, kind="overview", matched=False)
    assert topic == expected, f"{question!r} -> {topic}"


def test_an_unknown_subject_keeps_its_own_name_instead_of_becoming_other():
    """The emergent path. "How was the brake temperature on the McLarens?" has no
    row in the taxonomy and must NOT be filed under Other — it keeps a name drawn
    from its own text, which is how the taxonomy learns what to add next."""
    q = "How was the brake temperature on the McLarens?"
    topic, hint = topics.classify(q, kind="overview", matched=False)
    assert topic != topics.OTHER
    label = topics.display_label(topic, hint)
    assert "brake" in label.lower(), label
    assert len(label.split()) <= 5, "a topic name is a label, not a sentence"


# =========================================================================== #
# 2. The taxonomy, across the subjects readers actually ask about.
# =========================================================================== #
@pytest.mark.parametrize("question,expected", [
    ("What was Ferrari's tyre strategy in Monaco?", "tyres"),
    ("Should they have pitted earlier for a two stop?", "strategy"),
    ("How did Verstappen overtake him into turn 1?", "overtakes"),
    ("Why did Leclerc retire?", "retirements"),
    ("Did the rain change anything?", "weather"),
    ("Which driver had the best race pace?", "pace"),
    ("Compare Norris versus Piastri", "comparison"),
    ("Was there a safety car?", "safety_car"),
    ("Did anyone get a penalty?", "penalties"),
    ("How long was the pit stop for Russell?", "pit_stops"),
    ("Who gained the most positions?", "positions"),
    ("What was the gap at the flag?", "gaps"),
    ("Was the start any good?", "starts"),
    ("Did they use DRS to pass?", "drs"),
    ("How were the sector times?", "sectors"),
    ("Who won the championship that year?", "championship"),
    ("What did the team say on the radio?", "radio"),
])
def test_a_question_is_categorised_from_its_own_text(question, expected):
    """The set that matters most: with no handler match, the TEXT decides — so a
    subject Ask cannot yet answer is still counted under its real name."""
    assert classify.classify_topic(question, "overview", False) == expected


def test_the_handler_only_breaks_a_tie():
    """A matched handler names the topic when the text says nothing, and yields
    when the text says something clearly. Otherwise the scoreboard would show
    which handler ran, not what people asked about."""
    # text is silent -> the handler decides
    assert classify.classify_topic("what about that", "tyre_strategy", True) == "tyres"
    # text is loud -> the text decides, even though a handler matched
    assert classify.classify_topic("why did he retire on lap 12?",
                                   "tyre_strategy", True) == "retirements"


def test_a_handler_this_map_has_never_heard_of_falls_back_to_the_text():
    """A new Ask handler must not silently become 'Other'."""
    assert classify.classify_topic("what tyres did they start on?",
                                   "some_new_handler_v99", True) == "tyres"


def test_every_topic_label_is_short_enough_to_scan():
    """A topic list is read at a glance or not at all."""
    for key, label in topics.TOPIC_LABEL.items():
        assert label, key
        assert len(label.split()) <= 5, (key, label)
        assert label[0].isupper(), (key, label)


def test_other_is_named_for_what_it_is():
    """It holds questions that are not about the racing — not questions the
    classifier failed on. The label has to say that, because a bucket called
    'Other' invites the reader to assume the classifier gave up."""
    assert topics.TOPIC_LABEL[topics.OTHER] == "Uncategorised"


@pytest.mark.parametrize("question", [
    "write me a poem",
    "what is the capital of France",
    "how do I make sourdough",
    "asdkjh askjdh qwe",
])
def test_only_genuinely_unrelated_text_reaches_other(question):
    topic, _hint = topics.classify(question, kind="off_topic", matched=True)
    assert topic == topics.OTHER


def test_a_key_phrase_never_comes_back_as_a_stopword():
    """An emergent topic called "The" or "Race" would be worse than Other."""
    for question in ("what happened in the race", "tell me about the session",
                     "what about that driver on that lap"):
        phrase = topics.key_phrase(question)
        assert phrase is None or phrase not in topics._STOP, (question, phrase)  # noqa: SLF001


# =========================================================================== #
# 3. Relevance: the refusal, and what must never be refused.
# =========================================================================== #
UNRELATED_CASES = [
    "what's a good Ferrari-themed cake recipe",
    "write me a poem about Ferrari",
    "what is the capital of France",
    "who won the football world cup",
    "how do I fix a race condition in my python code",
    "recommend me a laptop under 800 dollars",
    "what should I do about my headache",
    "tell me a joke",
    "asdkjh askjdh qwe zzz",
]


@pytest.mark.parametrize("question", UNRELATED_CASES)
def test_an_unrelated_question_is_refused(question):
    verdict = relevance.assess(question)
    assert verdict.verdict == relevance.UNRELATED, (question, verdict)


def test_the_spoof_that_motivated_the_whole_design():
    """An F1 word inside an off-domain question must not buy relevance. This is
    the natural thing for a bored visitor to try, so a plain keyword test — the
    obvious implementation — is defeated by the first person who tries."""
    for question in ("write me a poem about Verstappen",
                     "what's a good Ferrari-themed cake recipe",
                     "how do I cook a Hamilton beach roast",
                     "what is the capital of Monaco"):
        assert relevance.assess(question).verdict == relevance.UNRELATED, question


def test_an_entity_mention_alone_is_weak_evidence():
    """+1, not +3. If a name were strong, every spoof above would pass."""
    entities = {"drivers": ["VER"], "teams": []}
    strong = relevance.assess("what was his tyre strategy", entities=entities)
    spoof = relevance.assess("write me a poem", entities=entities)
    assert strong.verdict == relevance.RELATED
    assert spoof.verdict == relevance.UNRELATED


RELATED_CASES = [
    "who won?",
    "how many pit stops did Piastri have?",
    "why did Lando end the race in second place?",
    "what was the gap to the leader on lap 30?",
    "did the undercut work",
    "was there a safety car",
    "who had the best race pace",
    "what tyres did they start on",
    "why did he retire",
    "did anyone get a penalty",
    "how was the brake temperature on the McLarens",
    "were any laps deleted",
    "who took pole and by how much",
    "was the start any good",
]


@pytest.mark.parametrize("question", RELATED_CASES)
def test_a_real_question_is_never_refused(question):
    """The asymmetry, asserted. UNSURE is acceptable here — it falls through to
    the handler chain exactly as before this module existed. UNRELATED is not."""
    verdict = relevance.assess(question)
    assert verdict.verdict != relevance.UNRELATED, (question, verdict)


def test_an_unrecognisable_question_falls_through_rather_than_refusing():
    """"I have no idea what this is" must behave like it did before the gate
    existed, or the gate becomes a way to lose real questions."""
    assert relevance.assess("what about turn 4 then").verdict != relevance.UNRELATED


def test_lap_entities_only_count_when_a_lap_was_actually_named():
    """V91 REGRESSION. `_extract` always returns a `laps` dict, so testing it for
    truthiness gave EVERY question a free +2 — enough to make a cake recipe score
    as a session question. The contents have to be checked, not the container."""
    empty = {"laps": {"lap": None, "late": False, "early": False}}
    assert relevance.assess("what's a good Ferrari-themed cake recipe",
                            entities=empty).verdict == relevance.UNRELATED
    named = {"laps": {"lap": 30, "late": False, "early": False}}
    assert relevance.assess("what happened there", entities=named).verdict != \
        relevance.UNRELATED


def test_the_refusal_says_what_would_work():
    """A refusal that only says no teaches the reader nothing about the product."""
    assert "Formula 1" in relevance.REFUSAL
    assert len(relevance.REFUSAL) < 400


# =========================================================================== #
# 4. End to end, through the real pipeline.
# =========================================================================== #
@pytest.fixture(scope="module")
def ctx():
    from app.adapters.mock_adapter import get_mock_session
    from app.analysis.engine import analyze
    from app.analysis.qa import QAContext

    session = get_mock_session()
    strategy, pace = analyze(session)
    return QAContext(session=session, strategy=strategy, pace=pace)


def test_ask_declines_an_unrelated_question_instead_of_summarising_the_race(ctx):
    from app.analysis.qa import answer_question

    answer = answer_question("what's a good Ferrari-themed cake recipe", ctx)
    assert answer.kind == "off_topic"
    assert "Formula 1" in answer.answer
    # and the thing that used to happen, must not
    assert "fastest lap" not in answer.answer.lower()
    assert "winner" not in answer.answer.lower()


def test_a_declined_question_is_not_recorded_as_a_capability_gap(ctx):
    """The reason the gate exists at all: `unsupported` is the list that decides
    what gets built, and a poem in it is a wrong instruction."""
    from app.analysis.qa import answer_question

    answer = answer_question("write me a poem about racing cars", ctx)
    outcome = classify.classify_outcome(kind=answer.kind, confidence=answer.confidence,
                                        missing=answer.missing_data,
                                        matched=answer.matched_handler)
    assert outcome == classify.OFF_TOPIC
    assert outcome not in classify.UNRESOLVED


def test_a_real_question_still_gets_a_real_answer(ctx):
    from app.analysis.qa import answer_question

    answer = answer_question("who won?", ctx)
    assert answer.kind != "off_topic"
    assert answer.matched_handler is True
    assert answer.answer
