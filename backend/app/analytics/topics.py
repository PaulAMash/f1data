"""
What was the question actually about?

WHAT THE OLD CLASSIFIER GOT WRONG, observed on real dashboard traffic:

    "How many pit stops did Piastri have?"   -> Strategy
        `pit ?stop` lived inside the STRATEGY pattern and there was no "Pit
        stops" topic, so a question about a concrete countable thing was filed
        under the vaguest heading available.

    "Did Max had technical issues while racing?"   -> Other
    "Why did Collapinto and Hamilton collided?"    -> Other
        nothing matched "technical issues" at all, and RETIREMENTS matched
        `collision` but not `collid\\w*`, so the past tense missed.

"Other" is supposed to mean "this was not a Formula 1 question". Every row that
lands there for some other reason — a subject nobody wrote a regex for, a verb
tense — makes the one bucket that should drive product decisions worthless.

THREE CHANGES.

1. SCORED, NOT FIRST-MATCH. Every topic scores the question; the best score
   wins. Weights encode specificity, so a compound phrase ("lost positions")
   outranks a topic noun ("positions") outranks a word topics share ("race").
   First-match-wins made the ORDER of the list decide the answer, which is why
   "pit stop" could never beat "strategy" no matter how obvious the question.

2. THIRTY-ODD TOPICS, each labelled the way a person would say it — one word
   where one word does, up to five when the subject genuinely needs them.

3. EMERGENT TOPICS. When nothing scores confidently the question is not thrown
   away: a key phrase is extracted and stored as `topic_hint`. The dashboard
   clusters hints that recur, so a subject nobody anticipated ("brake
   temperature") shows up as a candidate for this table instead of vanishing
   into Other. THE TAXONOMY GROWS FROM THE TRAFFIC rather than from guesses,
   which is the only way it can keep up with what people actually ask.

No model, a pure function, microseconds. An LLM would classify these well and
would also add a network call per question to decide something a lexicon
decides correctly, while making the result unreproducible and untestable.
"""
from __future__ import annotations

import re

OTHER = "other"

