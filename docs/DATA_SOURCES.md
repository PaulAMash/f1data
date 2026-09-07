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
