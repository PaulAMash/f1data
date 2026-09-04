"""
Pitwall IQ — FastAPI backend.

Serves normalized F1 data + deterministic analysis to the Next.js frontend.
Source labelling (live / cache / mock) and a full per-facet source report travel
with every session, but are surfaced by the UI in a tucked-away Data Sources
panel rather than as prominent badges. Secrets never leave here.
"""
from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import analytics, cache, service, timing, upstream
from . import schedule as app_schedule
from .analytics import classify as ask_classify
from .analytics import queries as analytics_queries
from .analytics import report as analytics_report
from .analytics import triage
from .analytics.admin import admin_token_configured, require_admin
from .adapters import data_source_manager, headshots, history_adapter, historical, pitstop_service
from .adapters.data_source_manager import DataUnavailableError
from .adapters.pitwall_runtime import load_pitwall
from .analysis.engine import analyze, compare_drivers
from .analysis.practice import compute_practice
from .analysis.qualifying import compute_qualifying
from .analysis.qa import QAContext, answer_question
from .analysis.whatif import simulate_whatif
from .archive_scale import archive_scale
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

# A SESSION IS 380 KB OF JSON AND WAS BEING SHIPPED UNCOMPRESSED.
#
# The lap table is ~83% of that, and lap tables are the most compressible thing
# this API returns: the same driver codes, compounds and lap numbers repeating a
# thousand times over. Measured on the demo race, gzip takes the payload from
# 383,757 bytes to 33,807 — 11x smaller, for one line of middleware.
#
# It cost nothing in development and everything in production, which is exactly
# why it survived this long: over loopback a third of a megabyte is free, and
# over a real connection between the browser and a hosted API it is seconds. The
# frontend talks to the API host directly rather than through the CDN, so
# nothing upstream was compressing it either.
#
# `minimum_size` keeps the small, frequent calls (meta, current, health) out of
# it — below about a kilobyte, compression costs more than it saves.
app.add_middleware(GZipMiddleware, minimum_size=1024)


# --------------------------------------------------------------------------- #
# Private product analytics.
#
# Started here so a missing database is discovered once, at boot, rather than on
# every request. `setup()` returning False is a supported, quiet outcome: every
# recording call becomes a no-op and the site is exactly what it was.
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def _lifespan(_app: FastAPI):
    try:
        analytics.setup()
    except Exception as exc:  # noqa: BLE001 — analytics may never fail a boot
        logging.getLogger("pitwall_iq").warning("analytics setup skipped: %s", exc)
    yield
    try:
        analytics.shutdown()
    except Exception:  # noqa: BLE001
        pass


app.router.lifespan_context = _lifespan


#: Over this, a request is worth recording as slow in its own right — the point
#: of the figure is to find the endpoints that need work, and an average hides
#: exactly the tail that readers actually feel.
_SLOW_REQUEST_MS = 3_000

#: Paths whose own traffic must never become analytics traffic: the beacon and
#: the dashboard would otherwise measure themselves, and a dashboard refresh
#: would show up as product usage.
_UNMEASURED = ("/api/signal", "/api/admin/", "/api/health", "/health")


@app.middleware("http")
async def _measure(request: Request, call_next):
    """Timing and failure telemetry for every API call, recorded server-side.

    SERVER-SIDE ON PURPOSE. Client beacons are blocked by a meaningful share of
    browsers — the ad blocker that hid a request in V84 would hide these too —
    and "are requests failing or slow in production" is exactly the question you
    cannot afford to have answered only by the readers who allow tracking. This
    path sees every request, blocked extension or not.
    """
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # The request is already failing; recording must not change how.
        try:
            path = request.url.path
            if not path.startswith(_UNMEASURED):
                analytics.record("api_error", path=path, ok=False,
                                 ms=int((time.perf_counter() - started) * 1000),
                                 detail="unhandled exception", status=500)
        except Exception:  # noqa: BLE001
            pass
        raise
    try:
        path = request.url.path
        if not path.startswith(_UNMEASURED):
            ms = int((time.perf_counter() - started) * 1000)
            analytics.record("api_request", path=path, ok=response.status_code < 400,
                             ms=ms, detail=str(response.status_code),
                             status=response.status_code)
            # 503 IS ALREADY RECORDED, ONCE, SOMEWHERE BETTER. The only 503 this
            # app produces is DataUnavailableError, and its handler below writes
            # a `session_load_failed` row carrying the year, Grand Prix, session
            # and reason — everything this branch would record and more. Writing
            # `api_error` here too made one failed session load into two rows in
            # every error count, which is why the dashboard reported more errors
            # than had actually happened.
            if response.status_code >= 400 and response.status_code != 503:
                analytics.record("api_error", path=path, ok=False, ms=ms,
                                 detail=f"HTTP {response.status_code}",
                                 status=response.status_code)
            elif ms >= _SLOW_REQUEST_MS:
                analytics.record("api_slow", path=path, ok=True, ms=ms)
    except Exception:  # noqa: BLE001 — never let measurement change the answer
        pass
    return response


