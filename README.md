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

- **Race Explorer** — season / GP / session picker with final classification, grid→finish, gainers & losers, tyre summary, weather, driver-of-the-day and best/worst strategy calls.
- **Interactive position chart** — one line per driver, P1 at top, VSC/SC bands, pit markers, rich hover (tyre, age, gap, pit & race-control status), toggle/highlight/zoom, end-of-line labels.
- **Tyre strategy timeline** — lap-accurate stint Gantt colour-coded by compound, undercut markers, neutralization windows, per-stint hover (avg/median/best lap + degradation).
- **Pace analysis** — fuel- & tyre-corrected clean-air pace separates real speed from track position; consistency score, traffic laps, tyre-limited flag, constructor pace ranking.
- **Strategy explainer** — deterministic, template-driven insight cards: turning points, best/worst calls, undercuts, missed cheap stops, hidden pace. No AI guesswork.
- **Ask in plain English** — “Why did Leclerc lose places?”, “Who benefited from the VSC?” — answered from computed data; optional LLM only polishes wording.
- **Driver comparison** — position trace, cumulative time delta, pace/pit/strategy table, final verdict.
- **Strategy Simulator Lite** — a clearly-labelled what-if estimate grounded in real pit loss, degradation and rejoin gaps.
- **Race control & weather timeline**, and a **Historical mode** (standings 1950+, circuit winners).

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

## How the data pipeline works

```
 Browser (Next.js)  ──►  FastAPI  ──►  service.py  ──►  adapters
                                          │                ├─ pitwall_adapter  (FastF1 / F1 archive)  ── real
   normalized JSON  ◄── analysis engine ◄─┤                ├─ history_adapter  (Jolpica/Ergast)        ── real
   + data-source tag                      └─ cache.py       └─ mock_adapter     (simulated race)        ── demo
```

Resolution order for a session (`service.get_session`):

1. **Force demo** (UI toggle or `PITWALL_IQ_MOCK_MODE`) → simulated race, tagged `mock`.
2. **Local cache** (a previously-fetched real session) → tagged `cache`.
3. **Live fetch** via pitwall/FastF1 → normalized, cached, tagged `live`.
4. **Fetch failed** → simulated race with an explanatory note, tagged `mock`.

Every API response carries a `source` (`live` / `cache` / `mock`) that the UI renders as a
badge, so you always know where the numbers came from. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

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
| Dashboard shows an **amber "Demo data"** badge unexpectedly | The backend couldn't reach the F1 hosts (`livetiming.formula1.com`, `api.jolpi.ca`). Check outbound network / proxy policy. The note under the header explains the exact reason. |
| Frontend error: *"Cannot reach the API"* | The backend isn't running, or `NEXT_PUBLIC_API_BASE` points at the wrong URL. Start the backend on port 8000. |
| `pip install f1pitwall[full]` fails on **PyJWT** | A system-managed PyJWT can block the upgrade. Re-run with `pip install --ignore-installed PyJWT "f1pitwall[full]"`. |
| Real fetch is **slow the first time** | FastF1 downloads and caches session data on first access; subsequent loads are served from the local cache instantly. |
| A specific session has **no pit-stop times** | The F1 `PitStopSeries` feed only covers 2025+. Pre-2025 stops are derived from stint boundaries (noted in the session's `notes`). |
| Want to force real data | Turn the **Demo** toggle off in the UI, or set `PITWALL_IQ_MOCK_MODE=false`, and ensure the F1 hosts are reachable. |

---

## Known limitations

- **Live car telemetry/GPS** during an in-progress session needs an `F1TV_TOKEN`. All completed-session and open-data features work without it.
- **Clean-air pace** is a fuel- and tyre-corrected estimate; it's a fair comparison of car speed, not an official metric.
- **Strategy Simulator Lite** is intentionally a directional estimate (labelled as such), not a full race simulation.
- **Undercut/overcut detection** is heuristic (from the position trace); it catches the clear cases, not every micro-swing.
- **Historical mode** is deliberately basic but cleanly architected to grow.
- The bundled demo race is **simulated** (realistic, not an official result) and is only used when real data can't be fetched.

## Acknowledgements

Built on the open-source [**pitwall**](https://github.com/darshjoshi/pitwall) MCP server and
[FastF1](https://github.com/theOehrly/Fast-F1); historical data via
[Jolpica/Ergast](https://github.com/jolpica/jolpica-f1). Not affiliated with Formula 1.
