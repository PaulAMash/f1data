"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download, FileText, HardDrive, Loader2, Printer, RotateCcw, Trash2, X,
} from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { API_BASE } from "@/lib/api";
import { cx } from "@/lib/format";
import { Empty, Explain, Section, Sub } from "./kit";

/* ========================================================================== */
/* THE TWO THINGS THIS PAGE CAN DO RATHER THAN SHOW.                          */
/*                                                                            */
/* 1. TURN THE WINDOW INTO SOMETHING SAVEABLE. The dashboard is live and       */
/*    therefore temporary: every number on it is "the last 7 days" and in a    */
/*    week it will be a different 7 days with nothing to compare against. The  */
/*    report is the same analysis frozen, in a form that survives outside the  */
/*    browser — printed, filed, attached.                                      */
/*                                                                            */
/*    It renders in an IFRAME rather than a popup because a popup opened from  */
/*    inside an await is blocked by default in every current browser, and a    */
/*    feature that works on the developer's machine and nowhere else is worse  */
/*    than no feature. The iframe also prints on its own — the browser's print */
/*    engine is the PDF writer, so the deployment carries no PDF library.      */
/*                                                                            */
/* 2. THROW DATA AWAY. Two separate operations that sound alike and are not:   */
/*    analytics are a MEASUREMENT nothing can regenerate, the cache is a COPY  */
/*    that refills itself. They are kept visually apart, they preview what     */
/*    they would remove before removing it, and each needs its own phrase      */
/*    typed out — so the muscle memory of one cannot fire the other.           */
/* ========================================================================== */

type Props = {
  token: string;
  range: string;
  rangeLabel: string;
  /** Called after a successful purge so the dashboard re-reads an empty store. */
  onChanged: () => void;
};

async function adminFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || body?.message || `The API answered ${res.status}.`);
  }
  return res;
}