@app.exception_handler(DataUnavailableError)
async def _data_unavailable(request: Request, exc: DataUnavailableError):
    # Honest failure — no silent demo data. The UI shows retry + Data Sources link.
    #
    # This is also the single place every "the session could not be loaded"
    # ends up, which makes it the right place to record one: the dashboard's
    # session-failure list is built from here, so it cannot drift from what
    # readers actually experienced.
    try:
        params = request.query_params
        payload = exc.to_payload()
        analytics.record(
            "session_load_failed", path=request.url.path, ok=False,
            year=int(params["year"]) if params.get("year", "").isdigit() else None,
            gp=params.get("gp"), session_type=params.get("session"),
            detail=str(payload.get("reason") or payload.get("message") or "")[:300])
    except Exception:  # noqa: BLE001
        pass
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


@app.get("/api/archive/scale")
def archive_scale_route():
    """How much of Formula 1 the product covers, derived rather than typed.

    Powers the landing page's statistics band. See app/archive_scale.py for why
    this is reference data rather than seventy-six archive requests.
    """
    return archive_scale()


@app.get("/api/featured")
def featured():
    """The most recent completed Grand Prix, as a headline rather than a payload.

    The landing page wants one true fact about one real race: who won it, by how
    much, and the sentence that explains it. Fetching a whole RaceBundle to
    render six values would put a megabyte and a full analysis on the critical
    path of a first impression, so this returns only what is shown — and it is
    cheap, because the session it reads is the same cached one the Race Explorer
    opens on a moment later.

    Never a race that has not been run: `get_current` is the same resolver the
    Explorer uses, and it only ever returns a completed event.
    """
    cur = service.get_current()
    if not cur.get("gp"):
        return {"available": False}
    try:
        bundle = service.get_session(cur["year"], cur["gp"], "Race")
        strategy, _pace = analyze(bundle)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("pitwall_iq").info("featured race unavailable: %s", exc)
        return {"available": False}

    rows = sorted([c for c in bundle.classification if c.position],
                  key=lambda c: c.position or 99)
    win = rows[0] if rows else None
    second = rows[1] if len(rows) > 1 else None
    turn = strategy.turning_points[0] if strategy.turning_points else None

    return {
        "available": bool(win),
        "year": cur["year"],
        "gp": cur["gp"],
        "circuit": bundle.circuit.name if bundle.circuit else None,
        "laps": bundle.total_laps,
        "winner": None if not win else {
            "code": win.driver, "name": win.name, "team": win.team,
            "team_color": win.team_color, "grid": win.grid,
        },
        "margin": (second.gap if second else None),
        "story": (strategy.story or [None])[0],
        "turning_point": None if not turn else {
            "title": turn.title, "lap": getattr(turn, "lap", None),
        },
        "finishers": sum(1 for c in bundle.classification if not c.retired),
        "entries": len(bundle.classification),
        "source": bundle.data_source.value,
    }


@app.get("/api/health/data-sources")
def health_data_sources():
    """Reachability of every real source — powers the Data Sources diagnostics."""
    probes = service.data_source_health()
    return {"probes": [p.model_dump() for p in probes]}


@app.get("/api/debug/archive")
def debug_archive():
    """Settle "is the F1 archive down, or is it us?" in one request.

    The Live source status row can only ever say pass/fail. This returns the raw
    evidence: the exact URL, the HTTP status, the User-Agent we sent, the timing,
    and — crucially — the same request with the library's default agent, so a
    WAF rule on the agent shows up as one passing and one failing. If both
    return the same non-200 the host really is refusing everyone.
    """
    import time
    import requests
    pitwall = load_pitwall()
    from .config import get_settings as _gs

    url = f"{pitwall.STATIC_BASE}/{pitwall_probe_year()}/Index.json"

    def attempt(label: str, ua: str) -> dict:
        t0 = time.perf_counter()
        try:
            resp = requests.get(url, headers={"User-Agent": ua},
                                timeout=_gs().fetch_timeout)
            return {"as": label, "user_agent": ua[:60], "status": resp.status_code,
                    "ms": round((time.perf_counter() - t0) * 1000),
                    "bytes": len(resp.content),
                    "verdict": "ok" if resp.status_code == 200
                               else "refused (host is up)" if resp.status_code in (401, 403)
                               else f"HTTP {resp.status_code}"}
        except Exception as exc:  # noqa: BLE001
            return {"as": label, "user_agent": ua[:60], "status": None,
                    "ms": round((time.perf_counter() - t0) * 1000),
                    "error": f"{type(exc).__name__}: {exc}"[:200],
                    "verdict": "no HTTP response — transport failure"}

    ours = attempt("configured", _gs().archive_user_agent)
    theirs = attempt("library default", "Pitwall/1.0")
    both_fail = ours.get("status") != 200 and theirs.get("status") != 200
    ua_rule = ours.get("status") == 200 and theirs.get("status") in (401, 403)
    return {
        "url": url,
        "attempts": [ours, theirs],
        "conclusion": (
            "A bot rule on the User-Agent — the host is healthy and answers a "
            "browser-shaped request. Keep PITWALL_IQ_ARCHIVE_UA set." if ua_rule
            else "Both agents were refused or failed. The problem is not our "
                 "User-Agent — check the transport errors above." if both_fail
            else "The archive is answering normally."),
    }


