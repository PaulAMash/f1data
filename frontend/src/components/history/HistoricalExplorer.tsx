"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { api } from "@/lib/api";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { LoadingState } from "@/components/ui/misc";
import { cx } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { Select } from "@/components/ui/Select";
import { useLivery } from "@/lib/liveryColor";
import { teamColour } from "@/lib/constructors";
import { didNotFinish, inFinishingOrder, NOT_CLASSIFIED_HINT, positionLabel } from "@/lib/classification";

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
  // the reader's default season, applied once their stored answer has landed
  const { prefs, ready } = usePrefs();
  const seeded = useRef(false);
  useEffect(() => {
    if (!ready || seeded.current || !prefs.season) return;
    seeded.current = true;
    setYear(prefs.season);
  }, [ready, prefs.season]);
  const [events, setEvents] = useState<{ name: string }[]>([]);
  /* Whether the CALENDAR could be read, which is a different failure from
     whether a RESULT could be. Both used to land on "No results found for this
     selection" — a sentence about a selection the reader was never able to
     make, under a picker showing an em dash. */
  const [calendarFailed, setCalendarFailed] = useState(false);
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

  /* Events for the selected year — the ones that have actually been run.

     A season in progress used to list its whole calendar, so choosing a Grand
     Prix three months away produced "no results found for this event": an
     accurate sentence about a question the reader never meant to ask. The
     server stamps each event (see service.mark_completed) and the Race
     Explorer's picker reads the same stamp, so the two lists cannot disagree.

     The most recent race is selected rather than the first, because the thing
     somebody opening a season in progress wants is what just happened. */
  useEffect(() => {
    setEvents([]); setEvent(""); setCalendarFailed(false);
    api.histEvents(year)
      .then((r) => {
        const evs = (r.events ?? [])
          .filter((e: any) => e.completed !== false)
          .map((e: any) => ({ name: e.name }));
        setEvents(evs);
        setCalendarFailed(evs.length === 0);
        if (evs.length) setEvent(evs[evs.length - 1].name);
      })
      .catch(() => { setEvents([]); setCalendarFailed(true); });
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
    // `nonce` is not read in here; it is the retry signal. Bumping it has to
    // produce a new callback so the effect below re-runs and fetches again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, event, session, nonce]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // Only offer sessions the historical source actually supports — no "(n/a)" options.
  const allSessions = sessions.available;
  const isUnavailableSession = false;

  return (
    <Card>
      <CardHeader title="Historical Data Explorer"
        info={<InfoTip text="Official archive results. Practice sessions and some older data aren't available in the archive and are shown as such — never fabricated." />} />
      <CardBody className="space-y-4">
        {/* selectors */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Sel label="Season" value={String(year)} onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))} />
          <Sel label="Grand Prix" className="col-span-2 sm:col-span-1" value={event} onChange={setEvent}
            options={events.length
              ? events.map((e) => ({ value: e.name, label: e.name }))
              : [{ value: "", label: calendarFailed ? "No calendar for this season" : "Loading…" }]} />
          <Sel label="Session" value={session} onChange={setSession}
            options={allSessions.map((s) => ({ value: s, label: s }))} />
          <button onClick={() => setNonce((n) => n + 1)} disabled={loading}
            className="pill-btn h-[38px] justify-center self-end">
            <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
          </button>
        </div>

        {/* body */}
        {loading ? (
          <LoadingState title="Fetching results…"
            hint="Pulling the official classification from the archive — this is usually quick." size={32} />
        ) : isUnavailableSession ? (
          <Unavailable note={sessions.note ?? `${session} isn't available from the historical source for this event.`} />
        ) : calendarFailed ? (
          <ErrorRetry
            message={`The archive did not return a calendar for ${year}. That is the source being unreachable rather than a season with no races in it.`}
            onRetry={() => setNonce((n) => n + 1)} />
        ) : results?.error ? (
          <ErrorRetry message={results.message ?? "The historical source was unreachable."} onRetry={() => setNonce((n) => n + 1)} />
        ) : results && results.available && results.rows?.length ? (
          <ResultsTable rows={results.rows} session={session} simple={simple} />
        ) : (
          <Unavailable note={results?.note ?? "No results found for this selection."} />
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * A classification, in the product's own language.
 *
 * This was a plain HTML table: eight grey columns, one weight of type, and
 * nothing to tell a Ferrari from a Haas except reading the word. In a product
 * whose entire visual argument is that colour is how you recognise a car, the
 * archive was the one screen where colour did no work at all.
 *
 * Three changes, and all three are hierarchy rather than decoration:
 *
 *   THE LIVERY IS THE ROW'S LEFT EDGE. Constructors are found before they are
 *   read — which is what a reader scanning twenty rows for their team is
 *   actually doing.
 *
 *   THE PODIUM IS THE HEADLINE. A classification is read from the top, so the
 *   first three carry more weight and a gold, silver and bronze position mark.
 *   Everyone else is a list, which is what everyone else is.
 *
 *   RETIREMENTS RECEDE. A car that did not finish is not a result at the same
 *   level as one that did, and dimming it is how a timing screen has always
 *   said so.
 */
function ResultsTable({ rows, session, simple }: {
  rows: any[]; session: string; simple: boolean;
}) {
  const isQuali = /qual/i.test(session);
  const paint = useLivery();
  const tintOf = (r: any) => paint(teamColour(r.constructorName));
  /* One definition of "did not finish", one order, one position label — shared
     with the Race Explorer's Final classification. See lib/classification.ts:
     the same car used to read P18 in one table and nothing in the other. */
  const out = (r: any) => didNotFinish(r.status);
  const ordered = inFinishingOrder(
    (rows ?? []).map((r: any) => ({ ...r, position: r.position == null ? null : Number(r.position) })));

  return (
    <div>
      {/* Desktop table. `overflow-x`, and ONLY `overflow-x`.
          This carried `.modal-scroll`, which is a rule for a box inside an
          overlay: `overflow-y: auto` plus `overscroll-behavior: contain`. With
          no height limit the box could never scroll vertically — but `contain`
          stops the wheel chaining out of a box whether or not that box can use
          it, so the pointer resting anywhere over the classification killed
          scrolling for the whole page until it was moved off. A rule that says
          "the scroll stops here" belongs only where something is going to
          catch it. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-left text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              <th className="w-10 py-2.5 pl-1">Pos</th>
              <th className="py-2.5">Driver</th>
              <th className="py-2.5">Constructor</th>
              <th className="py-2.5 text-right">{isQuali ? "Best" : "Time / Gap"}</th>
              {!simple && !isQuali && <th className="py-2.5 text-right">Laps</th>}
              {!simple && !isQuali && <th className="py-2.5 text-right">Grid</th>}
              {!simple && !isQuali && <th className="py-2.5 text-right">Pts</th>}
              {!simple && <th className="py-2.5 pr-1 text-right">Status</th>}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r: any, i: number) => {
              const pos = Number(r.position) || 99;
              const podium = pos <= 3;
              const tint = tintOf(r);
              return (
                <tr key={i}
                  className={cx("den-row group/res border-b border-white/[0.04] transition-colors hover:bg-white/[0.025]",
                    out(r) && "opacity-55")}>
                  <td className="relative py-2.5 pl-1">
                    <span aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full transition-all duration-[--dur-2] group-hover/res:inset-y-0"
                      style={{ background: tint, opacity: podium ? 1 : 0.5 }} />
                    <span className={cx("ml-2.5 inline-block tabular-nums",
                      podium ? "text-[15px] font-bold text-ink" : "font-semibold text-ink-muted",
                      r.position == null && "text-ink-faint")}
                      title={r.position == null ? NOT_CLASSIFIED_HINT : undefined}>
                      {positionLabel(r.position)}
                    </span>
                  </td>
                  <td className={cx("py-2.5", podium ? "font-semibold text-ink" : "font-medium text-ink")}>
                    {r.driverName ?? r.driverCode}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: tint }} />
                      {r.constructorName ?? "—"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-ink-muted">
                    {r.time ?? r.gap ?? r.sessionBest ?? "—"}
                  </td>
                  {!simple && !isQuali && <td className="py-2.5 text-right tabular-nums text-ink-faint">{r.laps ?? "—"}</td>}
                  {!simple && !isQuali && <td className="py-2.5 text-right tabular-nums text-ink-faint">{r.grid ?? "—"}</td>}
                  {!simple && !isQuali && (
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={r.points ? "font-semibold text-ink" : "text-ink-faint"}>
                        {r.points ?? "—"}
                      </span>
                    </td>
                  )}
                  {!simple && (
                    <td className="py-2.5 pr-1 text-right text-[11.5px] text-ink-faint">{r.status ?? "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="space-y-1.5 sm:hidden">
        {ordered.map((r: any, i: number) => {
          const pos = Number(r.position) || 99;
          const tint = tintOf(r);
          return (
            <div key={i}
              className={cx("relative flex items-center gap-3 overflow-hidden rounded-xl bg-white/[0.02] py-2.5 pl-4 pr-3",
                out(r) && "opacity-55")}>
              <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full"
                style={{ background: tint, opacity: pos <= 3 ? 1 : 0.5 }} />
              <span className={cx("w-6 shrink-0 text-right tabular-nums",
                pos <= 3 ? "text-[15px] font-bold text-ink" : "text-[13px] text-ink-muted",
                r.position == null && "text-ink-faint")}>
                {positionLabel(r.position)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {r.driverName ?? r.driverCode}
                </span>
                <span className="block truncate text-[11.5px] text-ink-faint">
                  {r.constructorName ?? "—"}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink-muted">
                {r.time ?? r.gap ?? r.sessionBest ?? "—"}
              </span>
            </div>
          );
        })}
      </div>
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
  options: { value: string; label: string; hint?: string }[]; className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="label">{label}</span>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} wide />
    </div>
  );
}
