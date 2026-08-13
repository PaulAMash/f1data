"""
Everything the dashboard shows, in one payload.

ONE ENDPOINT, NOT TWELVE. The dashboard's job is "open it and immediately
understand what is happening", and a page that has to orchestrate a dozen
requests before it can say anything is working against that. The volumes here
are small — a beta with a handful of readers — so the whole board is assembled
server-side in a single call and rendered in one pass.

The SQL is deliberately ordinary: counts, group-bys and a `ts >= ?` bound, so it
runs unchanged on Postgres in production and SQLite on a laptop. The only
differences live in store._Dialect (`day_expr`, placeholder style).

EVERY LITERAL `%` IN A LIKE PATTERN IS WRITTEN `%%`. psycopg scans query text for
its own placeholders whenever parameters are passed and treats a bare `%` as a
malformed one — a 500 in production that no SQLite test can see. That exact bug
took the dashboard down once (V86.1). See tests/test_analytics_sql.py, which
parses every query here with psycopg's own connection-free preparation.

PARAMETER ORDER FOLLOWS THE `?` ORDER IN THE TEXT, not the order the clauses are
thought about in. A `?` in a SELECT list binds BEFORE the window bounds in the
WHERE — appending them (the natural-looking `params + (…)`) silently compares a
column to a timestamp and makes rows vanish.

--------------------------------------------------------------------------- #
WHAT THE NUMBERS MEAN, WHICH IS A DIFFERENT PROBLEM FROM HOW THEY LOOK.

Three counts were wrong in ways that made the dashboard actively misleading, and
no amount of chart work would have fixed them:

  "Errors: 7" was mostly browsers asking for a favicon. Every `api_error` row
      counted equally, so `/favicon.ico HTTP 404`, `/robots.txt HTTP 404` and a
      500 on a session load were the same number. Now an error is only an error
      if it happened on an /api/ route, and 4xx (the caller asked for something
      that is not there) is reported apart from 5xx (we broke).

  A failed session load counted TWICE — once as `session_load_failed` from the
      503 handler, once as `api_error` from the middleware. Fixed at the source
      in main.py: the middleware no longer records a 503 it knows is recorded.

  "p95 17267 ms" read as an emergency and was a cold FastF1 fetch. Endpoints
      whose latency is upstream by nature are labelled and scored against their
      own expectation rather than one global bar.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from . import classify, store, topics, triage

# --------------------------------------------------------------------------- #
# Ranges
# --------------------------------------------------------------------------- #
RANGES = {
    "today": 1, "7d": 7, "30d": 30, "90d": 90, "all": None,
}

#: Endpoints that are slow because something upstream is slow, not because
#: anything is wrong. FastF1 and Jolpica are third-party archives on a cold
#: cache; a session load taking nine seconds once and 40 ms afterwards is the
#: cache working, not a regression. Scored against `_UPSTREAM_BUDGET_MS` so the
#: dashboard stops crying wolf about them.
_UPSTREAM_PREFIXES = ("/api/session", "/api/featured", "/api/historical",
                      "/api/history", "/api/seasons", "/api/compare",
                      "/api/archive")
_NORMAL_BUDGET_MS = 800
_UPSTREAM_BUDGET_MS = 6000


def resolve_range(key: str = "7d", start: str | None = None,
                  end: str | None = None) -> dict:
    """A window, from a preset key or an explicit pair of ISO dates."""
    now = datetime.now(timezone.utc)
    if start or end:
        try:
            frm = datetime.fromisoformat(start).replace(tzinfo=timezone.utc) if start else None
            to = (datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
                  if end else now)
            return {"key": "custom", "from": frm, "to": to,
                    "days": (to - frm).days + 1 if frm else None}
        except (TypeError, ValueError):
            pass   # a malformed date falls back to the default rather than 500s
    key = key if key in RANGES else "7d"
    days = RANGES[key]
    if days is None:
        return {"key": "all", "from": None, "to": now, "days": None}
    if key == "today":
        frm = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        frm = now - timedelta(days=days)
    return {"key": key, "from": frm, "to": now, "days": days}


def _bounds(window: dict) -> tuple[str, tuple]:
    """A WHERE fragment and its parameters for the window."""
    d = store.dialect()
    assert d
    if window["from"] is None:
        return "ts <= ?", (d.ts(window["to"]),)
    return "ts >= ? AND ts <= ?", (d.ts(window["from"]), d.ts(window["to"]))


def _previous(window: dict) -> dict | None:
    """The window immediately before this one, for a comparison figure."""
    if window["from"] is None:
        return None
    span = window["to"] - window["from"]
    return {"key": "previous", "from": window["from"] - span, "to": window["from"],
            "days": window["days"]}


def _scalar(sql: str, params: tuple, default=0):
    rows = store.query(sql, params)
    if not rows or rows[0][0] is None:
        return default
    return rows[0][0]


def _percentile(table: str, column: str, where: str, params: tuple,
                fraction: float) -> int | None:
    """COUNT, then jump to the row at that position. Portable and cheap —
    neither engine agrees on how to spell a percentile function."""
    total = _scalar(f"SELECT COUNT(*) FROM {table} WHERE {where} AND {column} IS NOT NULL",
                    params)
    if not total:
        return None
    offset = max(0, min(total - 1, int(total * fraction)))
    rows = store.query(
        f"SELECT {column} FROM {table} WHERE {where} AND {column} IS NOT NULL "
        f"ORDER BY {column} LIMIT 1 OFFSET {offset}", params)
    return int(rows[0][0]) if rows else None


def _pct(part: float, whole: float, digits: int = 1) -> float:
    return round(100.0 * part / whole, digits) if whole else 0.0


def _top(window: dict, sql: str, keys: tuple[str, ...], limit: int = 10) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(sql.format(where=where, limit=limit), params)
    return [dict(zip(keys, row)) for row in rows]


# --------------------------------------------------------------------------- #
# One definition of "what HTTP code was this".
#
# The `status` column is new; rows already in production do not have one — their
# code lives inside `detail` as the string "HTTP 404". Rather than leave a
# permanent hole in every historical chart, this reads the column when it is
# there and falls back to the text when it is not, so old and new rows compare.
# `%%` because of the psycopg rule at the top of the file.
# --------------------------------------------------------------------------- #
_STATUS = ("CASE WHEN status IS NOT NULL THEN status "
           "     WHEN detail LIKE 'HTTP 4%%' THEN 400 "
           "     WHEN detail LIKE 'HTTP 5%%' THEN 500 "
           "     ELSE 500 END")

#: An error on a path that is not an API route is not a backend error. Browsers
#: ask for /favicon.ico and crawlers ask for /robots.txt on every deployment that
#: has ever existed; counting those as product errors is how the old dashboard
#: reported seven errors on a day when nothing had gone wrong.
_IS_API = "path LIKE '/api/%%'"


# --------------------------------------------------------------------------- #
# Overview
# --------------------------------------------------------------------------- #
def _overview(window: dict) -> dict:
    where, params = _bounds(window)
    visitors = _scalar(
        f"SELECT COUNT(DISTINCT visitor) FROM analytics_event "
        f"WHERE {where} AND visitor IS NOT NULL", params)
    visits = _scalar(
        f"SELECT COUNT(DISTINCT visit) FROM analytics_event "
        f"WHERE {where} AND visit IS NOT NULL", params)
    views = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'page_view'",
        params)
    asks = _scalar(f"SELECT COUNT(*) FROM analytics_ask WHERE {where}", params)
    sessions_opened = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'session_open'",
        params)

    # THE FOUR KINDS OF BAD, KEPT APART. Only three are "a reader was hurt", and
    # only one of those is "we broke it".
    server_errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_error' "
        f"AND {_IS_API} AND {_STATUS} >= 500", params)
    request_errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_error' "
        f"AND {_IS_API} AND {_STATUS} < 500", params)
    noise_errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_error' "
        f"AND NOT ({_IS_API})", params)
    session_failures = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} "
        f"AND name = 'session_load_failed'", params)
    client_errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'client_error'",
        params)
    #: What a reader actually experienced going wrong. Not 404s for a favicon.
    reader_facing = server_errors + session_failures + client_errors

    # A returning visitor is one we had already seen before this window opened.
    returning = 0
    if window["from"] is not None:
        d = store.dialect()
        assert d
        returning = _scalar(
            f"SELECT COUNT(DISTINCT e.visitor) FROM analytics_event e "
            f"WHERE {where} AND e.visitor IS NOT NULL AND EXISTS ("
            f"  SELECT 1 FROM analytics_event p WHERE p.visitor = e.visitor AND p.ts < ?)",
            params + (d.ts(window["from"]),))
    return {
        "visitors": visitors, "visits": visits, "page_views": views,
        "ask_questions": asks, "sessions_opened": sessions_opened,
        "errors": reader_facing,
        "server_errors": server_errors, "request_errors": request_errors,
        "noise_errors": noise_errors,
        "session_failures": session_failures, "client_errors": client_errors,
        "returning_visitors": returning,
        "returning_pct": _pct(returning, visitors),
        "views_per_visit": round(views / visits, 1) if visits else 0.0,
        "asks_per_visit": round(asks / visits, 2) if visits else 0.0,
    }


def _traffic(window: dict) -> list[dict]:
    d = store.dialect()
    assert d
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT {d.day_expr} AS day, COUNT(DISTINCT visitor), "
        f"       SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END), "
        f"       COUNT(DISTINCT visit), "
        f"       SUM(CASE WHEN name = 'session_open' THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN name IN ('client_error', 'session_load_failed') "
        f"                 OR (name = 'api_error' AND {_IS_API} AND {_STATUS} >= 500) "
        f"                THEN 1 ELSE 0 END) "
        f"FROM analytics_event WHERE {where} GROUP BY {d.day_expr} ORDER BY day", params)
    asks = dict(store.query(
        f"SELECT {d.day_expr} AS day, COUNT(*) FROM analytics_ask WHERE {where} "
        f"GROUP BY {d.day_expr}", params))
    return [{"day": r[0], "visitors": r[1] or 0, "views": r[2] or 0,
             "visits": r[3] or 0, "sessions": r[4] or 0, "errors": r[5] or 0,
             "asks": asks.get(r[0], 0)} for r in rows]


# --------------------------------------------------------------------------- #
# Usage
# --------------------------------------------------------------------------- #
#: The product's own vocabulary in human words, so the dashboard stops showing
#: raw event keys ("story", "control") that a reader has to translate.
FEATURE_LABEL = {
    "story": "Race Story", "charts": "Charts", "strategy": "Strategy",
    "pace": "Pace", "compare": "Compare", "ask": "Ask", "data": "Sources",
    "laps": "Lap times", "runs": "Long runs", "position": "Position trace",
    "tyres": "Tyre strategy", "control": "Race Control", "standings": "Standings",
    "championship": "Championship", "historical": "Historical explorer",
    "simulate": "What-if", "settings": "Settings", "tour": "Guided tour",
    "welcome": "Welcome", "other": "Other",
}

PAGE_LABEL = {
    "/": "Home", "/explorer": "Explore", "/history": "Seasons / Historical",
    "/settings": "Settings", "/welcome": "Welcome", "/admin": "Admin",
}


def _usage(window: dict) -> dict:
    features = _top(window,
                    "SELECT feature, COUNT(*) n, COUNT(DISTINCT visit) visits "
                    "FROM analytics_event "
                    "WHERE {where} AND name = 'feature_use' AND feature IS NOT NULL "
                    "GROUP BY feature ORDER BY n DESC LIMIT {limit}",
                    ("feature", "n", "visits"), limit=24)
    for row in features:
        row["label"] = FEATURE_LABEL.get(row["feature"], str(row["feature"]).title())

    pages = _top(window,
                 "SELECT path, COUNT(*) n, COUNT(DISTINCT visit) visits "
                 "FROM analytics_event "
                 "WHERE {where} AND name = 'page_view' AND path IS NOT NULL "
                 "GROUP BY path ORDER BY n DESC LIMIT {limit}",
                 ("path", "n", "visits"))
    for row in pages:
        row["label"] = PAGE_LABEL.get(row["path"], row["path"])

    # HOW LONG A FEATURE HELD SOMEBODY. "Opened" and "read" are different facts,
    # and only this one separates them: a tab everybody clicks and nobody stays
    # on is a naming or content problem that looks identical to a popular tab in
    # a plain use count.
    dwell = _top(window,
                 "SELECT feature, COUNT(*) n, AVG(ms) avg_ms, MAX(ms) max_ms "
                 "FROM analytics_event WHERE {where} AND name = 'feature_dwell' "
                 "AND feature IS NOT NULL AND ms IS NOT NULL "
                 "GROUP BY feature ORDER BY avg_ms DESC LIMIT {limit}",
                 ("feature", "n", "avg_ms", "max_ms"), limit=24)
    for row in dwell:
        row["label"] = FEATURE_LABEL.get(row["feature"], str(row["feature"]).title())
        row["avg_ms"] = int(row["avg_ms"]) if row["avg_ms"] is not None else None
        row["avg_s"] = round((row["avg_ms"] or 0) / 1000.0, 1)

    return {
        "pages": pages,
        "races": _top(window,
                      "SELECT year, gp, COUNT(*) n, COUNT(DISTINCT visitor) people "
                      "FROM analytics_event "
                      "WHERE {where} AND name = 'session_open' AND gp IS NOT NULL "
                      "GROUP BY year, gp ORDER BY n DESC LIMIT {limit}",
                      ("year", "gp", "n", "people"), limit=12),
        "seasons": _top(window,
                        "SELECT year, COUNT(*) n, COUNT(DISTINCT visitor) people "
                        "FROM analytics_event WHERE {where} AND name = 'session_open' "
                        "AND year IS NOT NULL GROUP BY year ORDER BY n DESC LIMIT {limit}",
                        ("year", "n", "people"), limit=12),
        "sessions": _top(window,
                         "SELECT session_type, COUNT(*) n FROM analytics_event "
                         "WHERE {where} AND name = 'session_open' AND session_type IS NOT NULL "
                         "GROUP BY session_type ORDER BY n DESC LIMIT {limit}",
                         ("session_type", "n")),
        "features": features,
        "dwell": dwell,
        "modes": _top(window,
                      "SELECT mode, COUNT(*) n FROM analytics_event "
                      "WHERE {where} AND mode IS NOT NULL "
                      "GROUP BY mode ORDER BY n DESC LIMIT {limit}", ("mode", "n"), limit=4),
        # Current season vs archive — a different question from "which race".
        # `/explorer` is the current-season surface, `/history` the archive; the
        # home page is neither and no longer inflates "current" the way the old
        # catch-all ELSE did.
        "eras": _top(window,
                     "SELECT CASE WHEN path LIKE '/history%%' THEN 'historical' "
                     "            WHEN path LIKE '/explorer%%' THEN 'current' "
                     "            ELSE 'other pages' END era, COUNT(*) n "
                     "FROM analytics_event WHERE {where} AND name = 'page_view' "
                     "GROUP BY era ORDER BY n DESC LIMIT {limit}", ("era", "n"), limit=4),
        "exits": _exits(window),
        "depth": _depth(window),
        "funnel": _funnel(window),
        "repeat_visitors": _repeat_visitors(window),
    }


def _exits(window: dict) -> list[dict]:
    """THE LAST THING SOMEBODY DID BEFORE THEY LEFT. One row per visit, its final
    event — the only way to answer "where do people stop". Feature and page are
    kept apart rather than COALESCEd into one column, because a list mixing
    "story" with "/explorer" is a list nobody can read."""
    rows = _top(window,
                "SELECT name, feature, path, COUNT(*) n FROM ("
                "  SELECT name, feature, path, ROW_NUMBER() OVER "
                "    (PARTITION BY visit ORDER BY ts DESC) rn "
                "  FROM analytics_event WHERE {where} AND visit IS NOT NULL "
                "    AND name IN ('page_view', 'feature_use', 'session_open')"
                ") last WHERE rn = 1 GROUP BY name, feature, path "
                "ORDER BY n DESC LIMIT {limit}",
                ("name", "feature", "path", "n"), limit=12)
    out = []
    for row in rows:
        if row["feature"]:
            what, kind = FEATURE_LABEL.get(row["feature"], str(row["feature"]).title()), "feature"
        elif row["path"]:
            what, kind = PAGE_LABEL.get(row["path"], row["path"]), "page"
        else:
            what, kind = str(row["name"]).replace("_", " "), "event"
        out.append({"what": what, "kind": kind, "n": row["n"]})
    return out


def _depth(window: dict) -> dict:
    """How much of the product a visit actually touched.

    A visit that opened one page and left is a different product from one that
    opened four races and asked three questions, and an average alone hides
    which you have. Buckets, because the distribution IS the finding.
    """
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT n, COUNT(*) FROM ("
        f"  SELECT visit, COUNT(*) n FROM analytics_event "
        f"  WHERE {where} AND visit IS NOT NULL "
        f"    AND name IN ('page_view', 'feature_use', 'session_open') "
        f"  GROUP BY visit) v GROUP BY n ORDER BY n", params)
    buckets = {"1": 0, "2-3": 0, "4-9": 0, "10+": 0}
    total = weighted = 0
    for n, visits in rows:
        n, visits = int(n), int(visits)
        total += visits
        weighted += n * visits
        key = "1" if n == 1 else "2-3" if n <= 3 else "4-9" if n <= 9 else "10+"
        buckets[key] += visits
    return {
        "buckets": [{"bucket": k, "visits": v, "pct": _pct(v, total)}
                    for k, v in buckets.items()],
        "visits": total,
        "avg_actions": round(weighted / total, 1) if total else 0.0,
        "bounce_pct": _pct(buckets["1"], total),
    }


def _funnel(window: dict) -> list[dict]:
    """Visit -> opened a session -> used an analysis feature -> asked Ask.

    The one view that says where the product loses people.

    THE BASE IS THE UNION OF BOTH TABLES, and it has to be. Counting only
    analytics_event let the Ask step exceed 100%: a visit that asked a question
    but whose page views never arrived (an ad blocker eating the beacon, which
    is ordinary — the server-side Ask call cannot be blocked) appears in the
    numerator and not the denominator. Live verification produced "Asked Ask —
    200% of visits", which is the kind of number that discredits every other
    number on the page.
    """
    where, params = _bounds(window)
    visits = _scalar(
        f"SELECT COUNT(*) FROM ("
        f"  SELECT visit FROM analytics_event WHERE {where} AND visit IS NOT NULL "
        f"  UNION "
        f"  SELECT visit FROM analytics_ask WHERE {where} AND visit IS NOT NULL"
        f") all_visits", params + params)
    opened = _scalar(
        f"SELECT COUNT(DISTINCT visit) FROM analytics_event "
        f"WHERE {where} AND visit IS NOT NULL AND name = 'session_open'", params)
    analysed = _scalar(
        f"SELECT COUNT(DISTINCT visit) FROM analytics_event "
        f"WHERE {where} AND visit IS NOT NULL AND name = 'feature_use' "
        f"AND feature NOT IN ('welcome', 'tour', 'settings')", params)
    asked = _scalar(
        f"SELECT COUNT(DISTINCT visit) FROM analytics_ask "
        f"WHERE {where} AND visit IS NOT NULL", params)
    steps = [
        ("Visited", visits, "Any tracked activity in this window."),
        ("Opened a session", opened, "Chose a race and session to look at."),
        ("Used an analysis feature", analysed,
         "Opened Race Story, Charts, Strategy, Pace, Compare or similar."),
        ("Asked Ask", asked,
         "Submitted at least one question. Only counts visits recorded since Ask "
         "began carrying a visit id, so a range reaching further back understates it."),
    ]
    # min() rather than trust: a funnel step above 100% is always a bug in the
    # query, and the union above makes it impossible — but a percentage the
    # reader can see is worth defending twice.
    return [{"step": label, "visits": n, "pct": min(100.0, _pct(n, visits)),
             "help": help_} for label, n, help_ in steps]


def _repeat_visitors(window: dict) -> list[dict]:
    """Visits per visitor — the honest form of "retention" for a product with no
    accounts. One visit is a look; four is a habit."""
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT visits, COUNT(*) FROM ("
        f"  SELECT visitor, COUNT(DISTINCT visit) visits FROM analytics_event "
        f"  WHERE {where} AND visitor IS NOT NULL GROUP BY visitor) v "
        f"GROUP BY visits ORDER BY visits", params)
    buckets = {"1 visit": 0, "2-3 visits": 0, "4+ visits": 0}
    for visits, people in rows:
        visits, people = int(visits), int(people)
        key = "1 visit" if visits == 1 else "2-3 visits" if visits <= 3 else "4+ visits"
        buckets[key] += people
    total = sum(buckets.values())
    return [{"bucket": k, "people": v, "pct": _pct(v, total)} for k, v in buckets.items()]


# --------------------------------------------------------------------------- #
# Performance
# --------------------------------------------------------------------------- #
def _performance(window: dict) -> dict:
    where, params = _bounds(window)
    api_where = f"{where} AND name = 'api_request' AND {_IS_API}"

    endpoints = _top(window,
                     "SELECT path, COUNT(*) n, AVG(ms) avg_ms, MAX(ms) max_ms, "
                     "       SUM(CASE WHEN NOT ok THEN 1 ELSE 0 END) errs "
                     "FROM analytics_event WHERE {where} AND name = 'api_request' "
                     "AND path LIKE '/api/%%' AND ms IS NOT NULL GROUP BY path "
                     "HAVING COUNT(*) >= 2 ORDER BY avg_ms DESC LIMIT {limit}",
                     ("path", "n", "avg_ms", "max_ms", "errs"), limit=16)
    for row in endpoints:
        row["avg_ms"] = int(row["avg_ms"]) if row["avg_ms"] is not None else None
        path = str(row["path"] or "")
        upstream = path.startswith(_UPSTREAM_PREFIXES)
        budget = _UPSTREAM_BUDGET_MS if upstream else _NORMAL_BUDGET_MS
        row["upstream"] = upstream
        row["budget_ms"] = budget
        row["error_pct"] = _pct(row["errs"] or 0, row["n"] or 0)
        over = (row["avg_ms"] or 0) > budget
        row["tone"] = ("bad" if over and (row["errs"] or 0)
                       else "warn" if over else "good")
        # Why this row is slow, in words, so the list stops being numbers the
        # reader has to interpret from scratch every time.
        # The note has to say the RIGHT thing for a fast upstream route too:
        # "slow on a cold cache by design" printed under a 1.6s bar that is well
        # inside a 6s budget reads as an excuse for a problem there isn't one of.
        budget_s = budget // 1000
        if upstream and over:
            row["note"] = f"Slower than {budget_s}s, which is generous even for an upstream fetch"
        elif upstream:
            row["note"] = f"Third-party archive fetch, inside its {budget_s}s budget"
        elif over:
            row["note"] = f"Slower than the {budget}ms this endpoint should take"
        else:
            row["note"] = f"Within its {budget}ms budget"

    # THE ENDPOINT THAT COSTS THE MOST TIME OVERALL, which is not the slowest:
    # one at 9 s called twice matters less than one at 700 ms called four
    # hundred times, and only this figure says which.
    worst = None
    burden = sorted(((r, (r["avg_ms"] or 0) * (r["n"] or 0)) for r in endpoints),
                    key=lambda pair: pair[1], reverse=True)
    if burden and burden[0][1] > 0:
        row, total_ms = burden[0]
        worst = {"path": row["path"], "total_ms": int(total_ms), "n": row["n"],
                 "avg_ms": row["avg_ms"], "upstream": row["upstream"]}

    failures = _top(window,
                    "SELECT path, " + _STATUS + " status, COUNT(*) n, MAX(detail) detail "
                    "FROM analytics_event WHERE {where} AND name = 'api_error' "
                    "GROUP BY path, " + _STATUS + " ORDER BY n DESC LIMIT {limit}",
                    ("path", "status", "n", "detail"), limit=16)
    for row in failures:
        status = int(row["status"] or 500)
        is_api = str(row["path"] or "").startswith("/api/")
        row["is_api"] = is_api
        row["tone"] = "bad" if (status >= 500 and is_api) else "warn" if is_api else "muted"
        row["needs_action"] = status >= 500 and is_api
        row["note"] = ("Server error — this is ours to fix" if status >= 500 and is_api else
                       "Request error — the caller asked for something not there"
                       if is_api else
                       "Not an API route — browser or crawler noise, not a product error")

    requests = _scalar(f"SELECT COUNT(*) FROM analytics_event WHERE {api_where}", params)
    server_errors = _scalar(
        f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_error' "
        f"AND {_IS_API} AND {_STATUS} >= 500", params)
    return {
        "requests": requests,
        "avg_ms": int(_scalar(
            f"SELECT AVG(ms) FROM analytics_event WHERE {api_where} AND ms IS NOT NULL",
            params, 0) or 0),
        "median_ms": _percentile("analytics_event", "ms", api_where, params, 0.5),
        "p95_ms": _percentile("analytics_event", "ms", api_where, params, 0.95),
        "slow_requests": _scalar(
            f"SELECT COUNT(*) FROM analytics_event WHERE {where} AND name = 'api_slow'",
            params),
        "server_errors": server_errors,
        "server_error_pct": _pct(server_errors, requests, 2),
        "endpoints": endpoints,
        "worst_offender": worst,
        "failed": failures,
        "session_failures": _top(window,
                                 "SELECT year, gp, session_type, detail, COUNT(*) n "
                                 "FROM analytics_event WHERE {where} "
                                 "AND name = 'session_load_failed' "
                                 "GROUP BY year, gp, session_type, detail "
                                 "ORDER BY n DESC LIMIT {limit}",
                                 ("year", "gp", "session_type", "detail", "n")),
        "client_errors": _top(window,
                              "SELECT detail, COUNT(*) n FROM analytics_event "
                              "WHERE {where} AND name = 'client_error' "
                              "GROUP BY detail ORDER BY n DESC LIMIT {limit}",
                              ("detail", "n")),
    }


# --------------------------------------------------------------------------- #
# Ask — the point of the exercise
# --------------------------------------------------------------------------- #
def _ask(window: dict) -> dict:
    where, params = _bounds(window)
    yes, no = store._as_bool(True), store._as_bool(False)   # noqa: SLF001

    total = _scalar(f"SELECT COUNT(*) FROM analytics_ask WHERE {where}", params)
    outcomes = {o: 0 for o in classify.OUTCOMES}
    for outcome, n in store.query(
            f"SELECT outcome, COUNT(*) FROM analytics_ask WHERE {where} GROUP BY outcome",
            params):
        key = classify.normalize_outcome(outcome)
        outcomes[key] = outcomes.get(key, 0) + n

    helpful = _scalar(
        f"SELECT COUNT(*) FROM analytics_ask WHERE {where} AND helpful = ?",
        params + (yes,))
    unhelpful = _scalar(
        f"SELECT COUNT(*) FROM analytics_ask WHERE {where} AND helpful = ?",
        params + (no,))
    rated = helpful + unhelpful

    #: Answered, complete, confident — and the reader said no. The one failure
    #: the pipeline cannot detect about itself, and a different problem from
    #: "could not answer": this is a WRONG answer, not a missing one.
    disliked_answers = _scalar(
        f"SELECT COUNT(*) FROM analytics_ask WHERE {where} AND helpful = ? "
        f"AND outcome = ?", params + (no, classify.ANSWERED))

    unresolved = sum(outcomes.get(o, 0) for o in classify.UNRESOLVED)
    f1_questions = total - outcomes.get(classify.OFF_TOPIC, 0)

    return {
        "total": total,
        "f1_questions": f1_questions,
        "outcomes": outcomes,
        "outcome_labels": classify.OUTCOME_LABEL,
        "outcome_help": classify.OUTCOME_HELP,
        "outcome_tones": classify.OUTCOME_TONE,
        "outcome_actions": classify.OUTCOME_ACTION,
        "answered_pct": _pct(outcomes.get(classify.ANSWERED, 0), f1_questions),
        "unresolved": unresolved,
        "unresolved_pct": _pct(unresolved, f1_questions),
        "unresolved_help": classify.UNRESOLVED_HELP,
        "helpful": helpful, "unhelpful": unhelpful, "rated": rated,
        "rated_pct": _pct(rated, total),
        "helpful_pct": _pct(helpful, rated) if rated else None,
        "disliked_answers": disliked_answers,
        "avg_ms": int(_scalar(
            f"SELECT AVG(ms) FROM analytics_ask WHERE {where} AND ms IS NOT NULL",
            params, 0) or 0),
        "p95_ms": _percentile("analytics_ask", "ms", where, params, 0.95),
        "topics": _ask_topics(window),
        "emerging": _emerging_topics(window),
        "gaps": _capability_gaps(window),
        "disliked": _disliked(window),
        "repeats": _repeat_questions(window),
        "recent": _ask_rows(window, limit=60),
    }


def _ask_topics(window: dict) -> list[dict]:
    """Per topic: how many, how well it went, and how people felt about it.

    THE FOUR NUMBERS TOGETHER ARE THE POINT. "People ask about tyres a lot" is
    trivia. "People ask about tyres a lot, we answer 40%, and half the ones we
    do answer get a thumbs down" is a decision.
    """
    where, params = _bounds(window)
    yes, no = store._as_bool(True), store._as_bool(False)   # noqa: SLF001
    unresolved_list = ", ".join(f"'{o}'" for o in classify.UNRESOLVED)
    rows = store.query(
        f"SELECT topic, MIN(topic_hint), COUNT(*), "
        f"       SUM(CASE WHEN outcome = '{classify.ANSWERED}' THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN outcome IN ({unresolved_list}) THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN outcome = '{classify.UNSUPPORTED}' THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN helpful = ? THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN helpful = ? THEN 1 ELSE 0 END) "
        f"FROM analytics_ask WHERE {where} AND outcome <> '{classify.OFF_TOPIC}' "
        f"GROUP BY topic ORDER BY COUNT(*) DESC",
        # The two `helpful = ?` placeholders sit in the SELECT list, so they bind
        # BEFORE the window bounds. See the note at the top of this file.
        (yes, no) + params)
    out = []
    for topic, hint, n, answered, unresolved, unsupported, up, down in rows:
        rated = (up or 0) + (down or 0)
        out.append({
            "topic": topic,
            "label": topics.display_label(topic, hint),
            "n": n,
            "answered": answered or 0,
            "answered_pct": _pct(answered or 0, n),
            "unresolved": unresolved or 0,
            "unresolved_pct": _pct(unresolved or 0, n),
            "unsupported": unsupported or 0,
            "helpful": up or 0, "unhelpful": down or 0, "rated": rated,
            "helpful_pct": _pct(up or 0, rated) if rated else None,
        })
    return out


def _emerging_topics(window: dict) -> list[dict]:
    """Topics the taxonomy does not have yet, discovered from the traffic.

    When `topics.classify` cannot place a question it keeps a key phrase rather
    than discarding it. A phrase appearing once is a person; a phrase appearing
    three times is a SUBJECT, and that is the moment it deserves a row in the
    table in topics.py. This list is that signal, ranked — the mechanism by
    which the taxonomy is supposed to grow.
    """
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT topic_hint, COUNT(*) n, MIN(question), MAX(ts) "
        f"FROM analytics_ask WHERE {where} AND topic_hint IS NOT NULL "
        f"AND topic_hint <> '' AND outcome <> '{classify.OFF_TOPIC}' "
        f"GROUP BY topic_hint HAVING COUNT(*) >= 2 ORDER BY n DESC LIMIT 15", params)
    return [{"phrase": r[0], "label": str(r[0]).title(), "n": r[1],
             "example": r[2], "last_seen": str(r[3])} for r in rows]


def _capability_gaps(window: dict) -> list[dict]:
    """WHAT TO TEACH ASK NEXT.

    Questions about Formula 1, understood as such, that no handler covers —
    grouped by the normalised question so "who had the best strategy" asked five
    times is one line with a 5 beside it, not five lines. Ranked by how many
    people asked, because that is the order to build in.

    This is the most valuable query in the file: a feature backlog written by the
    readers. Before V91 it was scattered through a "recent problems" list that
    mixed it with system errors and cake recipes.
    """
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT COALESCE(question_norm, question) key, COUNT(*) n, "
        f"       MIN(question), MIN(topic), MAX(ts), "
        f"       COUNT(DISTINCT visitor) people, MIN(topic_hint) hint "
        f"FROM analytics_ask WHERE {where} AND outcome = '{classify.UNSUPPORTED}' "
        f"GROUP BY COALESCE(question_norm, question) "
        f"ORDER BY COUNT(*) DESC, MAX(ts) DESC LIMIT 25", params)
    return [{"question": r[2], "n": r[1], "topic": r[3],
             "topic_label": topics.display_label(r[3], r[6]),
             "last_seen": str(r[4]), "people": r[5] or 0} for r in rows]


def _disliked(window: dict) -> list[dict]:
    """Answers the reader rejected. A different list from the gaps above, and
    deliberately so: these are questions Ask DID answer, so the fix is not a new
    handler but a better answer from the one that already ran."""
    where, params = _bounds(window)
    no = store._as_bool(False)                              # noqa: SLF001
    rows = store.query(
        f"SELECT ts, question, outcome, topic, missing, year, gp, session_type, "
        f"       helpful, kind, topic_hint FROM analytics_ask "
        f"WHERE {where} AND helpful = ? ORDER BY ts DESC LIMIT 25", params + (no,))
    return [_ask_row(r) for r in rows]


def _repeat_questions(window: dict) -> list[dict]:
    """Asked more than once, whatever the outcome. High repetition on an answered
    question is a candidate for a starter chip; on an unsupported one it is the
    loudest possible feature request."""
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT COALESCE(question_norm, question) key, COUNT(*) n, MIN(question), "
        f"       MIN(topic), MIN(outcome), COUNT(DISTINCT visitor) people, "
        f"       MIN(topic_hint) hint "
        f"FROM analytics_ask WHERE {where} "
        f"GROUP BY COALESCE(question_norm, question) HAVING COUNT(*) >= 2 "
        f"ORDER BY COUNT(*) DESC LIMIT 20", params)
    return [{"question": r[2], "n": r[1], "topic": r[3],
             "topic_label": topics.display_label(r[3], r[6]),
             "outcome": classify.normalize_outcome(r[4]),
             "outcome_label": classify.OUTCOME_LABEL.get(
                 classify.normalize_outcome(r[4]), r[4]),
             "people": r[5] or 0} for r in rows]


def _ask_rows(window: dict, limit: int = 60) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT ts, question, outcome, topic, missing, year, gp, session_type, "
        f"       helpful, kind, topic_hint FROM analytics_ask WHERE {where} "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    return [_ask_row(r) for r in rows]


def _ask_row(row) -> dict:
    (ts, question, outcome, topic, missing, year, gp, session_type,
     helpful, kind, hint) = row
    try:
        missing_list = json.loads(missing) if missing else []
    except (TypeError, ValueError):
        missing_list = []
    outcome = classify.normalize_outcome(outcome)
    return {
        "ts": str(ts), "question": question, "outcome": outcome,
        "outcome_label": classify.OUTCOME_LABEL.get(outcome, outcome),
        "outcome_tone": classify.OUTCOME_TONE.get(outcome, "muted"),
        "outcome_action": classify.OUTCOME_ACTION.get(outcome, "none"),
        "topic": topic,
        # The extracted phrase IS the topic when the taxonomy had no row for it,
        # so an F1 question about brake temperature reads "Brake Temperature"
        # rather than "Uncategorised" beside an outcome that calls it F1.
        "topic_label": topics.display_label(topic, hint),
        "topic_hint": hint,
        "kind": kind,
        "missing": missing_list,
        "missing_summary": classify.summarize_missing(missing_list),
        "year": year, "gp": gp, "session_type": session_type,
        # WHICH RACE THIS WAS ASKED ABOUT. The columns were always stored and
        # never shown, so a log of sixty questions gave no way to tell a
        # question about Miami from one about Monza — and Ask's answers are
        # scoped to exactly one session, which makes the session half of the
        # question. Pre-assembled here so every surface prints it identically.
        "context": session_context(year, gp, session_type),
        "helpful": None if helpful is None else bool(helpful),
    }


# --------------------------------------------------------------------------- #
# Feedback — what readers wrote down on purpose.
#
# Ask tells you where the product FAILED somebody. Feedback tells you what they
# would have done about it, in their own words, and it is the only signal here
# that arrives already sorted into "this is broken" and "this should exist".
# Those two need different panels for the same reason `gaps` and `disliked` do:
# they are answered by different work.
# --------------------------------------------------------------------------- #
def _feedback(window: dict) -> dict:
    where, params = _bounds(window)
    yes = store._as_bool(True)                              # noqa: SLF001

    total = _scalar(f"SELECT COUNT(*) FROM analytics_feedback WHERE {where}", params)
    junk = _scalar(
        f"SELECT COUNT(*) FROM analytics_feedback WHERE {where} AND junk = ?",
        params + (yes,))

    counts = {k: 0 for k in triage.KINDS}
    for kind, n in store.query(
            f"SELECT kind, COUNT(*) FROM analytics_feedback WHERE {where} "
            f"GROUP BY kind", params):
        if kind in counts:
            counts[kind] = n

    severities = {s: 0 for s in triage.SEVERITY_ORDER}
    for severity, n in store.query(
            f"SELECT severity, COUNT(*) FROM analytics_feedback "
            f"WHERE {where} AND kind = ? AND junk <> ? GROUP BY severity",
            params + (triage.BUG, yes)):
        if severity in severities:
            severities[severity] = n

    return {
        "total": total,
        "bugs": counts.get(triage.BUG, 0),
        "suggestions": counts.get(triage.SUGGESTION, 0),
        # Counted and shown, never silently dropped: a junk rate that climbs is
        # itself worth knowing, and hiding the rows would make the total lie.
        "junk": junk,
        "real": max(0, total - junk),
        "people": _scalar(
            f"SELECT COUNT(DISTINCT visitor) FROM analytics_feedback WHERE {where}",
            params),
        "severities": severities,
        "severity_labels": triage.SEVERITY_LABEL,
        "kind_labels": triage.KIND_LABEL,
        "areas": _feedback_areas(window),
        "emerging": _feedback_emerging(window),
        "recent": _feedback_rows(window, limit=120),
    }


def _feedback_areas(window: dict) -> list[dict]:
    """Per product area: how many reports, split by what kind they are.

    The split is the whole value. Twelve reports about Charts that are all
    suggestions is a popular surface people want more from; twelve that are all
    bugs is a surface that does not work.
    """
    where, params = _bounds(window)
    yes = store._as_bool(True)                              # noqa: SLF001
    rows = store.query(
        f"SELECT area, MIN(area_hint), COUNT(*), "
        f"       SUM(CASE WHEN kind = '{triage.BUG}' THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN kind = '{triage.SUGGESTION}' THEN 1 ELSE 0 END), "
        f"       SUM(CASE WHEN severity = '{triage.HIGH}' THEN 1 ELSE 0 END), "
        f"       MAX(ts) "
        f"FROM analytics_feedback WHERE {where} AND junk <> ? "
        f"GROUP BY area ORDER BY COUNT(*) DESC", params + (yes,))
    return [{"area": r[0], "label": triage.display_area(r[0], r[1]),
             "n": r[2], "bugs": r[3] or 0, "suggestions": r[4] or 0,
             "blocking": r[5] or 0, "last_seen": str(r[6])} for r in rows]


def _feedback_emerging(window: dict) -> list[dict]:
    """Subjects the area taxonomy has no row for, discovered from the reports.

    Same mechanism, and the same threshold, as `_emerging_topics`: once is a
    person, twice is a subject that has earned a row in analytics/triage.py.
    """
    where, params = _bounds(window)
    yes = store._as_bool(True)                              # noqa: SLF001
    rows = store.query(
        f"SELECT area_hint, COUNT(*) n, MIN(message), MAX(ts) "
        f"FROM analytics_feedback WHERE {where} AND junk <> ? "
        f"AND area_hint IS NOT NULL AND area_hint <> '' "
        f"GROUP BY area_hint HAVING COUNT(*) >= 2 ORDER BY n DESC LIMIT 15",
        params + (yes,))
    return [{"phrase": r[0], "label": str(r[0]).title(), "n": r[1],
             "example": r[2], "last_seen": str(r[3])} for r in rows]


_FEEDBACK_COLUMNS = ("ts, ref, kind, message, area, area_hint, severity, junk, "
                     "path, feature, year, gp, session_type, mode")


def _feedback_rows(window: dict, limit: int = 120) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT {_FEEDBACK_COLUMNS} FROM analytics_feedback WHERE {where} "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    return [_feedback_row(r) for r in rows]


def _feedback_row(row) -> dict:
    (ts, ref, kind, message, area, hint, severity, junk,
     path, feature, year, gp, session_type, mode) = row
    kind = triage.normalize_kind(kind)
    return {
        "ts": str(ts), "ref": ref,
        "kind": kind, "kind_label": triage.KIND_LABEL.get(kind, kind),
        "message": message,
        "area": area, "area_label": triage.display_area(area, hint),
        "area_hint": hint,
        "severity": severity,
        "severity_label": triage.SEVERITY_LABEL.get(severity or "", None),
        "junk": bool(junk),
        "path": path, "page": PAGE_LABEL.get(path or "", path),
        "feature": feature,
        "feature_label": FEATURE_LABEL.get(feature or "", feature),
        "year": year, "gp": gp, "session_type": session_type,
        # One string the dashboard and the report can both print without either
        # of them re-deciding what "no session was open" looks like.
        "context": session_context(year, gp, session_type),
        "mode": mode,
    }


# --------------------------------------------------------------------------- #
# WHERE SOMEBODY WAS, AS ONE LINE.
#
# "2026 Miami Grand Prix · Race" is the whole of the context a question or a
# report needs, and it was previously assembled — or not — at each call site.
# The Ask log printed nothing at all, the disliked panel printed a third
# variant, and the report printed a fourth. One function, so a row is legible
# the same way wherever it is shown.
# --------------------------------------------------------------------------- #
def session_context(year, gp, session_type) -> str | None:
    """`2026 Miami Grand Prix · Race`, or None when nothing was open."""
    if not gp and not year:
        return None
    race = " ".join(str(p) for p in (year, gp) if p).strip()
    if not race:
        return None
    return f"{race} · {session_type}" if session_type else race


def _recent(window: dict, limit: int = 40) -> list[dict]:
    where, params = _bounds(window)
    rows = store.query(
        f"SELECT ts, name, path, feature, year, gp, session_type, ok, ms, detail "
        f"FROM analytics_event WHERE {where} AND name NOT IN ('api_request') "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    keys = ("ts", "name", "path", "feature", "year", "gp", "session_type",
            "ok", "ms", "detail")
    out = []
    for row in rows:
        item = dict(zip(keys, row))
        item["ts"] = str(item["ts"])
        item["ok"] = None if item["ok"] is None else bool(item["ok"])
        item["label"] = FEATURE_LABEL.get(item["feature"] or "", item["feature"])
        out.append(item)
    return out


# --------------------------------------------------------------------------- #
# Verdicts — the three sentences to read first.
#
# A dashboard whose top row is six bare counts makes the reader do the
# comparison themselves, every time, from memory. These do it once: each returns
# good / warn / bad AND the reason, so the headline is a judgement rather than a
# measurement, and the measurement is right there when the judgement surprises.
# --------------------------------------------------------------------------- #
def _n(count: int, singular: str, plural: str | None = None) -> str:
    """"1 visit", not "1 visits". A generated sentence that cannot count reads as
    generated, and a reader who notices stops trusting the number in front of
    it — which is the whole job of a verdict."""
    word = singular if count == 1 else (plural or singular + "s")
    return f"{count} {word}"


def _verdicts(overview: dict, ask: dict, performance: dict) -> dict:
    err_pct = performance["server_error_pct"]
    failures = overview["session_failures"]
    if performance["requests"] == 0:
        backend = ("unknown", "No API traffic in this window.")
    elif err_pct >= 2 or performance["server_errors"] >= 10:
        backend = ("bad", f"{_n(performance['server_errors'], 'server error')} "
                          f"({err_pct}% of requests).")
    elif performance["server_errors"] or failures >= 5:
        backend = ("warn", f"{_n(performance['server_errors'], 'server error')}, "
                           f"{_n(failures, 'session load')} failed.")
    else:
        backend = ("good", "No server errors across "
                           f"{_n(performance['requests'], 'API request')}.")

    f1 = ask["f1_questions"]
    if f1 == 0:
        asked = ("unknown", "No questions asked in this window.")
    elif ask["answered_pct"] < 40:
        asked = ("bad", f"Only {ask['answered_pct']}% of F1 questions answered "
                        f"outright — {ask['outcomes'].get(classify.UNSUPPORTED, 0)} "
                        f"are not supported yet.")
    elif ask["answered_pct"] < 70 or (ask["helpful_pct"] is not None
                                      and ask["helpful_pct"] < 60):
        asked = ("warn", f"{ask['answered_pct']}% answered outright; "
                         f"{_n(ask['unresolved'], 'question')} still unresolved.")
    else:
        asked = ("good", f"{ask['answered_pct']}% of F1 questions answered outright.")

    visits = overview["visits"]
    if visits == 0:
        product = ("unknown", "No visits recorded in this window.")
    elif overview["errors"] > max(3, visits * 0.25):
        product = ("bad", f"{_n(overview['errors'], 'reader-facing error')} across "
                          f"{_n(visits, 'visit')}.")
    elif overview["errors"]:
        product = ("warn", f"{_n(overview['errors'], 'reader-facing error')} across "
                           f"{_n(visits, 'visit')}.")
    else:
        product = ("good", f"{_n(visits, 'visit')}, "
                           f"{_n(overview['page_views'], 'page view')}, "
                           "no reader-facing errors.")

    return {
        "product": {"state": product[0], "note": product[1]},
        "ask": {"state": asked[0], "note": asked[1]},
        "backend": {"state": backend[0], "note": backend[1]},
    }


# --------------------------------------------------------------------------- #
# What to work on next
# --------------------------------------------------------------------------- #
def priorities(data: dict, limit: int = 8) -> list[dict]:
    """A ranked to-do list, derived rather than felt.

    SCORING. Each candidate carries an impact estimate in the only currency the
    analytics have: how many readers hit it. A capability gap five people asked
    for outranks one person's; a broken thing outranks both, because a broken
    thing costs more than a missing one. Everything is explainable — every entry
    names the number it came from, so a priority you disagree with can be argued
    with rather than merely overridden.
    """
    if not data.get("available"):
        return []
    ask = data.get("ask") or {}
    perf = data.get("performance") or {}
    overview = data.get("overview") or {}
    out: list[dict] = []

    # 1. Things that are broken beat things that are missing.
    if perf.get("server_errors"):
        out.append({
            "score": 100 + perf["server_errors"],
            "kind": "reliability", "severity": "high",
            "title": f"Fix {perf['server_errors']} server error"
                     f"{'' if perf['server_errors'] == 1 else 's'}",
            "why": f"{perf['server_error_pct']}% of API requests returned 5xx. "
                   "Readers saw a failure, not a slow page.",
            "evidence": [f"{f['path']} — {f['n']}x (HTTP {f['status']})"
                         for f in (perf.get("failed") or [])
                         if f.get("needs_action")][:4],
        })
    if overview.get("session_failures"):
        top = (perf.get("session_failures") or [])[:3]
        out.append({
            "score": 80 + overview["session_failures"],
            "kind": "reliability", "severity": "high",
            "title": f"{overview['session_failures']} session load"
                     f"{'' if overview['session_failures'] == 1 else 's'} failed",
            "why": "A reader chose a race and got an error instead of a session. "
                   "Usually the upstream archive, but it is still a dead end.",
            "evidence": [f"{s.get('year') or ''} {s.get('gp') or '?'} "
                         f"{s.get('session_type') or ''} — {s.get('detail') or 'unknown'}"
                         .strip() for s in top],
        })
    if overview.get("client_errors"):
        out.append({
            "score": 70 + overview["client_errors"],
            "kind": "reliability", "severity": "medium",
            "title": f"{overview['client_errors']} client-side error"
                     f"{'' if overview['client_errors'] == 1 else 's'}",
            "why": "The browser error boundary caught something. These are bugs in "
                   "the frontend, invisible in the API logs.",
            "evidence": [f"{c.get('detail') or 'unknown'} — {c['n']}x"
                         for c in (perf.get("client_errors") or [])][:4],
        })

    # 2. Capability gaps — the readers' own feature requests, ranked by demand.
    #    Capped at four: every gap outscores every other category by
    #    construction, so an uncapped slice turns a mixed priority list into a
    #    single-category one and hides the reliability and taxonomy entries the
    #    ranking exists to interleave. The full list is still on the dashboard.
    for gap in (ask.get("gaps") or [])[:4]:
        askers = gap.get("people") or 1
        out.append({
            "score": 40 + gap["n"] * 5 + askers * 3,
            "kind": "ask capability", "severity": "medium",
            "title": f"Teach Ask: “{gap['question']}”",
            "why": f"Asked {gap['n']}x by {askers} "
                   f"{'person' if askers == 1 else 'people'} and no handler covers "
                   f"it. Topic: {gap['topic_label']}.",
            "evidence": [],
        })

    # 3. Answers people rejected — a wrong answer, not a missing one.
    if ask.get("disliked_answers"):
        out.append({
            "score": 55 + ask["disliked_answers"] * 4,
            "kind": "ask quality", "severity": "medium",
            "title": f"{ask['disliked_answers']} complete answer"
                     f"{'' if ask['disliked_answers'] == 1 else 's'} marked unhelpful",
            "why": "Ask matched a handler, answered confidently, and the reader said "
                   "no. The handler is wrong or the answer misses the point — a "
                   "different fix from adding a capability.",
            "evidence": [f"“{d['question']}” ({d['topic_label']})"
                         for d in (ask.get("disliked") or [])][:4],
        })

    # 4. Topics that fail more than they succeed.
    for topic in (ask.get("topics") or []):
        if topic["n"] >= 3 and topic["unresolved_pct"] >= 50:
            out.append({
                "score": 30 + topic["unresolved"] * 4,
                "kind": "ask capability", "severity": "medium",
                "title": f"{topic['label']}: {topic['unresolved_pct']}% unresolved",
                "why": f"{_n(topic['n'], 'question')} about {topic['label'].lower()}, only "
                       f"{topic['answered']} answered outright. A whole subject Ask "
                       "is weak at, rather than one missing question.",
                "evidence": [],
            })

    # 5. Emerging topics — the taxonomy asking to be extended.
    for topic in (ask.get("emerging") or [])[:3]:
        out.append({
            "score": 25 + topic["n"] * 3,
            "kind": "taxonomy", "severity": "low",
            "title": f"New topic forming: “{topic['label']}”",
            "why": f"{_n(topic['n'], 'question')} share this phrase, and the taxonomy "
                   "has no permanent row for it. Worth adding to the table in "
                   "analytics/topics.py so it survives beyond this window.",
            "evidence": [f"e.g. “{topic['example']}”"],
        })

    # 6. Performance, but only when it is not simply an upstream fetch.
    worst = perf.get("worst_offender")
    if worst and not worst.get("upstream") and (worst.get("avg_ms") or 0) > 800:
        out.append({
            "score": 35,
            "kind": "performance", "severity": "medium",
            "title": f"{worst['path']} costs the most time overall",
            "why": f"{worst['n']} calls averaging {worst['avg_ms']} ms — "
                   f"{round(worst['total_ms'] / 1000)}s of reader waiting in this "
                   "window, and it is not an upstream fetch.",
            "evidence": [],
        })

    # 7. Nothing wrong? Then say what to grow.
    if not out:
        out.append({
            "score": 1, "kind": "growth", "severity": "low",
            "title": "Nothing is broken — get more traffic through Ask",
            "why": f"{overview.get('visits', 0)} visits and "
                   f"{overview.get('ask_questions', 0)} questions in this window. The "
                   "capability-gap list only becomes useful once people are asking, "
                   "so the bottleneck is reach, not the product.",
            "evidence": [],
        })

    out.sort(key=lambda item: item["score"], reverse=True)
    return out[:limit]



# --------------------------------------------------------------------------- #
# The whole board
# --------------------------------------------------------------------------- #
def dashboard(range_key: str = "7d", start: str | None = None,
              end: str | None = None) -> dict:
    window = resolve_range(range_key, start, end)
    if not store.enabled():
        return {
            "available": False,
            "reason": ("No analytics database is configured on this deployment. "
                       "Set DATABASE_URL (Render Postgres) and redeploy."),
            "health": store.health(),
            "range": _range_out(window),
        }
    overview = _overview(window)
    performance = _performance(window)
    ask = _ask(window)
    payload = {
        "available": True,
        "range": _range_out(window),
        "health": store.health(),
        "overview": overview,
        "verdicts": _verdicts(overview, ask, performance),
        "traffic": _traffic(window),
        "usage": _usage(window),
        "performance": performance,
        "ask": ask,
        "feedback": _feedback(window),
        "recent": _recent(window),
    }
    # Ranked LAST, because it reads the finished payload. The dashboard and the
    # saved report therefore agree by construction rather than by two lists
    # happening to be scored the same way.
    payload["priorities"] = priorities(payload)
    prev = _previous(window)
    payload["previous"] = _overview(prev) if prev else None
    return payload


def ask_log(range_key: str = "7d", outcome: str | None = None,
            topic: str | None = None, limit: int = 100,
            start: str | None = None, end: str | None = None) -> dict:
    """Browse Ask interactions — the drill-down behind every Ask panel."""
    window = resolve_range(range_key, start, end)
    if not store.enabled():
        return {"available": False, "rows": [], "range": _range_out(window)}
    where, params = _bounds(window)
    if outcome in classify.OUTCOMES:
        where += " AND outcome = ?"
        params = params + (outcome,)
    if topic:
        where += " AND topic = ?"
        params = params + (topic,)
    limit = max(1, min(500, int(limit)))
    rows = store.query(
        f"SELECT ts, question, outcome, topic, missing, year, gp, session_type, "
        f"       helpful, kind, topic_hint FROM analytics_ask WHERE {where} "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    return {"available": True, "range": _range_out(window),
            "rows": [_ask_row(r) for r in rows]}


def feedback_log(range_key: str = "30d", kind: str | None = None,
                 area: str | None = None, severity: str | None = None,
                 include_junk: bool = False, limit: int = 200,
                 start: str | None = None, end: str | None = None) -> dict:
    """Browse submitted feedback — the drill-down behind the feedback panel.

    Junk is EXCLUDED by default and included on request rather than deleted, so
    the default view is signal and the noise is still auditable. Every filter is
    matched against a known vocabulary before it reaches SQL; an unrecognised
    value is dropped rather than passed through.
    """
    window = resolve_range(range_key, start, end)
    if not store.enabled():
        return {"available": False, "rows": [], "range": _range_out(window)}
    where, params = _bounds(window)
    if kind in triage.KINDS:
        where += " AND kind = ?"
        params = params + (kind,)
    if area:
        where += " AND area = ?"
        params = params + (area,)
    if severity in triage.SEVERITY_ORDER:
        where += " AND severity = ?"
        params = params + (severity,)
    if not include_junk:
        where += " AND junk <> ?"
        params = params + (store._as_bool(True),)           # noqa: SLF001
    limit = max(1, min(500, int(limit)))
    rows = store.query(
        f"SELECT {_FEEDBACK_COLUMNS} FROM analytics_feedback WHERE {where} "
        f"ORDER BY ts DESC LIMIT {limit}", params)
    return {"available": True, "range": _range_out(window),
            "rows": [_feedback_row(r) for r in rows]}


def _range_out(window: dict) -> dict:
    return {
        "key": window["key"], "days": window["days"],
        "from": window["from"].isoformat() if window["from"] else None,
        "to": window["to"].isoformat(),
    }
