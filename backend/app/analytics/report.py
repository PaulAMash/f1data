"""
The analytics, as something you can keep.

WHY A SERVER-RENDERED DOCUMENT RATHER THAN A PDF LIBRARY. Rendering a PDF in
Python means WeasyPrint or ReportLab: a large dependency, native libraries, and
a second layout engine to maintain alongside the dashboard's — on a free Render
instance where cold-start weight is already the thing that made session loads
slow (V84). A self-contained HTML document with print rules gets a PDF out of
the browser's own engine with Ctrl-P, looks the same on screen and on paper,
opens on a phone, and costs nothing at rest.

AUTHENTICATION SURVIVES IT. The document is fetched with the admin token like
every other admin call and handed to a blob URL by the page, so the secret never
travels as a URL that could be shared, bookmarked or logged.

WHAT MAKES IT WORTH GENERATING. Not the tables — those are on the dashboard. The
last section: a ranked, generated answer to "what should I work on next", built
from the same numbers rather than from an impression of them. That is the part
that is hard to do by eye and easy to do from data.
"""
from __future__ import annotations

import html
from datetime import datetime, timezone

from . import classify
from .queries import dashboard, priorities


# --------------------------------------------------------------------------- #
# Renderers
# --------------------------------------------------------------------------- #
def build(range_key: str = "30d", start: str | None = None,
          end: str | None = None) -> dict:
    """The report as data. Both renderers below read only this."""
    data = dashboard(range_key, start, end)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "range": data.get("range"),
        "available": data.get("available", False),
        "reason": data.get("reason"),
        "overview": data.get("overview"),
        "verdicts": data.get("verdicts"),
        "usage": data.get("usage"),
        "performance": data.get("performance"),
        "ask": data.get("ask"),
        # WHAT READERS ASKED FOR IN THEIR OWN WORDS.
        #
        # This is the section the report exists for. Every other number here
        # describes behaviour and has to be interpreted; a bug report is already
        # a sentence about what to do, written by the person it happened to. A
        # report that carried the analytics and left the feedback in a dashboard
        # nobody exports would be a planning document missing its agenda.
        "feedback": data.get("feedback"),
        # Already ranked inside the dashboard payload; recomputing here would
        # be a second source of truth for the same list.
        "priorities": data.get("priorities") or priorities(data),
    }


def _feedback_split(report: dict) -> tuple[list[dict], list[dict]]:
    """Real bugs and real suggestions, most recent first.

    Junk is dropped from BOTH — a saved report is a planning document, and the
    keyboard-mashing is available on the dashboard for anyone who wants to audit
    it. The counts in the summary still include it, so the total never lies.
    """
    rows = (report.get("feedback") or {}).get("recent") or []
    real = [r for r in rows if not r.get("junk")]
    return ([r for r in real if r.get("kind") == "bug"],
            [r for r in real if r.get("kind") == "suggestion"])


def _s(n) -> str:
    """The plural "s", or nothing. A report that says "1 questions" reads as
    generated, and a reader who notices that stops trusting the numbers."""
    return "" if n == 1 else "s"


def _e(value) -> str:
    return html.escape(str(value if value is not None else "—"))


def _rows(items: list[dict], columns: list[tuple[str, str]]) -> str:
    if not items:
        return '<tr><td colspan="99" class="empty">Nothing recorded.</td></tr>'
    return "".join(
        "<tr>" + "".join(f"<td>{_e(item.get(key))}</td>" for key, _ in columns) + "</tr>"
        for item in items)


def _table(title: str, items: list[dict], columns: list[tuple[str, str]],
           note: str = "") -> str:
    head = "".join(f"<th>{_e(label)}</th>" for _, label in columns)
    note_html = f'<p class="note">{_e(note)}</p>' if note else ""
    return (f'<div class="block"><h3>{_e(title)}</h3>{note_html}'
            f'<table><thead><tr>{head}</tr></thead>'
            f'<tbody>{_rows(items, columns)}</tbody></table></div>')


