"use client";
import { useMemo, useState } from "react";
import type { RaceSession, Stint, UndercutEvent } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import { cx, fmtLap, fmtSec } from "@/lib/format";

const WINDOW_FILL: Record<string, string> = {
  VSC: "rgba(255,176,32,0.14)", SAFETY_CAR: "rgba(255,140,0,0.18)",
  RED: "rgba(255,59,59,0.16)", YELLOW: "rgba(255,220,80,0.08)",
};

export function TyreStrategyChart({
  session, undercuts = [], highlight = [],
}: { session: RaceSession; undercuts?: UndercutEvent[]; highlight?: string[] }) {
  const total = session.total_laps;
  const [tip, setTip] = useState<{ s: Stint; x: number; y: number } | null>(null);

  const order = useMemo(
    () => [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    [session],
  );
  const stintsByDriver = useMemo(() => {
    const m = new Map<string, Stint[]>();
    for (const s of session.stints) {
      if (!m.has(s.driver)) m.set(s.driver, []);
      m.get(s.driver)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.stint - b.stint);
    return m;
  }, [session]);

  const undercutDrivers = new Set(undercuts.flatMap((u) => [u.attacker]));
  const axisTicks = tickLaps(total);

  return (
    <div className="relative">
      {/* lap axis */}
      <div className="mb-1 flex pl-14 pr-2">
        <div className="relative h-4 flex-1">
          {axisTicks.map((l) => (
            <span key={l} className="absolute -translate-x-1/2 text-[10px] text-ink-faint"
              style={{ left: `${(l / total) * 100}%` }}>{l}</span>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* neutralization windows behind rows */}
        <div className="pointer-events-none absolute inset-0 left-14 right-2">
          {session.track_status_windows.map((w, i) => (
            <div key={i} className="absolute top-0 bottom-0 rounded-sm" title={w.label}
              style={{
                left: `${((w.start_lap - 1) / total) * 100}%`,
                width: `${((w.end_lap - w.start_lap + 1) / total) * 100}%`,
                background: WINDOW_FILL[w.status] ?? "rgba(255,255,255,0.05)",
              }} />
          ))}
        </div>

        <div className="space-y-1">
          {order.map((c) => {
            const stints = stintsByDriver.get(c.driver) ?? [];
            const dim = highlight.length > 0 && !highlight.includes(c.driver);
            return (
              <div key={c.driver} className={cx("flex items-center gap-2", dim && "opacity-30")}>
                <div className="flex w-12 shrink-0 items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.team_color }} />
                  <span className="text-xs font-semibold">{c.driver}</span>
                </div>
                <div className="relative h-6 flex-1">
                  {stints.map((s) => {
                    const left = ((s.start_lap - 1) / total) * 100;
                    const width = (s.laps / total) * 100;
                    return (
                      <div
                        key={s.stint}
                        onMouseEnter={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTip(null)}
                        className="absolute top-0 flex h-6 items-center justify-center overflow-hidden rounded-[3px] text-[10px] font-bold ring-1 ring-black/20 transition-transform hover:z-10 hover:scale-y-110"
                        style={{
                          left: `${left}%`, width: `${width}%`,
                          background: COMPOUND_COLOR[s.compound], color: "#0b0e16",
                        }}
                      >
                        {width > 5 ? `${COMPOUND_SHORT[s.compound]}${s.laps}` : ""}
                      </div>
                    );
                  })}
                  {/* undercut marker */}
                  {undercutDrivers.has(c.driver) && (
                    <span className="absolute -top-1 text-[9px] text-speed"
                      style={{ left: `${((undercuts.find((u) => u.attacker === c.driver)!.pit_lap) / total) * 100}%` }}
                      title="Undercut attempt">▲</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 pl-14 text-[11px] text-ink-muted">
        {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COMPOUND_COLOR[c] }} />
            {COMPOUND_LABEL[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="text-speed">▲</span> Undercut</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: WINDOW_FILL.VSC }} /> VSC / SC window
        </span>
      </div>

      {tip && <StintTooltip {...tip} />}
    </div>
  );
}

function StintTooltip({ s, x, y }: { s: Stint; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-xl border border-white/10 bg-base-900/95 p-3 text-xs shadow-glow"
      style={{ left: Math.min(x + 12, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240), top: y + 12 }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: COMPOUND_COLOR[s.compound], color: "#0b0e16" }}>
          {COMPOUND_LABEL[s.compound]}
        </span>
        <span className="text-ink-muted">{s.is_new_tyre ? "new" : "used"} · stint {s.stint}</span>
      </div>
      <Row k="Laps" v={`${s.start_lap}–${s.end_lap} (${s.laps} laps)`} />
      <Row k="Avg lap" v={fmtLap(s.avg_lap)} />
      <Row k="Median lap" v={fmtLap(s.median_lap)} />
      <Row k="Best lap" v={fmtLap(s.best_lap)} />
      <Row k="Degradation" v={s.degradation != null ? `${s.degradation >= 0 ? "+" : ""}${s.degradation.toFixed(3)}s/lap` : "—"} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-faint">{k}</span>
      <span className="tabular-nums text-ink">{v}</span>
    </div>
  );
}

function tickLaps(total: number): number[] {
  const step = total > 60 ? 10 : total > 30 ? 5 : 2;
  const out: number[] = [];
  for (let l = step; l < total; l += step) out.push(l);
  out.push(total);
  return out;
}
