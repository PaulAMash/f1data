"use client";
import { useMemo } from "react";
import type { RaceBundle } from "@/lib/types";

/**
 * Key moments at a glance: one horizontal lap timeline with neutralization
 * windows (VSC / Safety Car), the turning point, and the podium's pit stops.
 * Small on purpose — it's for scanning, not analysis (that's the Charts tab).
 */
export function RaceTimeline({ bundle }: { bundle: RaceBundle }) {
  const { session, strategy } = bundle;
  const total = Math.max(1, session.total_laps);
  const W = 1000, H = 92, PAD = 14, ROW_Y = 46;
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
    for (let l = step; l < total; l += step) out.push(l);
    return out;
  }, [total]);

  if (!session.positions.length && !session.pit_stops.length) return null;

  return (
    <div>
      <div className="label mb-2">Key moments</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Race timeline with safety-car windows and podium pit stops">
        {/* base track line */}
        <line x1={PAD} y1={ROW_Y} x2={W - PAD} y2={ROW_Y} stroke="rgba(255,255,255,0.14)" strokeWidth={2} />

        {/* neutralization windows */}
        {session.track_status_windows.map((w, i) => (
          <g key={i}>
            <rect x={x(w.start_lap)} y={ROW_Y - 16} width={Math.max(3, x(w.end_lap) - x(w.start_lap))}
              height={32} rx={4} fill="rgba(255,176,32,0.16)" stroke="rgba(255,176,32,0.35)" strokeWidth={1} />
            <text x={(x(w.start_lap) + x(w.end_lap)) / 2} y={ROW_Y - 22} textAnchor="middle"
              fill="#ffb020" fontSize={11} fontWeight={600}>{w.label ?? "SC"}</text>
          </g>
        ))}

        {/* podium pit stops */}
        {pits.map((p, i) => {
          const c = podium.find((r) => r.driver === p.driver);
          return (
            <g key={i}>
              <line x1={x(p.lap)} y1={ROW_Y} x2={x(p.lap)} y2={ROW_Y + 14}
                stroke={c?.team_color ?? "#888"} strokeWidth={2} />
              <circle cx={x(p.lap)} cy={ROW_Y + 18} r={4} fill={c?.team_color ?? "#888"}>
                <title>{p.driver} pit · lap {p.lap}</title>
              </circle>
            </g>
          );
        })}

        {/* turning point */}
        {tpLap && (
          <g>
            <line x1={x(tpLap)} y1={ROW_Y - 20} x2={x(tpLap)} y2={ROW_Y + 20}
              stroke="rgba(255,107,107,0.85)" strokeWidth={2} strokeDasharray="4 3" />
            <text x={x(tpLap)} y={H - 4} textAnchor="middle" fill="#ff6b6b" fontSize={11} fontWeight={600}>
              Turning point · L{tpLap}
            </text>
          </g>
        )}

        {/* lap ticks */}
        {ticks.map((l) => (
          <g key={l}>
            <line x1={x(l)} y1={ROW_Y - 3} x2={x(l)} y2={ROW_Y + 3} stroke="rgba(255,255,255,0.2)" />
            <text x={x(l)} y={ROW_Y - 8} textAnchor="middle" fill="#5f6b84" fontSize={10}>{l}</text>
          </g>
        ))}
        <text x={PAD} y={ROW_Y - 8} fill="#5f6b84" fontSize={10}>L1</text>
        <text x={W - PAD} y={ROW_Y - 8} textAnchor="end" fill="#5f6b84" fontSize={10}>L{total}</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-faint">
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-amber/30 align-middle" />VSC / Safety Car</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ink-faint align-middle" />Podium pit stops</span>
      </div>
    </div>
  );
}