#: (key, label, [(weight, pattern)]).
#:
#: WEIGHTS: 5 = a compound phrase that names this topic and nothing else.
#:          4 = the topic's own noun. 3 = strong associated vocabulary.
#:          2 = words this topic shares with its neighbours.
_TOPICS: list[tuple[str, str, list[tuple[int, str]]]] = [
    ("pit_stops", "Pit stops", [
        (5, r"\b(how many|number of|count of)\s+(pit\s*)?stops?\b"),
        (4, r"\bpit\s?stops?\b"), (4, r"\bpitted\b"), (4, r"\bbox(ed)?\b"),
        (3, r"\b(stationary|pit\s?lane|pit\s?crew|wheel\s?gun|slow\s?stop|"
            r"pit\s?window|in\s?lap|out\s?lap)\b"),
    ]),
    ("strategy", "Strategy", [
        (5, r"\b(best|better|right|wrong|optimal)\s+(strategy|call|plan)\b"),
        # "should they have pitted earlier" is a question about the DECISION.
        # The word "pitted" alone would file it under Pit stops, which counts
        # stops — a different question with a different answer.
        (5, r"\bshould\s+\w+\s+have\s+(pitted|stopped|boxed|stayed|waited)\b"),
        (3, r"\b(one|two|three|1|2|3)[\s-]?stop(per|ping)?\b"),
        (4, r"\bstrateg\w*\b"), (4, r"\bundercut\w*\b"), (4, r"\bovercut\w*\b"),
        (3, r"\b(pit\s?wall|game\s?plan|gambl\w*|tactic\w*|split\s?strategy)\b"),
        (2, r"\b(call|decision|plan)\b"),
    ]),
    ("positions", "Position changes", [
        (5, r"\b(lose|lost|losing|gain(ed|ing)?|drop(ped)?|climb(ed)?|"
            r"fell|slip(ped)?|made\s?up|recover(ed)?)(\s+\w+){0,2}\s+(place|position)s?\b"),
        (5, r"\bmove[ds]?\s+(up|down|forward|backwards?)\b"),
        (4, r"\bposition\s?(change|swap|trace)s?\b"),
        (3, r"\b(biggest\s?(mover|gainer|loser)|places?\s?(gained|lost)|net\s?(gain|loss))\b"),
        (2, r"\b(positions?|places?)\b"),
    ]),
    ("pace", "Pace", [
        (5, r"\b(race|clean[\s-]?air|long[\s-]?run|true|underlying)\s?pace\b"),
        (4, r"\bpace\b"),
        (3, r"\b(fast(est)?|quick(est)?|slow(est|er)?|consisten\w*|"
            r"degradation\s?rate|stint\s?median)\b"),
        (2, r"\b(speed|rapid)\b"),
    ]),
    ("tyres", "Tyres", [
        (5, r"\b(tyre|tire)\s?(strategy|choice|wear|life|management|temp\w*)\b"),
        (4, r"\b(tyres?|tires?|compounds?)\b"),
        (4, r"\b(degrad\w*|graining|blister\w*)\b"),
        (3, r"\b(softs?|mediums?|hards?|inters?|intermediates?|wets?|slicks?)\b"),
        (3, r"\bstints?\b"),
    ]),
    ("technical", "Technical issues", [
        (5, r"\b(technical|mechanical|reliability)\s?(issue|problem|fault|failure|trouble)s?\b"),
        (4, r"\b(power\s?unit|gearbox|hydraulic\w*|turbo|ers|mgu[\s-]?[hk]|"
            r"clutch|suspension|driveshaft|water\s?pump|oil\s?leak)\b"),
        (4, r"\b(engine|brake|battery)\s?(failure|problem|issue|fault|trouble)s?\b"),
        (3, r"\b(broke\s?down|blew\s?up|smoke|overheat\w*|misfire|"
            r"limp\s?mode|derate|failure)\b"),
        (3, r"\btechnical\b"),
    ]),
    ("collisions", "Collisions", [
        (5, r"\b(collid\w*|collision|crash\w*|contact\s?between)\b"),
        (4, r"\b(accident|incident|shunt|t[\s-]?bone|rear[\s-]?end\w*|"
            r"wiped?\s?out|took\s?(each\s?other|him|them)\s?out)\b"),
        (3, r"\b(spun|spin|off\s?track|into\s?the\s?(wall|barrier|gravel)|"
            r"damage|front\s?wing|puncture)\b"),
        (3, r"\bcontact\b"),
    ]),
    ("overtakes", "Overtakes", [
        (5, r"\b(overtak\w*|how\s?did\s?\w+\s?(pass|get\s?(past|by)))\b"),
        (4, r"\b(pass(ed|ing)?|dive[\s-]?bomb|switch[\s-]?back|"
            r"wheel[\s-]?to[\s-]?wheel|side[\s-]?by[\s-]?side)\b"),
        (3, r"\b(defend\w*|attack\w*|battle|fight\s?for|slipstream|tow)\b"),
    ]),
    ("safety_car", "Safety car", [
        (5, r"\b(safety\s?car|virtual\s?safety\s?car|vsc)\b"),
        (4, r"\b(neutrali[sz]\w*|red\s?flag|suspend\w*\s?the\s?race)\b"),
        (3, r"\b(restart|bunched\s?up|full\s?course\s?yellow|fcy)\b"),
    ]),
    ("penalties", "Penalties", [
        (5, r"\b(penalt\w*|time\s?penalty|drive[\s-]?through|stop[\s-]?(and|&)[\s-]?go)\b"),
        (4, r"\b(stewards?|investigat\w*|reprimand|grid\s?drop|"
            r"disqualif\w*|dsq|black\s?flag)\b"),
        (3, r"\b(unsafe\s?release|impeding|forcing\s?\w+\s?off)\b"),
    ]),
    ("track_limits", "Track limits", [
        (5, r"\b(track\s?limits?|deleted\s?laps?|laps?\s?(were\s?|got\s?)?deleted|"
            r"exceeded\s?the\s?limits|lap\s?time\s?deleted)\b"),
        (4, r"\b(white\s?line|all\s?four\s?wheels|corner\s?cutting)\b"),
    ]),
    ("retirements", "Retirements", [
        (5, r"\b(why\s?did\s?\w+\s?retire|retirement)\b"),
        (4, r"\b(retir\w*|dnf|did\s?not\s?finish|out\s?of\s?the\s?race)\b"),
        (3, r"\b(pulled\s?over|parked\s?(it|the\s?car)|failed\s?to\s?finish)\b"),
    ]),
    ("qualifying", "Qualifying", [
        (5, r"\b(qualif\w*|pole\s?position|q1|q2|q3|shoot\s?out)\b"),
        (5, r"\b((took|on|for|get|got)\s?pole|pole\s?(lap|time|sitter))\b"),
        (4, r"\b(pole|grid\s?(position|slot|penalty)?|starting\s?position)\b"),
        (3, r"\b(knocked\s?out|eliminated|out\s?in\s?q\d|banker\s?lap)\b"),
    ]),
    ("starts", "Race starts", [
        (5, r"\b(race\s?start|start\s?of\s?the\s?race|off\s?the\s?line|launch)\b"),
        (4, r"\b(getaway|lights\s?out|first\s?(lap|corner)|turn\s?1\b)\b"),
        # "the start" as a noun, never "they start on the softs"
        (4, r"\b(the|his|her|their|a)\s?start\b"),
        (3, r"\b(jump\s?start|anti[\s-]?stall|bog(ged)?\s?down|formation\s?lap)\b"),
    ]),
    ("weather", "Weather", [
        (5, r"\b(weather|rain\w*|wet\s?(track|conditions|race)|dry\s?line)\b"),
        (4, r"\b(track\s?temp\w*|air\s?temp\w*|humid\w*|wind\w*)\b"),
        (3, r"\b(dry|damp|drizzle|storm|sun|cloud\w*|conditions)\b"),
    ]),
    ("results", "Results", [
        (5, r"\b(who\s?(won|win)|the\s?winner|final\s?(result|classification|order)|"
            r"(finish|end)(ed|ing)?\s?(the\s?race\s?)?(in|on)?\s?"
            r"(p\d|first|second|third|fourth|fifth|the\s?podium))\b"),
        (4, r"\b(podium|winner|won|result|classification|standings\s?after)\b"),
        (3, r"\b(finish\w*|top\s?(three|five|ten)|1[\s-]?2\s?finish)\b"),
        (2, r"\bpoints?\b"),
    ]),
    ("teammates", "Teammate battles", [
        (5, r"\b(team[\s-]?mates?|against\s?his\s?team[\s-]?mate|intra[\s-]?team)\b"),
        (4, r"\b(head[\s-]?to[\s-]?head|team\s?order)\b"),
    ]),
    ("comparison", "Driver comparison", [
        (5, r"\b(compare|comparison|versus|\bvs\.?\b)\b"),
        (3, r"\b(better\s?than|faster\s?than|closer\s?to|who\s?was\s?better)\b"),
    ]),
    ("drivers", "Drivers", [
        (5, r"\b(driver\s?(of\s?the\s?day|line[\s-]?up|rating|performance))\b"),
        (3, r"\b(rookie|debut|helmet|number\s?\d{1,2}\b)\b"),
    ]),
    ("teams", "Teams", [
        (5, r"\b(constructor\w*|which\s?team|team\s?performance)\b"),
        (3, r"\b(garage|factory|upgrade\w*|development)\b"),
    ]),
    ("championship", "Championship", [
        (5, r"\b(championship|title\s?(race|fight|chance)|drivers'?\s?standings)\b"),
        (5, r"\b(won|win|winning|lost|losing|lead(s|ing)?|clinch\w*)\s+the\s+"
            r"(championship|title)\b"),
        (4, r"\b(standings|points\s?(gap|lead|table)|leader\s?board)\b"),
    ]),
    ("race_control", "Race control", [
        (5, r"\b(race\s?control|fia\s?(message|decision)|flag\s?(shown|waved))\b"),
        (4, r"\b(yellow\s?flag|blue\s?flag|double\s?yellow|marshal\w*)\b"),
    ]),
    ("radio", "Team radio", [
        (5, r"\b(team\s?radio|radio\s?(message|call)|said\s?on\s?the\s?radio)\b"),
        (4, r"\bradio\b"),
        (3, r"\b(engineer\s?(said|told)|over\s?the\s?radio)\b"),
    ]),
    ("drs", "DRS", [
        (5, r"\bdrs\b"),
        (4, r"\b(drag\s?reduction|detection\s?point|activation\s?zone)\b"),
        (3, r"\b(slipstream|tow|dirty\s?air)\b"),
    ]),
    ("sectors", "Sectors and corners", [
        (5, r"\b(sector\s?[123]|mini[\s-]?sector)\b"),
        (4, r"\b(corner\s?\d+|turn\s?\d+|chicane|apex|braking\s?zone)\b"),
        (3, r"\b(sectors?|straight\s?line\s?speed|top\s?speed\s?trap)\b"),
    ]),
    ("fuel", "Fuel and weight", [
        (5, r"\b(fuel\s?(load|save|saving|effect|correction)|lift\s?and\s?coast)\b"),
        (4, r"\b(fuel|underfuel\w*|weight\s?penalty|ballast)\b"),
    ]),
    ("setup", "Car setup", [
        (5, r"\b(car\s?setup|set[\s-]?up\s?(change|choice)|downforce\s?level)\b"),
        (4, r"\b(ride\s?height|wing\s?(angle|level)|balance|understeer|oversteer)\b"),
    ]),
    ("practice", "Practice running", [
        (5, r"\b(free\s?practice|fp[123]\b|practice\s?(session|programme|program))\b"),
        (3, r"\b(long\s?run|race\s?sim\w*|installation\s?lap|programme)\b"),
    ]),
    ("sprint", "Sprint", [
        (5, r"\bsprint\s?(race|shootout|qualifying|session)?\b"),
    ]),
    ("laps", "Lap times", [
        (5, r"\b(lap\s?time|fastest\s?lap|purple\s?(lap|sector)|personal\s?best)\b"),
        (3, r"\b(on\s?lap\s?\d+|lap\s?\d+|how\s?many\s?laps)\b"),
    ]),
    ("gaps", "Gaps and margins", [
        (5, r"\b(gap\s?(to|between)|winning\s?margin|by\s?how\s?(much|many\s?seconds))\b"),
        (4, r"\b(delta|interval|margin|tenths?|seconds?\s?behind)\b"),
        (4, r"\bgaps?\b"),
    ]),
    ("history", "Records and history", [
        (5, r"\b(all[\s-]?time|record\s?(book|holder)|ever\s?(won|scored)|"
            r"in\s?history|career\s?(win|total))\b"),
        (3, r"\b(record|historic\w*|first\s?time\s?since|last\s?time)\b"),
    ]),
]

