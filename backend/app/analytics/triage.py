"""
What is this piece of feedback about, and how much does it matter?

The same shape as analytics/topics.py, pointed at a different subject. Ask
questions are about MOTOR RACING — tyres, undercuts, who lost second place.
Feedback is about THE PRODUCT — a chart that will not draw, a season that is
missing, a feature somebody wants. The two taxonomies have almost no vocabulary
in common, so sharing one would have meant a table that classified neither well;
what IS shared is the method, because it is the method that was worth keeping:

    SCORED, NOT FIRST-MATCH. Every area scores the message and the best score
    wins, so the order of the list cannot decide the answer.

    WEIGHTED BY SPECIFICITY. A compound phrase that names one area and nothing
    else outranks that area's own noun, which outranks a word it shares with a
    neighbour.

    EMERGENT WHEN NOTHING FITS. Rather than sweeping an unanticipated subject
    into "Other", a key phrase is extracted and stored, and the dashboard
    clusters phrases that recur. The taxonomy grows from what people actually
    report.

No model. A pure function over a lexicon, in microseconds, on a request that is
already fire-and-forget.

--------------------------------------------------------------------------- #
THREE THINGS ARE DECIDED HERE, NOT ONE.

    AREA      which part of the product this is about. What turns a list of
              complaints into a list of places to work.

    SEVERITY  for bugs only, and read from how the reporter wrote it. "The page
              is completely broken" and "the label is slightly off" are both
              bugs and are not the same bug. Deliberately coarse — three levels,
              from language, with no pretence of being more than a first sort.

    JUNK      whether this is a real report at all. THE POINT OF THIS FLAG IS
              TO PROTECT THE OTHER TWO. A public feedback box collects
              keyboard-mashing, test submissions and abuse, and every one of
              those that lands in a real category makes that category's count a
              little less true. Junk is filed under `other` and marked, so the
              product areas stay honest and the noise is still there to read if
              you want it.
"""
from __future__ import annotations

import re

#: The two things a reader can be doing. Kept as data because the panel, the
#: dashboard, the report and the purge scopes all need to agree on the spelling.
BUG = "bug"
SUGGESTION = "suggestion"
KINDS = (BUG, SUGGESTION)

KIND_LABEL = {BUG: "Bug report", SUGGESTION: "Suggestion"}

OTHER = "other"

