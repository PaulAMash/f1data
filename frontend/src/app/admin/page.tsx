"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, BarChart3, KeyRound, LogOut, MessageSquareText, RefreshCw, Timer,
} from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { API_BASE } from "@/lib/api";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE PRIVATE DASHBOARD.                                                     */
/*                                                                            */
/* This page is public HTML and that is fine, because it contains no data —   */
/* only the shape of some. The frontend is a static export on Cloudflare, so   */
/* there is no server here to check anything; every number on this screen      */
/* arrives from an endpoint that refuses to answer without the admin token,    */
/* and until one is supplied this is a login box and nothing else.             */
/*                                                                            */
/* The token is typed once and kept in this browser's localStorage. It is      */
/* never in the build, never in the page source, and never sent anywhere but   */
/* the Pitwall IQ API as an Authorization header.                              */
/*                                                                            */
/* DESIGNED FOR ONE PERSON, WHO ALREADY KNOWS WHAT THE PRODUCT IS. So: the     */
/* answer first, the explanation only where a number is genuinely ambiguous,   */
/* and no chart that a list would tell you faster. The whole board is one      */
/* request; the ranges re-request it.                                          */
/* -------------------------------------------------------------------------- */

const TOKEN_KEY = "pitwall.admin";
const RANGES: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try { setToken(localStorage.getItem(TOKEN_KEY)); } catch { /* private mode */ }
  }, []);

  const load = useCallback(async (tk: string, rangeKey: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics?range=${rangeKey}`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (res.status === 401) throw new Error("That token was not accepted.");
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Analytics is not configured on this deployment.");
      }
      if (!res.ok) throw new Error(`The API answered ${res.status}.`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || "Could not reach the API.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) void load(token, range); }, [token, range, load]);

  function signIn() {
    const tk = entry.trim();
    if (!tk) return;
    try { localStorage.setItem(TOKEN_KEY, tk); } catch { /* ignore */ }
    setToken(tk);
    setEntry("");
  }

  function signOut() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setToken(null); setData(null); setError(null);
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-base-850/60 p-6">
          <KeyRound size={20} className="text-accent-soft" />
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">
            Pitwall IQ analytics
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Private. Paste the admin token to continue — it is kept in this browser
            and sent only to the Pitwall IQ API.
          </p>
          <input
            type="password" value={entry} autoFocus
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signIn()}
            placeholder="Admin token"
            className="mt-4 w-full rounded-lg border border-white/10 bg-base-900/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/40" />
          <button onClick={signIn} disabled={!entry.trim()}
            className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-pure disabled:opacity-40">
            Open dashboard
          </button>
          {error && <p className="mt-3 text-xs text-amber">{error}</p>}
        </div>
      </div>
    );
  }

  const o = data?.overview;
  const prev = data?.previous;
  const ask = data?.ask;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
              Private
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Pitwall IQ analytics
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={cx("px-2.5 py-1.5 text-xs font-medium transition-colors",
                    range === r.key ? "bg-accent/15 text-accent-soft"
                                    : "text-ink-muted hover:bg-white/[0.04]")}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={() => token && load(token, range)} className="pill-btn h-8 text-xs">
              <RefreshCw size={13} className={cx(loading && "animate-spin")} /> Refresh
            </button>
            <button onClick={signOut} className="pill-btn h-8 text-xs text-ink-faint">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        {error && (
          <Panel tone="warn">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="mt-px shrink-0 text-amber" />
              <div>
                <p className="text-sm font-medium text-ink">Couldn&rsquo;t load analytics</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{error}</p>
              </div>
            </div>
          </Panel>
        )}

        {data && data.available === false && (
          <Panel tone="warn">
            <p className="text-sm font-medium text-ink">Analytics is not recording yet</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{data.reason}</p>
          </Panel>
        )}

        {data?.available && (
          <div className="space-y-5">
            {/* ---- the five numbers -------------------------------------- */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Visitors" value={o.visitors} prev={prev?.visitors} />
              <Stat label="Visits" value={o.visits} prev={prev?.visits} />
              <Stat label="Page views" value={o.page_views} prev={prev?.page_views} />
              <Stat label="Ask questions" value={o.ask_questions} prev={prev?.ask_questions} />
              <Stat label="Returning" value={o.returning_visitors}
                    hint={`${o.returning_pct}% of visitors`} />
              <Stat label="Errors" value={o.errors} prev={prev?.errors} bad />
            </div>

            {/* ---- ASK, first, because it is the point ------------------- */}
            <Section title="Ask" icon={<MessageSquareText size={15} />}
              note={`${ask.total} question${ask.total === 1 ? "" : "s"} · ${ask.answered_pct}% answered outright`}>
              <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                <div>
                  <Bars items={[
                    ["Answered", ask.outcomes.answered, "bg-speed"],
                    ["Partial", ask.outcomes.partial, "bg-amber"],
                    ["Could not answer", ask.outcomes.unanswered, "bg-rose-400"],
                    ["Data unavailable", ask.outcomes.data_unavailable, "bg-sky-400"],
                    ["System error", ask.outcomes.error, "bg-rose-500"],
                  ]} total={ask.total} />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-muted">
                    <span>👍 {ask.helpful}</span>
                    <span>👎 {ask.unhelpful}</span>
                    {ask.helpful_pct !== null && ask.rated > 0 && (
                      <span className="text-ink">{ask.helpful_pct}% of {ask.rated} rated helpful</span>
                    )}
                    <span>avg {ask.avg_ms} ms</span>
                  </div>
                </div>
                <div>
                  <Label>What people ask about</Label>
                  {ask.topics.length === 0 && <Empty>No questions yet.</Empty>}
                  <ul className="mt-1.5 space-y-1">
                    {ask.topics.map((t: any) => (
                      <li key={t.topic} className="flex items-center gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate text-ink">{t.label}</span>
                        <span className="tabular-nums text-ink-muted">{t.n}</span>
                        {/* the number that tells you what to build next */}
                        {t.unresolved > 0 && (
                          <span className="tabular-nums text-[11.5px] text-amber"
                            title="asked, but Ask could not fully answer">
                            {t.unresolved} unresolved
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {ask.problems.length > 0 && (
                <div className="mt-5">
                  <Label>Where Ask fell short — most recent</Label>
                  <ul className="mt-2 space-y-1.5">
                    {ask.problems.map((p: any, i: number) => (
                      <li key={i} className="rounded-lg border border-white/[0.05] bg-base-800/40 px-3 py-2">
                        <p className="text-[13.5px] text-ink">&ldquo;{p.question}&rdquo;</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
                          <span className={cx("font-medium",
                            p.outcome === "answered" ? "text-speed"
                              : p.outcome === "partial" ? "text-amber" : "text-rose-400")}>
                            → {p.outcome_label}
                          </span>
                          {p.missing_summary && (
                            <span className="text-ink-faint">Missing: {p.missing_summary}</span>
                          )}
                          <span className="text-ink-faint">{p.topic_label}</span>
                          {p.gp && <span className="text-ink-faint">{p.year} {p.gp} · {p.session_type}</span>}
                          {p.helpful === false && <span className="text-rose-400">marked unhelpful</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* ---- usage ------------------------------------------------- */}
            <Section title="Usage" icon={<BarChart3 size={15} />}>
              <Traffic rows={data.traffic} />
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <TopList title="Most viewed races" rows={data.usage.races}
                  render={(r: any) => `${r.year} ${r.gp}`} />
                <TopList title="Most viewed sessions" rows={data.usage.sessions}
                  render={(r: any) => r.session_type} />
                <TopList title="Most used features" rows={data.usage.features}
                  render={(r: any) => r.feature} />
                <TopList title="Pages" rows={data.usage.pages} render={(r: any) => r.path} />
                <TopList title="Simple vs Advanced" rows={data.usage.modes}
                  render={(r: any) => r.mode} />
                <TopList title="Last thing before leaving" rows={data.usage.exits}
                  render={(r: any) => r.what} />
              </div>
            </Section>

            {/* ---- performance ------------------------------------------- */}
            <Section title="Performance" icon={<Timer size={15} />}
              note={`${data.performance.requests} API requests · median ${data.performance.median_ms ?? "—"} ms · p95 ${data.performance.p95_ms ?? "—"} ms`}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <TopList title="Slowest endpoints" rows={data.performance.slowest}
                  render={(r: any) => r.path} value={(r: any) => `${r.avg_ms} ms`} />
                <TopList title="Failed requests" rows={data.performance.failed}
                  render={(r: any) => `${r.path} ${r.detail ?? ""}`} />
                <TopList title="Session load failures" rows={data.performance.session_failures}
                  render={(r: any) => `${r.year ?? ""} ${r.gp ?? "?"} · ${r.detail ?? ""}`} />
                <TopList title="Client errors" rows={data.performance.client_errors}
                  render={(r: any) => r.detail ?? "unknown"} />
              </div>
            </Section>

            {/* ---- recent ------------------------------------------------ */}
            <Section title="Recent activity" icon={<Activity size={15} />}>
              {data.recent.length === 0 && <Empty>Nothing recorded in this window.</Empty>}
              <ul className="space-y-0.5">
                {data.recent.map((e: any, i: number) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                    <span className="w-36 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                      {String(e.ts).replace("T", " ").slice(0, 19)}
                    </span>
                    <span className="font-medium text-ink">{e.name}</span>
                    <span className="text-ink-muted">
                      {[e.feature, e.path, e.gp && `${e.year ?? ""} ${e.gp}`, e.session_type,
                        e.detail].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <p className="pb-8 text-[11px] leading-relaxed text-ink-faint">
              Visitor counts are approximate by design: identity is a random id this
              browser generated for itself, so clearing site data or switching device
              counts as a new visitor. No IP addresses, cookies or fingerprints are
              collected. Analytics store: {data.health?.engine ?? "—"} ·
              {" "}{data.health?.written ?? 0} written, {data.health?.dropped ?? 0} dropped
              {data.health?.last_error ? ` · last error: ${data.health.last_error}` : ""}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function Panel({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cx("rounded-xl border px-4 py-3",
      tone === "warn" ? "border-amber/20 bg-amber/[0.04]" : "border-white/[0.06] bg-base-850/40")}>
      {children}
    </div>
  );
}

function Section({ title, icon, note, children }: {
  title: string; icon?: React.ReactNode; note?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-base-850/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {icon}{title}
        </h2>
        {note && <span className="text-[12px] text-ink-faint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, prev, hint, bad }: {
  label: string; value: number; prev?: number; hint?: string; bad?: boolean;
}) {
  const delta = prev === undefined || prev === null ? null : value - prev;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-850/50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cx("mt-0.5 text-2xl font-bold tabular-nums",
        bad && value > 0 ? "text-amber" : "text-ink")}>{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
      {!hint && delta !== null && (
        <p className={cx("text-[11px] tabular-nums",
          delta === 0 ? "text-ink-faint"
            : (delta > 0) !== !!bad ? "text-speed" : "text-amber")}>
          {delta > 0 ? "+" : ""}{delta} vs previous
        </p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[13px] text-ink-faint">{children}</p>;
}

function Bars({ items, total }: { items: [string, number, string][]; total: number }) {
  if (!total) return <Empty>No questions in this window.</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.map(([label, n, tint]) => (
        <li key={label} className="flex items-center gap-2.5 text-[13px]">
          <span className="w-36 shrink-0 text-ink-muted">{label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className={cx("block h-full rounded-full", tint)}
              style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums text-ink">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function TopList({ title, rows, render, value }: {
  title: string; rows: any[]; render: (r: any) => string; value?: (r: any) => string;
}) {
  return (
    <div>
      <Label>{title}</Label>
      {(!rows || rows.length === 0) && <Empty>Nothing yet.</Empty>}
      <ul className="mt-1.5 space-y-1">
        {(rows ?? []).map((r, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-ink" title={render(r)}>{render(r)}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">
              {value ? value(r) : r.n}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Traffic over time. A sparkline, not a chart library — this is six numbers a
 *  day and a bar per day says it faster than an axis would. */
function Traffic({ rows }: { rows: any[] }) {
  if (!rows?.length) return <Empty>No traffic in this window.</Empty>;
  const peak = Math.max(1, ...rows.map((r) => r.views || 0));
  return (
    <div>
      <Label>Traffic</Label>
      {/* `max-w` matters more than it looks: on a range with one day in it a
          `flex-1` bar spans the entire panel, and a full-width block of accent
          red reads as an alarm rather than as "one day, some traffic". Bars
          shrink to fit when there are ninety of them and stay bar-shaped when
          there is one. */}
      <div className="mt-2 flex h-24 items-end gap-1">
        {rows.map((r) => (
          <div key={r.day} className="group/bar relative w-full max-w-[28px] flex-1"
            title={`${r.day} — ${r.visitors} visitors, ${r.views} views, ${r.asks} asks`}>
            <div className="w-full rounded-t bg-accent/60 transition-colors group-hover/bar:bg-accent"
              style={{ height: `${Math.max(2, ((r.views || 0) / peak) * 96)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-faint">
        <span>{rows[0]?.day}</span><span>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}
