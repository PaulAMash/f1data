# Private product analytics

A small, private analytics system for one question: **what do people actually do
in Pitwall IQ, and where does Ask fail them.**

It is not logging, and it is deliberately not an event firehose. A short list of
meaningful events, one rich record per Ask interaction, and a single dashboard
that can be read in a minute.

---

## The rule that outranks everything else here

> **Analytics may never break Pitwall IQ.**

Not "should not". May not. Concretely:

- Recording is **fire-and-forget**. `record()` puts a row on a bounded in-memory
  queue and returns; a background thread writes batches. Nothing on a request
  path waits for a database.
- The queue is **bounded**. When it fills, events are dropped and counted. The
  alternative — blocking a request until analytics catches up — turns a
  reporting system into an availability risk. A dropped event costs a row in a
  chart; a blocked request costs a reader.
- Every public function in `app/analytics` **swallows its own exceptions**.
- With **no database configured, nothing runs.** Every call is a no-op and the
  site behaves exactly as it did before. This is a normal, supported state — it
  is what lets the code deploy safely before the database exists.
- If the **dashboard** breaks, the site is untouched: it is a separate page
  talking to separate endpoints.

There are tests for each of these (`backend/tests/test_analytics.py`), including
one that makes the store raise on every write and asserts that Ask still answers.

---

## Architecture

```
Browser                          FastAPI                        Postgres
───────                          ───────                        ────────
lib/analytics.ts                 POST /api/signal   ─┐
  page_view                      POST /api/ask       ├─→ record() ─→ [queue] ─→ writer ─→ analytics_event
  session_open        ─beacon─→  POST /api/ask/feedback                                  analytics_ask
  feature_use                    (middleware: every request)                             analytics_daily
  client_error
                                 GET /api/admin/analytics  ←── token ──  /admin page
```

Two halves, on purpose:

**Server-side events** (`api_request`, `api_slow`, `api_error`,
`session_load_failed`, and the whole Ask record) are recorded by the backend and
cannot be blocked. A meaningful share of browsers block analytics beacons — the
same extension that hid a request during V84 debugging would hide these — and
"are requests failing or slow in production" is exactly the question you cannot
afford to have answered only by the readers who allow tracking.

**Client-side events** (`page_view`, `session_open`, `feature_use`,
`client_error`) can only come from the browser, because only the browser knows
which tab is open. These are sent with `navigator.sendBeacon` as `text/plain`,
which keeps them a CORS "simple request" — a preflight on a page-unload beacon
is a beacon that often never arrives.

---

## What is tracked

### Events (`analytics_event`)

| name | where from | carries |
| --- | --- | --- |
| `page_view` | browser | path |
| `session_open` | browser | year, Grand Prix, session type |
| `feature_use` | browser | feature (tab), mode (simple/advanced), race context |
| `client_error` | browser | the error message only |
| `api_request` | server middleware | path, status, duration |
| `api_slow` | server middleware | path, duration (over 3 s) |
| `api_error` | server middleware | path, status |
| `session_load_failed` | server (503 handler) | year, GP, session, reason |
| `feature_dwell` | browser | feature, milliseconds spent on it *(V91)* |
| `session_unavailable` | browser | year, GP — the reader hit the dead-end screen *(V91)* |

**V91 added two events for two questions the old set could not answer.**
`feature_dwell` separates *opened* from *read*: a tab everybody clicks and
nobody stays on looks identical to a popular tab in a plain use count, and is a
naming or content problem rather than a success. The duration is clamped at one
hour and discarded outside `0…3_600_000 ms`, because a laptop that went to sleep
with the tab open would otherwise contribute "nine hours of engagement" and
dominate every average it landed in. `session_unavailable` records the dead end
from the *reader's* side; the API's own `session_load_failed` cannot see a
reader who gave up before the request finished.

The client event vocabulary is **closed**: `/api/signal` accepts only the names
and feature values above, and buckets anything else. An open ingest is a table
that strangers can fill with anything.

### Ask (`analytics_ask`)

One row per Ask interaction: timestamp, race context, the question, the answer,
the outcome, the topic, the handler that answered, confidence, what was missing,
whether the LLM polish ran, response time, any error, and the thumbs rating.

### What is deliberately **not** collected

No IP addresses. No cookies. No device or browser fingerprints. No user agents.
No referrers. No names, emails or accounts. No free text other than an Ask
question, which the reader typed on purpose and which is the entire point.

