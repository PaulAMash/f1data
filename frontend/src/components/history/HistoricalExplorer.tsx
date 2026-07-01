"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { Skeleton } from "@/components/ui/misc";
import { cx } from "@/lib/format";

const CURRENT = new Date().getFullYear();
const FALLBACK_YEARS = Array.from({ length: CURRENT - 1949 }, (_, i) => CURRENT - i);

type Results = {
  available?: boolean; rows?: any[]; note?: string; source?: string;
  confidence?: string; event_name?: string; error?: string; message?: string; retryable?: boolean;
};

export function HistoricalExplorer() {
  const simple = useIsSimple();
  const [years, setYears] = useState<number[]>(FALLBACK_YEARS);
  const [year, setYear] = useState(CURRENT - 1);
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [event, setEvent] = useState("");
  const [sessions, setSessions] = useState<{ available: string[]; unavailable: string[]; note?: string }>({
    available: ["Qualifying", "Race"], unavailable: [],
  });
  const [session, setSession] = useState("Race");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  // seasons (1950-present); fall back to a generated range if the source is down
  useEffect(() => {
    api.histSeasons()
      .then((r) => { if (r.seasons?.length) setYears(r.seasons.map((s: any) => s.year)); })
      .catch(() => setYears(FALLBACK_YEARS));
  }, []);

  // events for the selected year
  useEffect(() => {
    setEvents([]); setEvent("");
    api.histEvents(year)
      .then((r) => {
        const evs = (r.events ?? []).map((e: any) => ({ name: e.name }));
        setEvents(evs);
        if (evs.length) setEvent(evs[0].name);
      })
      .catch(() => setEvents([]));
  }, [year]);

  // sessions for the selected event
  useEffect(() => {
    if (!event) return;
    api.histSessions(year, event)
      .then((r) => {
        setSessions({ available: r.available ?? ["Race"], unavailable: r.unavailable ?? [], note: r.note });
        setSession((prev) => (r.available?.includes(prev) ? prev : (r.available?.[r.available.length - 1] ?? "Race")));
      })
      .catch(() => setSessions({ available: ["Qualifying", "Race"], unavailable: [] }));
  }, [year, event]);

  // auto-fetch results
  const fetchResults = useCallback(() => {
    if (!event || !session) return;
    setLoading(true); setResults(null);
    api.histResults(year, event, session)
      .then(setResults)
      .catch((e) => setResults({ available: false, error: "source_unavailable", message: e?.message }))
      .finally(() => setLoading(false));
  }, [year, event, session, nonce]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const allSessions = useMemo(
    () => [...sessions.available, ...sessions.unavailable],
    [sessions],
  );
  const isUnavailableSession = sessions.unavailable.includes(session);

  return (
    <Card>
      <CardHeader title="Historical Data Explorer"
        subtitle="Pick a season, Grand Prix and session for real results, 1950–present."
        info={<InfoTip text="Results come from Jolpica/Ergast. Practice sessions and some older data aren't available from this source and are shown as such — never fabricated." />} />
      <CardBody className="space-y-4">
        {/* selectors */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Sel label="Season" value={String(year)} onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))} />
          <Sel label="Grand Prix" className="col-span-2 sm:col-span-1" value={event} onChange={setEvent}
            options={(events.length ? events : [{ name: event || "—" }]).map((e) => ({ value: e.name, label: e.name }))} />
          <Sel label="Session" value={session} onChange={setSession}
            options={allSessions.map((s) => ({ value: s, label: s + (sessions.unavailable.includes(s) ? " (n/a)" : "") }))} />
          <button onClick={() => setNonce((n) => n + 1)} disabled={loading}
            className="pill-btn h-[38px] justify-center self-end">
            <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
          </button>
        </div>

        {/* body */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : isUnavailableSession ? (
          <Unavailable note={sessions.note ?? `${session} isn't available from the historical source for this event.`} />
        ) : results?.error ? (
          <ErrorRetry message={results.message ?? "The historical source was unreachable."} onRetry={() => setNonce((n) => n + 1)} />
        ) : results && results.available && results.rows?.length ? (
          <ResultsTable rows={results.rows} session={session} simple={simple} source={results.source} confidence={results.confidence} />
        ) : (
          <Unavailable note={results?.note ?? "No results found for this selection."} />
        )}
      </CardBody>
    </Card>
  );
}

function ResultsTable({ rows, session, simple, source, confidence }: {
  rows: any[]; session: string; simple: boolean; source?: string; confidence?: string;
}) {
  const isQuali = /qual/i.test(session);
  return (
    <div>
      {/* desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pl-1">Pos</th><th className="py-2">Driver</th><th className="py-2">Constructor</th>
              <th className="py-2">{isQuali ? "Best" : "Time / Gap"}</th>
              {!simple && !isQuali && <th className="py-2">Laps</th>}
              {!simple && !isQuali && <th className="py-2">Grid</th>}
              {!simple && !isQuali && <th className="py-2">Pts</th>}
              {!simple && <th className="py-2 pr-1">Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.04]">
                <td className="py-2 pl-1 tabular-nums font-semibold">{r.position ?? "—"}</td>
                <td className="py-2 font-medium">{r.driverName ?? r.driverCode}</td>
                <td className="py-2 text-ink-muted">{r.constructorName ?? "—"}</td>
                <td className="py-2 tabular-nums text-ink-muted">{r.time ?? r.gap ?? r.sessionBest ?? "—"}</td>
                {!simple && !isQuali && <td className="py-2 tabular-nums text-ink-muted">{r.laps ?? "—"}</td>}
                {!simple && !isQuali && <td className="py-2 tabular-nums text-ink-muted">{r.grid ?? "—"}</td>}
                {!simple && !isQuali && <td className="py-2 tabular-nums text-ink-muted">{r.points ?? "—"}</td>}
                {!simple && <td className="py-2 pr-1 text-xs text-ink-faint">{r.status ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="space-y-1.5 sm:hidden">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-base-800/40 px-3 py-2">
            <span className="w-6 text-center text-sm font-bold text-ink-muted">{r.position ?? "—"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.driverName ?? r.driverCode}</div>
              <div className="truncate text-xs text-ink-faint">{r.constructorName ?? ""}</div>
            </div>
            <span className="shrink-0 text-right text-xs tabular-nums text-ink-muted">
              {r.time ?? r.gap ?? r.sessionBest ?? "—"}
              {!isQuali && r.points != null && <div className="text-ink-faint">{r.points} pts</div>}
            </span>
          </div>
        ))}
      </div>

      {!simple && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Source: {source ?? "jolpica"}{confidence ? ` · confidence ${confidence}` : ""} · {rows.length} entries.
        </p>
      )}
    </div>
  );
}

function Unavailable({ note }: { note: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-base-800/30 px-4 py-8 text-center">
      <p className="mx-auto max-w-md text-sm text-ink-muted">{note}</p>
    </div>
  );
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-amber/15 bg-amber/[0.03] px-4 py-8 text-center">
      <AlertTriangle size={20} className="text-amber" />
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      <button onClick={onRetry} className="pill-btn"><RefreshCw size={14} /> Retry</button>
    </div>
  );
}

function Sel({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="label">{label}</span>
      <span className="relative inline-flex items-center">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/10 bg-base-800 px-3 py-2 pr-8 text-sm text-ink outline-none focus:border-white/25">
          {options.map((o) => <option key={o.value} value={o.value} className="bg-base-800">{o.label}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-ink-faint" />
      </span>
    </label>
  );
}
