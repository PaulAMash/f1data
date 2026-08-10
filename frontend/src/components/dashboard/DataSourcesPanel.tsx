"use client";
import { useState } from "react";
import { CheckCircle2, Database, RefreshCw, Trash2, XCircle } from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { api } from "@/lib/api";
import { useFreshEffect } from "@/lib/fresh";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/misc";
import { cx } from "@/lib/format";

const SOURCE_NAMES: Record<string, string> = {
  openf1: "OpenF1",
  // named after the host we actually probe, not the library that reads it —
  // "FastF1 unreachable" sent everyone looking at the wrong thing
  "f1-archive": "F1 live-timing archive",
  fastf1: "F1 live-timing archive",
  jolpica: "Jolpica / Ergast",
  pitwall: "pitwall", cache: "Local cache", mock: "Demo generator",
};

const FACET_LABEL: Record<string, string> = {
  results: "Results & classification", laps: "Lap times", stints: "Tyres & stints",
  pit_stops: "Pit stops", overtakes: "Overtakes", weather: "Weather",
  race_control: "Race control", positions: "Position history", drivers: "Drivers",
  sectors: "Sector times",
  // legacy names for the same facet — sessions cached before the adapters agreed
  // on one spelling still carry them, and an unlabelled facet reads as a bug
  tyres: "Tyres & stints", "tyres/compounds": "Tyres & stints",
};

