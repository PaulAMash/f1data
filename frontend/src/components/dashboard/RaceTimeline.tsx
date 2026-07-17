"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { RaceBundle } from "@/lib/types";

interface Tip { x: number; y: number; title: string; lines: string[] }

/**
 * Key moments at a glance: one horizontal lap strip with neutralization
 * windows (VSC / Safety Car), the turning point, and the podium's pit stops.
 * Hover anything for the detail; deep analysis lives in the Charts tab.
 */
export function RaceTimeline({ bundle }: { bundle: RaceBundle }) {
  const { session, strategy } = bundle;
  const [tip, setTip] = useState<Tip | null>(null);
  const total = Math.max(1, session.total_laps);
  const W = 1000, H = 64, PAD = 18, Y = 34;
  const x = (lap: number) => PAD + ((lap - 1) / Math.max(1, total - 1)) * (W - 2 * PAD);

  const podium = useMemo(
    () => [...session.classification]
      .filter((c) => c.position && c.position <= 3)
      .sort((a, b) => (a.position ?? 9) - (b.position ?? 9)),
    [session],
  );
  const pits = useMemo(
    () => session.pit_stops.filter((p) => podium.some((c) => c.driver === p.driver)),
    [session, podium],
  );
  const tp = strategy.turning_points[0];
  const tpLap = tp?.lap_range?.[0];

  const ticks = useMemo(() => {
    const step = total > 50 ? 10 : 5;
    const out: number[] = [];
    for (let l = step; l < total; l += step) {
      if (l / total > 0.06 && l / total < 0.94) out.push(l);
    }
    return out;
  }, [total]);

  // Races and sprints only — qualifying/practice pit entries are runs, not
  // strategy, and used to render as a meaningless wall of dots.
  if (bundle.category !== "race" && bundle.category !== "sprint") return null;
  if (!session.positions.length && !session.pit_stops.length) return null;
  // If any podium car shows an implausible stop count the pit feed is suspect.
  const pitsReliable = session.pit_data_reliable !== false &&
    podium.every((c) => pits.filter((p) => p.driver === c.driver).length <= 5);

  const show = (e: React.MouseEvent, title: string, lines: string[]) =>
    setTip({ x: e.clientX, y: e.clientY, title, lines });

  const windowTip = (w: any) => {
    const inWindow = Array.from(new Set(
      session.pit_stops.filter((p) => p.lap >= w.start_lap && p.lap <= w.end_lap).map((p) => p.driver)));
    return [
      `Laps ${w.start_lap}–${w.end_lap}`,
      inWindow.length
        ? `Pitted cheap in this window: ${inWindow.slice(0, 8).join(", ")}`
        : "No cars pitted in this window",
    ];
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label">Key moments</span>
        <span className="flex flex-wrap gap-3 text-[11px] text-ink-faint">
          <span><span className="mr-1.5 inline-block h-2 w-3.5 rounded-[2px] bg-amber/30 ring-1 ring-amber/40 align-middle" />VSC / Safety Car</span>
          {pitsReliable && <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink-faint align-middle" />Podium pit stop</span>}
          {tpLap && <span><span className="mr-1.5 inline-block h-2 w-2 rotate-45 bg-accent-soft align-middle" />Turning point</span>}
          <span className="text-ink-faint/70">hover for detail</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Race timeline with safety-car windows and podium pit stops"
        onMouseLeave={() => setTip(null)}>
        <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="rgba(255,255,255,0.12)" strokeWidth={4} strokeLinecap="round" />

        {/* neutralization windows */}
        {session.track_status_windows.map((w, i) => {
          const x1 = x(w.start_lap), x2 = x(w.end_lap);
          const wide = x2 - x1 > 70;
          return (
            <g key={i} className="cursor-help"
              onMouseMove={(e) => show(e, w.label ?? "Neutralization", windowTip(w))}
              onMouseLeave={() => setTip(null)}>
              <rect x={x1} y={Y - 8} width={Math.max(5, x2 - x1)} height={16} rx={8}
                fill="rgba(255,176,32,0.30)" stroke="rgba(255,176,32,0.55)" strokeWidth={1} />
              <text x={(x1 + x2) / 2} y={Y - 14} textAnchor="middle" pointerEvents="none"
                fill="#ffb020" fontSize={11} fontWeight={600}>
                {wide ? (w.label ?? "SC") : (w.label ?? "SC").split(" ").map((t: string) => t[0]).join("")}
              </text>
            </g>
          );
        })}

        {/* podium pit stops */}
        {pitsReliable && pits.map((p, i) => {
          const c = podium.find((r) => r.driver === p.driver);
          return (
            <g key={i} className="cursor-help"
              onMouseMove={(e) => show(e, `${c?.name ?? p.driver} — pit stop`,
                [`Lap ${p.lap}`, `Finished P${c?.position}`])}
              onMouseLeave={() => setTip(null)}>
              {/* generous invisible hit area */}
              <circle cx={x(p.lap)} cy={Y} r={11} fill="transparent" />
              <circle cx={x(p.lap)} cy={Y} r={5} pointerEvents="none"
                fill={c?.team_color ?? "#888"} stroke="#0b0e16" strokeWidth={2} />
            </g>
          );
        })}

        {/* turning point — hover for the story; no static label to collide with ticks */}
        {tpLap && (
          <g className="cursor-help"
            onMouseMove={(e) => show(e, "Turning point",
              [tp!.title, ...(tp!.detail ? [tp!.detail] : [])])}
            onMouseLeave={() => setTip(null)}>
            <rect x={x(tpLap) - 10} y={Y - 28} width={20} height={20} fill="transparent" />
            <rect x={x(tpLap) - 5} y={Y - 25} width={10} height={10} rx={2} pointerEvents="none"
              transform={`rotate(45 ${x(tpLap)} ${Y - 20})`} fill="#ff6b6b" />
            <line x1={x(tpLap)} y1={Y - 13} x2={x(tpLap)} y2={Y - 8} pointerEvents="none"
              stroke="rgba(255,107,107,0.8)" strokeWidth={1.5} />
          </g>
        )}

        {/* lap ticks */}
        {ticks.map((l) => (
          <g key={l} pointerEvents="none">
            <line x1={x(l)} y1={Y + 8} x2={x(l)} y2={Y + 12} stroke="rgba(255,255,255,0.18)" />
            <text x={x(l)} y={Y + 24} textAnchor="middle" fill="#5f6b84" fontSize={10}>{l}</text>
          </g>
        ))}
        <text x={PAD} y={Y + 24} textAnchor="start" fill="#5f6b84" fontSize={10}>L1</text>
        <text x={W - PAD} y={Y + 24} textAnchor="end" fill="#5f6b84" fontSize={10}>L{total}</text>
      </svg>

      {tip && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed z-50 w-64 rounded-xl border border-white/10 bg-base-900/95 p-3 text-xs shadow-glow"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 272),
            top: Math.min(tip.y + 14, (typeof window !== "undefined" ? window.innerHeight : 9999) - 140),
          }}>
          <div className="mb-1 font-semibold text-ink">{tip.title}</div>
          {tip.lines.map((l, i) => (
            <div key={i} className="leading-relaxed text-ink-muted">{l}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