def pitwall_probe_year() -> int:
    from .adapters.pitwall_adapter import _probe_year
    return _probe_year()


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
def current_default(response: Response):
    """Current season + latest Grand Prix for Race Explorer to open by default.

    THIS IS NOW THE FIRST THING ON THE CRITICAL PATH. The Explorer used to seed
    its picker with a hard-coded demo race and correct itself when this
    answered, which is why a reader saw the Austrian Grand Prix for a moment on
    every arrival. It waits for the real answer instead — so this call has to be
    cheap, and it is: the calendar behind it is cached upstream-side (see
    app/upstream) and the browser is told it may reuse the answer for a few
    minutes rather than asking again on every navigation.
    """
    response.headers["Cache-Control"] = f"public, max-age={_CURRENT_SEASON_MAX_AGE}"
    return service.get_current()


@app.get("/api/sessions/available")
def sessions_available(year: int = Query(...), gp: str = Query(...)):
    """Which sessions of this Grand Prix have actually been run.

    THE NAME WAS ALWAYS RIGHT AND THE ANSWER WAS ALWAYS THE SCHEDULE. This
    returned `match.sessions` — the calendar's promise — so an unrun race was
    offered the moment its weekend appeared, and when the calendar itself
    could not be loaded it fell through to a hard-coded list of all five,
    which offered a race for *any* Grand Prix including one months away.
    Both are the same mistake: treating scheduled as available.

    `scheduled` still travels alongside, because the countdown and the
    schedule need to show sessions that have NOT run — that is their whole
    job. The two lists are named for what they are.
    """
    data, src = service.get_grands_prix(year)
    match = next((g for g in data if g.name.lower() == gp.lower()
                 or gp.lower() in g.name.lower()), None)
    if match is None:
        # No calendar, no claim. An empty list makes the client show its
        # upcoming/unavailable state; a guessed list makes it fetch a race
        # that may not have been run.
        return {"source": src.value, "year": year, "gp": gp,
                "sessions": [], "scheduled": [], "live": [], "states": {},
                "known": False}
    now = app_schedule.now_utc()
    return {"source": src.value, "year": year, "gp": gp,
            "sessions": match.available_sessions,
            "scheduled": match.sessions,
            # Running right now. A picker that greys these out alongside the
            # ones months away is telling a reader the wrong thing about the
            # session they can currently hear on the television.
            "live": match.live_sessions,
            "states": {s: app_schedule.session_state(match, s, now)
                       for s in (match.sessions or [])},
            "session_times": match.session_times,
            "completed": match.completed, "known": True}


@app.get("/api/schedule")
def schedule_route(year: int | None = Query(None), limit: int = Query(6)):
    """The upcoming calendar: what is next, and what follows it.

    ONE SOURCE OF TRUTH WITH THE AVAILABILITY RULES. The countdown and the
    schedule read this, and this reads the same `session_times` that decide
    whether a session may be loaded — so nothing can be counted down to and
    simultaneously offered as readable, and no date is maintained by hand.

    Cheap by construction: it is the season calendar the Explorer already
    fetches, filtered and sorted. No session payloads are touched.
    """
    from datetime import date as _date

    settings = get_settings()
    year = year or _date.today().year
    now = app_schedule.now_utc()

    def season(y: int):
        try:
            gps, src = service.get_grands_prix(y)
            return gps, src
        except Exception:  # noqa: BLE001
            return [], DataSource.MOCK

    gps, src = season(year)
    # A season that has finished rolls into the next one rather than showing
    # an empty schedule through the winter. A season whose LAST session is
    # running has not finished — rolling over then would have thrown away the
    # live Abu Dhabi race to show an empty next year.
    spent = (not app_schedule.next_session_across(gps, now)
             and not app_schedule.live_now(gps, now))
    if gps and spent:
        nxt_gps, nxt_src = season(year + 1)
        if nxt_gps and app_schedule.next_session_across(nxt_gps, now):
            gps, src, year = nxt_gps, nxt_src, year + 1

    def describe(g, s: str) -> dict:
        start = app_schedule.session_start(g, s)
        end = app_schedule.session_end(g, s)
        return {
            "name": s,
            "start": start and start.isoformat(),
            # Expected, not observed: a scheduled length plus whatever the
            # session actually does. The client says so rather than printing
            # it as a fact.
            "end": end and end.isoformat(),
            # When this stops being live and becomes readable. Sent so the
            # page can turn a session over on the exact second rather than
            # whenever it next asks — see schedule.session_available_at.
            "available_at": (a := app_schedule.session_available_at(g, s)) and a.isoformat(),
            "state": app_schedule.session_state(g, s, now),
            # `available` stays for clients written before there were three
            # states. It is the same answer, narrowed.
            "available": s in g.available_sessions,
        }

    def place(g) -> dict:
        return {"year": year, "round": g.round, "name": g.name,
                "location": g.location, "country": g.country,
                "circuit": g.circuit.name if g.circuit else None,
                "date": g.date}

    events = []
    for g in gps:
        # An event belongs on an upcoming schedule while anything about it is
        # still to come — a session yet to start, OR one running right now.
        # Testing only for the former dropped a Grand Prix off the schedule
        # during its own final session, which is the moment it matters most.
        nxt = app_schedule.next_session(g, now)
        running = app_schedule.live_sessions(g, now)
        if not nxt and not running:
            continue
        events.append({
            **place(g),
            "sessions": [describe(g, s) for s in (g.sessions or [])],
            "next_session": nxt and {"name": nxt[0], "start": nxt[1].isoformat()},
            "live_session": running[0] if running else None,
            "completed": g.completed,
        })
        if len(events) >= max(1, min(limit, 30)):
            break

    # WHAT IS HAPPENING RIGHT NOW, asked once, of the whole season rather than
    # of the trimmed list above — so a live session is never lost to a `limit`.
    # This is the entire basis of the live experience: the same session times
    # the countdown counts down to and the Explorer gates on, so the site
    # cannot call a session live and offer to analyse it in the same breath.
    live = None
    running = app_schedule.live_now(gps, now)
    if running:
        g, name = running
        start = app_schedule.session_start(g, name)
        end = app_schedule.session_end(g, name)
        nxt = app_schedule.next_session(g, now)
        available_at = app_schedule.session_available_at(g, name)
        live = {
            **place(g), "session": name,
            "start": start and start.isoformat(),
            "end": end and end.isoformat(),
            "available_at": available_at and available_at.isoformat(),
            "next_session": nxt and {"name": nxt[0], "start": nxt[1].isoformat()},
            "sessions": [describe(g, s) for s in (g.sessions or [])],
        }

    return {"source": src.value, "year": year, "now": now.isoformat(),
            "mock": settings.mock_mode, "live": live, "events": events}