def to_html(report: dict) -> str:
    """A self-contained, printable document. No external anything."""
    if not report.get("available"):
        body = (f'<p class="empty">'
                f'{_e(report.get("reason") or "Analytics is not configured.")}</p>')
        return _SHELL.format(title="Pitwall IQ analytics report", body=body,
                             generated=_e(report["generated_at"]), range_label="—")

    o = report["overview"] or {}
    ask = report["ask"] or {}
    perf = report["performance"] or {}
    usage = report["usage"] or {}
    fb = report.get("feedback") or {}
    fb_bugs, fb_ideas = _feedback_split(report)
    rng = report["range"] or {}
    range_label = f'{(rng.get("from") or "the beginning")[:10]} → {(rng.get("to") or "")[:10]}'

    def stat(label: str, value, hint: str = "") -> str:
        return (f'<div class="stat"><span class="k">{_e(label)}</span>'
                f'<span class="v">{_e(value)}</span>'
                f'{f"<span class=h>{_e(hint)}</span>" if hint else ""}</div>')

    verdicts = "".join(
        f'<div class="verdict {v["state"]}"><strong>{_e(name.title())}</strong>'
        f'<span>{_e(v["note"])}</span></div>'
        for name, v in (report.get("verdicts") or {}).items())

    priority_html = "".join(
        f'<li class="pri {p["severity"]}"><div class="pri-t">{_e(p["title"])}</div>'
        f'<div class="pri-w">{_e(p["why"])}</div>'
        + ("<ul class='ev'>" + "".join(f"<li>{_e(e)}</li>" for e in p["evidence"])
           + "</ul>" if p.get("evidence") else "")
        + "</li>"
        for p in report.get("priorities") or [])

    outcome_rows = [
        {"outcome": classify.OUTCOME_LABEL.get(key, key),
         "n": ask.get("outcomes", {}).get(key, 0),
         "meaning": classify.OUTCOME_HELP.get(key, "")}
        for key in classify.OUTCOMES]

    body = f"""
    <section class="hero"><div class="verdicts">{verdicts}</div></section>

    <h2>Product usage</h2>
    <div class="stats">
      {stat("Visitors", o.get("visitors"), f'{o.get("returning_pct", 0)}% returning')}
      {stat("Visits", o.get("visits"), f'{o.get("views_per_visit", 0)} pages each')}
      {stat("Page views", o.get("page_views"))}
      {stat("Sessions opened", o.get("sessions_opened"))}
      {stat("Ask questions", o.get("ask_questions"), f'{o.get("asks_per_visit", 0)} per visit')}
      {stat("Reader-facing errors", o.get("errors"))}
    </div>
    {_table("Most viewed pages", usage.get("pages") or [],
            [("label", "Page"), ("n", "Views"), ("visits", "Visits")])}
    {_table("Most viewed races", usage.get("races") or [],
            [("year", "Season"), ("gp", "Grand Prix"), ("n", "Opens"), ("people", "People")])}
    {_table("Seasons viewed", usage.get("seasons") or [],
            [("year", "Season"), ("n", "Opens"), ("people", "People")])}
    {_table("Most viewed sessions", usage.get("sessions") or [],
            [("session_type", "Session"), ("n", "Opens")])}
    {_table("Most used features", usage.get("features") or [],
            [("label", "Feature"), ("n", "Uses"), ("visits", "Visits")])}
    {_table("Time spent per feature", usage.get("dwell") or [],
            [("label", "Feature"), ("avg_s", "Avg seconds"), ("n", "Samples")],
            "Separates a feature people open from one they actually read.")}
    {_table("Simple vs Advanced", usage.get("modes") or [],
            [("mode", "Mode"), ("n", "Events")])}
    {_table("Where visits ended", usage.get("exits") or [],
            [("what", "Last thing seen"), ("kind", "Kind"), ("n", "Visits")],
            "The final tracked action of each visit.")}
    {_table("Engagement funnel", usage.get("funnel") or [],
            [("step", "Step"), ("visits", "Visits"), ("pct", "% of visits")])}

    <h2 class="page-break">Ask intelligence</h2>
    <div class="stats">
      {stat("Questions", ask.get("total"))}
      {stat("About F1", ask.get("f1_questions"))}
      {stat("Answered outright", f'{ask.get("answered_pct", 0)}%')}
      {stat("Unresolved", ask.get("unresolved"),
            f'{ask.get("unresolved_pct", 0)}% of F1 questions')}
      {stat("Rated helpful", ask.get("helpful"))}
      {stat("Rated unhelpful", ask.get("unhelpful"),
            f'{ask.get("helpful_pct")}% helpful' if ask.get("helpful_pct") is not None else "")}
    </div>
    {_table("Outcomes", outcome_rows,
            [("outcome", "Outcome"), ("n", "Questions"), ("meaning", "What it means")])}
    {_table("What people ask about", ask.get("topics") or [],
            [("label", "Topic"), ("n", "Questions"), ("answered_pct", "Answered %"),
             ("unresolved", "Unresolved"), ("helpful", "Up"), ("unhelpful", "Down")])}
    {_table("What to teach Ask next", ask.get("gaps") or [],
            [("question", "Question"), ("n", "Times asked"), ("people", "People"),
             ("topic_label", "Topic")],
            "F1 questions Ask understood but no handler covers.")}
    {_table("Answers marked unhelpful", ask.get("disliked") or [],
            [("question", "Question"), ("context", "Where"), ("topic_label", "Topic"),
             ("outcome_label", "Outcome")],
            "Ask answered these; the reader disagreed.")}
    {_table("Every question", ask.get("recent") or [],
            [("question", "Question"), ("context", "Grand Prix / session"),
             ("topic_label", "Topic"), ("outcome_label", "Outcome")],
            "Most recent first. The Grand Prix and session are the ones the "
            "reader had open — Ask answers from that session's data alone.")}
    {_table("Emerging topics", ask.get("emerging") or [],
            [("label", "Phrase"), ("n", "Questions"), ("example", "Example")],
            "Recurring subjects the taxonomy does not cover yet.")}
    {_table("Repeatedly asked", ask.get("repeats") or [],
            [("question", "Question"), ("n", "Times"), ("outcome_label", "Outcome")])}

    <h2 class="page-break">What readers reported</h2>
    <div class="stats">
      {stat("Submissions", fb.get("total"))}
      {stat("Bug reports", fb.get("bugs"))}
      {stat("Suggestions", fb.get("suggestions"))}
      {stat("Blocking bugs", (fb.get("severities") or {}).get("high"),
            "reported as unusable")}
      {stat("People", fb.get("people"))}
      {stat("Discarded", fb.get("junk"), "no report in them")}
    </div>
    {_table("Bug reports", fb_bugs,
            [("message", "Report"), ("severity_label", "Severity"),
             ("area_label", "Area"), ("context", "Grand Prix / session"),
             ("page", "Page")],
            "Everything readers said was broken, most recent first.")}
    {_table("Suggestions", fb_ideas,
            [("message", "Suggestion"), ("area_label", "Area"),
             ("context", "Grand Prix / session"), ("page", "Page")],
            "Feature requests and improvements, in the reader's own words.")}
    {_table("Where the reports are", fb.get("areas") or [],
            [("label", "Area"), ("n", "Reports"), ("bugs", "Bugs"),
             ("suggestions", "Suggestions"), ("blocking", "Blocking")],
            "An area with many bugs is a surface that does not work; one with "
            "many suggestions is a surface people want more from.")}
    {_table("Emerging subjects", fb.get("emerging") or [],
            [("label", "Phrase"), ("n", "Reports"), ("example", "Example")],
            "Recurring subjects the area taxonomy does not cover yet.")}

    <h2 class="page-break">Performance</h2>
    <div class="stats">
      {stat("API requests", perf.get("requests"))}
      {stat("Median", f'{perf.get("median_ms")} ms')}
      {stat("p95", f'{perf.get("p95_ms")} ms')}
      {stat("Server errors", perf.get("server_errors"),
            f'{perf.get("server_error_pct", 0)}%')}
      {stat("Session load failures", o.get("session_failures"))}
      {stat("Slow responses", perf.get("slow_requests"))}
    </div>
    {_table("Endpoints", perf.get("endpoints") or [],
            [("path", "Endpoint"), ("n", "Calls"), ("avg_ms", "Avg ms"),
             ("max_ms", "Max ms"), ("error_pct", "Error %"), ("note", "Assessment")],
            "Upstream archive fetches are judged against a higher budget than "
            "internal endpoints — slow is not the same as wrong.")}
    {_table("Failed requests", perf.get("failed") or [],
            [("path", "Path"), ("status", "Status"), ("n", "Count"), ("note", "Assessment")])}
    {_table("Session load failures", perf.get("session_failures") or [],
            [("year", "Season"), ("gp", "Grand Prix"), ("session_type", "Session"),
             ("detail", "Reason"), ("n", "Count")])}

    <h2 class="page-break">What to work on next</h2>
    <ol class="priorities">{priority_html or '<li class="pri low">Nothing to flag.</li>'}</ol>
    """
    return _SHELL.format(title="Pitwall IQ analytics report", body=body,
                         generated=_e(report["generated_at"]), range_label=_e(range_label))