# --------------------------------------------------------------------------- #
# Areas
#
# WEIGHTS: 5 = a phrase that names this area and nothing else.
#          4 = the area's own noun. 3 = strong associated vocabulary.
#          2 = a word this area shares with its neighbours.
# --------------------------------------------------------------------------- #
_AREAS: list[tuple[str, str, list[tuple[int, str]]]] = [
    ("charts", "Charts and visuals", [
        (5, r"\b(position|pace|tyre|tire|strategy|lap[\s-]?time)\s?(chart|graph|plot|trace)\b"),
        (5, r"\b(chart|graph|plot)s?\s+(is|are|was|were|do(es)?n'?t|not|never|won'?t)\s+"
            r"(blank|empty|missing|load|render|draw|show|appear)"),
        (4, r"\b(chart|graph|plot|axis|axes|legend|tooltip)s?\b"),
        (3, r"\b(line|bar|marker|data\s?point|y[\s-]?axis|x[\s-]?axis|gridline)s?\b"),
        (3, r"\b(overlap\w*|collid\w*|cut\s?off|clipped|unreadable|illegible)\b"),
    ]),
    ("ask", "Ask", [
        (5, r"\bask\s+(feature|box|tab|tool|said|says|answered|gave|could\s?n'?t|does\s?n'?t)\b"),
        (5, r"\b(wrong|bad|incorrect|useless|unhelpful)\s+answer\b"),
        (4, r"\banswer(ed|ing|s)?\b"), (4, r"\bchat\s?bot\b"),
        (3, r"\b(question|prompt|query|response)s?\b"),
        (3, r"\bai\b"),
    ]),
    ("data_accuracy", "Wrong or missing data", [
        (5, r"\b(wrong|incorrect|inaccurate|missing|blank|empty|no)\s+"
            r"(result|data|time|lap|position|standing|point|stint|pit\s?stop|driver|team)s?\b"),
        (5, r"\bshould\s+(be|say|show)\b.{0,30}\b(but|instead|not)\b"),
        (5, r"\b(does\s?n'?t|do\s?n'?t|did\s?n'?t)\s+match\b"),
        (4, r"\b(inaccura\w*|incorrect\w*|wrong)\b"),
        (3, r"\b(out\s?of\s?date|stale|outdated|mismatch\w*|discrepanc\w*)\b"),
        (3, r"\bpartial\s?data\b"),
    ]),
    ("loading", "Loading and availability", [
        (5, r"\b(stuck|spins?|spinning|hangs?|hung|never)\s+"
            r"(on|at|in)?\s?(the\s)?(load|loading|spinner|tyre|tire)\b"),
        (5, r"\b(wo\s?n'?t|does\s?n'?t|did\s?n'?t|never)\s+(load|open|finish)\b"),
        (5, r"\bsession\s?(is\s)?(unavailable|not\s?available)\b"),
        (4, r"\b(loading|spinner|timeout|timed\s?out)\b"),
        (3, r"\b(error|failed|failure|503|500|502|504)\b"),
        (3, r"\bunavailable\b"),
    ]),
    ("performance", "Speed", [
        (5, r"\b(very|really|so|extremely|painfully)\s+slow\b"),
        (5, r"\btakes?\s+(ages|forever|too\s?long|\d+\s?(second|minute)s?)\b"),
        (4, r"\b(slow|sluggish|laggy|lag|freez\w*|stutter\w*|jank\w*)\b"),
        (3, r"\bperformance\b"), (3, r"\bspeed\s?(it\s?)?up\b"),
    ]),
    ("navigation", "Navigation", [
        (5, r"\b(back|forward)\s?(button|arrow)\b"),
        (5, r"\bca\s?n'?t\s+(find|get\s?back|return|navigate)\b"),
        (4, r"\b(navigation|nav\s?bar|menu|breadcrumb|tab)s?\b"),
        (4, r"\b(link|url|route|page\s?not\s?found|404)s?\b"),
        (3, r"\b(lost|confusing|confused)\b.{0,20}\b(where|which\s?page|navigat\w*)\b"),
    ]),
    ("selection", "Choosing a session", [
        (5, r"\b(race|session|season|year|grand\s?prix|gp)\s?(select|picker|dropdown|chooser)\b"),
        (5, r"\bca\s?n'?t\s+(select|choose|pick|find)\s+(a|the|my)?\s?"
            r"(race|session|season|year|gp|grand\s?prix)\b"),
        (4, r"\b(dropdown|selector|picker)s?\b"),
        (3, r"\b(select|choose|pick)\w*\b.{0,20}\b(race|session|season)\b"),
    ]),
    ("compare", "Compare", [
        (5, r"\bcompar\w+\s+(two|2|drivers?|teams?|tab|page|tool)\b"),
        (4, r"\bcompar\w+\b"),
        (3, r"\b(head[\s-]?to[\s-]?head|side[\s-]?by[\s-]?side|versus|vs\.?)\b"),
    ]),
    ("historical", "Historical archive", [
        (5, r"\b(championship|title)\s+(standing|table|history)s?\b"),
        (5, r"\b(19[5-9]\d|200\d|201\d)\b"),
        (4, r"\b(historical|archive|history)\b"),
        (3, r"\b(past|old|previous|earlier)\s+(season|year|race|championship)s?\b"),
        (3, r"\bstandings?\b"),
    ]),
    ("appearance", "Appearance and layout", [
        (5, r"\b(dark|light)\s?mode\b"),
        (5, r"\b(text|font)\s+(is\s+)?(too\s+)?(small|big|large|tiny|hard\s?to\s?read)\b"),
        (4, r"\b(theme|colour|color|contrast|layout|spacing|alignment)s?\b"),
        (4, r"\b(mobile|phone|tablet|ipad|responsive)\b"),
        (3, r"\b(overflow\w*|cut\s?off|off\s?screen|squash\w*|cramped|misalign\w*)\b"),
        (3, r"\b(ugly|cluttered|busy|hard\s?to\s?read)\b"),
    ]),
    ("copy", "Wording and labels", [
        (5, r"\b(typo|typos|misspel\w*|mis-?spelt|spelling\s?(mistake|error)?)\b"),
        (4, r"\b(wording|phrasing|grammar|punctuation)\b"),
        (3, r"\b(label|caption|heading|title|tooltip\s?text|says?)\b.{0,25}"
            r"\b(wrong|unclear|confusing|should\s?say|reads?)\b"),
        (3, r"\b(unclear|confusing|jargon|ambiguous)\s+(wording|label|text|term)s?\b"),
    ]),
    ("tutorial", "Tutorial and onboarding", [
        (5, r"\b(guided\s?)?(tour|tutorial|walkthrough|onboarding)\b"),
        (4, r"\bwelcome\s?(screen|page)\b"),
        (3, r"\b(first\s?time|getting\s?started|how\s?do\s?i\s?start)\b"),
    ]),
    ("settings", "Settings", [
        (5, r"\b(setting|preference)s?\s?(page|screen|panel)\b"),
        (4, r"\b(setting|preference)s?\b"),
        (3, r"\b(units?|metric|imperial|celsius|fahrenheit|spelling|24\s?hour|12\s?hour)\b"),
        (3, r"\b(reduced\s?motion|animation\s?off|colou?r\s?blind)\b"),
    ]),
    ("animation", "Motion and animation", [
        (5, r"\banimation(s)?\s+(do\s?n'?t|does\s?n'?t|are\s?n'?t|is\s?n'?t|never|not)\s+"
            r"(play|work|run|animat\w*|mov\w*)\b"),
        (4, r"\banimat\w+\b"),
        (3, r"\b(motion|transition|movement)s?\b"),
    ]),
    ("feature_request", "New capability", [
        (5, r"\b(would|it'?d)\s?be\s?(really\s?)?(nice|great|good|cool|useful|helpful)\s?(if|to)\b"),
        (5, r"\b(please|can\s?you|could\s?you|you\s?should)\s+add\b"),
        (5, r"\bfeature\s?request\b"),
        (4, r"\b(add|support|include)\s+(a|an|the|more)\b"),
        (3, r"\b(wish|hope|want)\s+(you|it|there)\b"),
        (3, r"\bmissing\s+(feature|option|ability)\b"),
    ]),
]

