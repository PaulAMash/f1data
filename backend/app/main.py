"""
Pitwall IQ — FastAPI backend.

Serves normalized F1 data + deterministic analysis to the Next.js frontend.
Source labelling (live / cache / mock) and a full per-facet source report travel
with every session, but are surfaced by the UI in a tucked-away Data Sources
panel rather than as prominent badges. Secrets never leave here.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import cache, service
from .adapters import history_adapter, historical, pitstop_service
from .adapters.data_source_manager import DataUnavailableError
from .analysis.engine import analyze, compare_drivers
from .analysis.practice import compute_practice
from .analysis.qualifying import compute_qualifying
from .analysis.qa import QAContext, answer_question
from .analysis.whatif import simulate_whatif
from .config import get_settings
from .models import DataSource

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title="Pitwall IQ API", version="2.0.0",
              description="Real, multi-source F1 race intelligence: pace, strategy, tyres, practice, and plain-English answers.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.exception_handler(DataUnavailableError)
async def _data_unavailable(_request: Request, exc: DataUnavailableError):
    # Honest failure — no silent demo data. The UI shows retry + Data Sources link.
    return JSONResponse(status_code=503, content=exc.to_payload())


# --------------------------------------------------------------------------- #
# meta / health
# --------------------------------------------------------------------------- #
@app.get("/api/health")
@app.get("/health")
def health():
    """Liveness probe (also served at /health) for deployment health checks."""
    return {"ok": True, "service": "pitwall-iq-backend", "status": "ok"}


@app.get("/api/meta")
def meta():
    return {
        "app": "Pitwall IQ",
        "mock_mode": settings.mock_mode,
        "live_fetch_enabled": settings.enable_live_fetch,
        "llm_available": settings.llm_available,
        "default_year": settings.default_year,
        "source_labels": {s.value: service.source_label(s) for s in DataSource},
    }


@app.get("/api/health/data-sources")
def health_data_sources():
    """Reachability of every real source — powers the Data Sources diagnostics."""
    probes = service.data_source_health()
    return {"probes": [p.model_dump() for p in probes]}


@app.get("/api/debug/headshots")
def debug_headshots(year: int = Query(...), gp: str = Query(...),
                    session: str = Query("Race"), mock: bool = Query(False)):
    """Per-driver portrait trace: the final Formula1.com URL each driver
    resolved to and which source produced it (f1-listing / session-media /
    season-media / unresolved). Open this and click a URL to confirm it's the
    real portrait — the same one on Formula1.com's Drivers page."""
    from .adapters import headshots
    s = service.get_session(year, gp, session, force_mock=mock)
    rows = headshots.resolve(s)
    return {
        "year": year, "gp": s.grand_prix, "session": s.session_type,
        "unresolved": [r["code"] for r in rows if r["resolved_via"] == "unresolved"],
        "drivers": rows,
    }


# --------------------------------------------------------------------------- #
# calendar
# --------------------------------------------------------------------------- #
@app.get("/api/seasons")
def seasons():
    data, src = service.get_seasons()
    return {"source": src.value, "seasons": [s.model_dump() for s in data]}


@app.get("/api/seasons/{year}/races")
def races(year: int):
    data, src = service.get_grands_prix(year)
    return {"source": src.value, "year": year, "races": [g.model_dump() for g in data]}


@app.get("/api/current")
def current_default():
    """Current season + latest Grand Prix for Race Explorer to open by default."""
    return service.get_current()


@app.get("/api/sessions/available")
def sessions_available(year: int = Query(...), gp: str = Query(...)):
    """Which session types are available for a given GP (Practice…Race)."""
    data, src = service.get_grands_prix(year)
    match = next((g for g in data if g.name.lower() == gp.lower()
                 or gp.lower() in g.name.lower()), None)
    sessions = match.sessions if match else ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]
    return {"source": src.value, "year": year, "gp": gp, "sessions": sessions}


# --------------------------------------------------------------------------- #
# session bundle (Race Explorer)
# --------------------------------------------------------------------------- #
def _bundle(year, gp, session_type, mock, refresh):
    s = service.get_session(year, gp, session_type, force_mock=mock, refresh=refresh)
    strategy, pace = analyze(s)
    practice = compute_practice(s) if s.category == "practice" else None
    qualifying = (compute_qualifying(s)
                  if s.category in ("qualifying", "sprint_qualifying") else None)
    return s, strategy, pace, practice, qualifying


@app.get("/api/session")
def session_bundle(
    year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
    mock: bool = Query(False), refresh: bool = Query(False),
):
    s, strategy, pace, practice, qualifying = _bundle(year, gp, session, mock, refresh)
    return {
        "source": s.data_source.value,
        "source_label": service.source_label(s.data_source),
        "category": s.category,
        "session": s.model_dump(),
        "strategy": strategy.model_dump(),
        "pace": [p.model_dump() for p in pace],
        "practice": practice.model_dump() if practice else None,
        "qualifying": qualifying.model_dump() if qualifying else None,
    }


@app.get("/api/session/load")
def session_load(year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
                 mock: bool = Query(False), refresh: bool = Query(False)):
    """The normalized session only (no analysis) — useful for debugging."""
    s = service.get_session(year, gp, session, force_mock=mock, refresh=refresh)
    return s.model_dump()


