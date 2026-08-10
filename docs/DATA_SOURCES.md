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