_COMPILED = [(key, [(w, re.compile(p, re.I)) for w, p in pats])
             for key, _label, pats in _AREAS]

AREA_LABEL = {key: label for key, label, _ in _AREAS}
AREA_LABEL[OTHER] = "Uncategorised"

#: Order the dashboard lists them in, so a scoreboard is stable between loads.
AREA_ORDER = [key for key, _, _ in _AREAS] + [OTHER]

#: Below this nothing convincing was said. Same threshold and same reasoning as
#: topics._CONFIDENT: two is one shared word, which is not a subject.
_CONFIDENT = 3


# --------------------------------------------------------------------------- #
# Severity — bugs only.
# --------------------------------------------------------------------------- #
HIGH, MEDIUM, LOW = "high", "medium", "low"
SEVERITY_ORDER = (HIGH, MEDIUM, LOW)
SEVERITY_LABEL = {HIGH: "Blocking", MEDIUM: "Degraded", LOW: "Cosmetic"}

_BLOCKING = re.compile(
    r"\b(crash\w*|cannot\s?use|ca\s?n'?t\s?use|unusable|completely\s?broken|"
    r"totally\s?broken|nothing\s?(loads|works|shows)|blank\s?(page|screen)|"
    r"white\s?screen|wo\s?n'?t\s?(load|open|start)|stuck\s?(on|at)|"
    r"never\s?(loads|finishes)|infinite\s?loop|data\s?loss|lost\s?my)\b", re.I)

_COSMETIC = re.compile(
    r"\b(typo|spelling|misspel\w*|slightly|a\s?bit|minor|small|tiny|nitpick|"
    r"cosmetic|pixel|alignment|spacing|colou?r\s?is|would\s?look\s?better)\b", re.I)


def severity_of(message: str) -> str:
    """A coarse first sort for a bug report, read from how it was written.

    Blocking beats cosmetic when a message somehow reads as both: a report that
    says "minor typo, and the page never loads" is a page that never loads.
    """
    text = message or ""
    if _BLOCKING.search(text):
        return HIGH
    if _COSMETIC.search(text):
        return LOW
    return MEDIUM


# --------------------------------------------------------------------------- #
# Junk
#
# Every rule here is about the SHAPE of the text, never about whether it is
# critical. Harsh feedback is feedback; the flag exists to catch submissions
# that carry no report at all, and it is deliberately conservative — a false
# positive silently hides something real, which is far worse than an extra row
# to skim.
# --------------------------------------------------------------------------- #
_URL_ONLY = re.compile(r"^\s*(https?://\S+\s*)+$", re.I)
_TEST_ONLY = re.compile(r"^[\s\W]*(test(ing)?\d*|hello|hi|hey|asdf\w*|qwerty\w*|"
                        r"foo|bar|baz|abc\w*|123\w*|lorem\s?ipsum)[\s\W]*$", re.I)


