<h1 align="center">Pitwall IQ</h1>

<p align="center"><strong>A virtual pit wall for exploring Formula 1 races.</strong><br>
Ask <em>why</em> a race unfolded the way it did — strategy, pace, tyres, pit stops, weather and race control, from real F1 data.</p>

---

Pitwall IQ is a full-stack F1 race-intelligence app. It pulls real race/session data
through the open-source [**pitwall**](https://github.com/darshjoshi/pitwall) stack
(FastF1 + the F1 live-timing archive + Jolpica/Ergast), normalizes it into clean
models, runs a **deterministic analysis engine** over it, and presents an interactive,
broadcast-styled dashboard. It answers plain-English questions from the computed data —
**no API key required**.

When a completed session can't be fetched (e.g. the F1 data hosts are blocked by a
network policy), the app falls back to a **realistic simulated race**, clearly labelled
as demo data. The real data adapter is fully implemented and used automatically wherever
the F1 hosts are reachable.

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

The Explorer loads the bundled, clearly-labelled **2026 Austrian GP** demo race — a
realistic simulated race with a full strategy story (LEC's costly 3-stop, a VSC cheap-stop
window, VER's winning 2-stop). Flip **Demo** off in the UI to attempt real data.

---

## Desktop app (macOS)

Pitwall IQ also runs as a real macOS `.app` via **Tauri v2** — it wraps the same UI and
**auto-starts the backend** as a local sidecar, so you just open the app (no terminal,
no browser). The web workflow above is unchanged.

```bash
make desktop-deps          # once: Tauri CLI + PyInstaller (Rust must be installed too)
make desktop-dev           # run the desktop app in dev (auto-starts the backend)
make desktop-build-mac     # build the macOS .app + .dmg
```

The built app appears at:

```
frontend/src-tauri/target/release/bundle/macos/Pitwall IQ.app
frontend/src-tauri/target/release/bundle/dmg/Pitwall IQ_2.0.0_<arch>.dmg
```

The desktop shell launches the FastAPI backend on `127.0.0.1:8765`, waits for
`/health`, then reveals the window; it stops the backend on quit. Demo/real data both
work (OpenF1 + Jolpica are bundled; FastF1 is opt-in). Full guide — including
**signing & notarization** for distributing to other Macs — in
[`docs/DESKTOP.md`](docs/DESKTOP.md). iOS/Windows plans in
[`docs/MOBILE_ROADMAP.md`](docs/MOBILE_ROADMAP.md).

> The macOS `.app`/`.dmg` must be **built on a Mac** (Apple's toolchain is macOS-only).

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

Session resolution: **force demo** → **cache** → **live chain** → **demo fallback** (with an
explanatory note). Every response is tagged `live` / `cache` / `mock`; the UI surfaces this in
the **Data Sources** panel, and only shows a prominent chip when it matters (Demo / Partial).
Mock data never silently masquerades as real. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

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
| `PITWALL_IQ_MOCK_MODE` | `false` | Always serve the simulated demo race |
| `PITWALL_IQ_ENABLE_LIVE` | `true` | Attempt real fetches |
| `PITWALL_IQ_USE_FASTF1` | `true` | Use FastF1 for rich lap data |
| `PITWALL_IQ_CACHE_DIR` | `backend/data/cache` | Where real sessions are cached |
| `PITWALL_IQ_DEFAULT_YEAR` | `2026` | Season shown first |
| `F1TV_TOKEN` | — | **Optional**, server-side only. Live car telemetry/GPS during a *live* session. Never sent to the browser |
| `ANTHROPIC_API_KEY` | — | **Optional**, server-side only. Polishes Q&A wording; facts always come from the engine |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | Frontend → backend URL |

**Secrets never reach the frontend.** Tokens/keys are read only by the backend; the
frontend receives a boolean `llm_available` flag, never the key itself.

---

## Tests, lint & typecheck

```bash
# backend (14 tests: simulator consistency, analysis, Q&A, API)
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
| Frontend error: *"Cannot reach the API"* | The backend isn't running, or `NEXT_PUBLIC_API_BASE` is wrong. Start the backend on port 8000. |
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
