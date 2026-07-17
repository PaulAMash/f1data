"use client";
import { useMemo } from "react";
import type { RaceBundle } from "@/lib/types";

/**
 * Key moments at a glance: one horizontal lap strip with neutralization
 * windows (VSC / Safety Car), the turning point, and the podium's pit stops.
 * Small on purpose — it's for scanning, not analysis (that's the Charts tab).
 */
export function RaceTimeline({ bundle }: { bundle: RaceBundle }) {
  const { session, strategy } = bundle;
  const total = Math.max(1, session.total_laps);
  const W = 1000, H = 74, PAD = 18, Y = 40;
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

  // ticks that never collide with the L1 / L{total} end labels
  const ticks = useMemo(() => {
    const step = total > 50 ? 10 : 5;
    const out: number[] = [];
    for (let l = step; l < total; l += step) {
      if (l / total > 0.06 && l / total < 0.94) out.push(l);
    }
    return out;
  }, [total]);

  if (!session.positions.length && !session.pit_stops.length) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label">Key moments</span>
        <span className="flex flex-wrap gap-3 text-[11px] text-ink-faint">
          <span><span className="mr-1.5 inline-block h-2 w-3.5 rounded-[2px] bg-amber/30 ring-1 ring-amber/40 align-middle" />VSC / Safety Car</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink-faint align-middle" />Podium pit stop</span>
          {tpLap && <span><span className="mr-1.5 inline-block h-2 w-2 rotate-45 bg-accent-soft align-middle" />Turning point</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Race timeline with safety-car windows and podium pit stops">
        {/* base track line */}
        <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="rgba(255,255,255,0.12)" strokeWidth={4} strokeLinecap="round" />

        {/* neutralization windows sit ON the track line */}
        {session.track_status_windows.map((w, i) => {
          const x1 = x(w.start_lap), x2 = x(w.end_lap);
          const wide = x2 - x1 > 70;
          return (
            <g key={i}>
              <rect x={x1} y={Y - 7} width={Math.max(4, x2 - x1)} height={14} rx={7}
                fill="rgba(255,176,32,0.30)" stroke="rgba(255,176,32,0.55)" strokeWidth={1} />
              <text x={(x1 + x2) / 2} y={Y - 14} textAnchor="middle"
                fill="#ffb020" fontSize={11} fontWeight={600}>
                {wide ? (w.label ?? "SC") : (w.label ?? "SC").split(" ").map((t) => t[0]).join("")}
              </text>
            </g>
          );
        })}

        {/* podium pit stops: team-coloured dots on the line */}
        {pits.map((p, i) => {
          const c = podium.find((r) => r.driver === p.driver);
          return (
            <circle key={i} cx={x(p.lap)} cy={Y} r={5}
              fill={c?.team_color ?? "#888"} stroke="#0b0e16" strokeWidth={2}>
              <title>{p.driver} pit · lap {p.lap}</title>
            </circle>
          );
        })}

        {/* turning point: diamond above the line, label below the axis */}
        {tpLap && (
          <g>
            <rect x={x(tpLap) - 5} y={Y - 24} width={10} height={10} rx={2}
              transform={`rotate(45 ${x(tpLap)} ${Y - 19})`} fill="#ff6b6b" />
            <line x1={x(tpLap)} y1={Y - 12} x2={x(tpLap)} y2={Y - 6}
              stroke="rgba(255,107,107,0.8)" strokeWidth={1.5} />
            <text x={x(tpLap)} y={H - 2} textAnchor="middle" fill="#ff6b6b" fontSize={11} fontWeight={600}>
              L{tpLap}
            </text>
          </g>
        )}

        {/* lap ticks under the line */}
        {ticks.map((l) => (
          <g key={l}>
            <line x1={x(l)} y1={Y + 8} x2={x(l)} y2={Y + 12} stroke="rgba(255,255,255,0.18)" />
            <text x={x(l)} y={Y + 24} textAnchor="middle" fill="#5f6b84" fontSize={10}>{l}</text>
          </g>
        ))}
        <text x={PAD} y={Y + 24} textAnchor="start" fill="#5f6b84" fontSize={10}>L1</text>
        <text x={W - PAD} y={Y + 24} textAnchor="end" fill="#5f6b84" fontSize={10}>L{total}</text>
      </svg>
    </div>
  );
}