# --------------------------------------------------------------------------- #
# session bundle (Race Explorer)
# --------------------------------------------------------------------------- #
def _guard_unrun(year: int, gp: str, session_type: str) -> None:
    """Refuse a session that has not been run, before any source is touched.

    A LINK CAN NAME A SESSION THAT DOES NOT EXIST YET. The pickers no longer
    offer one, but a bookmark, a shared URL or a stale tab still can — and the
    old path answered by asking OpenF1, FastF1 and Jolpica in turn for a race
    two days in the future, waiting out every timeout to conclude what the
    calendar already knew. That is the request the reader waits on for nothing.

    So it is answered here, from the calendar, in the same structured shape
    every other unavailable session uses — `future_session` was already the
    right reason code and the right sentence; it simply never fired inside the
    current season, which is exactly where this happens. A missing or
    unreadable calendar refuses nothing: an unknown answer must not become a
    denial.
    """
    try:
        gps, _src = service.get_grands_prix(year)
    except Exception:  # noqa: BLE001 — no calendar, no opinion
        return
    match = next((g for g in gps if g.name.lower() == gp.lower()
                  or gp.lower() in g.name.lower()), None)
    if match is None or not match.sessions:
        return
    if session_type in match.available_sessions:
        return
    # Only refuse what the calendar positively says is still to come. An
    # unrecognised session name is not evidence of anything.
    if session_type not in match.sessions:
        return
    err = DataUnavailableError(year, gp, session_type, attempts=[])
    # A SESSION THAT IS RUNNING IS NOT A SESSION THAT HAS NOT HAPPENED, and
    # answering both with `future_session` is what would have sent a reader
    # who tuned in for Practice 1 to a page saying it had not been run. The
    # refusal is the same — there is genuinely nothing to analyse until the
    # timing is published — but the reason is the truth, and the client turns
    # this one into the live experience rather than an unavailable screen.
    # Retryable, because unlike a future session this one resolves by itself.
    if session_type in match.live_sessions:
        err.reason = "live_session"
        err.retryable = True
        raise err
    err.reason = "future_session"
    err.retryable = False
    raise err


def _bundle(year, gp, session_type, mock, refresh):
    _guard_unrun(year, gp, session_type)
    with timing.phase("load"):
        s = service.get_session(year, gp, session_type, force_mock=mock, refresh=refresh)
    with timing.phase("analyze"):
        strategy, pace = analyze(s)
        practice = compute_practice(s) if s.category == "practice" else None
        qualifying = (compute_qualifying(s)
                      if s.category in ("qualifying", "sprint_qualifying") else None)
    if qualifying is not None and s.data_source != DataSource.MOCK:
        # post-session grid penalties can only be verified against the official
        # starting grid — a lookup, so it stays out of the pure analysis pass
        changes = data_source_manager.quali_grid_changes(s, qualifying.rows)
        if changes:
            qualifying = qualifying.model_copy(update={"grid_changes": changes})
    return s, strategy, pace, practice, qualifying


#: How long a browser may reuse a session bundle without asking again.
#:
#: A GRAND PRIX THAT HAS FINISHED WILL NEVER CHANGE. Re-fetching a quarter of a
#: megabyte to redraw a 2024 race exactly as it was drawn a minute ago is pure
#: latency, and every tab change, back-navigation and re-visit was paying it.
#: The season the sport is currently racing is the one thing here that does
#: move — a session can be re-classified, a penalty applied hours later — so it
#: gets a short window rather than a long one, and `refresh=true` (the Re-run
#: control) always bypasses this entirely by carrying a different URL.
_FINISHED_SEASON_MAX_AGE = 86_400   # a day, for a race that is already history
_CURRENT_SEASON_MAX_AGE = 300       # five minutes, while the season is live