The only identity is `visitor`: a random UUID the browser generates for itself
on first visit and keeps in `localStorage`. It is derived from nothing,
identifies nobody, and clearing site data erases it. `visit` is a second random
id that rolls over after 30 minutes of inactivity.

**This makes visitor counts approximate, and the dashboard says so.** Clearing
site data, switching browser or using another device all count as a new visitor.
That is the honest cost of not fingerprinting anyone, and it is the right trade.

`navigator.doNotTrack` is honoured: if it is set, the browser sends nothing.

---

## How Ask answers are classified

**No second LLM call.** The Ask pipeline is a chain of ~30 deterministic
handlers (`app/analysis/qa.py`) and it already knows how well it did:

| signal | meaning |
| --- | --- |
| `kind` | which handler answered — `tyre_strategy`, `best_pace`, `overtake`… |
| `confidence` | high / medium / low, set by the handler |
| `missing_data` | explicit list of what the answer needed and didn't have |
| `kind == "missing"` | the handler said outright it cannot answer |
| `matched_handler` | **added in V86** — did any handler recognise the question? |

`matched_handler` was the one genuinely missing signal. When nothing matches,
`_best_effort()` falls through to `_generic()`, which returns a session overview
— and after the fact that is indistinguishable from an overview somebody asked
for. That case *is* "Ask does not support what this person wanted", which is the
most valuable thing on the dashboard. Setting the flag changes no behaviour and
no wording.

### The six outcomes (V91 renamed all of them, and added one)

The old names were written from the system's point of view and read from the
dashboard as five shades of failure. But the useful question is not "how badly
did this go" — it is **"what would I do about it"**, and those have different
answers that the old vocabulary lumped together.

| outcome | derived from | what to do |
| --- | --- | --- |
| **Answered** | a handler matched, no `missing_data`, confidence ≥ medium | nothing |
| **Answered with gaps** | a handler matched but `missing_data` is non-empty, or confidence is low | improve |
| **Not yet supported** | nothing matched (`matched_handler` false), or the question was empty | **build** |
| **Data unavailable** | `kind == "missing"`, or the session itself 503'd | nothing |
| **Not about F1** *(new)* | the relevance gate declined — see below | nothing |
| **System error** | an exception on the request | fix |

`unanswered → unsupported` is the important rename. It is **not an error**: it
is a feature request a reader wrote for you, and the single most valuable row in
the table. Painting it in a failure colour on a beta whose job is discovering
what to build is reading the instrument backwards.

`off_topic` is new because those rows used to land in `unanswered`, quietly
inflating the "Ask can't do this" bucket with poems and cake recipes — corrupting
the one list that decides what gets built next.

**"Unresolved"** is defined in exactly one place (`classify.UNRESOLVED`) as
*not yet supported + data unavailable + answered with gaps*. It deliberately
excludes off-topic (working as intended) and system errors (a bug, not a
capability gap). The old dashboard showed an "unresolved" count whose definition
existed only inside a SQL string; a number nobody can define is a number nobody
can act on, so the definition now travels to the page as a tooltip.

Rows written under the old spellings are rewritten **once**, in place, by
`store._migrate()`, so no query in `queries.py` carries alias handling.

### Is it even a Formula 1 question? (`app/analysis/relevance.py`, V91)

`qa.py` was built on a promise — *never dead-end* — which is right for a reader
whose phrasing the handlers do not recognise and wrong for a reader who is not
asking about Formula 1 at all. Its fall-through returns a race summary, so
*"what's a good Ferrari-themed cake recipe"* got a race summary: the reader is
told something they did not ask, and analytics record a capability gap for a
question that is not one.

A deterministic gate now runs before the handler chain. It scores **evidence for**
(asking about session data — laps, stints, positions, pace, strategy: strong)
against **evidence against** (recipe, poem, capital-of, another sport: strong),
and the asymmetry is the whole design:

- **A driver or team mention is weak evidence (+1), never decisive.** A keyword
  test is defeated by the first bored visitor who types "write me a poem about
  Ferrari", and defeating it is the natural thing to try.
- **A refusal requires positive evidence of being off-domain.** "I have no idea
  what this is" returns `unsure` and falls through to exactly the behaviour that
  shipped before the gate existed. Refusing a real question is far worse than
  answering a fake one.
- **Above the session-data threshold, off-domain evidence must win by a margin.**
  English borrows vocabulary constantly — "was the undercut a recipe for
  disaster", "he cooked his tyres" — and a one-point win refuses all of them.

