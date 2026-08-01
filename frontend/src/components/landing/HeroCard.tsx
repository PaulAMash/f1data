"use client";
import { forwardRef } from "react";
import { type Annotation } from "@/lib/raceEngine";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* An event card.                                                             */
/*                                                                            */
/* A label and a number is a caption. What a pit wall actually shows is a      */
/* small instrument: the reading, and the shape the reading came from. So      */
/* every card carries a visualisation, and which one it carries is a property  */
/* of the event rather than a decoration chosen at random —                     */
/*                                                                            */
/*   spark   a lap-time trace          — anything about pace                   */
/*   bars    a per-sector breakdown    — anything measured in sectors          */
/*   wave    a live waveform           — anything continuously sampled         */
/*   gauge   a filled arc              — anything with a percentage            */
/*   pulse   a breathing ring          — a state, not a number                 */
/*   scan    a sweeping bar            — the system doing work                 */
/*                                                                            */
/* All six are two dozen pixels wide. They are not there to be read; they are  */
/* there so the card reads as an instrument rather than as a tooltip.          */
/* -------------------------------------------------------------------------- */

export const HeroCard = forwardRef<HTMLDivElement, { a: Annotation }>(
  function HeroCard({ a }, ref) {
    return (
      <div ref={ref} className={cx("ann absolute left-0 top-0 opacity-0", `tone-${a.tone}`)}>
        <span className="ann-stem" />
        <span className="ann-riser" />
        <span className="ann-anchor" style={{ background: `var(--d${a.ref})` }} />
        <span className="ann-card">
          <span className="ann-head">
            <span className="ann-dot" style={{ background: `var(--d${a.ref})` }} />
            {a.label}
          </span>
          {a.value && <span className="ann-value">{a.value}</span>}
          <Viz a={a} />
        </span>
      </div>
    );
  },
);

function Viz({ a }: { a: Annotation }) {
  const stroke = `var(--d${a.ref})`;
  switch (a.viz) {
    case "spark":
      return <Line points={a.series} stroke={stroke} />;
    case "wave":
      return <Line points={a.series} stroke={stroke} smooth />;
    case "bars":
      return (
        <svg width="30" height="14" viewBox="0 0 30 14" fill="none" className="ann-spark">
          {a.series.slice(0, 6).map((v, i) => (
            <rect key={i} x={i * 5} y={13 - v * 11} width="3" height={Math.max(1.5, v * 11)}
              rx="1.2" fill={stroke} opacity={0.5 + v * 0.5} />
          ))}
        </svg>
      );
    case "gauge":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ann-spark">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".18" />
          <circle cx="8" cy="8" r="6" stroke={stroke} strokeWidth="2" strokeLinecap="round"
            strokeDasharray="37.7" className="ann-gauge" transform="rotate(-90 8 8)" />
        </svg>
      );
    case "pulse":
      return (
        <span className="ann-ring" style={{ background: stroke }} />
      );
    case "scan":
      return <span className="ann-scan"><i style={{ background: stroke }} /></span>;
  }
}

function Line({ points, stroke, smooth }: { points: number[]; stroke: string; smooth?: boolean }) {
  if (!points.length) return null;
  const x = (i: number) => (i / (points.length - 1)) * 30;
  const y = (v: number) => 13 - v * 11;
  let d = `M ${x(0)} ${y(points[0])}`;
  if (smooth) {
    // the same Catmull-Rom the racing lines use, so nothing in the hero has a
    // corner in it anywhere
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i];
      const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      d += ` C ${x(i) + (x(i + 1) - x(i - 1 < 0 ? 0 : i - 1)) / 6} ${y(p1) + (y(p2) - y(p0)) / 6},`
        + ` ${x(i + 1) - (x(Math.min(points.length - 1, i + 2)) - x(i)) / 6} ${y(p2) - (y(p3) - y(p1)) / 6},`
        + ` ${x(i + 1)} ${y(p2)}`;
    }
  } else {
    for (let i = 1; i < points.length; i++) d += ` L ${x(i)} ${y(points[i])}`;
  }
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" fill="none" className="ann-spark">
      <path d={d} stroke={stroke} strokeWidth="1.2" strokeLinecap="round"
        strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