@app.get("/api/session")
def session_bundle(
    response: Response,
    year: int = Query(...), gp: str = Query(...), session: str = Query("Race"),
    mock: bool = Query(False), refresh: bool = Query(False),
):
    timing.start()
    s, strategy, pace, practice, qualifying = _bundle(year, gp, session, mock, refresh)
    if not refresh:
        past = year < settings.default_year
        age = _FINISHED_SEASON_MAX_AGE if past else _CURRENT_SEASON_MAX_AGE
        # `private`: this is per-reader content in the sense that it may be a
        # demo session, and nothing here is worth a shared cache guessing at.
        response.headers["Cache-Control"] = f"private, max-age={age}"
    # WHERE THE TIME WENT, IN THE ONE PLACE A BROWSER ALREADY LOOKS.
    # Chrome renders this under Network -> Timing -> Server Timing, so reading a
    # production request needs no tooling: open the tab and look. Serialization
    # is timed by the middleware, since it happens after this function returns.
    with timing.phase("serialize"):
        payload = {
            "source": s.data_source.value,
            "source_label": service.source_label(s.data_source),
            "category": s.category,
            "session": s.model_dump(),
            "strategy": strategy.model_dump(),
            "pace": [p.model_dump() for p in pace],
            "practice": practice.model_dump() if practice else None,
            "qualifying": qualifying.model_dump() if qualifying else None,
        }
    hdr = timing.header()
    if hdr:
        response.headers["Server-Timing"] = hdr
    return payload


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
        # the remembered upstream documents too — a cache clear that leaves the
        # calendar and standings behind has not cleared the cache
        cleared += upstream.cache_clear()
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
    #: The browser's own anonymous id (a random UUID it keeps in localStorage).
    #: Optional, carries nothing identifying, and is the only way to tell "one
    #: person asked eight questions" from "eight people asked one".
    visitor: str | None = None
    #: The current visit (a random UUID in sessionStorage, rolled over after 30
    #: idle minutes). Without it Ask cannot be joined to the rest of a visit, so
    #: "what share of visits reach Ask" has no answer.
    visit: str | None = None


@app.post("/api/ask")
def ask(body: AskBody):
    """Answer a question, and record how well that went.

    THE RECORDING IS NOT ALLOWED TO CHANGE THE ANSWER. Every analytics call in
    here is wrapped, the outcome is derived from fields the pipeline already
    produced (see app/analytics/classify.py — no second model, no extra latency),
    and the failure paths record and then re-raise exactly as before so the
    reader sees the same 503 or 500 they always did.
    """
    started = time.perf_counter()

    def _record(qa=None, outcome=None, error=None) -> str | None:
        try:
            question = body.question or ""
            # The topic AND, when nothing in the taxonomy fits, the key phrase
            # that lets a new topic emerge from repetition instead of every
            # unrecognised subject collapsing into "Other". See analytics/topics.py.
            topic, hint = ask_classify.classify_topic_full(
                question, getattr(qa, "kind", None),
                getattr(qa, "matched_handler", None),
                getattr(qa, "entities", None))
            return analytics.record_ask(
                question=question,
                question_norm=ask_classify.normalize_question(question),
                outcome=outcome or ask_classify.classify_outcome(
                    kind=getattr(qa, "kind", None),
                    confidence=getattr(qa, "confidence", None),
                    missing=getattr(qa, "missing_data", None),
                    matched=getattr(qa, "matched_handler", None)),
                topic=topic, topic_hint=hint,
                visitor=body.visitor, visit=body.visit,
                year=body.year, gp=body.gp,
                session_type=body.session,
                answer=getattr(qa, "answer", None),
                kind=getattr(qa, "kind", None),
                confidence=getattr(qa, "confidence", None),
                missing=getattr(qa, "missing_data", None),
                matched=getattr(qa, "matched_handler", None),
                used_llm=getattr(qa, "used_llm", None),
                ms=int((time.perf_counter() - started) * 1000),
                error=error)
        except Exception:  # noqa: BLE001
            return None

    try:
        s, strategy, pace, _practice, _qualifying = _bundle(
            body.year, body.gp, body.session, body.mock, False)
        ctx = QAContext(session=s, strategy=strategy, pace=pace)
        qa = answer_question(body.question, ctx, simple=body.simple)
    except DataUnavailableError as exc:
        # Ask never ran: the session itself could not be loaded. That is a real
        # Ask failure from the reader's side and belongs in the same table.
        _record(outcome=ask_classify.NO_DATA, error=str(exc)[:200])
        raise
    except Exception as exc:  # noqa: BLE001
        _record(outcome=ask_classify.FAILED, error=f"{type(exc).__name__}: {exc}"[:200])
        raise

    ref = _record(qa)
    # `ask_ref` is what the thumbs-up/down control sends back. A random handle,
    # not the row id, so it cannot be guessed or enumerated.
    return {"source": s.data_source.value, "category": s.category,
            "ask_ref": ref, **qa.model_dump()}


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
    kind = "constructor" if type == "constructor" else "driver"
    rows, src = history_adapter.get_standings(year, kind)
    # A championship table is a list of people, and it read like a spreadsheet
    # because it had no faces in it. Ergast/Jolpica knows the name; F1's own
    # driver listing knows the portrait; this joins them by name. Only when the
    # app is genuinely allowed to reach the network — demo mode stays offline,
    # and a row with no portrait renders the initials avatar it always did.
    settings = get_settings()
    if kind == "driver" and not settings.mock_mode and settings.enable_live_fetch:
        try:
            faces = headshots.portraits_by_name(year, [r.get("name") for r in rows])
            for r in rows:
                url = faces.get(r.get("name"))
                if url:
                    r["headshot_url"] = url
        except Exception:  # noqa: BLE001
            pass
    # "Nothing came back" and "this season has no championship" look identical
    # in an empty list, and only one of them has a Retry that helps. Every
    # season since 1950 has a championship, so an empty table outside demo mode
    # is the archive not answering — said plainly, in the shape the historical
    # routes already use.
    unavailable = not rows and src != DataSource.MOCK
    return {"source": src.value, "year": year, "type": type, "standings": rows,
            **({"error": "source_unavailable", "retryable": True,
                "message": "The championship table couldn't be read from the archive "
                           "(Jolpica/Ergast) just now."} if unavailable else {})}


