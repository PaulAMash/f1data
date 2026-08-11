"""
Is this question actually about the loaded Formula 1 session?

WHY THIS EXISTS. `qa.py` was built on a promise — "NEVER dead-end" — which is
right for a reader whose phrasing the handlers do not recognise and wrong for a
reader who is not asking about Formula 1 at all. `_best_effort` falls through to
`_generic`, which returns a race summary, so "what's a good Ferrari-themed cake
recipe" got a race summary. Two costs: the reader is told something they did not
ask about, and the analytics record a *capability gap* ("an F1 question Ask
cannot yet answer") for a question that is not one — polluting the one bucket
that is supposed to decide what gets built next.

NO LLM, AND THE REASON IS NOT COST. A model would decide this well, but it would
put a network call in front of every question — including the ones the handler
chain already answers deterministically in single-digit milliseconds — to decide
something a lexicon decides correctly, and it would make the decision
unreproducible: the same question could be refused on Tuesday and answered on
Wednesday, and no test could pin it down. Everything below runs in microseconds,
is a pure function of the text and the loaded session, and has a regression
corpus (tests/test_ask_relevance.py).

THE SPOOFING PROBLEM, WHICH IS THE WHOLE DESIGN.

A keyword test — "does this mention Ferrari / F1 / a driver" — is trivially
defeated, and defeating it is the natural thing for a bored visitor to try:

    "write me a poem about Ferrari"
    "what's the capital of Monaco"          <- a real circuit!
    "how do I cook a Hamilton beach roast"

So a mention alone is deliberately WEAK evidence (+1) and cannot by itself make
a question F1. What makes a question F1 is asking something about session DATA —
laps, stints, positions, pace, strategy — which is strong (+3). An off-domain
marker ("recipe", "poem", "capital of") is strong evidence AGAINST: enough to
outvote a spoofed entity, not enough to outvote a genuine data question.

THE ASYMMETRY THAT MATTERS. Refusing a real question is far worse than answering
a fake one: one tells a reader their interest is invalid, the other wastes a
paragraph. So there are three verdicts and only ever a refusal on POSITIVE
evidence of being off-domain. "I have no idea what this is" returns UNSURE and
falls through to exactly the behaviour that shipped before this module existed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

RELATED = "related"
UNRELATED = "unrelated"
UNSURE = "unsure"

#: At or above this, the question asked something only session data answers.
STRONG_F1 = 3
#: How far off-domain evidence must exceed that before it wins. See `assess`.
MARGIN = 2

#: What Ask says when it declines. One sentence, no apology theatre, and it names
#: the boundary so the reader knows what WOULD work.
REFUSAL = ("Sorry — I can only answer questions about Formula 1 race and session "
           "data. Ask me about this session's drivers, laps, strategy, pace, tyres "
           "or race control and I'll dig into the real timing data.")


@dataclass(frozen=True)
class Verdict:
    """The decision, plus everything needed to explain or test it."""
    verdict: str
    f1_score: int
    off_score: int
    reasons: tuple[str, ...] = ()

    @property
    def is_unrelated(self) -> bool:
        return self.verdict == UNRELATED


# --------------------------------------------------------------------------- #
# Evidence FOR: this is a question about session data.
#
# Weight 3 = asking about something only a session can answer. Weight 2 = F1
# domain language a general question would not use. Weight 1 = a mention, which
# on its own proves nothing (see the spoofing note above).
# --------------------------------------------------------------------------- #
_F1_EVIDENCE: list[tuple[int, str, re.Pattern]] = [
    (3, "session data", re.compile(
        r"\b(lap ?times?|laps?|stints?|pit ?stops?|pitted|pit ?lane|pit ?wall|"
        r"tyres?|tires?|compounds?|degrad\w*|graining|blistering|"
        r"grid|pole|podium|dnf|retire[ds]?|retirement|classif\w*|"
        r"safety ?car|virtual safety|vsc|red ?flag|yellow ?flag|drs|"
        r"undercut|overcut|overtak\w*|fastest ?lap|race ?pace|"
        r"qualifying|quali|q1|q2|q3|sprint|free practice|fp[123]|"
        r"sector ?[123]|telemetry|stewards?|penalt\w*|track limits|"
        r"race ?control|formation ?lap|parc ferm[eé]|apex|chicane)\b", re.I)),
    (3, "session question", re.compile(
        r"\b(who (won|finished|led|retired|started|took)|what happened|"
        r"how many (laps|stops|pit|points|places|positions)|"
        r"why did .{0,40}\b(lose|lost|gain|win|retire|pit|crash|stop|drop|fall)|"
        r"how did .{0,40}\b(win|lose|overtake|pass|finish|qualify)|"
        r"best (strategy|pace|lap|stint)|(strategy|pace) (was|worked)|"
        r"fastest (driver|lap|car|team)|biggest (mover|gainer|loser))\b", re.I)),
    (2, "f1 domain", re.compile(
        r"\b(formula ?(one|1)|f1|grand ?prix|gp\b|fia|paddock|"
        r"championship|standings|constructor[s']*|team ?mate|teammate|"
        r"race ?engineer|strateg\w*|pace|position|places|"
        r"circuit|track|session)\b", re.I)),
    (2, "timing language", re.compile(
        r"\b(seconds?|tenths?|gap|delta|split|gained|lost|"
        r"slow(er|est)?|fast(er|est)?|quick(er|est)?|pace)\b", re.I)),
]

# --------------------------------------------------------------------------- #
# Evidence AGAINST: nobody asks this about a motor race.
#
# EVERY ENTRY HERE IS A LIABILITY, so each was checked against the kinds of
# question a real reader asks. Deliberately ABSENT, and why:
#   "weather"  — a first-class F1 topic ("what was the weather doing?")
#   "story"    — Race Story is a feature of this product
#   "code"     — drivers have three-letter codes
#   "engine"   — a power unit
#   "price"    — only ever as "stock price" / "ticket price", handled as phrases
# --------------------------------------------------------------------------- #
_OFF_DOMAIN: list[tuple[int, str, re.Pattern]] = [
    (4, "cooking", re.compile(
        r"\b(recipe|cook(ing|ed)?|bake[drs]?|baking|cake|dinner|breakfast|"
        r"lunch|restaurant|menu|ingredient|calories)\b", re.I)),
    (4, "creative writing", re.compile(
        r"\b(poem|poetry|haiku|limerick|sonnet|write me|write a|essay|"
        r"joke|riddle|lyrics|screenplay|fan ?fiction)\b", re.I)),
    (4, "general knowledge", re.compile(
        r"\b(capital of|population of|president of|prime minister|"
        r"who invented|when was .{0,20}(founded|born|invented)|"
        r"meaning of life|how tall is|currency of|language.{0,10}spoken)\b", re.I)),
    (4, "assistant tasks", re.compile(
        r"\b(translate|translation|summari[sz]e this|rewrite this|"
        r"ignore (all |your |the )?(previous|prior|above)|"
        r"system prompt|you are now|pretend (to be|you)|act as a|"
        r"jailbreak|disregard (all|your|the))\b", re.I)),
    (4, "programming", re.compile(
        r"\b(python|javascript|typescript|sql query|regex|"
        r"write (some |the )?code|function that|api key|stack ?overflow)\b", re.I)),
    # A named other sport is decisive on its own: it is the one marker that has
    # to survive beside "who won", which is otherwise strong F1 evidence.
    (5, "other sports", re.compile(
        r"\b(football|soccer|basketball|baseball|cricket|rugby|tennis|golf|"
        r"nba|nfl|mlb|premier league|world cup|olympics)\b", re.I)),
    (3, "commerce", re.compile(
        r"\b(stock ?price|share price|ticket price|buy tickets|book a (flight|hotel)|"
        r"invest\w*|crypto|bitcoin|discount code|how much does it cost to buy)\b", re.I)),
    # Shopping advice. The consumer nouns are named explicitly rather than
    # matching "recommend me a ..." on its own, because "recommend me a driver
    # to watch" is a perfectly good F1 question and must not be caught here.
    (3, "shopping advice", re.compile(
        r"\b(laptop|smart ?phone|iphone|android|headphones|mattress|"
        r"television|washing machine|graphics card)\b|"
        r"\bunder \$?\d+ ?(dollars|pounds|euros|quid|bucks)\b", re.I)),
    (3, "personal / medical", re.compile(
        r"\b(my (girlfriend|boyfriend|wife|husband|mum|mom|dad|boss|homework)|"
        r"symptoms?|diagnos\w*|prescription|should i see a doctor|"
        r"headaches?|migraines?|fever|feel(ing)? (sick|ill)|my health|"
        r"dating advice|relationship advice)\b", re.I)),
    (3, "off-domain how-to", re.compile(
        r"\b(how (do|can) i (cook|bake|learn|install|download|fix my|lose weight|"
        r"get rich|make money))\b", re.I)),
    (2, "chit-chat", re.compile(
        r"\b(how are you|who are you|what are you|are you (an? )?(ai|robot|human|"
        r"chatgpt|bot)|what model|tell me about yourself|marry me|i love you)\b", re.I)),
]

_STOPWORDS = frozenset("""
a an the is was are were do did does what which who whom whose why how when where
in on at to of for from by with about and or but if then than that this these those
it its his her their my your our me you he she they we i can could would should
have has had be been being will shall may might must not no yes so as too very
""".split())


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def _looks_like_gibberish(text: str) -> bool:
    """Keyboard mashing, not a question.

    Conservative: a real question tripping this would be refused, so it only
    fires when most content words are unpronounceable. "asdfghjkl qwertyuiop"
    qualifies; "wht happened to leclrc" (typos, no vowelless runs) does not.
    """
    words = [w for w in _tokens(text) if w not in _STOPWORDS]
    if not words:
        return False

    def unpronounceable(w: str) -> bool:
        if len(w) < 4 or w.isdigit():
            return False
        # no vowel at all, or a run of five consonants — neither is English
        return not re.search(r"[aeiouy]", w) or bool(re.search(r"[^aeiouy\W]{5}", w))

    bad = sum(1 for w in words if unpronounceable(w))
    return bad * 2 >= len(words)


def assess(question: str, *, entities: dict | None = None) -> Verdict:
    """Decide whether `question` is about Formula 1 session data.

    `entities` is `qa._extract`'s output — drivers and teams already resolved
    AGAINST THE LOADED SESSION, which is much stronger than a name list: it
    means the person named someone actually in this race. It still scores only
    +1, because naming a driver is exactly what a spoofed question does.
    """
    text = (question or "").strip()
    if not text:
        return Verdict(UNSURE, 0, 0, ("empty",))

    reasons: list[str] = []
    f1_score = 0
    for weight, label, pattern in _F1_EVIDENCE:
        if pattern.search(text):
            f1_score += weight
            reasons.append(f"+{weight} {label}")

    ents = entities or {}
    if (ents.get("drivers") or []) or (ents.get("teams") or []):
        f1_score += 1                      # WEAK. See the module docstring.
        reasons.append("+1 named someone in this session")

    # `_extract` ALWAYS returns a populated `laps` dict — {late, early, lap} with
    # falsey values when nothing was referenced — so testing the dict itself only
    # tests that qa.py returned a dict, which it always does. The CONTENTS are
    # the signal, not the container.
    laps = ents.get("laps") or {}
    if laps.get("lap") is not None or laps.get("late") or laps.get("early"):
        f1_score += 2
        reasons.append("+2 referenced a lap")
    if ents.get("compound"):
        f1_score += 2
        reasons.append("+2 referenced a tyre compound")

    off_score = 0
    for weight, label, pattern in _OFF_DOMAIN:
        if pattern.search(text):
            off_score += weight
            reasons.append(f"-{weight} {label}")

    # --- the decision ----------------------------------------------------- #
    # Off-domain evidence has to BEAT the F1 evidence, not merely exist: a
    # question can legitimately mention food ("did the pit crew get lunch before
    # the safety car?") and still be about the race.
    #
    # AND WHERE THERE IS REAL SESSION-DATA EVIDENCE IT MUST BEAT IT CLEARLY.
    # English borrows vocabulary constantly — "was the undercut a recipe for
    # disaster", "he cooked his tyres" — and a one-point win for the off-domain
    # side refuses all of them. The margin applies only above the session-data
    # threshold, so a question carrying nothing but a driver's name is still
    # decided on the simple comparison and the spoofing cases are unaffected.
    decisive = f1_score + (MARGIN if f1_score >= STRONG_F1 else 1)
    if off_score and off_score >= decisive:
        return Verdict(UNRELATED, f1_score, off_score, tuple(reasons))
    if f1_score == 0 and off_score:
        return Verdict(UNRELATED, f1_score, off_score, tuple(reasons))
    if f1_score == 0 and _looks_like_gibberish(text):
        return Verdict(UNRELATED, f1_score, off_score, tuple(reasons) + ("gibberish",))
    if f1_score >= STRONG_F1:
        return Verdict(RELATED, f1_score, off_score, tuple(reasons))
    if f1_score > 0:
        # Something F1-ish but thin — a bare "Verstappen?" or "the strategy".
        # Not enough to be sure, and not evidence of anything else either, so the
        # handlers get their chance exactly as they always did.
        return Verdict(UNSURE, f1_score, off_score, tuple(reasons))
    return Verdict(UNSURE, f1_score, off_score, tuple(reasons) or ("no signal",))
