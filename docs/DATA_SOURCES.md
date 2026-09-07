# Data sources

Pitwall IQ gets real F1 data through the open-source **pitwall** stack. All of it is free
and needs no API key. This document records exactly what is used and how it's normalized.

## Real sources

| Source | Host | Coverage | Used for |
|---|---|---|---|
| **F1 live-timing archive** (via pitwall helpers) | `livetiming.formula1.com` | 2018–present | Drivers, timing/classification, tyre stints, pit stops (2025+), race control, weather |
| **FastF1** (pitwall "full" engine) | `livetiming.formula1.com` + cache | 2018–present | Rich lap-by-lap: compound, tyre life, stint, position, sector times, results, weather, RC messages |
| **Jolpica/Ergast** | `api.jolpi.ca` | 1950–present | Starting grid, historical results, championship standings, circuit winners |

The adapter tries **FastF1 first** (richest, cleanest DataFrames) and falls back to the
**F1 archive feeds** accessed through pitwall's own `_find_session` / `_get_keyframe`
helpers (which know the feed layout + decompression). Grid positions and all of Historical
mode come from Jolpica.

### How pitwall is used

pitwall is a FastMCP server; its `@mcp.tool()` functions return **formatted strings**, so
for a data app we use its **structured data layer** directly:

- `pitwall._find_session(year, race, session_type)` → resolves the session path (fuzzy race matching).
- `pitwall._get_keyframe(path, feed)` → structured feed dicts (`DriverList`, `TimingData`, `TyreStintSeries`, `PitStopSeries`, `RaceControlMessages`, `WeatherData`, …).
- `pitwall._driver_map`, `_get_json`, `_deep_merge`, `_parse_stream_line` → driver metadata and TimingData stream replay for lap-by-lap.
- `pitwall.JOLPICA`, `pitwall._resolve_circuit_id` → historical endpoints.

Everything is converted into the normalized [`app/models.py`](../backend/app/models.py)
types inside the adapter — and nowhere else.

## Feed → model mapping (F1 archive)

| F1 feed | Normalized model |
|---|---|
| `DriverList` | `Driver` (number, code/TLA, name, team, colour) |
| `TimingData.Lines` | `ClassificationRow`, `Lap` (position, gap, best lap, laps, pits, retired) + stream replay for per-lap |
| `TyreStintSeries.Stints` | `Stint` (compound, length, new/used) → enriched with avg/median/best/degradation from laps |
| `PitStopSeries.PitTimes` | `PitStop` (lap, stationary time, lane time) — 2025+ only |
| `RaceControlMessages` | `RaceControlEvent` + derived `TrackStatusWindow` (VSC/SC/red) |
| `WeatherData` | `WeatherPoint` (air/track temp, humidity, rain, wind) |

## Optional live telemetry

Real-time car telemetry / GPS **during a live session** can require an **F1 TV Premium
token** (`F1TV_TOKEN`). This is:

- **Optional** — every completed-session and open-data feature works without it.
- **Server-side only** — read by the backend, never sent to the browser.

## Rate limits, and the one cache that keeps us under them

Jolpica publishes hard limits for unauthenticated clients: **4 requests per second, 500 per
hour, HTTP 429 `Request was throttled.` when either is exceeded.** They are enforced per source
IP, so on Render that is **per deployment, shared by every reader at once** — not per visitor.
The documentation also says the limits will decrease.

Before V85 nothing remembered an upstream answer at all (`app/cache.py` persists finished
*session bundles* only), so one season change on the Seasons page cost nine Jolpica requests —
enough for a single reader to trip the burst limit alone, and a sustained ceiling of roughly
fifty-five season changes an hour across everybody.

Every outbound archive request now goes through **`app/upstream.py`**, which does three things
before anything reaches the network:

- **Remembers.** A finished season is a historical record: cached seven days, in memory and on
  disk under `cache_dir/upstream/`. The season being raced gets five minutes, because a
  re-classification or a penalty can still change it. The season list gets a day.
- **Coalesces.** Concurrent requests for the same URL share one upstream call. This is the case
  a plain TTL cache cannot help with — a burst arrives with the cache cold for all of it.
- **Paces, then retries.** A token bucket at 3 req/s for `api.jolpi.ca` and 4 req/s for
  `api.openf1.org`, both under the published limits. A 429 or transient 5xx is retried up to
  three times, honouring `Retry-After` when the server sends one and using jittered exponential
  backoff when it does not.

