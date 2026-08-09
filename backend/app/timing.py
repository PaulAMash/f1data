"""
Where a session request actually spends its time.

V84 opened with a question nobody could answer from the outside: a production
page took 30-60 seconds and the candidate explanations — cold start, slow
upstream, heavy processing, big payload — were indistinguishable from a
stopwatch on the browser. Every one of them produces "the page took a minute".

So the server says where the time went, in a form the browser already knows how
to display. `Server-Timing` is a standard response header and Chrome renders it
in DevTools -> Network -> (request) -> Timing, under "Server Timing", with no
tooling and no build flags. Reading a production request becomes: open the tab,
click the request, look.

Deliberately cheap: a monotonic clock and a list of (name, ms) pairs per
request. No sampling, no aggregation, no storage — this is a diagnostic that
must never itself become a reason the request is slow.
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from contextvars import ContextVar

# Per-request, and safe under the threadpool FastAPI runs sync endpoints in.
_phases: ContextVar[list[tuple[str, float]] | None] = ContextVar("_phases", default=None)


def start() -> None:
    """Begin collecting for this request."""
    _phases.set([])


def record(name: str, ms: float) -> None:
    buf = _phases.get()
    if buf is not None:
        buf.append((name, ms))


@contextmanager
def phase(name: str):
    """Time a named span. Records even when the body raises, because a step
    that failed slowly is exactly the one worth seeing."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        record(name, (time.perf_counter() - t0) * 1000)


def collected() -> list[tuple[str, float]]:
    return list(_phases.get() or [])


def header() -> str:
    """The phases as a Server-Timing header value.

    Names are collapsed so repeated steps (three sources tried in turn) add up
    rather than overwrite — the total for a phase is what a reader wants first.
    """
    totals: dict[str, float] = {}
    order: list[str] = []
    for name, ms in collected():
        if name not in totals:
            order.append(name)
            totals[name] = 0.0
        totals[name] += ms
    return ", ".join(f'{n};dur={totals[n]:.1f}' for n in order)