No model: a network call per question to decide something a lexicon decides
correctly, made unreproducible and untestable, is a bad trade. The corpus lives
in `backend/tests/test_ask_intelligence.py`.

### Topics (`app/analytics/topics.py`, rewritten in V91)

Observed on real dashboard traffic, all of these were wrong:

    "How many pit stops did Piastri have?"   -> Strategy
    "Did Max had technical issues?"          -> Other
    "Why did Collapinto and Hamilton collided?" -> Other
    "Were any laps deleted?"                 -> Other
    "Who took pole and by how much?"         -> Gaps

`Other` is supposed to mean *this was not a Formula 1 question*. Every row that
landed there for any other reason — a subject nobody wrote a regex for, a verb
tense — made the one bucket that should drive product decisions worthless.

**1. Scored, not first-match-wins.** Every topic scores the question; the best
score wins. Weights encode specificity: a compound phrase that names one topic
and nothing else (5) outranks the topic's own noun (4) outranks vocabulary
topics share (2). First-match-wins made the *order of the list* decide the
answer, which is why "pit stop" could never beat "strategy".

**2. The question text is the authority; the handler is only a tie-breaker.** A
subject Ask has no handler for must still be counted under its real name —
otherwise the list that tells you what to build is filed under whichever handler
caught the fall-through.

**3. Emergent topics.** When nothing scores confidently the question is not
discarded: a key phrase is extracted (driver and team names removed first —
"Piastri" is *who*, never *what*) and becomes the topic's own key, prefixed `~`.
So "How was the brake temperature on the McLarens?" appears on the scoreboard as
**Brake Temperature**, not as Other. When a phrase recurs it is promoted to the
Emerging topics panel, which is the signal that it has earned a permanent row in
`topics.py`. **The taxonomy grows from the traffic** rather than from guesses.

> The emergent key has to be as specific as the subject. Storing these as
> `(other, hint)` and labelling from the hint looks equivalent and is not: the
> dashboard groups by `topic`, so every unanticipated subject in the window
> would collapse into ONE row wearing whichever hint sorted first — a dozen
> unrelated questions presented as a single topic called "Brake Temperature".

About thirty named topics: Pit stops, Strategy, Position changes, Pace, Tyres,
Technical issues, Collisions, Overtakes, Safety car, Penalties, Track limits,
Retirements, Qualifying, Starts, Weather, Results, Teammates, Comparison,
Championship, Race control, Team radio, DRS, Sectors, Fuel and weight, Setup,
Practice, Sprint, Gaps and margins, History — plus whatever the traffic invents.
Labels are one word where one word does, up to five when the subject needs them,
because a topic list is read at a glance or not at all. `Other` is labelled
**Uncategorised**.

### Thumbs up / down

The deterministic classification cannot detect the one failure that matters
most: an answer that was complete, confident and **wrong**. Only the reader
knows that. So each answer carries two small controls in a row that already
exists — no new row, no modal, no form — which become a quiet confirmation once
pressed. A rating is **final**, not a toggle: the server already has it, and a
second click that flipped it would leave the UI disagreeing with the analytics.

#### The bug this had, and why it was not in the feedback code (V91)

The reported symptom was that the 👍/👎 sometimes vanished, and sometimes came
back already showing a rating the reader never gave. Two causes:

1. **The action row was conditional** on the answer having plain-text
   paragraphs, so answers rendered another way had no controls at all.
2. **`key={i}` over a list that grows at the front.** React matches children by
   key, so unshifting a new answer shifts every index by one and key `0` now
   names a *different* answer. React sees "same key, new props", keeps the
   mounted component **and its state**, and swaps the data underneath. The
   `sent` state of the answer that used to be first was now attached to the
   answer that is first now. That is not a rendering glitch — it is a reader
   being shown a judgement somebody else made about a different answer.

The fix: each history entry is created with its own id and keyed on that; the
control seeds from `recallFeedback(refId)` and re-seeds whenever the ref changes;
the row renders unconditionally. `npm run doctor:feedback`
(`frontend/scripts/ask-feedback-doctor.mjs`) asserts all six invariants against
the source, because reproducing this needs a real reconciler and a real list
mutation — more machinery than the component it protects, in a project with no
component-test harness. Re-introducing `key={i}` fails it immediately.

---

## Database

Three tables, created idempotently at startup.

