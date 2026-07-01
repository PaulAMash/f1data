"use client";
import { useEffect, useState } from "react";
import { Trophy, Users } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { Skeleton, EmptyState } from "@/components/ui/misc";
import { InfoTip } from "@/components/ui/InfoTip";
import { api } from "@/lib/api";
import type { DataSource } from "@/lib/types";
import { cx } from "@/lib/format";

const YEARS = Array.from({ length: 9 }, (_, i) => 2026 - i);
const CIRCUITS = ["austria", "monza", "monaco", "silverstone", "spa", "suzuka", "bahrain", "brazil"];

export default function History() {
  const [year, setYear] = useState(2025);
  const [type, setType] = useState<"driver" | "constructor">("driver");
  const [rows, setRows] = useState<any[]>([]);
  const [source, setSource] = useState<DataSource>("mock");
  const [loading, setLoading] = useState(true);

  const [circuit, setCircuit] = useState("austria");
  const [winners, setWinners] = useState<any[]>([]);
  const [winSource, setWinSource] = useState<DataSource>("mock");

  useEffect(() => {
    setLoading(true);
    api.historyStandings(year, type)
      .then((r) => { setRows(r.standings); setSource(r.source as DataSource); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [year, type]);

  useEffect(() => {
    api.circuitWinners(circuit)
      .then((r) => { setWinners(r.winners); setWinSource(r.source as DataSource); })
      .catch(() => setWinners([]));
  }, [circuit]);

  const maxPts = Math.max(1, ...rows.map((r) => r.points ?? 0));

  return (
    <div className="min-h-screen">
      <NavBar active="history" />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <div className="label">Historical mode</div>
          <h1 className="text-2xl font-semibold tracking-tight">Championships, winners & records</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Standings and past winners from 1950 to today via Jolpica/Ergast. A basic explorer,
            architected to grow — falls back to labelled sample data when the source is unreachable.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {/* standings */}
          <Card>
            <CardHeader
              title="Championship standings"
              info={<InfoTip text="Points and wins for the selected season." />}
              right={
                <div className="flex items-center gap-2">
                  <DataSourceBadge source={source} />
                  <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-base-800 px-2.5 py-1.5 text-sm outline-none">
                    {YEARS.map((y) => <option key={y} value={y} className="bg-base-800">{y}</option>)}
                  </select>
                </div>
              }
            />
            <CardBody>
              <Tabs items={[
                { id: "driver", label: "Drivers", icon: <Users size={14} /> },
                { id: "constructor", label: "Constructors", icon: <Trophy size={14} /> },
              ]} active={type} onChange={(t) => setType(t as any)} className="mb-4" />

              {loading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
              ) : rows.length ? (
                <div className="space-y-1.5">
                  {rows.map((r) => (
                    <div key={r.position} className="flex items-center gap-3">
                      <span className="w-5 text-right tabular-nums text-sm text-ink-faint">{r.position}</span>
                      <div className="flex-1">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {r.name}
                            {r.team && <span className="ml-2 text-xs text-ink-faint">{r.team}</span>}
                          </span>
                          <span className="tabular-nums text-sm text-ink-muted">
                            {r.points} pts{r.wins ? ` · ${r.wins}W` : ""}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className={cx("h-full rounded-full", r.position === 1 ? "bg-accent" : "bg-speed/70")}
                            style={{ width: `${((r.points ?? 0) / maxPts) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No standings available" />}
            </CardBody>
          </Card>

          {/* circuit winners */}
          <Card>
            <CardHeader
              title="Past winners at circuit"
              right={
                <div className="flex items-center gap-2">
                  <DataSourceBadge source={winSource} />
                  <select value={circuit} onChange={(e) => setCircuit(e.target.value)}
                    className="rounded-lg border border-white/10 bg-base-800 px-2.5 py-1.5 text-sm capitalize outline-none">
                    {CIRCUITS.map((c) => <option key={c} value={c} className="bg-base-800">{c}</option>)}
                  </select>
                </div>
              }
            />
            <CardBody>
              {winners.length ? (
                <div className="space-y-1.5">
                  {winners.map((w, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-base-800/40 px-3 py-2">
                      <span className="w-10 tabular-nums text-sm text-ink-faint">{w.season}</span>
                      <span className="flex-1 text-sm font-medium">{w.winner}</span>
                      <span className="text-xs text-ink-muted">{w.team}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No winners data" />}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