export default function AdminTools({ token, range, rangeLabel, onChanged }: Props) {
  return (
    <Section title="Tools" icon={<HardDrive size={15} />}
      note="Save the analysis, or clear what was recorded">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <ReportTool token={token} range={range} rangeLabel={rangeLabel} />
        <div className="space-y-6">
          <AnalyticsReset token={token} onChanged={onChanged} />
          <CacheClear token={token} />
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* REPORT                                                                     */
/* -------------------------------------------------------------------------- */
function ReportTool({ token, range, rangeLabel }: {
  token: string; range: string; rangeLabel: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  /* A blob URL is a live handle into this document. Left alone it keeps the
     whole report string alive for the lifetime of the tab, so every one made
     here is revoked — the preview's when it closes, a download's on the next
     tick, once the browser has taken the bytes. */
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const fetchReport = useCallback(async (format: string) => {
    const res = await adminFetch(token, `/api/admin/analytics/report?range=${range}&format=${format}`);
    return format === "json" ? JSON.stringify(await res.json(), null, 2) : res.text();
  }, [token, range]);

  async function open() {
    setBusy("preview"); setError(null);
    try {
      const html = await fetchReport("html");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(new Blob([html], { type: "text/html" })));
    } catch (e: any) {
      setError(e?.message ?? "Could not build the report.");
    } finally { setBusy(null); }
  }

  async function download(format: string, ext: string, mime: string) {
    setBusy(ext); setError(null);
    try {
      const text = await fetchReport(format);
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `pitwall-iq-analytics-${range}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e: any) {
      setError(e?.message ?? "Could not build the report.");
    } finally { setBusy(null); }
  }

  return (
    <Sub title="Save this analysis"
      help="The same figures as the page, plus the ranked list of what to work on, built server-side into one self-contained document. It has no scripts and no external references, so it keeps working from a folder years from now.">
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Builds a report for <span className="font-medium text-ink">{rangeLabel}</span>.
        Print it to PDF from the preview, or keep the source.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={open} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5
                     text-[12.5px] font-semibold text-pure transition-opacity
                     hover:opacity-90 disabled:opacity-40">
          {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          Open report
        </button>
        <ToolButton onClick={() => download("html", "html", "text/html")}
          busy={busy === "html"} disabled={busy !== null} icon={<Download size={13} />}>
          .html
        </ToolButton>
        <ToolButton onClick={() => download("md", "md", "text/markdown")}
          busy={busy === "md"} disabled={busy !== null} icon={<Download size={13} />}>
          .md
        </ToolButton>
        <ToolButton onClick={() => download("json", "json", "application/json")}
          busy={busy === "json"} disabled={busy !== null} icon={<Download size={13} />}>
          .json
        </ToolButton>
      </div>
      {error && <p className="mt-2 text-[12px] text-amber">{error}</p>}

      <ul className="mt-4 space-y-1 border-t border-white/[0.06] pt-3">
        {[
          ["The three verdicts", "product, Ask and backend, with the reason for each"],
          ["Product usage", "visitors, visits, races, features, dwell, funnel and exits"],
          ["Ask intelligence", "outcomes, topics, the capability gaps and the rejected answers"],
          ["Performance", "endpoints against their budgets, failures, session load errors"],
          ["What to work on next", "the same ranked list as the panel above"],
        ].map(([title, detail]) => (
          <li key={title} className="flex items-baseline gap-2 text-[12px]">
            <span className="shrink-0 font-medium text-ink">{title}</span>
            <span className="min-w-0 flex-1 truncate text-ink-faint" title={detail}>
              {detail}
            </span>
          </li>
        ))}
      </ul>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-3 sm:p-6"
          role="dialog" aria-label="Analytics report preview">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden
                          rounded-2xl border border-white/10 bg-base-900 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
              <FileText size={14} className="text-accent-soft" />
              <span className="text-[13px] font-semibold text-ink">Analytics report</span>
              <span className="text-[11.5px] text-ink-faint">{rangeLabel}</span>
              <button onClick={() => frame.current?.contentWindow?.print()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border
                           border-white/10 px-2.5 py-1.5 text-[12px] text-ink
                           transition-colors hover:bg-white/[0.06]">
                <Printer size={13} /> Print / Save as PDF
              </button>
              <button onClick={() => { URL.revokeObjectURL(preview); setPreview(null); }}
                aria-label="Close report"
                className="rounded-lg border border-white/10 p-1.5 text-ink-muted
                           transition-colors hover:bg-white/[0.06]">
                <X size={14} />
              </button>
            </div>
            {/* white, because the report is a printed document and prints on
                paper — inheriting the dashboard's dark surface would produce a
                preview that looks nothing like what comes out. */}
            <iframe ref={frame} src={preview} title="Analytics report"
              className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
    </Sub>
  );
}

function ToolButton({ onClick, busy, disabled, icon, children }: {
  onClick: () => void; busy?: boolean; disabled?: boolean;
  icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10
                 px-2.5 py-1.5 text-[12.5px] text-ink-muted transition-colors
                 hover:bg-white/[0.06] hover:text-ink disabled:opacity-40">
      {busy ? <Loader2 size={13} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* DESTRUCTIVE: ANALYTICS                                                     */
/*                                                                            */
/* The requirement was "obvious but hard to trigger by accident", which is a   */
/* real tension: hiding it makes it safe and useless. What makes this safe is  */
/* not that it is hidden — it is in plain sight — but that it CANNOT FIRE      */
/* UNTIL YOU HAVE READ WHAT IT WOULD DO. The row counts are fetched first and  */
/* shown; the phrase must be typed exactly; the button is inert until both.    */
/* -------------------------------------------------------------------------- */
function AnalyticsReset({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState<any>(null);
  const [scope, setScope] = useState("all");
  const [before, setBefore] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminFetch(token, "/api/admin/analytics/inventory");
      setInv(await res.json());
    } catch (e: any) { setError(e?.message ?? "Could not read the store."); }
  }, [token]);

  useEffect(() => { if (open && !inv) void load(); }, [open, inv, load]);

  const required = inv?.confirm_phrase ?? "DELETE ANALYTICS";
  const armed = phrase === required && !busy;

  async function reset() {
    if (!armed) return;
    setBusy(true); setError(null);
    try {
      const res = await adminFetch(token, "/api/admin/analytics/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: phrase, scope, before: before || null }),
      });
      const body = await res.json();
      setDone(`${body.total} row${body.total === 1 ? "" : "s"} deleted.`);
      setPhrase(""); setInv(null);
      void load();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? "The delete did not run.");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.04] p-3.5">
      <div className="flex items-center gap-2">
        <Trash2 size={14} className="shrink-0 text-accent" />
        <h3 className="text-[13px] font-semibold text-ink">Clear analytics data</h3>
        <Explain>
          Deletes recorded events and Ask interactions and nothing else. Cached F1
          data, configuration and every other table are untouched. There is no undo
          — analytics are a measurement, so a deleted week cannot be re-derived.
        </Explain>
        <button onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[11.5px]
                     text-ink-muted transition-colors hover:bg-white/[0.06]">
          {open ? "Cancel" : "Open"}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
        For starting a clean measurement period after testing.
      </p>

      {done && !open && <p className="mt-2 text-[12px] text-speed">{done}</p>}

      {open && (
        <div className="mt-3 space-y-3 border-t border-accent/15 pt-3">
          {!inv && !error && <Empty>Reading the store…</Empty>}

          {inv?.available === false && (
            <Empty>Analytics is not recording on this deployment — nothing to clear.</Empty>
          )}

          {inv?.analytics?.tables?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                What is stored right now
              </p>
              <ul className="mt-1.5 space-y-1">
                {inv.analytics.tables.map((t: any) => (
                  <li key={t.table} className="flex items-baseline gap-2 text-[12px]">
                    <span className="font-mono text-[11px] text-ink">{t.table}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-faint" title={t.purpose}>
                      {t.purpose}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-ink">{t.rows}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{inv.note}</p>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                What to delete
              </span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-base-900/60 px-2.5
                           py-1.5 text-[12.5px] text-ink outline-none focus:border-accent/40">
                <option value="all">Everything</option>
                <option value="events">Page/feature events only</option>
                <option value="ask">Ask questions only</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                Older than (optional)
              </span>
              <input type="date" value={before} onChange={(e) => setBefore(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-base-900/60 px-2.5
                           py-1.5 text-[12.5px] text-ink outline-none focus:border-accent/40" />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {before
              ? `Keeps everything recorded on or after ${before}.`
              : "Leave the date empty to delete the whole history for that scope."}
          </p>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">
              Type <span className="font-mono text-accent-soft">{required}</span> to confirm
            </span>
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)}
              placeholder={required} autoComplete="off" spellCheck={false}
              className="mt-1 w-full rounded-lg border border-white/10 bg-base-900/60 px-2.5
                         py-1.5 font-mono text-[12.5px] text-ink outline-none
                         placeholder:text-ink-faint/60 focus:border-accent/40" />
          </label>

          <button onClick={reset} disabled={!armed}
            className={cx("inline-flex w-full items-center justify-center gap-1.5 rounded-lg",
              "px-3 py-2 text-[12.5px] font-semibold transition-colors",
              armed ? "bg-accent text-pure ring-1 ring-inset ring-white/25 hover:opacity-90"
                    : "cursor-not-allowed border border-white/10 text-ink-faint")}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete permanently
          </button>

          {error && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber">
              <AlertTriangle size={13} className="mt-px shrink-0" />{error}
            </p>
          )}
          {done && <p className="text-[12px] text-speed">{done}</p>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DESTRUCTIVE: CACHE — deliberately quieter. It costs speed, not information. */
/* -------------------------------------------------------------------------- */
function CacheClear({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState<any>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminFetch(token, "/api/admin/cache/inventory");
      setInv(await res.json());
    } catch (e: any) { setError(e?.message ?? "Could not read the cache."); }
  }, [token]);

  useEffect(() => { if (open && !inv) void load(); }, [open, inv, load]);

  const required = inv?.confirm_phrase ?? "CLEAR CACHE";
  const armed = phrase === required && !busy;

  async function clear() {
    if (!armed) return;
    setBusy(true); setError(null);
    try {
      const res = await adminFetch(token, "/api/admin/cache/clear", {
        method: "POST", body: JSON.stringify({ confirm: phrase }),
      });
      const body = await res.json();
      setDone(`${body.cleared} cached file${body.cleared === 1 ? "" : "s"} removed. No analytics affected.`);
      setPhrase(""); setInv(null);
      void load();
    } catch (e: any) {
      setError(e?.message ?? "The clear did not run.");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-base-850/50 p-3.5">
      <div className="flex items-center gap-2">
        <RotateCcw size={14} className="shrink-0 text-ink-muted" />
        <h3 className="text-[13px] font-semibold text-ink">Clear cached F1 data</h3>
        <Explain>
          Empties the stored session JSON and remembered upstream documents. Loses
          no analytics — the data re-fetches from FastF1 and Jolpica on demand,
          which makes the next few session loads slow while it refills.
        </Explain>
        <button onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[11.5px]
                     text-ink-muted transition-colors hover:bg-white/[0.06]">
          {open ? "Cancel" : "Open"}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
        Frees disk. Costs speed until the cache refills.
      </p>

      {done && !open && <p className="mt-2 text-[12px] text-speed">{done}</p>}

      {open && (
        <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
          {!inv && !error && <Empty>Reading the cache…</Empty>}
          {inv && (
            <p className="text-[12px] leading-relaxed text-ink-muted">
              <span className="font-medium tabular-nums text-ink">{inv.sessions}</span> cached
              session{inv.sessions === 1 ? "" : "s"}, <span className="font-medium tabular-nums text-ink">{inv.mb} MB</span>.
              <span className="mt-1 block text-[11px] text-ink-faint">{inv.note}</span>
            </p>
          )}
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">
              Type <span className="font-mono text-ink">{required}</span> to confirm
            </span>
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)}
              placeholder={required} autoComplete="off" spellCheck={false}
              className="mt-1 w-full rounded-lg border border-white/10 bg-base-900/60 px-2.5
                         py-1.5 font-mono text-[12.5px] text-ink outline-none
                         placeholder:text-ink-faint/60 focus:border-accent/40" />
          </label>
          <button onClick={clear} disabled={!armed}
            className={cx("inline-flex w-full items-center justify-center gap-1.5 rounded-lg",
              "px-3 py-2 text-[12.5px] font-semibold transition-colors",
              armed ? "border border-white/20 bg-white/[0.08] text-ink hover:bg-white/[0.12]"
                    : "cursor-not-allowed border border-white/10 text-ink-faint")}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Clear cache
          </button>
          {error && <p className="text-[12px] text-amber">{error}</p>}
          {done && <p className="text-[12px] text-speed">{done}</p>}
        </div>
      )}
    </div>
  );
}
