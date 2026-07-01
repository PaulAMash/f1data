<h1 align="center">Pitwall IQ</h1>

<p align="center"><strong>A virtual pit wall for exploring Formula 1 races.</strong><br>
Ask <em>why</em> a race unfolded the way it did — strategy, pace, tyres, pit stops, weather and race control, from real F1 data.</p>

---

Pitwall IQ is a **website** (Next.js frontend + FastAPI backend). It pulls real
race/session data from **OpenF1, FastF1 and Jolpica/Ergast**, normalizes it into clean
models, runs a **deterministic analysis engine** over it, and presents an interactive,
broadcast-styled dashboard. It answers plain-English questions from the computed data —
**no API key required**.

Real data is the default and only normal path. If every source fails, the app shows an
**honest error with retry** — it never silently substitutes fake data. A clearly-labelled
**demo mode** exists as an explicit developer/offline switch (`PITWALL_IQ_MOCK_MODE=true`).

> **Scope:** website only. There is no desktop or mobile app.

**New F1 fan or seasoned analyst?** A global **Simple / Advanced** toggle (top-right)
switches the whole app between a plain-English race story and deep analytics — your
choice is remembered across visits.

## Highlights

- **Race Story first** — a plain-English recap and answer-first cards (winner, best pace, turning point, biggest loss) lead every race, with a **Simple / Advanced** toggle so a new fan and a hardcore fan both feel at home.
- **Multi-source real data** — a `DataSourceManager` combines **OpenF1**, **FastF1** and **Jolpica/Ergast** by era, enriches pit-stop durations and overtakes, and reports exactly which source fed each facet — tucked away in a **Data Sources** panel, not shoved in your face.
- **Practice-aware** — Practice 1/2/3 switch to a practice UI: fastest lap, long-run (race-sim) pace, laps completed, most improved, tyre usage — no fake DNFs, no meaningless race-strategy cards.
- **Interactive position chart** — one line per driver, P1 at top, VSC/SC bands, pit markers, rich hover, toggle/highlight/zoom, end-of-line labels.
- **Tyre strategy timeline** — lap-accurate stint Gantt, undercut markers, neutralization windows, per-stint hover.
- **Pace analysis** — fuel- & tyre-corrected clean-air pace separates real speed from track position; consistency, traffic, constructor ranking.
- **Strategy explainer** — deterministic insight cards: turning points, best/worst calls, undercuts, missed cheap stops, hidden pace.
- **Ask in plain English (upgraded)** — messy questions work: *“how did george overtake verstappen last minute”*, *“who had the best long run in FP2”*. Fuzzy driver/team matching, overtake reasoning, a **Simplify** button, follow-up chips, and it **never dead-ends** — always a best-effort answer with an honest confidence level.
- **Driver comparison**, **Strategy Simulator Lite**, **race control & weather timeline**, and a **Historical mode** (standings 1950+).
- **Clean pit-stop labels** — “Stop 2.4s”, “Pit loss 21.8s”, or “~3.1s est.” with a source/confidence tooltip — never a scary warning.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Data | **pitwall / FastF1 / Jolpica** (Python) | Real F1 archive + rich lap data + 1950+ history |
| Backend/API | **FastAPI** (Python) | pitwall is Python — the adapter and analysis engine live where the data is |
| Analysis | Pure-Python deterministic engine | Pace, strategy, insights, Q&A and simulation — no LLM required |
| Frontend | **Next.js 14 + TypeScript** | App Router, static + client rendering |
| Styling | **Tailwind CSS** | Dark-mode-first design system |
| Charts | **Recharts** + custom SVG | Interactive position/pace charts; custom tyre Gantt |

> **Why FastAPI over Next.js API routes?** pitwall and FastF1 are Python libraries and
> the analysis engine is data-heavy. Keeping fetch + normalize + analyze in one Python
> service makes the pitwall integration clean and keeps the frontend a thin, typed client.

---

## Quick start

**Prerequisites:** Python 3.10+ and Node 18+.

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # optional but recommended
pip install -r requirements.txt                       # installs f1pitwall[full] + FastAPI
cp .env.example .env                                  # optional; sensible defaults work
uvicorn app.main:app --reload --port 8000
```

The API is now at <http://localhost:8000> (interactive docs at `/docs`).

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local                      # points at http://localhost:8000
npm run dev
```

Open <http://localhost:3000> and click **Open Race Explorer**.