```sql
analytics_event (id, ts, name, visitor, visit, path, year, gp, session_type,
                 feature, mode, ok, ms, detail,
                 status)                          -- V91: the HTTP code, as a number
analytics_ask   (id, ref, ts, visitor, year, gp, session_type, question, answer,
                 outcome, topic, kind, confidence, missing, matched, used_llm,
                 ms, error, helpful,
                 visit, topic_hint, question_norm) -- V91
analytics_daily (day, name, feature, n)           -- the rollup
```

**The V91 columns and why each exists.** `status` ends the guessing about what
an `api_error` row actually was (it used to live inside `detail` as the string
`"HTTP 404"`); `visit` on the Ask table is what puts Ask in the funnel at all;
`topic_hint` is the raw material emergent topics are clustered from;
`question_norm` is a case- and punctuation-stripped key so "Who won?", "who won"
and "WHO WON!!" group as one repeated question.

> **`CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists.**
> Adding columns to the DDL alone would have made every V91 column present in
> every test and absent in production — the worst possible split. `store._migrate()`
> reads the live column list, `ALTER TABLE`s in whatever is missing, and rewrites
> the legacy outcome spellings once. It is additive and idempotent: no column is
> ever dropped or renamed, so a rollback to V89 finds a schema it still
> understands. Queries read `status` when present and fall back to parsing
> `detail` when it is not, so old and new rows compare in the same chart.

`ref` is a random UUID, not the row id: it travels to the browser for the thumbs
control, and a sequential handle would let anyone rate — or enumerate — someone
else's question.

**Growth is bounded.** Raw events are pruned after **90 days**, but they are
rolled up into `analytics_daily` first, so the daily shape of usage survives
forever at a few rows per day. Ask rows are kept **400 days** — they are the
valuable data and there are far fewer of them. Pruning runs in the writer thread
every 6 hours.

**Two engines, one set of queries.** Production is Render PostgreSQL; localhost
and the test suite use SQLite. Every query is ordinary ANSI; the only differences
live in `store._Dialect` (placeholder style, three DDL type names, and the
day-truncation expression). Without this the aggregation queries would have had
no test coverage at all, since there is no Postgres in the build environment.

> **If a query has a literal `%` anywhere in it — a `LIKE` wildcard, a `strftime`
> token, anything — write it as `%%`.** psycopg scans every query string for its
> own placeholders (`%s`/`%b`/`%t`) whenever parameters are passed, and treats
> any other bare `%` as a malformed one. sqlite3's `?`-style driver never does
> this scanning, so a bare `%` passes every local test and every CI run and then
> 500s the moment it reaches Postgres — with no CORS headers on the response,
> since an unhandled exception skips the CORS middleware entirely, which is what
> made this look like a CORS bug in production rather than a SQL one the first
> time it happened (`LIKE '/history%'` in the "eras" query, V86). `%%` is correct
> on both engines: psycopg collapses it to one literal `%`, and SQLite's `LIKE`
> treats two adjacent wildcards the same as one.
>
> `tests/test_analytics_sql.py` runs every query the dashboard issues through
> psycopg's own placeholder parser (`psycopg._queries._query2pg` — pure text
> parsing, no live database needed) so this class of bug fails in CI, not in
> production. Adding a query with a bare `%` fails that test immediately.

**Connections:** the writer holds exactly one; dashboard reads open a short-lived
connection. Render's free Postgres tier has a small connection ceiling and this
process is also serving the site.

---

## The dashboard

`https://pitwalliq.com/admin`

### The order is an argument (V91)

The old page was a wall of counts. Everything on it was true and almost none of
it was legible, because it answered *how many* without ever answering *is that
good* or *what do I do*. It now reads top to bottom as:

1. **Three verdicts** — is the product ok, is Ask ok, is the backend ok. Each is
   a judgement (`good` / `warn` / `bad` / `no data`) with the measurement that
   produced it underneath, so the first thing read is a conclusion. A top row of
   six bare counts asks the reader to remember last week's six counts.
2. **What to work on next** — derived from the same numbers and ranked by how
   many readers each thing affects. Broken things outrank missing ones; a gap
   five people asked for outranks one person's. Every entry names the number it
   came from, so a priority you disagree with can be argued with rather than
   merely overridden. Ranked once, in `queries.priorities()`, so the dashboard
   and the saved report cannot disagree.
3. **Ask** — the point of the product, and the only place readers write down what
   they wanted and did not get. Six outcomes with their actions, a topic
   scoreboard (volume, success rate and sentiment on one row, clickable to filter
   the log), the capability gaps, the rejected answers, emerging topics, repeated
   questions, and every question in a filterable log.
4. **What people do here** — activity by day, the funnel, engagement depth,
   repeat visits, races, seasons, sessions, features, dwell, pages, exits.
