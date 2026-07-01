"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleHelp, Database, RefreshCw, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useIsSimple } from "@/lib/mode";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/misc";
import { cx } from "@/lib/format";

const SOURCE_NAMES: Record<string, string> = {
  openf1: "OpenF1", fastf1: "FastF1", jolpica: "Jolpica / Ergast",
  pitwall: "pitwall", cache: "Local cache", mock: "Demo generator",
};

const FACET_LABEL: Record<string, string> = {
  results: "Results & classification", laps: "Lap times", tyres: "Tyres & stints",
  pit_stops: "Pit stops", overtakes: "Overtakes", weather: "Weather",
  race_control: "Race control", positions: "Position history", drivers: "Drivers",
};

export function DataSourcesPanel({
  year, gp, session, mock, onRefetch,
}: { year: number; gp: string; session: string; mock: boolean; onRefetch: () => void }) {
  const simple = useIsSimple();
  const [report, setReport] = useState<any>(null);
  const [probes, setProbes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.sourceReport(year, gp, session, mock)
      .then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [year, gp, session, mock]);

  function checkHealth() {
    setProbing(true);
    api.dataSourceHealth().then((r) => setProbes(r.probes)).finally(() => setProbing(false));
  }

  async function clearCache() {
    const r = await api.clearCache(year, gp, session);
    setCleared(r.cleared);
  }

  const facets = report?.report?.facets ?? [];
  const missing: string[] = report?.report?.missing ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Where this data came from"
          subtitle={simple ? "Which service provided each part of this session." : report?.report?.fetched_at} />
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
            <p className="pt-1 text-xs text-amber">
              Not available for this session: {missing.map((m) => FACET_LABEL[m] ?? m).join(", ")}.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Live source status"
            right={<button className="pill-btn h-8 text-xs" onClick={checkHealth} disabled={probing}>
              {probing ? <Spinner size={12} /> : <RefreshCw size={12} />} Check now</button>} />
          <CardBody className="space-y-2">
            {probes.length === 0 && (
              <p className="text-sm text-ink-faint">Press “Check now” to test each F1 data source.</p>
            )}
            {probes.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-sm">
                {p.reachable === true ? <CheckCircle2 size={15} className="text-emerald-400" />
                  : p.reachable === false ? <XCircle size={15} className="text-rose-400" />
                    : <CircleHelp size={15} className="text-ink-faint" />}
                <span className="flex-1">{SOURCE_NAMES[p.name] ?? p.name}</span>
                <span className="max-w-[45%] truncate text-xs text-ink-faint" title={p.detail}>
                  {p.reachable === true ? "reachable" : p.reachable === false ? "unreachable" : (p.detail ?? "n/a")}
                </span>
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