> Prefer one command? From the repo root: `make install` then `make dev` (runs both).

### Try it immediately (offline / demo)

No network access to F1 data? Start the backend in demo mode and everything still works:

```bash
cd backend && PITWALL_IQ_MOCK_MODE=true uvicorn app.main:app --port 8000
```

The Explorer loads a bundled, clearly-labelled **example** race — a realistic simulated
session with a full strategy story (LEC's costly 3-stop, a VSC cheap-stop window, VER's
winning 2-stop). This is an explicit backend/dev switch — there is no Demo toggle in the
UI; to use real data, run the backend normally (`uvicorn app.main:app --port 8000`).

> **Scope:** Pitwall IQ is a **website** (Next.js frontend + FastAPI backend). There is
> no desktop or mobile app in the current scope.

---

## Pages & modes

| Page | Purpose — the question it answers |
|---|---|
| **Race Explorer** | *"What happened in this session, and why?"* — deep analysis of one selected session: Race Story, Charts, Strategy, Pace, Compare, Ask. |
| **Historical** | *"What happened across seasons, circuits and championships?"* — an archive browser: official results, qualifying, standings and past winners, 1950–present. |

The Explorer is a current-session **analysis workspace**; Historical is an **archive**,
not a second race picker.

**Simple / Advanced** (global toggle, top-right, remembered across visits) changes *every*
tab: Simple is visual and plain-English (story cards, pace bars, verdict-first compare, no
dense tables or diagnostics); Advanced adds full tables, clean-air pace, undercut/pit-loss
math, confidence, assumptions, source reports and diagnostics.

---

## How the data pipeline works

```
 Browser (Next.js) ─► FastAPI ─► service.py ─► DataSourceManager ─┬─ openf1_adapter   (OpenF1)        ── real
                                                                   ├─ pitwall_adapter  (FastF1)        ── real
 normalized JSON ◄─ analysis engine ◄──────────────────┐          ├─ jolpica_adapter  (Jolpica/Ergast)── real
 + per-facet source report                             │          ├─ pitstop_service  (best pit times)
                                                cache.py┘          └─ mock_adapter     (simulated)      ── demo
```

**Source priority (chosen automatically by `DataSourceManager`):**

| Era | Order |
|---|---|
| **2023+** | OpenF1 → FastF1 → Jolpica → cache → demo |
| **2018–2022** | FastF1 → Jolpica → cache → demo |
| **pre-2018** | Jolpica (advanced facets marked unavailable) → cache → demo |

The first source that returns a usable session becomes the *primary*; the manager then
**enriches** it — pit-stop durations via `PitStopDataService` (OpenF1 → Jolpica → FastF1
lane time → estimate), overtakes (OpenF1 or inferred from the position trace) — and attaches
a **source report** describing which source fed each facet, at what confidence.

Session resolution: **explicit demo mode** → **cache** → **live chain** → **honest error**.
There is **no silent demo fallback**: if every real source fails, the API returns a
structured `503 data_unavailable` (which sources were tried, whether it's retryable) and
the UI shows a retry + a link to Data Sources. Every response is tagged `live` / `cache`
/ `mock`; the UI surfaces this in the tucked-away **Data Sources** panel. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md),
[`docs/ASK_ENGINE.md`](docs/ASK_ENGINE.md) and
[`docs/HISTORICAL_EXPLORER.md`](docs/HISTORICAL_EXPLORER.md).

### Data / diagnostics endpoints

```
GET /api/session                       full bundle (session + strategy + pace + practice)
GET /api/session/load                  normalized session only (debug)
GET /api/session/source-report         which source fed each facet + counts
GET /api/session/raw-preview           first rows of laps/pits/overtakes (debug)
GET /api/session/cache/clear           clear one cached session, or all
GET /api/sessions/available            session types for a GP (Practice…Race)
GET /api/health/data-sources           reachability of OpenF1 / FastF1 / Jolpica / cache
POST /api/ask   { question, simple }   plain-English answer (simple = beginner language)
```

---

## Configuration

All configuration is via environment variables — see [`.env.example`](.env.example).
Nothing is required for the app to run on open data.