Liveness probes opt out (`_ttl=0`): a probe answered from cache has probed nothing. Session lap
and telemetry payloads also opt out — they are large, asked once, and already persisted as part
of the normalized session.

`GET /api/session/cache/clear` (with no key) clears this alongside the session cache.

## A completed session's record is assembled, not frozen (V107)

A session is over the moment the flag falls; the sources' *record* of it lands feed by feed
over the following hours. OpenF1 answers with every lap, stint and position at once, but its
`session_result` (the official classification: status, gaps, points, retirements) is
published afterwards; FastF1 takes Status, Points and Time from the results archive, which
has the round hours later still; Jolpica's pit-stop durations arrive with its results. A
request that lands in that window gets a **provisional running order** — real positions,
and no gap, time, points or retirement on any row.

That record used to be indistinguishable from the official one. The classification was
non-empty, so the facet merge never asked another source for it; the audit counted `results`
as present and called the session complete; and `app/cache.py` kept it for thirty days. Every
"—" in the results table, "22/22 still running", the missing retirements card, margin and pit
timing were that one list, read faithfully. (The OpenF1 adapter had also been failing on a
`datetime + float` in its lap-window builder since the first commit, so the "primary" for
2023+ was in practice FastF1 — the same shape, one source over.)

Two rules close it, in `app/adapters/data_source_manager.py`:

- **Present is not official.** A running order is flagged provisional by the adapter that
  built it (`FacetSource.provisional`), and — for records cached by older builds — recognised
  by its shape (`models.classification_is_official`: no real classification has no gap, time,
  points or retirement on *any* row). The session is still served and still `complete`; it is
  not `settled`. `RaceSession.settled` / `SourceReport.settled` is the one readiness flag both
  the website and the iOS app read; `SourceReport.provisional` names the facets.
- **The official record is reconciled in, field by field** (`_reconcile_results`) from
  whichever source publishes it first — Jolpica, OpenF1's `session_result`, or the F1
  archive — on the first fetch if it is already out, and on a later read of the cached record
  if not. Position, status, retirement, gap, classified time, points and laps come from the
  official row; the best lap, pit count and colour measured locally are kept. Nothing is
  estimated: a field the official source leaves blank stays blank.

An **unsettled** cached record is checked against the sources again (`_revalidate`) when the
entry is older than `upstream.TTL_LIVE` — the window the sources' own answers are kept for,
so it is the cadence at which a new answer can exist, not a delay before the data is trusted.
The check is cheap (OpenF1's result and pit feeds alone, Jolpica's results, the archive only
if still needed), a check that gains nothing only touches the entry, and a settled record is
never re-asked. `refresh=true` still reassembles from scratch through the same path.

Derived facts are gated on the flag rather than counted: `/api/featured` sends `margin` and
`finishers` as `null` while `settled` is false, and the Race Story shows "—" for finishers
and no retirements card instead of "22/22".

## An official record is completed field by field (V108)

V107 settled the Italian Grand Prix — margin, finishers, retirements, points — and the page
then read **"Kimi ANTONELLI won from P? by +3.857s"**, with "no notable movers" under it and
every surname on every page in capitals. Nothing was provisional any more. Two fields had
never arrived, from a source that never carries one of them, and the pipeline had stopped
asking the moment the record settled. Both symptoms appeared on every 2026 race at once
because Render's disk is ephemeral: the V107 deploy rebuilt every record through the
now-working OpenF1 route.