TOPIC_LABEL: dict[str, str] = {key: label for key, label, _ in _TOPICS}
#: NOT "Unrelated". `other` is reached two ways and only one of them means "not
#: about Formula 1" — the other is an F1 question about a subject the taxonomy
#: has no row for yet, which carries a hint. `display_label` tells them apart;
#: this is only the fallback when there is no hint to show.
TOPIC_LABEL[OTHER] = "Uncategorised"

_COMPILED: list[tuple[str, list[tuple[int, re.Pattern]]]] = [
    (key, [(w, re.compile(p, re.I)) for w, p in pats]) for key, _, pats in _TOPICS
]

#: A handler's identity is still good evidence — it is named after the thing it
#: answers — but it is a TIE-BREAKER now, not the answer. A handler names
#: ITSELF, not what was asked, so the tyre handler catching "how many pit stops
#: did he make" must not turn that into a tyre question.
KIND_TOPIC = {
    "tyre_strategy": "tyres",
    "undercut": "strategy", "alt_strategy": "strategy", "pit_loss": "pit_stops",
    "vsc": "safety_car",
    "best_pace": "pace", "fastest": "pace", "worst_team": "pace",
    "practice_fastest": "practice", "practice_longrun": "practice",
    "practice_team": "practice", "practice_laps": "practice",
    "overtake": "overtakes",
    "why_lost": "positions", "gainer": "positions", "loser": "positions",
    "what_happened": "positions", "could_better": "positions",
    "pole": "qualifying", "knocked_out": "qualifying",
    "weather": "weather",
    "results": "results", "winner": "results", "explain": "results",
    "overview": "results",
    "compare_drivers": "comparison", "compare_teams": "comparison",
    "retirement": "retirements",
    "off_topic": OTHER,
}

