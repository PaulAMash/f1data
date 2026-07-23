"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { RaceSession, Stint, UndercutEvent, Driver } from "@/lib/types";
import { COMPOUND_COLOR, COMPOUND_LABEL, COMPOUND_SHORT } from "@/lib/compounds";
import { EVENT, deriveWindows } from "@/lib/raceEvents";
import { cx, fmtLap } from "@/lib/format";
import { FocusCardShell, type FocusTile } from "./FocusCardShell";

export function TyreStrategyChart({
  session, undercuts = [], highlight = [], onSelect,
}: {
  session: RaceSession; undercuts?: UndercutEvent[]; highlight?: string[];
  onSelect?: (codes: string[]) => void;
}) {
  const total = session.total_laps;
  const [tip, setTip] = useState<{ s: Stint; x: number; y: number } | null>(null);

  const order = useMemo(() => [...session.classification].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)), [session]);
  const stintsByDriver = useMemo(() => {
    const m = new Map<string, Stint[]>();
    for (const s of session.stints) { if (!m.has(s.driver)) m.set(s.driver, []); m.get(s.driver)!.push(s); }
    for (const arr of m.values()) arr.sort((a, b) => a.stint - b.stint);
    return m;
  }, [session]);
  const windows = useMemo(() => deriveWindows(session), [session]);
  const driverByCode = useMemo(() => Object.fromEntries(session.drivers.map((d) => [d.code, d])) as Record<string, Driver>, [session.drivers]);

  const undercutDrivers = new Set(undercuts.flatMap((u) => [u.attacker]));
  const axisTicks = tickLaps(total);
  const focusCode = highlight.length === 1 ? highlight[0] : null;
  const focusable = !!onSelect;
  const pick = (code: string) => onSelect?.(highlight.includes(code) ? [] : [code]);

  return (
    <div className="space-y-4">
      {focusCode && driverByCode[focusCode] && (
        <TyreFocusCard driver={driverByCode[focusCode]} stints={stintsByDriver.get(focusCode) ?? []}
          row={session.classification.find((c) => c.driver === focusCode)} onClear={() => onSelect?.([])} />
      )}

      <div className="relative">
        <div className="mb-1 flex pl-14 pr-2">
          <div className="relative h-4 flex-1">
            {axisTicks.map((l) => (
              <span key={l} className="absolute -translate-x-1/2 text-[10px] text-ink-faint" style={{ left: `${(l / total) * 100}%` }}>{l}</span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* neutralisation windows — same detection the Position chart uses */}
          <div className="pointer-events-none absolute inset-0 left-14 right-2">
            {windows.map((w, i) => (
              <div key={i} className="absolute top-0 bottom-0 rounded-sm border-x" title={EVENT[w.kind].label}
                style={{
                  left: `${((w.start - 1) / total) * 100}%`, width: `${((w.end - w.start + 1) / total) * 100}%`,
                  background: `${EVENT[w.kind].color}22`, borderColor: `${EVENT[w.kind].color}55`,
                }} />
            ))}
          </div>

          <div className="space-y-1">
            {order.map((c) => {
              const stints = stintsByDriver.get(c.driver) ?? [];
              const isFocus = highlight.includes(c.driver);
              const dim = highlight.length > 0 && !isFocus;
              const RowTag = focusable ? "button" : "div";
              return (
                <RowTag key={c.driver} {...(focusable ? { onClick: () => pick(c.driver), type: "button" as const } : {})}
                  className={cx("flex w-full items-center gap-2 rounded-md text-left transition-all",
                    focusable && "hover:bg-white/[0.03]", dim && "opacity-30", isFocus && "bg-white/[0.05] ring-1 ring-white/15")}
                  style={isFocus ? { boxShadow: `inset 3px 0 0 0 ${c.team_color}` } : undefined}>
                  <div className="flex w-12 shrink-0 items-center gap-1.5 pl-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.team_color }} />
                    <span className={cx("text-xs font-semibold", isFocus && "text-ink")}>{c.driver}</span>
                  </div>
                  <div className="relative h-6 flex-1">
                    {stints.map((s) => {
                      const left = ((s.start_lap - 1) / total) * 100, width = (s.laps / total) * 100;
                      return (
                        <div key={s.stint}
                          onMouseEnter={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTip(null)}
                          className="absolute top-0 flex h-6 items-center justify-center overflow-hidden rounded-[3px] text-[10px] font-bold ring-1 ring-black/20 transition-transform hover:z-10 hover:scale-y-110"
                          style={{ left: `${left}%`, width: `${width}%`, background: COMPOUND_COLOR[s.compound], color: "#0b0e16" }}>
                          {width > 5 ? `${COMPOUND_SHORT[s.compound]}${s.laps}` : ""}
                        </div>
                      );
                    })}
                    {undercutDrivers.has(c.driver) && (
                      <span className="absolute -top-1 text-[9px] text-speed" title="Undercut attempt"
                        style={{ left: `${((undercuts.find((u) => u.attacker === c.driver)!.pit_lap) / total) * 100}%` }}>▲</span>
                    )}
                  </div>
                </RowTag>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 pl-14 text-[11px] text-ink-muted">
          {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COMPOUND_COLOR[c] }} /> {COMPOUND_LABEL[c]}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="text-speed">▲</span> Undercut</span>
          {Array.from(new Set(windows.map((w) => w.kind))).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm" style={{ background: `${EVENT[k].color}33` }} /> {EVENT[k].label}</span>
          ))}
          {focusable && <span className="text-ink-faint">· click a driver to focus their strategy</span>}
        </div>

        {tip && <StintTooltip {...tip} />}
      </div>
    </div>
  );
}

function TyreFocusCard({ driver, stints, row, onClear }: {
  driver: Driver; stints: Stint[]; row?: RaceSession["classification"][number]; onClear: () => void;
}) {
  const ordered = [...stints].sort((a, b) => a.stint - b.stint);
  const stops = row?.pit_stops ?? Math.max(0, ordered.length - 1);
  const longest = ordered.reduce((mx, s) => Math.max(mx, s.laps), 0);
  const seq = ordered.map((s) => COMPOUND_LABEL[s.compound]).join(" → ");
  const tiles: FocusTile[] = [
    { label: "Pit stops", value: String(stops) },
    { label: "Stints", value: String(ordered.length) },
    { label: "Longest stint", value: longest ? `${longest}L` : "—" },
    { label: "Compounds", value: String(new Set(ordered.map((s) => s.compound)).size) },
  ];
  return (
    <FocusCardShell driver={driver} eyebrow="Focused strategy" tiles={tiles}
      takeaway={ordered.length ? `${stops === 0 ? "No-stopper" : `${stops}-stop`} · ${seq}` : undefined} onClear={onClear}>
      {ordered.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Compound progression · stint length</div>
          <div className="flex gap-1">
            {ordered.map((s, i) => (
              <div key={i} className="min-w-0 rounded-md px-2 py-1.5 text-center" style={{ flexGrow: s.laps, background: `${COMPOUND_COLOR[s.compound]}22`, boxShadow: `inset 0 -2px 0 0 ${COMPOUND_COLOR[s.compound]}` }}
                title={`${COMPOUND_LABEL[s.compound]} · laps ${s.start_lap}-${s.end_lap}`}>
                <div className="text-[10px] font-bold" style={{ color: COMPOUND_COLOR[s.compound] }}>{COMPOUND_LABEL[s.compound]}</div>
                <div className="text-[10px] tabular-nums text-ink-muted">{s.laps}L · {s.start_lap}-{s.end_lap}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </FocusCardShell>
  );
}

function StintTooltip({ s, x, y }: { s: Stint; x: number; y: number }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed z-50 w-56 rounded-xl border border-white/10 bg-base-900/95 p-3 text-xs shadow-glow"
      style={{
        left: Math.min(x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240),
        top: Math.min(y + 14, (typeof window !== "undefined" ? window.innerHeight : 9999) - 180),
      }}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: COMPOUND_COLOR[s.compound], color: "#0b0e16" }}>{COMPOUND_LABEL[s.compound]}</span>
        <span className="text-ink-muted">{s.is_new_tyre ? "new" : "used"} · stint {s.stint}</span>
      </div>
      <Row k="Laps" v={`${s.start_lap}–${s.end_lap} (${s.laps} laps)`} />
      <Row k="Avg lap" v={fmtLap(s.avg_lap)} />
      <Row k="Median lap" v={fmtLap(s.median_lap)} />
      <Row k="Best lap" v={fmtLap(s.best_lap)} />
      <Row k="Degradation" v={s.degradation != null ? `${s.degradation >= 0 ? "+" : ""}${s.degradation.toFixed(3)}s/lap` : "—"} />
    </div>,
    document.body,
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5"><span className="text-ink-faint">{k}</span><span className="tabular-nums text-ink">{v}</span></div>
  );
}

function tickLaps(total: number): number[] {
  const step = total > 60 ? 10 : total > 30 ? 5 : 2;
  const out: number[] = [];
  for (let l = step; l < total; l += step) out.push(l);
  out.push(total);
  return out;
}