@app.get("/api/history/circuit-winners")
def history_circuit(circuit: str = Query(...)):
    rows, src = history_adapter.get_circuit_winners(circuit)
    return {"source": src.value, "circuit": circuit, "winners": rows}


# --------------------------------------------------------------------------- #
# Historical Data Explorer (year / event / session → real results)
# --------------------------------------------------------------------------- #
def _hist_guard(fn, **fields):
    """Run a historical lookup; turn source failures into honest, structured info.

    `**fields` IS NOT DECORATION — IT IS THE TYPE CONTRACT, and getting it wrong
    took the Seasons page down.

    Three of these four routes use `available` as a boolean ("is there a result
    here"). `/api/historical/sessions` uses the same key for a LIST of session
    names. The failure shape below sets `available: False` unconditionally, so
    when Jolpica answered a sessions lookup with 429 the reader's browser got
    HTTP 200 carrying `{"available": false}` where a `string[]` belongs, called
    `.includes()` on a boolean, and threw — a TypeError with no boundary above
    it, which is a blank page rather than the retry card this function exists to
    produce. Two hundred with a lie in it is worse than a five hundred.

    So the fallback fields are passed in by each route and they are applied
    LAST, after the generic shape, which is what makes the sessions route able
    to say `available=[]` and keep the contract its caller was written against.
    """
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
    # `available` here is a list of session names, never a boolean — see the
    # note on _hist_guard for what happened the one time it was one.
    return _hist_guard(lambda: historical.sessions_for(year, event),
                       year=year, event=event, available=[], unavailable=[])


@app.get("/api/historical/results")
def historical_results(year: int = Query(...), event: str = Query(...), session: str = Query("Race")):
    return _hist_guard(lambda: historical.results(year, event, session),
                       year=year, event=event, session=session, rows=[])


# --------------------------------------------------------------------------- #
# Analytics ingest (public, deliberately minimal) and the private dashboard.
# --------------------------------------------------------------------------- #
#: The only event names the browser is allowed to submit. An open ingest is a
#: table anybody can fill with anything; a fixed vocabulary means the worst a
#: stranger can do is skew counts that are already approximate.
_CLIENT_EVENTS = {"page_view", "session_open", "feature_use", "client_error",
                  "visit_start",
                  # How long a feature held someone, and the moment a reader hit
                  # the "session unavailable" screen. The first separates
                  # "opened" from "read"; the second is the only way to see a
                  # dead end from the reader's side rather than the API's.
                  "feature_dwell", "session_unavailable"}
#: And the only features, so `feature` cannot become a free-text column.
_CLIENT_FEATURES = {
    "story", "charts", "strategy", "pace", "compare", "ask", "data", "laps", "runs",
    "position", "tyres", "control", "standings", "championship", "historical",
    "simulate", "settings", "tour", "welcome",
}
_MAX_BATCH = 20


@app.post("/api/signal", status_code=204)
async def signal(request: Request) -> Response:
    """Receive a small batch of client events. Always answers 204.

    ALWAYS. A beacon that can fail visibly is a beacon that can break a page, so
    a malformed body, an unknown event name and a dead database are all the same
    answer: "thank you, nothing to see". Nothing here is authenticated because
    nothing here is readable — this endpoint only ever writes.

    The body is parsed by hand rather than through a Pydantic model so the
    browser can send it with `sendBeacon` as text/plain, which skips the CORS
    preflight. A preflight on a page-unload beacon is a beacon that often does
    not arrive.
    """
    try:
        raw = await request.body()
        payload = json.loads(raw or b"{}")
        events = payload.get("events") or []
        visitor = str(payload.get("visitor") or "")[:64] or None
        visit = str(payload.get("visit") or "")[:64] or None
        for item in events[:_MAX_BATCH]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "")
            if name not in _CLIENT_EVENTS:
                continue
            feature = str(item.get("feature") or "") or None
            if feature and feature not in _CLIENT_FEATURES:
                feature = "other"
            mode = str(item.get("mode") or "") or None
            year = item.get("year")
            # Bounded: a duration the browser reports is still user input, and a
            # fortnight-long "dwell" from a laptop that was asleep would poison
            # every average it lands in. Over an hour is not a reading.
            ms = item.get("ms")
            ms = int(ms) if isinstance(ms, (int, float)) and 0 <= ms <= 3_600_000 else None
            analytics.record(
                name, visitor=visitor, visit=visit, ms=ms,
                path=str(item.get("path") or "") or None,
                year=int(year) if isinstance(year, (int, float, str)) and str(year).isdigit() else None,
                gp=str(item.get("gp") or "") or None,
                session_type=str(item.get("session") or "") or None,
                feature=feature,
                mode=mode if mode in ("simple", "advanced") else None,
                detail=str(item.get("detail") or "") or None)
    except Exception:  # noqa: BLE001 — a beacon never reports a problem
        pass
    return Response(status_code=204)


