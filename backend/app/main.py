"""
Pitwall IQ — FastAPI backend.

Serves normalized F1 race data + deterministic analysis to the Next.js frontend.
Data-source labelling (live / cache / mock) is attached to every response so the
UI can always tell the user where the numbers came from. Secrets never leave here.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import service
from .analysis.engine import analyze, compare_drivers
from .analysis.qa import QAContext, answer_question
from .analysis.whatif import simulate_whatif
from .adapters import history_adapter
from .config import get_settings
from .models import DataSource

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title="Pitwall IQ API", version="1.0.0",
              description="Real F1 race intelligence: pace, strategy, tyres, and plain-English answers.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# meta
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    """Frontend feature flags — never exposes secret *values*, only availability."""
    return {
        "app": "Pitwall IQ",
        "mock_mode": settings.mock_mode,
        "live_fetch_enabled": settings.enable_live_fetch,
        "llm_available": settings.llm_available,
        "default_year": settings.default_year,
        "source_labels": {s.value: service.source_label(s) for s in DataSource},
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


# --------------------------------------------------------------------------- #
# session bundle (Race Explorer)
# --------------------------------------------------------------------------- #
@app.get("/api/session")
def session_bundle(
    year: int = Query(...),
    gp: str = Query(..., description="Grand Prix name (partial match)"),
    session: str = Query("Race"),
    mock: bool = Query(False, description="Force simulated demo data"),
    refresh: bool = Query(False, description="Bypass cache and refetch"),
):
    s = service.get_session(year, gp, session, force_mock=mock, refresh=refresh)
    strategy, pace = analyze(s)
    return {
        "source": s.data_source.value,
        "source_label": service.source_label(s.data_source),
        "session": s.model_dump(),
        "strategy": strategy.model_dump(),
        "pace": [p.model_dump() for p in pace],
    }


@app.get("/api/compare")
def compare(
    year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
    a: str = Query(...), b: str = Query(...), mock: bool = Query(False),
):
    s = service.get_session(year, gp, session, force_mock=mock)
    result = compare_drivers(s, a, b)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"source": s.data_source.value, "grand_prix": s.grand_prix, **result}


# --------------------------------------------------------------------------- #
# natural-language Q&A
# --------------------------------------------------------------------------- #
class AskBody(BaseModel):
    year: int
    gp: str
    session: str = "Race"
    question: str
    mock: bool = False


@app.post("/api/ask")
def ask(body: AskBody):
    s = service.get_session(body.year, body.gp, body.session, force_mock=body.mock)
    strategy, pace = analyze(s)
    ctx = QAContext(session=s, strategy=strategy, pace=pace)
    qa = answer_question(body.question, ctx)
    return {"source": s.data_source.value, **qa.model_dump()}


# --------------------------------------------------------------------------- #
# strategy simulator lite
# --------------------------------------------------------------------------- #
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