def is_junk(message: str) -> bool:
    """Whether this submission carries no report."""
    text = (message or "").strip()
    if len(text) < 6:
        return True
    if _TEST_ONLY.match(text) or _URL_ONLY.match(text):
        return True

    letters = re.sub(r"[^a-z]", "", text.lower())
    if len(letters) < 5:                       # punctuation or digits only
        return True
    # A real sentence has vowels. Keyboard-mashing usually does not.
    if sum(c in "aeiou" for c in letters) / len(letters) < 0.12:
        return True
    # One character held down, or the same short token over and over.
    if re.search(r"(.)\1{7,}", text.lower()):
        return True
    words = re.findall(r"[a-z']+", text.lower())
    if len(words) >= 4 and len(set(words)) == 1:
        return True
    # Nothing that reads as a word at all: no token of three or more letters.
    if not any(len(w) >= 3 for w in words):
        return True
    return False


# --------------------------------------------------------------------------- #
# Emergent areas — same convention as topics.py, so a stored key says which
# kind it is at a glance and the two can never collide.
# --------------------------------------------------------------------------- #
EMERGENT_PREFIX = "~"

_STOP = frozenset("""
a an the is was were are be been being do did does done has have had how what
which who whom whose why when where that this these those there here it its
of in on at to for from by with about into over after before during than then
and or but if so as too very much many more most some any all both each
i me my we our you your he him his she her they them their
can could would should will shall may might must not no nor yes please
site website page app application pitwall iq thing stuff really just also
work works working use used using make makes made get gets got go goes went
see saw look looks looking think thought want wanted need needed
fix fixed broken issue problem bug suggestion feedback report
small big minor major slight little bit lot panel section tab button screen
add added adding remove please maybe perhaps think guess sure
support supported supporting allow allows able ability option feature
""".split())


def _emergent_key(phrase: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(phrase).lower()).strip("_")
    return f"{EMERGENT_PREFIX}{slug}"[:48] if slug else OTHER


def is_emergent(area: str | None) -> bool:
    return bool(area) and str(area).startswith(EMERGENT_PREFIX)


def key_phrase(message: str) -> str | None:
    """The two words this report is really about, once the filler is gone.

    TWO OR NOTHING, which is where this differs from topics.key_phrase. A single
    surviving word is not a product area — it is usually a verdict ("useless",
    "suck", "confusing"), and promoting one to a category of its own is how a
    scoreboard of places to work acquires a row called "Suck" sitting beside
    Charts and Loading. A report that cannot name two things stays in
    Uncategorised, which is exactly where a reader should look for it.
    """
    words = [w for w in re.findall(r"[a-z][a-z'-]+", (message or "").lower())
             if w not in _STOP and len(w) > 2]
    return " ".join(words[:2])[:40] if len(words) >= 2 else None


def classify(message: str, kind: str = BUG) -> tuple[str, str | None]:
    """`(area_key, area_hint)` for one submission.

    The hint is set only when nothing in the taxonomy scored confidently, and is
    the raw material the dashboard clusters into candidate areas. An area and a
    hint are mutually exclusive, exactly as in topics.classify.
    """
    text = message or ""

    # Junk never reaches a product area. Filing it under one is the whole thing
    # this is here to prevent.
    if is_junk(text):
        return OTHER, None

    scores: dict[str, int] = {}
    for key, patterns in _COMPILED:
        total = sum(w for w, pattern in patterns if pattern.search(text))
        if total:
            scores[key] = total

    # "New capability" describes the SHAPE of a request, not a part of the
    # product, so it must never outrank an area that was actually named. A
    # suggestion that says "please add a qualifying comparison" is about
    # Compare; only a suggestion that names nothing else is a bare capability
    # request. Dropped outright for bugs, where the phrasing means nothing.
    if "feature_request" in scores and (kind == BUG or len(scores) > 1):
        scores.pop("feature_request")

    if scores:
        best = max(scores.values())
        winners = [k for k, v in scores.items() if v == best]
        if best >= _CONFIDENT:
            return min(winners, key=AREA_ORDER.index), None

    phrase = key_phrase(text)
    if phrase:
        return _emergent_key(phrase), phrase
    return OTHER, None


def display_area(area: str | None, hint: str | None = None) -> str:
    """What to show a person for this report's subject."""
    key = area or OTHER
    if is_emergent(key):
        return str(hint or key[len(EMERGENT_PREFIX):].replace("_", " ")).strip().title()
    return AREA_LABEL.get(key, str(key).replace("_", " ").title())


def normalize_kind(kind: str | None) -> str:
    value = (kind or "").strip().lower()
    return value if value in KINDS else BUG