5. **Backend health** — endpoints against **their own** budget, not against each
   other; failures split by what they mean.
6. **Tools** — save the analysis, or clear what was recorded.
7. **Recent activity** — the raw stream, last, for when a number needs explaining.

Ranges: Today, 7 / 30 / 90 days, All time, plus custom dates via the API.

### Charts that answer a named question

Every chart is hand-drawn SVG/CSS — bar groups and proportion bars over at most
ninety points, where the part of a library you would use is the axis and the part
you would pay for is a render path that took four releases to stop returning
blank in production (V82/V83). None is decorative, and where a list said it
faster (top races, endpoints) it stayed a list.

- **Activity by day** — page views, sessions opened and Ask questions share one
  axis because they are the same unit: a thing somebody did. A second y-axis
  would let asks look as tall as views and would be a lie in the shape of a
  chart. Errors ride as a diamond above the group, because their job is "was
  this day bad", not "how many relative to page views".
- **The funnel** — ordinal, so one hue in darkening steps rather than four
  identities; four categorical hues would imply the stages are alternatives
  rather than a sequence. Each step shows its own drop-off, because the number
  worth acting on is not "18% reach Ask" but "we lose 60% at the step before".
- **The topic scoreboard** — volume, success and sentiment on one row, because
  separately they are trivia and together they are a decision.
- **Endpoint health** — latency against each endpoint's own budget (6 s for
  upstream archive fetches, 800 ms for everything else), with the budget drawn
  as a line. An honest global ranking put `/api/session` at the top and made a
  nine-second third-party fetch look like the worst thing happening on the site.

Colour carries meaning and only meaning. The product palette (accent red, speed
turquoise, amber) means status here exactly as it does everywhere else; the six
outcome colours are a separate categorical scale validated for colour-vision
separation (adjacent-pair ΔE 10.9 deuteranopia / 19.8 normal vision in dark,
10.0 / 19.8 in light, all six above 3:1 on their surface). The neutral for "not
about F1" is deliberately achromatic — the one outcome that should recede — and
sits at the end of the scale, away from the blue, which is where grey and blue
collapse for protanopes. Every segment is direct-labelled, so identity never
rests on colour alone.

### Tools: saving it, and clearing it

**`GET /api/admin/analytics/report`** builds the window into one self-contained
document — `html` (printable), `md` or `json`. HTML rather than a server-rendered
PDF: the browser's print engine already makes one, and WeasyPrint would cost
cold-start weight on every boot of a free-tier instance to save a keystroke. The
page fetches it with the admin token and shows it in an **iframe** (a popup
opened from inside an `await` is blocked by default in every current browser),
with a Print / Save as PDF button that prints the frame. No scripts, no external
references, nothing to fetch — it still opens from a folder years from now. The
part worth generating is not the tables, which are on the dashboard; it is the
ranked answer to "what should I work on next", which is hard to do by eye.

**Two destructive operations, kept apart on purpose.** "Clear my analytics" and
"clear the cached F1 data" sound similar and are nothing alike: one throws away a
MEASUREMENT that nothing can regenerate, the other a COPY that re-fetches itself.
Merging them behind one button would mean wanting a clean measurement period
after spam-testing Ask also, silently, made the next twenty session loads take
nine seconds each.

Three things guard each: the admin token; a typed confirmation phrase that is
**different** for each (`DELETE ANALYTICS` / `CLEAR CACHE`), so muscle memory
cannot carry you from one to the other; and an inventory endpoint that reports
exactly what would be removed **before** anything is. The requirement was
"obvious but hard to trigger accidentally", and what makes it safe is not that it
is hidden — it is in plain sight — but that it cannot fire until you have read
what it would do. The analytics purge can only ever touch the three tables named
in `store.ANALYTICS_TABLES`, it takes an optional `before` date so you can drop a
testing session and keep the real week in front of it, and it is a `DELETE` —
not `TRUNCATE`, not `DROP` — so the next event lands in a store that is already
the right shape.

### How it is protected

The frontend is a **static export** on Cloudflare — no server-side rendering, no
middleware, no runtime API routes. So the `/admin` *page* cannot be protected;
it ships as public HTML like every other page. What is protected is the **data**:
every analytics endpoint requires the admin token, and until one is supplied the
page is a login box containing nothing.

- One secret in `PITWALL_IQ_ADMIN_TOKEN`, minimum 24 characters.
- Sent as `Authorization: Bearer …` (or `X-Admin-Token`), compared with
  `secrets.compare_digest`.
