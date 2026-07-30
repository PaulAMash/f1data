"""One plain-English explanation of a failed network probe, shared by every source.

A probe exists to tell someone what to do next. This does not::

    HTTPSConnectionPool(host='api.openf1.org', port=443): Max retries exceeded
    with url: /v1/sessions?year=2024&session_name=Race (Caused by ProxyError('Unable to conne

It is a stack-trace fragment, truncated mid-word, shown to an end user — which
the app promises never to do — and it hides the one fact that decides who fixes
it: whether the failure happened on this machine (DNS, TLS, a corporate proxy)
or at the other end (down, slow, refusing us).

The F1 archive got a human explanation when its outage was investigated; OpenF1
and Jolpica kept the raw exception, so a single panel spoke two languages. This
module is that explanation, once, for all of them.
"""
from __future__ import annotations

from ..config import get_settings


def transport_detail(exc: Exception, host: str) -> str:
    """Name a connection failure in terms of who can fix it.

    `host` is the service's own hostname so the message can point at the right
    thing — "DNS could not resolve api.openf1.org" is actionable in a way that
    "connection error" never is.
    """
    name = type(exc).__name__
    msg = str(exc).lower()
    if "timed out" in msg or "timeout" in name.lower():
        return (f"timed out after {get_settings().probe_timeout}s — "
                f"{host} is slow or dropping packets")
    if "name or service not known" in msg or "nodename" in msg or "getaddrinfo" in msg:
        return f"DNS could not resolve {host} — a resolver problem on this machine"
    # order matters: a proxy that rejects CONNECT often reports through the TLS
    # layer, and "your proxy blocked it" is the more useful of the two answers
    if "proxy" in msg or "407" in msg or "tunnel" in msg:
        return f"blocked by an HTTP proxy before the request reached {host}"
    if "certificate" in msg or "ssl" in msg:
        return "TLS handshake failed — a proxy or certificate problem on this machine"
    if "refused" in msg:
        return f"{host} refused the connection — nothing is listening"
    if "max retries" in msg or "connection" in msg:
        return f"could not open a connection to {host}"
    return f"{name}: {exc}"[:160]


def http_detail(code: int, host: str) -> str:
    """Explain a non-200 answer.

    An HTTP status means the host is UP and talking to us. Reporting that as
    "unreachable" is a lie, and it is the lie that once cost two days of looking
    for an outage that was really a bot rule on our User-Agent.
    """
    if code in (401, 403):
        return (f"HTTP {code} — {host} is up but refused this request. "
                "Usually a bot/WAF rule on the User-Agent, not an outage.")
    if code == 404:
        return f"HTTP {code} — {host} is up but this path is gone; the API may have moved."
    if code == 429:
        return f"HTTP {code} — rate limited by {host}. Back off and retry."
    if 500 <= code < 600:
        return f"HTTP {code} — {host} is up but erroring. Their side."
    return f"HTTP {code} from {host}"
