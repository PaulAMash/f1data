"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/api";
import type { RaceBundle } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_SHORT } from "@/lib/compounds";
import { Spinner, ErrorState } from "@/components/ui/misc";
import { InfoTip } from "@/components/ui/InfoTip";
import { fmtLap, fmtSec } from "@/lib/format";

export function DriverComparison({
  bundle, year, gp, session, initial,
}: {
  bundle: RaceBundle; year: number; gp: string; session: string; initial: string[];
}) {
  const codes = bundle.session.drivers.map((d) => d.code);
  const ranked = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99));
  const [a, setA] = useState(initial[0] ?? ranked[0]?.driver ?? codes[0]);
  const [b, setB] = useState(initial[1] ?? ranked[1]?.driver ?? codes[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const colorOf = (c: string) => bundle.session.drivers.find((d) => d.code === c)?.team_color ?? "#888";

  useEffect(() => {
    let cancel = false;
    setLoading(true); setErr(null);
    api.compare(year, gp, session, a, b)
      .then((r) => { if (!cancel) setData(r); })
      .catch((e) => { if (!cancel) setErr(e.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [a, b, year, gp, session]);

  const positionData = useMemo(() => {
    const byLap = new Map<number, any>();
    for (const p of bundle.session.positions) {
      if (p.driver !== a && p.driver !== b) continue;
      if (!byLap.has(p.lap)) byLap.set(p.lap, { lap: p.lap });
      byLap.get(p.lap)[p.driver] = p.position;
    }
    return Array.from(byLap.values()).sort((x, y) => x.lap - y.lap);
  }, [bundle, a, b]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DriverSelect value={a} onChange={setA} options={codes} color={colorOf(a)} />
        <ArrowLeftRight size={16} className="text-ink-faint" />
        <DriverSelect value={b} onChange={setB} options={codes} color={colorOf(b)} />
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {err && <ErrorState message={err} />}

      {data && !loading && !("error" in data) && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Position trace" info="Where each car ran, lap by lap. P1 at the top.">
              {positionData.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-center text-xs text-ink-faint">
                  Position order isn't tracked in this session (practice and qualifying have no running order).
                </div>
              ) : (
              <div className="h-[240px]">
                <ResponsiveContainer>
                  <LineChart data={positionData} margin={{ top: 6, right: 12, bottom: 2, left: -8 }}>
                    <CartesianGrid strokeDasharray="2 4" />
                    <XAxis dataKey="lap" type="number" domain={[1, bundle.session.total_laps]}
                      tick={{ fill: "#5f6b84", fontSize: 10 }} tickLine={false} />
                    <YAxis reversed domain={[1, bundle.session.drivers.length]}
                      tick={{ fill: "#5f6b84", fontSize: 10 }} width={26} tickLine={false} />
                    <Tooltip isAnimationActive={false}
                      contentStyle={{ background: "#0f131d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(l) => `Lap ${l}`} />
                    <Line dataKey={a} stroke={colorOf(a)} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey={b} stroke={colorOf(b)} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              )}
            </ChartCard>

            <ChartCard title="Cumulative time delta"
              info={`Running gap built up lap by lap. Above the line ${a} is behind; below, ${a} is ahead of ${b}.`}>
              <div className="h-[240px]">
                <ResponsiveContainer>
                  <AreaChart data={data.lap_delta} margin={{ top: 6, right: 12, bottom: 2, left: -8 }}>
                    <defs>
                      <linearGradient id="delta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colorOf(b)} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={colorOf(a)} stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" />
                    <XAxis dataKey="lap" type="number" domain={[1, bundle.session.total_laps]}
                      tick={{ fill: "#5f6b84", fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fill: "#5f6b84", fontSize: 10 }} width={40}
                      tickFormatter={(v) => `${v}s`} tickLine={false} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Tooltip isAnimationActive={false}
                      contentStyle={{ background: "#0f131d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(l) => `Lap ${l}`} formatter={(v: any) => [`${v}s`, `${a} − ${b}`]} />
                    <Area dataKey="delta" stroke={colorOf(a)} fill="url(#delta)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <CompareTable data={data} a={a} b={b} bundle={bundle} />
            <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-4">
              <div className="label mb-2">Final verdict</div>
              {data.verdict_points?.length ? (
                <ul className="space-y-2">
                  {data.verdict_points.map((p: string, i: number) => (
                    <li key={i} className={
                      i === data.verdict_points.length - 1
                        ? "border-t border-white/[0.08] pt-2 text-sm font-medium leading-relaxed text-ink"
                        : "flex gap-2 text-sm leading-relaxed text-ink"
                    }>
                      {i !== data.verdict_points.length - 1 && (
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-soft/70" />
                      )}
                      {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-relaxed text-ink">{data.verdict}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CompareTable({ data, a, b, bundle }: { data: any; a: string; b: string; bundle: RaceBundle }) {
  const pa = bundle.pace.find((p) => p.driver === a);
  const pb = bundle.pace.find((p) => p.driver === b);
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ["Finish", `P${data.classification[a]?.position ?? "—"}`, `P${data.classification[b]?.position ?? "—"}`],
    ["Pace rank", `P${pa?.pace_rank ?? "—"}`, `P${pb?.pace_rank ?? "—"}`],
    ["Clean-air pace", fmtLap(pa?.clean_air_pace), fmtLap(pb?.clean_air_pace)],
    ["Best lap", fmtLap(pa?.best_lap), fmtLap(pb?.best_lap)],
    ["Consistency", pa?.consistency_score?.toFixed(0) ?? "—", pb?.consistency_score?.toFixed(0) ?? "—"],
    ["Traffic laps", pa?.traffic_laps ?? "—", pb?.traffic_laps ?? "—"],
    ["Pit-lane loss", fmtSec(data.pit_loss[a]), fmtSec(data.pit_loss[b])],
    ["Strategy", <CompoundSeq key="a" seq={data.compound_sequence[a]} />, <CompoundSeq key="b" seq={data.compound_sequence[b]} />],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-base-800/50 text-xs text-ink-faint">
            <th className="py-2 pl-4 text-left font-semibold">Metric</th>
            <th className="py-2 text-center font-semibold">{a}</th>
            <th className="py-2 pr-4 text-center font-semibold">{b}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, va, vb]) => (
            <tr key={k} className="border-t border-white/[0.04]">
              <td className="py-2 pl-4 text-ink-muted">{k}</td>
              <td className="py-2 text-center tabular-nums">{va}</td>
              <td className="py-2 pr-4 text-center tabular-nums">{vb}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompoundSeq({ seq }: { seq: string[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {seq?.map((c, i) => (
        <span key={i} className="rounded px-1 text-[10px] font-bold"
          style={{ background: COMPOUND_COLOR[c as keyof typeof COMPOUND_COLOR], color: "#0b0e16" }}>
          {COMPOUND_SHORT[c as keyof typeof COMPOUND_SHORT]}
        </span>
      ))}
    </span>
  );
}

function DriverSelect({ value, onChange, options, color }: {
  value: string; onChange: (v: string) => void; options: string[]; color: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-base-800 px-3 py-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-semibold text-ink outline-none">
        {options.map((o) => <option key={o} value={o} className="bg-base-800">{o}</option>)}
      </select>
    </span>
  );
}

function ChartCard({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        {title}{info && <InfoTip text={info} />}
      </div>
      {children}
    </div>
  );
}
