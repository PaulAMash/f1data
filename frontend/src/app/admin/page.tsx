"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, RefreshCw } from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { API_BASE } from "@/lib/api";
import { cx } from "@/lib/format";
import AdminTools from "@/components/admin/AdminTools";
import { PALETTE_CSS, Verdict, Stat, Explain, type Tone } from "@/components/admin/kit";
import {
  AskPanel, PerformancePanel, PrioritiesPanel, RecentPanel, UsagePanel,
} from "@/components/admin/panels";
import { FeedbackPanel } from "@/components/admin/feedback";

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
/* WHAT CHANGED IN V91, AND WHY.                                              */
/*                                                                            */
/* The old page was a wall of counts. Everything on it was true and almost     */
/* none of it was legible, because it answered "how many" without ever         */
/* answering "is that good" or "what do I do". The order is now an argument:   */
/*                                                                            */
/*   1. THREE VERDICTS.  Is the product ok, is Ask ok, is the backend ok —     */
/*      each a judgement with its measurement underneath.                      */
/*   2. WHAT TO WORK ON.  Derived from the same numbers, ranked by how many    */
/*      readers each thing affects. The one section that is actionable.        */
/*   3. ASK.  The point of the product, and the only place readers write down  */
/*      what they wanted and did not get.                                      */
/*   4. USAGE, then BACKEND HEALTH.  Context for the two above.                */
/*   5. TOOLS.  Save it, or clear it.                                          */
/*   6. RECENT.  The raw stream, last, for when a number needs explaining.     */
/*                                                                            */
/* Counts still exist — but underneath the sentence that says whether they     */
/* matter, which is the difference between a dashboard and a log.              */
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
  const v = data?.verdicts;
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;

  return (
    <div className="adm min-h-screen">
      {/* The categorical scale lives in one place and is injected once, so the
          charts, the legends and the log dots cannot drift apart. */}
      <style>{PALETTE_CSS}</style>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
              Private
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Pitwall IQ analytics
            </h1>
            {data?.range && (
              <p className="mt-1 text-[12px] text-ink-faint">
                {data.range.days ? `Last ${data.range.days} day${data.range.days === 1 ? "" : "s"}`
                                 : "Everything recorded"}
                {" · to "}{String(data.range.to).replace("T", " ").slice(0, 16)} UTC
              </p>
            )}
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
          <div className="rounded-xl border border-amber/20 bg-amber/[0.04] px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="mt-px shrink-0 text-amber" />
              <div>
                <p className="text-sm font-medium text-ink">Couldn&rsquo;t load analytics</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{error}</p>
              </div>
            </div>
          </div>
        )}

        {data && data.available === false && (
          <div className="rounded-xl border border-amber/20 bg-amber/[0.04] px-4 py-3">
            <p className="text-sm font-medium text-ink">Analytics is not recording yet</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{data.reason}</p>
          </div>
        )}

        {data?.available && (
          <div className="space-y-5">
            {/* ---- 1. THE THREE JUDGEMENTS ------------------------------- */}
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Verdict label="Product" state={(v?.product?.state ?? "unknown") as Tone}
                note={v?.product?.note ?? ""} />
              <Verdict label="Ask" state={(v?.ask?.state ?? "unknown") as Tone}
                note={v?.ask?.note ?? ""} />
              <Verdict label="Backend" state={(v?.backend?.state ?? "unknown") as Tone}
                note={v?.backend?.note ?? ""} />
            </div>

            {/* ---- the counts, under the judgements they support --------- */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Visitors" value={o.visitors} prev={prev?.visitors}
                help="Distinct anonymous browser ids. Approximate by design — clearing site data or switching device reads as somebody new." />
              <Stat label="Visits" value={o.visits} prev={prev?.visits}
                help="A visit is one browsing session: it ends after 30 minutes of inactivity or when the tab is closed." />
              <Stat label="Page views" value={o.page_views} prev={prev?.page_views} />
              <Stat label="Questions" value={o.ask_questions} prev={prev?.ask_questions} />
              <Stat label="Returning" value={o.returning_visitors}
                hint={`${o.returning_pct}% of visitors`}
                help="Visitors we had already seen before this window opened — the only honest measure of whether anyone comes back." />
              <Stat label="Reader-facing errors" value={o.errors} prev={prev?.errors} invert
                tone={o.errors ? "warn" : "good"}
                help="Server errors, failed session loads and browser crashes only. A 404 for a favicon is not a reader-facing error and is counted separately." />
            </div>

            {/* ---- 2. WHAT TO DO ABOUT IT -------------------------------- */}
            <PrioritiesPanel priorities={data.priorities} />

            {/* ---- 3. ASK ------------------------------------------------ */}
            <AskPanel ask={data.ask} />

            {/* ---- 3b. WHAT THEY SAID IN THEIR OWN WORDS -----------------
                Directly under Ask, and above usage, because it is the same
                kind of signal one step more explicit: Ask records where the
                product fell short, and this records what somebody wanted done
                about it. Both belong above the numbers that describe
                behaviour rather than intent. */}
            <FeedbackPanel feedback={data.feedback} />

            {/* ---- 4. USAGE, THEN BACKEND -------------------------------- */}
            <UsagePanel usage={data.usage} traffic={data.traffic} overview={o} />
            <PerformancePanel performance={data.performance} overview={o} />

            {/* ---- 5. TOOLS ---------------------------------------------- */}
            <AdminTools token={token} range={range} rangeLabel={rangeLabel}
              onChanged={() => token && load(token, range)} />

            {/* ---- 6. THE RAW STREAM ------------------------------------- */}
            <RecentPanel recent={data.recent} />

            <p className="flex flex-wrap items-center gap-x-1.5 pb-8 text-[11px]
                          leading-relaxed text-ink-faint">
              <span>
                No IP addresses, cookies or fingerprints are collected — identity is a
                random id this browser generated for itself.
              </span>
              <Explain>
                Every figure here comes from events the app records about itself:
                which page, which feature, which race, how long the API took, and
                what was asked. Nothing identifies a person, and the store is bounded
                in memory and written on a background thread, so recording can never
                slow a reader&rsquo;s request down.
              </Explain>
              <span>
                Store: {data.health?.engine ?? "—"} · {data.health?.written ?? 0} written,
                {" "}{data.health?.dropped ?? 0} dropped
                {data.health?.last_error ? ` · last error: ${data.health.last_error}` : ""}.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