**Root cause 1 — the name is the provider's own string.** OpenF1's `drivers` feed publishes
`full_name` as `"Kimi ANTONELLI"` (the timing screen's shouted surname) alongside
`first_name`/`last_name` in ordinary case. The adapter copied `full_name` verbatim. No
fallback path was involved and nothing in the website or the app changes case; every
surface that takes the last word of a name as the surname inherited it. The adapter now
builds the name from the parts (`openf1_adapter._driver_name`), and the offline finalizer
re-cases any shouted name it meets (`analysis/normalize.canonical_name`), so a record cached
with `"Kimi ANTONELLI"` is right on its next read and written back once.

**Root cause 2 — the grid is a separate feed, and the settled record was never asked for
it.** OpenF1's `session_result` carries no starting grid; the grid is its `starting_grid`
feed, and when that is empty (or fails — the failure was swallowed without a log line)
every row is built with `grid=None`. The results archive publishes the grid for every race
since 1950 and was already being asked for retirement reasons, but the enrichment copied
reasons and classified times and nothing else, and `_reconcile_results` only runs while a
result is provisional. The Dutch Grand Prix only escaped because its record had been written
by the F1-archive route, which reads the grid off the results. The same feed failure also
left the entry list's `Driver.grid` empty while the classification row had one, so the pace
table lost its net positions.

The rules, in `app/adapters/data_source_manager.py`:

- **`_fill_official_fields`** completes an official classification from another source's
  rows: the grid, the classified time, the laps and the retirement reason fill whenever the
  row has nothing; the gap and the points fill only when both sources agree where the car
  finished. Nothing a row holds is ever overwritten; a blank (`None`, `""`, `NaN`) from the
  second source is not a value. It runs on the first fetch (`_enrich_from_results_archive`,
  which replaced the reasons-only enrichment) and whenever the F1 archive is fetched anyway.
- **`SourceReport.awaiting`** names the official fields a *settled* record is still owed —
  `"grid"`, `"race_time"`, `"retirement_reason"` when no row has one, `"pit_timing"` when no
  stop has a duration. It never touches `settled`: nothing is standing in for anything, and a
  reader must not be told an official result is pending. An awaiting record is re-checked on
  the same cadence as an unsettled one (`_REVALIDATE_AFTER`), asking **only** for what it is
  owed — one results-archive request, the pit feed if durations are blank — never the F1
  archive's whole session again; a check that gains nothing touches the entry. A record that
  is settled and owed nothing is never re-asked.
- **`sync_grids`** keeps the grid on both copies of the entry (`Driver.grid` and
  `ClassificationRow.grid`), offline, on every path.
- **The story never invents a start.** `analysis/text.from_grid` writes " from P7", " from
  pole", " from the pit lane" (Ergast's grid 0) — or nothing when the grid is unknown. It
  used to print "P?", and worse, "from pole" when the grid was `None`.
- **Gaps in one format.** Ergast's bare `"+17.878"` becomes `"+17.878s"` like every other
  source, and the winner's gap is `None` on the record itself (OpenF1 wrote `"LEADER"`).

**Found on the way — pit-lane time is not stationary time.** OpenF1's `pit_duration` and
Ergast's pit-stop `duration` are both measured from the pit-entry line to the pit-exit line:
twenty-odd seconds. Both were written to `stop_duration` as well as `pit_lane_time`, and
every reader of `stop_duration` treated it as the stop itself — "Best pit timing: stationary
time 24.20s" against a 2.0s scale. They now populate `pit_lane_time` only; the stationary
estimate derived from it is labelled as one; `best_pit_timing` carries `lane_s` rather than
`stationary_s` for a lane measure. And a lane duration beyond `MAX_RACING_PIT_LANE_S` (180 s)
— a red flag parks every car in the pit lane for twenty minutes, and the feeds record that
as a pit entry — is kept as an entry but excluded from every cost figure, which is how "Avg
pit loss 1298.1s" happened. Both rules live in `normalize.finalize_pit_stop` and run on every
read, so cached records heal without a refetch.

Verification of a provider failure is now visible: `openf1_adapter._safe` logs which endpoint
failed for which session instead of returning an empty list in silence.

## Network policy note

If the environment's egress policy blocks the F1 hosts above (403 on
`livetiming.formula1.com` / `api.jolpi.ca`), real fetches fail and the app falls back to
the **simulated demo race**, clearly labelled `mock`, with the reason in the session's
`notes`. This is expected behaviour in locked-down/offline environments — the real adapter
is fully implemented and activates automatically wherever those hosts are reachable.

## The demo (mock) dataset

When real data is unavailable, [`app/mock/simulator.py`](../backend/app/mock/simulator.py)
generates a **deterministic** 2026 Austrian GP: pace + tyre degradation + fuel burn + pit
loss + a VSC window are modelled, and positions/gaps/stints fall out of the physics — so
the analysis engine has genuinely consistent data to work on. It scripts a full strategy
story (LEC's costly 3-stop vs 2-stoppers, PIA/RUS converting the VSC, VER's winning 2-stop,
one DNF). It is realistic, **not** an official result.