- **Unset means the admin API is off entirely** — every route answers 503, not
  200. A deployment that has not been configured must expose nothing.
- The token is never in the frontend build and never in page source. You paste
  it into `/admin` once and that browser keeps it in `localStorage`.

---

## Environment variables

| variable | where | required | what it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | Render backend | for analytics | Injected automatically when a Postgres instance is attached. Absent → analytics disabled, site unaffected. |
| `PITWALL_IQ_ANALYTICS_DB` | backend | no | Override, e.g. `sqlite://./backend/data/analytics.db` for local work. |
| `PITWALL_IQ_ADMIN_TOKEN` | Render backend | for the dashboard | The one secret. Unset → admin API returns 503. |
| `PITWALL_IQ_ANALYTICS` | backend | no | `false` turns recording off without removing the database. |

### Admin endpoints

| endpoint | method | what it does |
| --- | --- | --- |
| `/api/admin/analytics` | GET | the whole dashboard in one call |
| `/api/admin/analytics/ask` | GET | browse Ask rows, filtered by outcome and topic |
| `/api/admin/analytics/report` | GET | `format=html\|md\|json` — the saveable report |
| `/api/admin/analytics/inventory` | GET | what is stored, per table, before you delete it |
| `/api/admin/analytics/reset` | POST | delete analytics rows. `confirm`, `scope`, `before` |
| `/api/admin/cache/inventory` | GET | what the F1 data cache holds |
| `/api/admin/cache/clear` | POST | empty it. `confirm` only |
| `/api/admin/status` | GET | is analytics itself healthy |

Generate a token:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Deploying

1. **Render → your backend service → Environment → Add PostgreSQL** (or attach an
   existing instance). Render sets `DATABASE_URL` for you.
2. Add `PITWALL_IQ_ADMIN_TOKEN` with the generated secret.
3. Redeploy the backend. The tables are created on first boot; there is no
   migration step and nothing to run by hand.
4. Open `https://pitwalliq.com/admin`, paste the token.

Nothing needs to change on Cloudflare, and `NEXT_PUBLIC_API_BASE_URL` is already
what the dashboard uses to find the API.

To confirm it is recording: `GET /api/admin/status` (with the token) reports
whether the store is enabled, which engine, and how many rows have been written,
dropped or errored. The same figures are printed at the foot of the dashboard —
a board that has quietly recorded nothing for a week looks exactly like a product
nobody is using, so it says which one it is.

---

## Reading the dashboard

- **Visitors vs Visits** — people vs sittings. A visit ends after 30 minutes idle.
- **Returning** — visitors seen before this window opened. Zero on the first
  week is expected, not a bug.
- **Ask → outcomes** — the six buckets above, each with the action it implies.
  "Not yet supported" is the number to watch: those are questions the product was
  asked and does not support.
- **Ask → what people ask about** — volume, answered %, and ▲▼ per topic. Read
  the three together: *people ask about tyres constantly, we answer 40%, and half
  of what we do answer gets a thumbs down* is an instruction. Click a topic to
  filter the question log beneath it.
- **What to teach Ask next** — real F1 questions, understood as F1, that no
  handler covers, grouped and ranked by how many people asked. A feature backlog
  written by readers, not an error log. The old dashboard buried this among 404s.
- **Answers people rejected** — Ask matched a handler, answered confidently, and
  the reader said no. A *wrong* answer, not a missing one; the fix is in the
  handler that already ran.
- **Emerging topics** — phrases recurring across questions the taxonomy has no
  row for. This is how `topics.py` is supposed to grow.
- **Last thing before leaving** — the final event of each visit. Where people
  stop.
- **Reader-facing errors** — server errors, failed session loads and browser
  crashes. A 404 for a favicon is **not** one of these and is counted separately
  as noise; the old headline reported seven errors on days when nothing had gone
  wrong. A failed session load is also counted **once** — the middleware no
  longer records an `api_error` for a 503 the handler already recorded.
- **Backend health** — median and p95 across all API requests, and each endpoint
  against its own budget. Expect seconds in the p95, not milliseconds: cold
  FastF1 and Jolpica fetches live in that tail by design. "Biggest total cost"
  is a different question from "slowest": one endpoint at 9 s called twice
  matters less than one at 700 ms called four hundred times.
- **How deep a visit goes / do people come back** — the distribution, not the
  average, because the shape is the finding.
- **Time spent per feature** — separates a feature people *open* from one they
  actually *read*.
