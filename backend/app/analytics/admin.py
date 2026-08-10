"""
Who is allowed to read the analytics.

THE CONSTRAINT THAT DECIDED THIS. The frontend is a fully static Next export
served from Cloudflare — every route prerenders to HTML, there is no server-side
rendering, no middleware and no API route at runtime. So there is no such thing
as "protecting the /admin page": that page ships as public HTML like every other
page. What can be protected is the DATA, and that is where all of it lives. The
dashboard is an empty shell until an authenticated request fills it.

One secret, in one environment variable, compared in constant time. No user
table, no password hashing, no session store, no JWT — there is exactly one
administrator and none of that machinery would make a single-admin dashboard
safer than a 256-bit random string does. It would just be more code with a
larger attack surface, protecting the same one page.

TWO DEFAULTS THAT MATTER:

  * An unset token disables the admin API completely — every route answers 503,
    not 200. A deployment that has not been configured yet must expose nothing,
    which is the opposite of what "no token configured" naturally does if you
    write the check the obvious way round.

  * A wrong token and an absent token are the same answer, and both are compared
    with `secrets.compare_digest`, so neither the response nor the time taken to
    produce it says anything about how close a guess was.
"""
from __future__ import annotations

import secrets

from fastapi import Header, HTTPException

from ..config import get_settings

#: Long enough that guessing is not a strategy. Refuses to run below it, because
#: a four-character admin token is worse than none: it looks like security.
MIN_TOKEN_LENGTH = 24


def admin_token_configured() -> bool:
    token = (get_settings().admin_token or "").strip()
    return len(token) >= MIN_TOKEN_LENGTH


def require_admin(authorization: str | None = Header(default=None),
                  x_admin_token: str | None = Header(default=None)) -> bool:
    """FastAPI dependency. Raises 401/503; returns True when the caller is me.

    Accepts either `Authorization: Bearer <token>` or `X-Admin-Token: <token>`.
    Two headers because a browser fetch sends whichever is convenient and curl
    users reach for the other; the check is identical.
    """
    configured = (get_settings().admin_token or "").strip()
    if len(configured) < MIN_TOKEN_LENGTH:
        # Not "unauthorized" — unavailable. There is nothing to be authorized
        # against, and saying so plainly is what tells a deploy it is misconfigured
        # rather than leaving somebody guessing at a 401.
        raise HTTPException(
            status_code=503,
            detail=("The analytics dashboard is not configured on this deployment. "
                    f"Set PITWALL_IQ_ADMIN_TOKEN to a random secret of at least "
                    f"{MIN_TOKEN_LENGTH} characters."))

    presented = ""
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            presented = parts[1].strip()
    if not presented and x_admin_token:
        presented = x_admin_token.strip()

    # compare_digest on both branches: returning early for an empty credential
    # would make "no token" measurably faster than "wrong token".
    ok = secrets.compare_digest(presented or "", configured)
    if not ok:
        raise HTTPException(status_code=401, detail="Not authorized.")
    return True