#: Below this nothing convincing was said and the question earns a hint instead.
#: Two is a single shared word — not enough to file something under.
_CONFIDENT = 3

#: Words carrying no topical signal. Includes the F1 words EVERY question has
#: ("race", "driver", "lap"), because a frequency count that keeps them returns
#: "the", "race" and "driver" and tells you nothing at all.
_STOP = frozenset("""
a an the is was were are be been being do did does done has have had how what
which who whom whose why when where that this these those there here it its
of in on at to for from by with about into over after before during than then
and or but if so as too very much many more most some any all both each
i me my we our you your he him his she her they them their
can could would should will shall may might must not no nor yes
happen happened happening get got go went come came make made take took
tell explain show give know think want need see look
race races racing session sessions grand prix gp driver drivers team teams
lap laps car cars today yesterday
""".split())


def key_phrase(question: str, entities: dict | None = None) -> str | None:
    """The two words this question is really about.

    Only used when no topic scored confidently. Driver and team names come out
    first — "Piastri" is *who*, never *what* — along with the domain words every
    question contains. What is left is the subject.
    """
    text = (question or "").lower()
    ents = entities or {}
    for name in list(ents.get("drivers") or []) + list(ents.get("teams") or []):
        text = re.sub(rf"\b{re.escape(str(name).lower())}\b", " ", text)
    words = [w for w in re.findall(r"[a-z][a-z'-]+", text)
             if w not in _STOP and len(w) > 2]
    if not words:
        return None
    # An adjacent pair ("brake temperature") is usually the subject; one word
    # alone is normally too coarse to become a topic.
    phrase = " ".join(words[:2]) if len(words) >= 2 else words[0]
    return phrase[:40]


