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

The five outcomes:

| outcome | derived from |
| --- | --- |
| **Successfully answered** | a handler matched, no `missing_data`, confidence ≥ medium |
| **Partially answered** | a handler matched but `missing_data` is non-empty, or confidence is low |
| **Could not answer** | nothing matched (`matched_handler` false), or the question was empty |
| **Data unavailable** | `kind == "missing"`, or the session itself 503'd |
| **System error** | an exception on the request |

### Topics

A matched handler **names its own topic** — a handler called `tyre_strategy`
answers tyre-strategy questions, so the taxonomy is free and exactly as accurate
as the feature it names. Questions nothing matched — the set that matters most,
because they tell you what to build — are categorised by keyword from the
question text (`app/analytics/classify.py`). A handler this map has not been
taught yet also falls back to the text, so a new feature never silently becomes
"Other".

Topics: Strategy, Pace, Tyres, Overtakes, Position changes, Qualifying, Weather,
Results, Comparison, Retirements, Historical, Other.

### Thumbs up / down

The deterministic classification cannot detect the one failure that matters
most: an answer that was complete, confident and **wrong**. Only the reader
knows that. So each answer carries two small icons in a row that already exists
— no new row, no modal, no form — and the control disappears once pressed.

---

## Database

Three tables, created idempotently at startup.

```sql
analytics_event (id, ts, name, visitor, visit, path, year, gp, session_type,
                 feature, mode, ok, ms, detail)
analytics_ask   (id, ref, ts, visitor, year, gp, session_type, question, answer,
                 outcome, topic, kind, confidence, missing, matched, used_llm,
                 ms, error, helpful)
analytics_daily (day, name, feature, n)          -- the rollup
```

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

Overview strip (visitors, visits, page views, Ask questions, returning, errors,
each against the previous equivalent window), then **Ask** first because it is
the point, then Usage, Performance and Recent activity. Ranges: Today, 7 / 30 /
90 days, All time, plus custom dates via the API.

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
- **Ask → outcomes** — the five buckets above. "Could not answer" is the number
  to watch: those are questions the product was asked and does not support.
- **Ask → what people ask about** — the "unresolved" column beside each topic is
  the one that tells you what to build: *people keep asking about tyres and we
  are bad at tyres*.
- **Where Ask fell short** — the actual questions, most recent first, with what
  was missing. This is the to-do list, and it only ever contains questions that
  went badly; a successfully answered question in that list would be noise in
  the one place that has to be signal.
- **Last thing before leaving** — the final event of each visit. Where people
  stop.
- **Performance** — median and p95 across all API requests, plus the slowest
  endpoints by average. `session_load_failed` rows are recorded in the same
  place the reader's 503 is produced, so the list cannot drift from what people
  actually experienced.
