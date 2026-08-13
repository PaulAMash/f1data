"""
Private product analytics for Pitwall IQ.

WHAT THIS IS FOR. One question: what do people actually do here, and where does
Ask fail them. Not logs, not an event firehose — a small number of meaningful
events, and one rich record per Ask interaction so that "Ask could not answer
this" is a thing you can read rather than a thing you guess at.

THE RULE THAT OUTRANKS EVERY OTHER RULE IN THIS PACKAGE.

    Analytics may never break Pitwall IQ.

Not "should not". May not. Every public function here is total: it swallows its
own exceptions, it never blocks the caller, and it degrades to doing nothing at
all when there is no database configured. A reader asking Ask a question while
the analytics database is unreachable gets their answer, on time, and nobody
tells them anything happened. That is why recording goes through a bounded
in-memory queue drained by a background thread rather than an inline INSERT: an
INSERT can be slow, and slow is a user-visible failure.

WHAT IS NOT COLLECTED, deliberately: no IP addresses, no cookies, no
device/browser fingerprints, no user agents, no referrers, no names, no email.
The only identity is `visitor` — a random UUID the browser generates for itself
and keeps in localStorage. It is derived from nothing, identifies nobody, and
the reader can erase it by clearing site data. See docs/ANALYTICS.md.
"""
from __future__ import annotations

from .store import (  # noqa: F401
    ANALYTICS_TABLES,
    PURGE_SCOPES,
    enabled,
    feedback,
    health,
    inventory,
    purge,
    record,
    record_ask,
    record_feedback,
    setup,
    shutdown,
)