#: Emergent keys are prefixed so they can never collide with a taxonomy key, and
#: so a glance at the stored value says which kind it is.
EMERGENT_PREFIX = "~"


def emergent_key(phrase: str) -> str:
    """A stable topic key for a subject the taxonomy has no row for."""
    slug = re.sub(r"[^a-z0-9]+", "_", str(phrase).lower()).strip("_")
    return f"{EMERGENT_PREFIX}{slug}"[:48] if slug else OTHER


def is_emergent(topic: str | None) -> bool:
    return bool(topic) and str(topic).startswith(EMERGENT_PREFIX)


def classify(question: str, kind: str | None = None,
             matched: bool | None = None,
             entities: dict | None = None) -> tuple[str, str | None]:
    """Return `(topic_key, topic_hint)`.

    `topic_hint` is set ONLY when the question did not land confidently in the
    taxonomy — it is the raw material the dashboard clusters into candidate
    topics. A question with a topic has no hint and vice versa.
    """
    if kind == "off_topic":
        return OTHER, None

    text = question or ""
    scores: dict[str, int] = {}
    for key, patterns in _COMPILED:
        total = sum(w for w, pattern in patterns if pattern.search(text))
        if total:
            scores[key] = total

    if scores:
        best = max(scores.values())
        winners = [k for k, v in scores.items() if v == best]
        if best >= _CONFIDENT:
            if len(winners) > 1 and matched is not False and kind:
                # A genuine tie, broken by the handler that answered it.
                preferred = KIND_TOPIC.get(kind)
                if preferred in winners:
                    return preferred, None
            # Stable across runs: taxonomy order, never dict order.
            order = [k for k, _, _ in _TOPICS]
            return min(winners, key=order.index), None

    # Nothing convincing in the text; the handler still knows something.
    if matched is not False and kind:
        mapped = KIND_TOPIC.get(kind)
        if mapped and mapped != OTHER:
            return mapped, None

    # AN EMERGENT SUBJECT GETS ITS OWN KEY, not `other`.
    #
    # It is tempting to store these as (OTHER, hint) and let the label come from
    # the hint — and that is exactly wrong, because the dashboard groups by
    # `topic`. Every unanticipated subject in the window would collapse into ONE
    # row, wearing whichever hint happened to sort first: twelve questions about
    # brake temperature, fuel loads and stewards' decisions, presented as a
    # single topic called "Brake Temperature". The key has to be as specific as
    # the subject, so the scoreboard can count them apart.
    phrase = key_phrase(question, entities)
    if phrase:
        return emergent_key(phrase), phrase
    return OTHER, None


def display_label(topic: str | None, hint: str | None = None) -> str:
    """What to show a person for this question's subject.

    When the taxonomy had no row but a phrase was extracted, THE PHRASE IS THE
    TOPIC. Showing it here rather than only in a separate panel is what stops a
    real subject reading as a shrug — and stops an F1 question being labelled
    "Unrelated" on the same line as an outcome that calls it F1.
    """
    key = topic or OTHER
    if is_emergent(key):
        # The hint is the phrase as it was written; the key is its slug. Prefer
        # the hint, fall back to un-slugging when the column is empty (a row
        # written before topic_hint existed).
        return str(hint or key[len(EMERGENT_PREFIX):].replace("_", " ")).strip().title()
    if key == OTHER and hint:
        return str(hint).strip().title()
    return TOPIC_LABEL.get(key, str(key).replace("_", " ").title())
