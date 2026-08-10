# Architecture

Pitwall IQ is two services: a **Python FastAPI backend** that owns all data access +
analysis, and a **Next.js frontend** that is a thin, typed presentation layer.

```
frontend/ (Next.js + TS + Tailwind)         backend/ (FastAPI + Python)
  src/app        routes/pages                  app/main.py        API routes
  src/components charts, dashboard, ui          app/service.py     source orchestration + fallback
  src/lib        api client, types, format      app/adapters/      pitwall/FastF1 · history · mock
                                                app/analysis/      pace · strategy · qa · whatif
                                                app/models.py      normalized Pydantic models
                                                app/cache.py       on-disk cache of real sessions
                                                app/mock/          deterministic race simulator
```

## Design principles

1. **One data vocabulary.** Every data source produces the same normalized
   [`app/models.py`](../backend/app/models.py) types (`RaceSession`, `Lap`, `Stint`,
   `PitStop`, `RaceControlEvent`, `WeatherPoint`, `PositionPoint`, …). Nothing above the
   adapter layer knows or cares whether the data is real or simulated.

2. **pitwall calls are isolated.** All contact with pitwall / FastF1 / the F1 archive
   lives in [`adapters/pitwall_adapter.py`](../backend/app/adapters/pitwall_adapter.py).
   Historical data (Jolpica) is in `history_adapter.py`. The UI never touches pitwall.

3. **Deterministic analysis first.** The engine
   ([`analysis/`](../backend/app/analysis)) computes everything from data with explicit
   rules and templates. An LLM is *optional* and only rephrases already-correct answers.

4. **Always labelled.** Every response is tagged `live` / `cache` / `mock` and the UI
   surfaces it as a badge. Fallbacks are explained in the session's `notes`.

## Request flow (Race Explorer)

```
GET /api/session?year=2026&gp=Austrian%20Grand%20Prix&session=Race
      │
      ▼
service.get_session ──► mock? ─────────────► mock_adapter.get_mock_session
      │  no                                    (simulated race, tagged mock)
      ▼
   cache.load ── hit ─────────────────────► cached RaceSession (tagged cache)
      │  miss
      ▼
   pitwall_adapter.fetch_session
      │  ├─ _fetch_via_fastf1  (preferred, rich)
      │  └─ _fetch_via_static  (F1 archive via pitwall helpers)
      │  success → cache.save → RaceSession (tagged live)
      │  failure → mock_adapter (tagged mock, with reason note)
      ▼
analysis.engine.analyze(session) → (StrategySummary, [DriverPaceSummary])
      ▼
{ source, session, strategy, pace }   ──►   frontend renders every tab from this bundle
```

The bundle is computed fresh per request (analysis is milliseconds); real *session data*
is what gets cached, because a completed session never changes.

## Two caches, and they cache different things

`app/cache.py` persists **normalized session bundles** keyed by `(year, gp, session)` — the
expensive thing on the Race Explorer's path.

`app/upstream.py` (V85) sits under every adapter and caches **individual upstream HTTP
documents** — calendars, season lists, standings, historical results. It is a different layer
solving a different problem: those calls are small, they repeat constantly, and several of them
used to be issued two or three times inside a single request. It also **coalesces** concurrent
requests for the same URL into one, **paces** each host below its published rate limit, and
treats **HTTP 429** as the instruction to wait that it is rather than as an outage. See
`docs/DATA_SOURCES.md` for the limits it is written against.

Nothing above the adapters knows either cache exists. Adapters keep their own shapes, their own
fallbacks and their own error types; they simply stopped talking to the network directly.

## Client state: which answer is allowed to win

Every picker in the frontend fires a fetch on change, and a fetch is not ordered — three rapid
season changes put three requests in the air and the last one to *finish* writes the state, not
the last one asked for. `lib/fresh.ts` exports `useFreshEffect`, which hands each run a
`fresh()` predicate that goes false the moment a newer run starts; a retired request can still
finish, it just cannot write. Every season- and selection-keyed fetch uses it, and
`npm run doctor:fetches` fails if a new one does not.

## The analysis engine

| Module | Responsibility |
|---|---|
| `pace.py` | Fuel + tyre normalization → clean-air pace, consistency, traffic laps, pace rank, per-stint pace |
| `strategy.py` | Gainers/losers, pit counts, undercut/overcut detection, best/worst calls, turning points, insight cards |
| `engine.py` | Orchestrates pace+strategy; driver head-to-head comparison |
| `qa.py` | Intent-routed natural-language answers from computed data; optional LLM polish |
| `whatif.py` | Strategy Simulator Lite — pit-lap / stop-count / compound what-ifs grounded in real pit loss & degradation |

### Why fuel + tyre correction?

Raw median lap time flatters chasers (low fuel, push laps) and penalizes leaders
(managing pace). To compare *car speed* fairly, `pace.py` estimates the field-wide fuel
slope (s/lap) and per-compound offsets, then normalizes each clean-air lap to a medium
tyre at mid-race fuel. The result surfaces true pace — e.g. it correctly ranks a driver
who was quick but lost out to strategy above their finishing position.

## Frontend structure

- `app/page.tsx` — landing. `app/explorer/page.tsx` — the dashboard (fetches one bundle, feeds every tab). `app/history/page.tsx` — historical mode.
- `components/charts` — `PositionChart`, `TyreStrategyChart`, `PaceAnalysis`, `RaceControlWeather`.
- `components/dashboard` / `strategy` / `driver-comparison` — the sections.
- `components/ui` — the design system (Card, Badge, Tabs, InfoTip, StatTile, DataSourceBadge, skeleton/empty/error states).
- `lib/types.ts` mirrors the backend models; `lib/api.ts` is the typed client.

## Extending

- **A new data source** → add an adapter that returns `RaceSession`; wire it into `service.py`. Nothing else changes.
- **A new insight** → add a builder in `strategy.py` returning a `RaceInsight`; it renders automatically.
- **A new question type** → add a handler to `qa.py`'s `HANDLERS` list.
- **A new chart/tab** → add a component and a tab entry in `explorer/page.tsx`.