export function DataSourcesPanel({
  year, gp, session, onRefetch,
}: { year: number; gp: string; session: string; onRefetch: () => void }) {
  const [report, setReport] = useState<any>(null);
  const [probes, setProbes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [cleared, setCleared] = useState<number | null>(null);

  // Keyed on the selection, so it has the same hazard every other
  // selection-keyed fetch has: change race twice quickly and the slower answer
  // describes the race you left. On the panel whose entire job is saying where
  // the data came from, that is the worst possible thing to be wrong about.
  useFreshEffect((fresh) => {
    setLoading(true);
    api.sourceReport(year, gp, session)
      .then((r) => { if (fresh()) setReport(r); })
      .catch(() => { if (fresh()) setReport(null); })
      .finally(() => { if (fresh()) setLoading(false); });
  }, [year, gp, session]);

  // A source check that fails is itself a finding, and the panel whose entire
  // job is reporting reachability was the one place that couldn't survive an
  // unreachable thing: no .catch() meant the rejected promise escaped as an
  // unhandled rejection and Next.js threw a full-screen error overlay over the
  // app. The answer belongs in the card, next to the other answers.
  function checkHealth() {
    setProbing(true);
    setProbeError(null);
    api.dataSourceHealth()
      .then((r) => { setProbes(r.probes); setProbeError(null); })
      .catch((e: any) => {
        setProbes([]);
        setProbeError(e?.message || "The source check couldn't complete.");
      })
      .finally(() => setProbing(false));
  }

  async function clearCache() {
    const r = await api.clearCache(year, gp, session);
    setCleared(r.cleared);
  }

  const facets = report?.report?.facets ?? [];
  const missing: string[] = report?.report?.missing ?? [];
  const missingReason: string | null = report?.report?.missing_reason ?? null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        {/* The heading already says what the list is. What the subtitle carried
            that the heading could not is the FETCH TIME, which is a fact about
            this particular answer rather than a description of the panel — so
            it stays, as a timestamp, and the sentence goes. */}
        <CardHeader title="Where this data came from"
          right={report?.report?.fetched_at ? (
            <span className="font-mono text-[11px] tabular-nums text-ink-faint">
              {String(report.report.fetched_at).replace("T", " ").slice(0, 16)}
            </span>
          ) : undefined} />
        <CardBody className="space-y-2">
          {loading && <div className="py-6 text-center"><Spinner /></div>}
          {!loading && facets.length === 0 && <p className="text-sm text-ink-faint">No source report available.</p>}
          {facets.map((f: any) => (
            <div key={f.facet} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-base-800/40 px-3 py-2">
              <span className="flex-1 text-sm">{FACET_LABEL[f.facet] ?? f.facet}</span>
              <Badge tone={f.source === "none" ? "bad" : "neutral"}>{SOURCE_NAMES[f.source] ?? f.source}</Badge>
              <ConfDot conf={f.confidence} />
            </div>
          ))}
          {missing.length > 0 && (
            <div className="pt-1 text-xs">
              <p className="text-amber">
                Not available for this session: {missing.map((m) => FACET_LABEL[m] ?? m).join(", ")}.
              </p>
              {missingReason && (
                <p className="mt-1 leading-snug text-ink-muted">{missingReason}</p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Live source status"
            right={<button className="pill-btn h-8 text-xs" onClick={checkHealth} disabled={probing}>
              {probing ? <Spinner size={12} /> : <RefreshCw size={12} />} Check now</button>} />
          <CardBody className="space-y-2">
            {probes.length === 0 && !probeError && !probing && (
              <p className="text-sm text-ink-faint">Press “Check now” to test each F1 data source.</p>
            )}
            {probing && probes.length === 0 && (
              <p className="text-sm text-ink-muted">Testing each source…</p>
            )}
            {probeError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2">
                <XCircle size={15} className="mt-px shrink-0 text-rose-400" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-rose-200">Couldn’t run the check</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-rose-200/75">{probeError}</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">
                    This is Pitwall IQ’s own backend, not an F1 source — the sources above
                    weren’t reached at all.
                  </p>
                </div>
              </div>
            )}
            {/* The failure case is the ONLY case where the reader needs detail,
                and it was the one case that threw it away: a failed probe
                printed the literal word "unreachable" and hid the backend's
                diagnosis in a title attribute. Two days of "unreachable" told
                nobody whether F1 was down, our request was refused, or DNS had
                broken. The reason is now on the page. */}
            {/* Three states, not two, because they need three different actions.
                Red means the source is down: wait. Amber means we never got as
                far as asking — a broken install here — and only you can fix it;
                showing that in neutral grey as "not probed" is how a missing
                Python package spent two days looking like an F1 outage. */}
            {probes.map((p) => (
              <div key={p.name} className="text-sm">
                <div className="flex items-center gap-2">
                  {p.reachable === true ? <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                    : p.reachable === false ? <XCircle size={15} className="shrink-0 text-rose-400" />
                      : <AlertTriangle size={15} className="shrink-0 text-amber" />}
                  <span className="flex-1 truncate">{SOURCE_NAMES[p.name] ?? p.name}</span>
                  <span className={cx("shrink-0 text-xs font-medium",
                    p.reachable === true ? "text-emerald-300"
                      : p.reachable === false ? "text-rose-300" : "text-amber")}>
                    {p.reachable === true ? "reachable"
                      : p.reachable === false ? "not answering" : "couldn’t check"}
                  </span>
                </div>
                {p.detail && (
                  <p className={cx("ml-[23px] mt-0.5 text-[11.5px] leading-snug",
                    p.reachable === false ? "text-rose-200/80"
                      : p.reachable === true ? "text-ink-faint" : "text-amber/85")}>
                    {p.detail}
                  </p>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cache" />
          <CardBody className="flex flex-wrap items-center gap-2">
            <button className="pill-btn" onClick={onRefetch}>
              <RefreshCw size={14} /> Refetch (bypass cache)
            </button>
            <button className="pill-btn" onClick={clearCache}>
              <Trash2 size={14} /> Clear cache
            </button>
            {cleared !== null && <span className="text-xs text-ink-muted">Cleared {cleared} file(s).</span>}
            <p className="w-full pt-1 text-xs text-ink-faint">
              <Database size={11} className="mr-1 inline" />
              Completed sessions never change, so real data is cached locally after the first fetch.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ConfDot({ conf }: { conf: string }) {
  const c = conf === "high" ? "bg-emerald-400" : conf === "low" ? "bg-rose-400" : "bg-amber";
  return <span className={cx("h-2 w-2 rounded-full", c)} title={`${conf} confidence`} />;
}