class FeedbackBody(BaseModel):
    ref: str
    helpful: bool


@app.post("/api/ask/feedback", status_code=204)
def ask_feedback(body: FeedbackBody) -> Response:
    """Thumbs up/down on one Ask answer. `ref` came back with that answer."""
    try:
        analytics.feedback(body.ref, body.helpful)
    except Exception:  # noqa: BLE001
        pass
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
# The feedback box.
#
# THE CONTEXT IS COLLECTED, NOT ASKED FOR. Every report that arrives without a
# page attached costs a round trip to find out where it happened, and readers
# are bad witnesses about routes — "the chart page" is four different screens.
# The browser already knows the path, the tab, the season, the Grand Prix and
# the session, so it sends them, and nobody has to describe where they were.
#
# UNAUTHENTICATED, LIKE /api/signal, AND FOR THE SAME REASON: it only ever
# writes, and there is nothing here to read back. Unlike /api/signal it answers
# with a body, because a person pressed Send and is owed an acknowledgement
# rather than a silent 204.
# --------------------------------------------------------------------------- #
class ReportBody(BaseModel):
    #: "bug" or "suggestion". Anything else is read as a bug — a misspelled
    #: kind must not lose the report.
    kind: str = "bug"
    message: str
    #: Where the reader was. All optional: a report from a page with no session
    #: open is still a report.
    path: str | None = None
    feature: str | None = None
    year: int | None = None
    gp: str | None = None
    session: str | None = None
    mode: str | None = None
    visitor: str | None = None
    visit: str | None = None


@app.post("/api/feedback")
def submit_feedback(body: ReportBody):
    """Record one bug report or suggestion, classified on the way in.

    Never fails for a reason the reader can do anything about. An empty message
    is the one refusal, because there is nothing to store; everything else —
    analytics disabled, database unreachable, a classifier that somehow threw —
    still answers `received`, because the alternative is a person who wrote out
    a paragraph being told to try again with no way to succeed.
    """
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Write something first.")

    kind = triage.normalize_kind(body.kind)
    ref = None
    try:
        area, hint = triage.classify(message, kind)
        ref = analytics.record_feedback(
            kind=kind, message=message,
            area=area, area_hint=hint,
            severity=triage.severity_of(message) if kind == triage.BUG else None,
            junk=triage.is_junk(message),
            visitor=body.visitor, visit=body.visit,
            path=body.path, feature=body.feature,
            year=body.year, gp=body.gp, session_type=body.session,
            mode=body.mode if body.mode in ("simple", "advanced") else None)
    except Exception:  # noqa: BLE001 — recording may never cost the reader
        logging.getLogger("pitwall_iq").warning("feedback record failed", exc_info=True)

    return {"received": True, "ref": ref,
            "kind": kind, "stored": ref is not None}


@app.get("/api/admin/analytics")
def admin_analytics(_ok: bool = Depends(require_admin),
                    range: str = Query("7d"),
                    start: str | None = Query(None),
                    end: str | None = Query(None)):
    """The whole dashboard, in one authenticated call."""
    return analytics_queries.dashboard(range, start, end)


@app.get("/api/admin/analytics/ask")
def admin_analytics_ask(_ok: bool = Depends(require_admin),
                        range: str = Query("7d"),
                        outcome: str | None = Query(None),
                        topic: str | None = Query(None),
                        limit: int = Query(100),
                        start: str | None = Query(None),
                        end: str | None = Query(None)):
    """Browse Ask interactions — the drill-down behind the problems list."""
    return analytics_queries.ask_log(range, outcome, topic, limit, start, end)


@app.get("/api/admin/feedback")
def admin_feedback_log(_ok: bool = Depends(require_admin),
                       range: str = Query("30d"),
                       kind: str | None = Query(None),
                       area: str | None = Query(None),
                       severity: str | None = Query(None),
                       junk: bool = Query(False),
                       limit: int = Query(200),
                       start: str | None = Query(None),
                       end: str | None = Query(None)):
    """Every submitted report, filtered. The drill-down behind the panel."""
    return analytics_queries.feedback_log(range, kind, area, severity,
                                          junk, limit, start, end)


# --------------------------------------------------------------------------- #
# Destructive admin operations.
#
# TWO OPERATIONS, KEPT APART ON PURPOSE. "Clear my analytics" and "clear the
# cached F1 data" sound similar and are nothing alike: one throws away a
# MEASUREMENT that nothing can regenerate, the other throws away a COPY that
# will be re-fetched on demand. Merging them behind one button would mean a
# reader wanting a clean measurement period after spam-testing Ask also,
# silently, made the next twenty session loads take nine seconds each.
#
# THREE THINGS GUARD EACH. The admin token; a typed confirmation phrase that is
# DIFFERENT for each operation, so muscle memory cannot carry you from one to
# the other; and a preview endpoint reporting exactly what would be removed
# BEFORE anything is. The analytics purge can additionally only ever touch the
# tables named in store.ANALYTICS_TABLES.
# --------------------------------------------------------------------------- #
_CONFIRM_ANALYTICS = "DELETE ANALYTICS"
_CONFIRM_CACHE = "CLEAR CACHE"


