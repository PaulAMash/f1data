"use client";
import { useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import { api } from "@/lib/api";
import type { RaceBundle, SimulationResult } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/misc";
import { InfoTip } from "@/components/ui/InfoTip";
import { cx } from "@/lib/format";

type Mode = "pit" | "stops" | "compounds";
const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"];

export function SimulatorLite({
  bundle, year, gp, session,
}: { bundle: RaceBundle; year: number; gp: string; session: string }) {
  const ranked = [...bundle.pace].sort((a, b) => (a.pace_rank ?? 99) - (b.pace_rank ?? 99));
  const [driver, setDriver] = useState(bundle.strategy.hidden_pace_driver ?? ranked[0]?.driver ?? "");
  const [mode, setMode] = useState<Mode>("pit");
  const [pitLap, setPitLap] = useState(Math.round(bundle.session.total_laps / 2));
  const [stops, setStops] = useState(2);
  const [seq, setSeq] = useState<string[]>(["MEDIUM", "HARD", "SOFT"]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const body: any = { year, gp, session, driver };
      if (mode === "pit") body.new_pit_lap = pitLap;
      if (mode === "stops") body.num_stops = stops;
      if (mode === "compounds") body.compounds = seq;
      setResult(await api.simulate(body));
    } catch (e: any) {
      setResult({
        driver, summary: e.message ?? "Simulation failed.", tyre_risk: "medium",
        verdict: "neutral", assumptions: [], is_estimate: true,
      });
    } finally {
      setLoading(false);
    }
  }

  const riskTone = { low: "good", medium: "key", high: "bad" } as const;
  const verdictTone = { better: "good", worse: "bad", neutral: "neutral" } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <FlaskConical size={14} className="text-accent-soft" /> What-if controls
          <InfoTip text="A lightweight model. It uses the driver's real pit-lane loss, stint degradation and gap-to-leader trace to estimate a direction — not an exact result." />
        </div>

        <label className="block">
          <span className="label">Driver</span>
          <select value={driver} onChange={(e) => setDriver(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-base-800 px-3 py-2 text-sm outline-none">
            {ranked.map((p) => <option key={p.driver} value={p.driver} className="bg-base-800">
              {p.driver} — P{p.finish} ({p.pit_stops} stops)
            </option>)}
          </select>
        </label>

        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-base-900/60 p-1 text-xs">
          {(["pit", "stops", "compounds"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cx("flex-1 rounded-md px-2 py-1.5 font-medium capitalize",
                mode === m ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:text-ink")}>
              {m === "pit" ? "Pit lap" : m === "stops" ? "Stops" : "Tyres"}
            </button>
          ))}
        </div>

        {mode === "pit" && (
          <label className="block">
            <span className="label">New pit lap: <span className="text-ink">{pitLap}</span></span>
            <input type="range" min={2} max={bundle.session.total_laps - 1} value={pitLap}
              onChange={(e) => setPitLap(Number(e.target.value))}
              className="mt-2 w-full accent-accent" />
          </label>
        )}
        {mode === "stops" && (
          <label className="block">
            <span className="label">Number of stops</span>
            <div className="mt-1 flex gap-1.5">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setStops(n)}
                  className={cx("flex-1 rounded-lg border py-2 text-sm font-semibold",
                    stops === n ? "border-accent/40 bg-accent/15 text-accent-soft" : "border-white/10 bg-base-800 text-ink-muted")}>
                  {n}
                </button>
              ))}
            </div>
          </label>
        )}
        {mode === "compounds" && (
          <div>
            <span className="label">Compound sequence</span>
            <div className="mt-1 space-y-1.5">
              {seq.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  {COMPOUNDS.map((opt) => (
                    <button key={opt} onClick={() => setSeq((s) => s.map((x, j) => j === i ? opt : x))}
                      className={cx("flex-1 rounded-md py-1.5 text-xs font-semibold",
                        c === opt ? "ring-2 ring-white/40" : "opacity-60")}
                      style={{ background: opt === "SOFT" ? "#ff3b3b" : opt === "MEDIUM" ? "#ffcf3f" : "#e7ecf3", color: "#0b0e16" }}>
                      {opt[0]}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button className="chip" onClick={() => setSeq((s) => [...s, "HARD"])}>+ stint</button>
                {seq.length > 1 && <button className="chip" onClick={() => setSeq((s) => s.slice(0, -1))}>− stint</button>}
              </div>
            </div>
          </div>
        )}

        <button onClick={run} disabled={loading || !driver}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {loading ? <Spinner size={14} /> : <Play size={14} />} Run estimate
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-base-850/50 p-5">
        {!result && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <FlaskConical size={26} className="text-ink-faint" />
            <p className="text-sm text-ink-muted">Adjust a strategy and run the estimate.</p>
            <p className="max-w-sm text-xs text-ink-faint">
              Try moving {driver}'s stop earlier, or dropping to 2 stops, to see the trade-off.
            </p>
          </div>
        )}
        {result && (
          <div className="animate-fade-in space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{result.driver}</Badge>
              <Badge tone={verdictTone[result.verdict as keyof typeof verdictTone] ?? "neutral"}>
                {result.verdict}
              </Badge>
              <Badge tone={riskTone[result.tyre_risk as keyof typeof riskTone] ?? "neutral"}>
                {result.tyre_risk} tyre risk
              </Badge>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-amber">Estimate</span>
            </div>
            <p className="text-sm leading-relaxed text-ink">{result.summary}</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Net time" value={result.delta_seconds != null ? `${result.delta_seconds >= 0 ? "+" : ""}${result.delta_seconds}s` : "—"} />
              <Metric label="Rejoin" value={result.rejoin_position ? `P${result.rejoin_position}` : "—"}
                sub={result.rejoin_behind ? `behind ${result.rejoin_behind}` : undefined} />
              <Metric label="vs actual" value={result.baseline_finish ? `P${result.baseline_finish}` : "—"} sub="finished" />
            </div>
            {result.assumptions.length > 0 && (
              <div>
                <div className="label mb-1.5">Assumptions</div>
                <ul className="space-y-1 text-xs text-ink-faint">
                  {result.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-base-800/60 p-3">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}