def to_markdown(report: dict) -> str:
    """The same report as text — for pasting into an issue, a note, or a prompt
    when the next round of Ask work gets planned."""
    if not report.get("available"):
        return f"# Pitwall IQ analytics\n\n{report.get('reason') or 'Not configured.'}\n"
    o = report["overview"] or {}
    ask = report["ask"] or {}
    perf = report["performance"] or {}
    usage = report["usage"] or {}
    rng = report["range"] or {}
    lines = [
        "# Pitwall IQ analytics report", "",
        f"Generated {report['generated_at']} · "
        f"{(rng.get('from') or 'the beginning')[:10]} → {(rng.get('to') or '')[:10]}",
        "", "## Verdicts",
    ]
    for name, v in (report.get("verdicts") or {}).items():
        lines.append(f"- **{name.title()}** — {v['state'].upper()}: {v['note']}")

    lines += [
        "", "## Product usage", "",
        f"- Visitors: {o.get('visitors')} ({o.get('returning_pct')}% returning)",
        f"- Visits: {o.get('visits')} · {o.get('views_per_visit')} pages each",
        f"- Page views: {o.get('page_views')}",
        f"- Sessions opened: {o.get('sessions_opened')}",
        f"- Ask questions: {o.get('ask_questions')} ({o.get('asks_per_visit')} per visit)",
        f"- Reader-facing errors: {o.get('errors')}",
        "", "### Most viewed races", "",
    ]
    for row in (usage.get("races") or [])[:5]:
        lines.append(f"- {row.get('year')} {row.get('gp')} — {row.get('n')}")
    lines += ["", "### Most used features", ""]
    for row in (usage.get("features") or [])[:8]:
        lines.append(f"- {row.get('label')} — {row.get('n')}")

    lines += [
        "", "## Ask intelligence", "",
        f"- Questions: {ask.get('total')} ({ask.get('f1_questions')} about F1)",
        f"- Answered outright: {ask.get('answered_pct')}%",
        f"- Unresolved: {ask.get('unresolved')} ({ask.get('unresolved_pct')}%)",
        f"- Feedback: {ask.get('helpful')} up / {ask.get('unhelpful')} down",
        "", "### Outcomes", "",
    ]
    for key in classify.OUTCOMES:
        lines.append(f"- {classify.OUTCOME_LABEL[key]}: "
                     f"{ask.get('outcomes', {}).get(key, 0)} — {classify.OUTCOME_HELP[key]}")

    lines += ["", "### What people ask about", ""]
    for t in (ask.get("topics") or [])[:15]:
        lines.append(f"- {t['label']}: {t['n']} question{_s(t['n'])}, "
                     f"{t['answered_pct']}% answered, {t['unresolved']} unresolved")

    lines += ["", "### What to teach Ask next", ""]
    for gap in (ask.get("gaps") or [])[:10]:
        lines.append(f"- \"{gap['question']}\" — asked {gap['n']}x by "
                     f"{gap['people']} {'person' if gap['people'] == 1 else 'people'} "
                     f"({gap['topic_label']})")
    if not ask.get("gaps"):
        lines.append("- Nothing outstanding.")

    lines += ["", "### Answers marked unhelpful", ""]
    for row in (ask.get("disliked") or [])[:10]:
        where = f" — {row['context']}" if row.get("context") else ""
        lines.append(f"- \"{row['question']}\"{where} — "
                     f"{row['outcome_label']} ({row['topic_label']})")
    if not ask.get("disliked"):
        lines.append("- None.")

    lines += ["", "### Every question", "",
              "The Grand Prix and session are the ones the reader had open.", ""]
    for row in (ask.get("recent") or [])[:60]:
        where = row.get("context") or "no session open"
        lines.append(f"- \"{row['question']}\"  \n  {where} · "
                     f"{row['topic_label']} · {row['outcome_label']}")
    if not ask.get("recent"):
        lines.append("- None.")

    # --- feedback ---------------------------------------------------------- #
    fb = report.get("feedback") or {}
    fb_bugs, fb_ideas = _feedback_split(report)
    sev = fb.get("severities") or {}
    lines += [
        "", "## What readers reported", "",
        f"- Submissions: {fb.get('total', 0)} from {fb.get('people', 0)} "
        f"{'person' if fb.get('people') == 1 else 'people'}",
        f"- Bug reports: {fb.get('bugs', 0)} "
        f"({sev.get('high', 0)} blocking, {sev.get('medium', 0)} degraded, "
        f"{sev.get('low', 0)} cosmetic)",
        f"- Suggestions: {fb.get('suggestions', 0)}",
        f"- Discarded as having no report in them: {fb.get('junk', 0)}",
        "", "### Bug reports", "",
    ]
    for row in fb_bugs[:40]:
        where = " · ".join(p for p in (row.get("page"), row.get("context")) if p)
        lines.append(f"- **[{row.get('severity_label') or 'Unrated'}] "
                     f"{row.get('area_label')}** — \"{row['message']}\"")
        if where:
            lines.append(f"  - {where}")
    if not fb_bugs:
        lines.append("- None.")

    lines += ["", "### Suggestions", ""]
    for row in fb_ideas[:40]:
        where = " · ".join(p for p in (row.get("page"), row.get("context")) if p)
        lines.append(f"- **{row.get('area_label')}** — \"{row['message']}\"")
        if where:
            lines.append(f"  - {where}")
    if not fb_ideas:
        lines.append("- None.")

    lines += ["", "### Where the reports are", ""]
    for row in (fb.get("areas") or [])[:15]:
        lines.append(f"- {row['label']}: {row['n']} report{_s(row['n'])} "
                     f"({row['bugs']} bug{_s(row['bugs'])}, "
                     f"{row['suggestions']} suggestion{_s(row['suggestions'])})")
    if not fb.get("areas"):
        lines.append("- Nothing reported yet.")

    lines += [
        "", "## Performance", "",
        f"- API requests: {perf.get('requests')}",
        f"- Median {perf.get('median_ms')} ms · p95 {perf.get('p95_ms')} ms",
        f"- Server errors: {perf.get('server_errors')} ({perf.get('server_error_pct')}%)",
        f"- Session load failures: {o.get('session_failures')}",
        "", "## What to work on next", "",
    ]
    for i, p in enumerate(report.get("priorities") or [], 1):
        lines.append(f"{i}. **{p['title']}** — {p['why']}")
        for e in p.get("evidence") or []:
            lines.append(f"   - {e}")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# The document shell. Print rules included: this is meant to become a PDF.