| Variable | Default | Purpose |
|---|---|---|
| `PITWALL_IQ_MOCK_MODE` | `false` | **Explicit** demo/offline mode (labelled sample data). Not a silent fallback |
| `PITWALL_IQ_ENABLE_LIVE` | `true` | Attempt real fetches |
| `PITWALL_IQ_USE_FASTF1` | `true` | Use FastF1 for rich lap data |
| `PITWALL_IQ_CACHE_DIR` | `backend/data/cache` | Where real sessions are cached |
| `PITWALL_IQ_DEFAULT_YEAR` | `2026` | Season shown first |
| `PITWALL_IQ_CORS` | `http://localhost:3000` | Allowed CORS origin(s) — set to your frontend URL |
| `F1TV_TOKEN` | — | **Optional**, server-side only. Live car telemetry/GPS during a *live* session. Never sent to the browser |
| `ANTHROPIC_API_KEY` | — | **Optional**, server-side only. Polishes Q&A wording; facts always come from the engine |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Frontend → backend URL (set to your deployed backend in production) |

**Deploying?** See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for backend + frontend hosting steps.

**Secrets never reach the frontend.** Tokens/keys are read only by the backend; the
frontend receives a boolean `llm_available` flag, never the key itself.

---

## Tests, lint & typecheck

```bash
# backend (25 tests: simulator consistency, analysis, Q&A, practice, hardening, API)
cd backend && python -m pytest

# frontend
cd frontend && npm run typecheck && npm run lint && npm run build
```

Or from the repo root: `make test`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows an **amber "Demo data"** chip unexpectedly | Every live source (OpenF1 `api.openf1.org`, FastF1 `livetiming.formula1.com`, Jolpica `api.jolpi.ca`) was unreachable. Open the **Data** tab → **Check now** to see which. Usually an outbound network / egress-policy block. |
| A **"Partial data"** chip appears | The primary source didn't provide every facet (e.g. an older season with no tyre/weather data). The Data tab lists exactly what's missing. This is expected, not a bug. |
| Frontend error: *"Cannot reach the API"* | The backend isn't running, or `NEXT_PUBLIC_API_BASE_URL` is wrong. Start the backend on port 8000. |
| `pip install f1pitwall[full]` fails on **PyJWT** | Re-run with `pip install --ignore-installed PyJWT "f1pitwall[full]"`. |
| Real fetch is **slow the first time** | FastF1 caches on first access; later loads are instant. Force a re-fetch from the Data tab → **Refetch**. |
| **How do I clear the cache?** | Data tab → **Clear cache**, or `GET /api/session/cache/clear` (optionally with `?year=&gp=&session=`). |
| **How do I test real data?** | Turn the **Demo** toggle off (or `PITWALL_IQ_MOCK_MODE=false`), ensure the hosts above are reachable, pick a real season/GP/session, and check the **Data** tab to confirm the source is OpenF1/FastF1/Jolpica rather than the demo generator. |
| A pit stop shows **"~3.1s est."** | No source published a measured stop duration, so it's estimated from pit-lane loss (low confidence — hover for the explanation). Not an error. |

---

## Known limitations

- **Live car telemetry/GPS** during an in-progress session needs an `F1TV_TOKEN`. All completed-session and open-data features work without it.
- **OpenF1** covers 2023-present; it's the preferred primary there (best for pit durations, overtakes and practice). Older seasons fall back to FastF1, then Jolpica.
- **Pit-stop duration** isn't published by every source. Order of preference: OpenF1 `pit_duration` → Jolpica `duration` → FastF1 pit-lane time → an estimate from pit-lane loss (labelled low-confidence). Pre-2011 races usually have none.
- **Overtakes** use OpenF1's endpoint where present, otherwise they're inferred from the lap-by-lap position trace (clear swaps, not every micro-move) — flagged as `inferred`.
- **Clean-air / long-run pace** are fuel- and tyre-aware estimates, fair for comparison but not official; practice pace especially is indicative (fuel loads and engine modes are unknown).
- **Strategy Simulator Lite** is a directional estimate, not a full race simulation.
- **Pre-2018 sessions**: advanced facets (tyres, weather, sectors, race control) are marked unavailable rather than faked.
- The bundled **demo** race/practice is simulated (realistic, not official) and is only used when demo mode is on or every real source fails — and it's always clearly labelled.

## Acknowledgements

Built on the open-source [**pitwall**](https://github.com/darshjoshi/pitwall) MCP server and
[FastF1](https://github.com/theOehrly/Fast-F1); historical data via
[Jolpica/Ergast](https://github.com/jolpica/jolpica-f1). Not affiliated with Formula 1.