class AnalyticsResetBody(BaseModel):
    #: Must equal _CONFIRM_ANALYTICS exactly. Typed, not a checkbox.
    confirm: str
    #: A key of store.PURGE_SCOPES — "all", "events", "ask", "feedback",
    #: "bugs" or "suggestions". Validated there, never interpolated here.
    scope: str = "all"
    #: Optional ISO date - delete only rows older than this, which is how you
    #: keep real history and drop a testing session.
    before: str | None = None


@app.get("/api/admin/analytics/inventory")
def admin_analytics_inventory(_ok: bool = Depends(require_admin)):
    """Exactly what is stored and what deleting it would cost, per table."""
    return {
        "analytics": analytics.inventory(),
        "confirm_phrase": _CONFIRM_ANALYTICS,
        "tables": list(analytics.ANALYTICS_TABLES),
        # The dashboard renders its scope menu from this rather than carrying
        # its own copy of the list, so a scope added in store.py appears in the
        # UI without a second edit — and one removed cannot linger there.
        "scopes": [{"key": key, "label": spec["label"]}
                   for key, spec in analytics.PURGE_SCOPES.items()],
        "note": ("Only these analytics tables are affected. Cached F1 session data, "
                 "application configuration and every other table are untouched - "
                 "see /api/admin/cache/inventory for the cache."),
    }


@app.post("/api/admin/analytics/reset")
def admin_analytics_reset(body: AnalyticsResetBody, _ok: bool = Depends(require_admin)):
    """Delete analytics rows. Nothing else, ever."""
    if body.confirm != _CONFIRM_ANALYTICS:
        raise HTTPException(status_code=400,
                            detail='Type "' + _CONFIRM_ANALYTICS + '" exactly to confirm.')
    before = None
    if body.before:
        try:
            before = datetime.fromisoformat(body.before).replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400,
                                detail="`before` must be an ISO date.") from None
    try:
        result = analytics.purge(body.scope, before)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {**result, "scope": body.scope, "before": body.before}


class CacheClearBody(BaseModel):
    confirm: str


@app.get("/api/admin/cache/inventory")
def admin_cache_inventory(_ok: bool = Depends(require_admin)):
    """What the application cache currently holds. Read-only."""
    settings_now = get_settings()
    files = sorted(settings_now.cache_dir.glob("*.json"))
    total_bytes = sum(f.stat().st_size for f in files if f.exists())
    return {
        "sessions": len(files),
        "bytes": total_bytes,
        "mb": round(total_bytes / (1024 * 1024), 2),
        "directory": str(settings_now.cache_dir),
        "confirm_phrase": _CONFIRM_CACHE,
        "note": ("Cached F1 session JSON plus remembered upstream documents "
                 "(calendar, standings). Clearing this loses no analytics and no "
                 "configuration - the data is re-fetched from FastF1/Jolpica on next "
                 "use, which makes the following session loads slow until it refills."),
    }


@app.post("/api/admin/cache/clear")
def admin_cache_clear(body: CacheClearBody, _ok: bool = Depends(require_admin)):
    """Clear cached F1 data. Touches no analytics table.

    The unauthenticated `/api/session/cache/clear` still exists for the Data
    Sources panel's single-session button; this is the whole-cache form, and it
    is behind the admin token because emptying the cache on a live deployment
    makes every subsequent reader pay a cold upstream fetch.
    """
    if body.confirm != _CONFIRM_CACHE:
        raise HTTPException(status_code=400,
                            detail='Type "' + _CONFIRM_CACHE + '" exactly to confirm.')
    cleared = 0
    for f in get_settings().cache_dir.glob("*.json"):
        try:
            f.unlink()
            cleared += 1
        except OSError:
            pass
    cleared += upstream.cache_clear()
    return {"cleared": cleared, "analytics_affected": False}


@app.get("/api/admin/analytics/report")
def admin_analytics_report(_ok: bool = Depends(require_admin),
                           range: str = Query("30d"),
                           format: str = Query("html"),
                           start: str | None = Query(None),
                           end: str | None = Query(None)):
    """A saveable report. `format` is html (printable), md, or json.

    HTML rather than a server-rendered PDF: the browser's print engine already
    makes one, and adding WeasyPrint to a free-tier instance would cost
    cold-start weight on every boot to save a keystroke. See analytics/report.py.
    """
    built = analytics_report.build(range, start, end)
    if format == "json":
        return built
    if format in ("md", "markdown"):
        return Response(content=analytics_report.to_markdown(built),
                        media_type="text/markdown; charset=utf-8")
    return Response(content=analytics_report.to_html(built),
                    media_type="text/html; charset=utf-8")


@app.get("/api/admin/status")
def admin_status(_ok: bool = Depends(require_admin)):
    """Is analytics itself healthy? A dashboard that has silently recorded
    nothing for a week looks exactly like a product nobody is using."""
    return {"analytics": analytics.health(),
            "admin_token_configured": admin_token_configured()}


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