# --------------------------------------------------------------------------- #
_SHELL = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{
    --ink: #12151a; --muted: #5a6472; --faint: #8a94a3; --line: #e3e7ee;
    --bg: #ffffff; --panel: #f7f9fc;
    --good: #0d8a5f; --warn: #b2740b; --bad: #c0392b; --accent: #d92b3a;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  .wrap {{ max-width: 950px; margin: 0 auto; padding: 40px 28px 64px; }}
  header {{ border-bottom: 3px solid var(--accent); padding-bottom: 14px; margin-bottom: 26px; }}
  h1 {{ margin: 0; font-size: 26px; letter-spacing: -0.4px; }}
  header p {{ margin: 6px 0 0; color: var(--muted); font-size: 12.5px; }}
  h2 {{ font-size: 18px; margin: 34px 0 12px; padding-bottom: 6px;
    border-bottom: 1px solid var(--line); }}
  h3 {{ font-size: 13px; margin: 0 0 8px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); }}
  .verdicts {{ display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }}
  .verdict {{ border: 1px solid var(--line); border-left-width: 4px; border-radius: 8px;
    padding: 10px 12px; background: var(--panel); }}
  .verdict strong {{ display: block; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.06em; margin-bottom: 3px; }}
  .verdict span {{ font-size: 12.5px; color: var(--muted); }}
  .verdict.good {{ border-left-color: var(--good); }} .verdict.good strong {{ color: var(--good); }}
  .verdict.warn {{ border-left-color: var(--warn); }} .verdict.warn strong {{ color: var(--warn); }}
  .verdict.bad {{ border-left-color: var(--bad); }}  .verdict.bad strong {{ color: var(--bad); }}
  .verdict.unknown {{ border-left-color: var(--faint); }}
  .verdict.unknown strong {{ color: var(--faint); }}
  .stats {{ display: grid; gap: 10px; grid-template-columns: repeat(6, 1fr); margin-bottom: 6px; }}
  .stat {{ border: 1px solid var(--line); border-radius: 8px; padding: 10px 11px; }}
  .stat .k {{ display: block; font-size: 10.5px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--faint); }}
  .stat .v {{ display: block; font-size: 21px; font-weight: 700;
    font-variant-numeric: tabular-nums; }}
  .stat .h {{ display: block; font-size: 11px; color: var(--muted); }}
  .block {{ margin-top: 20px; break-inside: avoid; }}
  .note {{ margin: -4px 0 8px; font-size: 12px; color: var(--faint); }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
  th {{ text-align: left; font-size: 10.5px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--faint); border-bottom: 1px solid var(--line);
    padding: 5px 8px 5px 0; font-weight: 600; }}
  td {{ padding: 5px 8px 5px 0; border-bottom: 1px solid var(--panel);
    vertical-align: top; font-variant-numeric: tabular-nums; }}
  td:first-child {{ font-variant-numeric: normal; }}
  .empty {{ color: var(--faint); font-style: italic; }}
  .priorities {{ padding-left: 20px; }}
  .pri {{ margin-bottom: 14px; break-inside: avoid; }}
  .pri-t {{ font-weight: 650; }}
  .pri-w {{ color: var(--muted); font-size: 12.5px; }}
  .pri.high .pri-t {{ color: var(--bad); }}
  .pri.medium .pri-t {{ color: var(--warn); }}
  .ev {{ margin: 4px 0 0; padding-left: 16px; color: var(--faint); font-size: 12px; }}
  footer {{ margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--line);
    font-size: 11.5px; color: var(--faint); }}
  @media print {{
    .wrap {{ padding: 0; max-width: none; }}
    .page-break {{ break-before: page; }}
    body {{ font-size: 11.5px; }}
    .stats {{ grid-template-columns: repeat(3, 1fr); }}
  }}
  @media (max-width: 760px) {{
    .verdicts, .stats {{ grid-template-columns: repeat(2, 1fr); }}
  }}
</style>
</head><body><div class="wrap">
<header>
  <h1>Pitwall IQ — analytics report</h1>
  <p>{range_label} · generated {generated} UTC · private</p>
</header>
{body}
<footer>
  Visitor counts are approximate by design: identity is a random id each browser
  generates for itself, so clearing site data or switching device counts as a new
  visitor. No IP addresses, cookies or fingerprints are collected.
</footer>
</div></body></html>
"""