@app.get("/api/session/source-report")
def session_source_report(year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
                          mock: bool = Query(False)):
    s = service.get_session(year, gp, session, force_mock=mock)
    report = s.source_report.model_dump() if s.source_report else None
    return {"source": s.data_source.value, "grand_prix": s.grand_prix, "session_type": s.session_type,
            "category": s.category, "partial": s.partial, "notes": s.notes, "report": report,
            "counts": {"drivers": len(s.drivers), "laps": len(s.laps), "pit_stops": len(s.pit_stops),
                       "overtakes": len(s.overtakes), "weather": len(s.weather),
                       "race_control": len(s.race_control)}}


@app.get("/api/session/raw-preview")
def session_raw_preview(year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
                        mock: bool = Query(False)):
    s = service.get_session(year, gp, session, force_mock=mock)
    return {
        "grand_prix": s.grand_prix, "session_type": s.session_type, "category": s.category,
        "drivers": [d.model_dump() for d in s.drivers[:6]],
        "laps": [l.model_dump() for l in s.laps[:8]],
        "pit_stops": [p.model_dump() for p in s.pit_stops[:6]],
        "overtakes": [o.model_dump() for o in s.overtakes[:6]],
    }


@app.get("/api/session/cache/clear")
def session_cache_clear(year: int | None = None, gp: str | None = None, session: str | None = None):
    """Clear one cached session, or the whole cache if no key is given."""
    cleared = 0
    if year and gp and session:
        p = cache._path(year, gp, session)  # noqa: SLF001
        if p.exists():
            p.unlink()
            cleared = 1
    else:
        for f in get_settings().cache_dir.glob("*.json"):
            f.unlink()
            cleared += 1
    return {"cleared": cleared}


# --------------------------------------------------------------------------- #
# compare / ask / simulate
# --------------------------------------------------------------------------- #
@app.get("/api/compare")
def compare(year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
            a: str = Query(...), b: str = Query(...), mock: bool = Query(False)):
    s = service.get_session(year, gp, session, force_mock=mock)
    result = compare_drivers(s, a, b)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"source": s.data_source.value, "grand_prix": s.grand_prix, **result}


class AskBody(BaseModel):
    year: int
    gp: str
    session: str = "Race"
    question: str
    mock: bool = False
    simple: bool = False


@app.post("/api/ask")
def ask(body: AskBody):
    s, strategy, pace, _practice, _qualifying = _bundle(body.year, body.gp, body.session, body.mock, False)
    ctx = QAContext(session=s, strategy=strategy, pace=pace)
    qa = answer_question(body.question, ctx, simple=body.simple)
    return {"source": s.data_source.value, "category": s.category, **qa.model_dump()}


class SimulateBody(BaseModel):
    year: int
    gp: str
    session: str = "Race"
    driver: str
    new_pit_lap: int | None = None
    num_stops: int | None = None
    compounds: list[str] | None = None
    mock: bool = False


@app.post("/api/simulate")
def simulate(body: SimulateBody):
    s = service.get_session(body.year, body.gp, body.session, force_mock=body.mock)
    _, pace = analyze(s)
    result = simulate_whatif(s, pace, body.driver, new_pit_lap=body.new_pit_lap,
                             num_stops=body.num_stops, compounds=body.compounds)
    return {"source": s.data_source.value, **result.model_dump()}


# --------------------------------------------------------------------------- #
# historical mode
# --------------------------------------------------------------------------- #
@app.get("/api/history/standings")
def history_standings(year: int = Query(...), type: str = Query("driver")):
    rows, src = history_adapter.get_standings(year, "constructor" if type == "constructor" else "driver")
    return {"source": src.value, "year": year, "type": type, "standings": rows}


@app.get("/api/history/circuit-winners")
def history_circuit(circuit: str = Query(...)):
    rows, src = history_adapter.get_circuit_winners(circuit)
    return {"source": src.value, "circuit": circuit, "winners": rows}


# --------------------------------------------------------------------------- #
# Historical Data Explorer (year / event / session → real results)
# --------------------------------------------------------------------------- #
def _hist_guard(fn, **fields):
    """Run a historical lookup; turn source failures into honest, structured info."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("pitwall_iq").info("historical lookup failed: %s", exc)
        return {"available": False, "error": "source_unavailable",
                "message": "The historical data source (Jolpica/Ergast) was unreachable. "
                           "Please retry.", "retryable": True, **fields}


@app.get("/api/historical/seasons")
def historical_seasons():
    return _hist_guard(lambda: {"seasons": historical.seasons()}, seasons=[])


@app.get("/api/historical/events")
def historical_events(year: int = Query(...)):
    return _hist_guard(lambda: {"year": year, "events": historical.events(year)}, events=[])


@app.get("/api/historical/sessions")
def historical_sessions(year: int = Query(...), event: str = Query(...)):
    return _hist_guard(lambda: historical.sessions_for(year, event))


@app.get("/api/historical/results")
def historical_results(year: int = Query(...), event: str = Query(...), session: str = Query("Race")):
    return _hist_guard(lambda: historical.results(year, event, session),
                       year=year, event=event, session=session, rows=[])


@app.get("/api/historical/source-report")
def historical_source_report(year: int = Query(...), event: str = Query(...), session: str = Query("Race")):
    def build():
        res = historical.results(year, event, session)
        return {"year": year, "event": event, "session": session,
                "source": res.get("source", "jolpica"),
                "available": res.get("available", False),
                "confidence": res.get("confidence"), "note": res.get("note"),
                "row_count": len(res.get("rows", []))}
    return _hist_guard(build, year=year, event=event, session=session)
