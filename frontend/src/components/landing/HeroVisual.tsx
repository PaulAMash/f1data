"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The hero.                                                                  */
/*                                                                            */
/* A landing page gets one image, and this product's image should be its own   */
/* subject: a Grand Prix, drawn as light. Five position traces flow across a   */
/* dark canvas, each carrying a travelling glow, with the annotations a race   */
/* engineer would actually be looking at pinned to the moments that matter.    */
/*                                                                            */
/* Three things make it read as a piece of film rather than a chart:           */
/*                                                                            */
/*   IT BUILDS.    Nothing is on screen at t=0. The canvas fades up, the       */
/*                 traces draw themselves left to right over two seconds, the  */
/*                 nodes land, and the labels arrive last — the order a shot   */
/*                 would be cut in.                                            */
/*   IT BREATHES.  Once built, a slow luminance drift moves along each trace   */
/*                 and the ambient light behind it shifts. Nothing translates, */
/*                 nothing loops visibly; it just never goes completely still. */
/*   IT HAS DEPTH. Bloom under the strokes, a vignette over them, and the      */
/*                 labels floating above both on their own plane.              */
/*                                                                            */
/* Pure SVG and CSS. No images, nothing to download, and it themes with the    */
/* rest of the product because every colour is a variable.                      */
/* -------------------------------------------------------------------------- */

interface Trace {
  d: string;
  color: string;
  width: number;
  /** Where the travelling highlight sits, as a fraction — staggered per trace. */
  delay: number;
}

const TRACES: Trace[] = [
  { d: "M-10 132 C 90 128, 150 74, 250 68 S 392 96, 470 46 S 610 30, 740 44", color: "rgb(var(--accent))", width: 2.4, delay: 0 },
  { d: "M-10 158 C 110 154, 176 106, 262 100 S 404 52, 508 84 S 640 74, 740 62", color: "rgb(var(--speed))", width: 2.0, delay: 0.6 },
  { d: "M-10 104 C 84 112, 168 158, 272 148 S 398 158, 490 126 S 636 140, 740 108", color: "rgb(var(--amber))", width: 1.7, delay: 1.2 },
  { d: "M-10 190 C 100 188, 190 168, 296 176 S 428 190, 528 158 S 664 172, 740 142", color: "#a78bfa", width: 1.5, delay: 1.8 },
  { d: "M-10 76 C 96 70, 158 40, 258 30 S 386 44, 476 18 S 618 8, 740 22", color: "#60b2ff", width: 1.3, delay: 2.4 },
];

/** Annotations, placed on the traces they belong to. */
const PINS = [
  { x: 46, y: 20, tone: "rgb(var(--speed))", label: "DRS DETECTION", delay: 2.05 },
  { x: 64, y: 8, tone: "#a78bfa", label: "VERSTAPPEN", value: "1:24.350", delay: 2.2 },
  { x: 24, y: 62, tone: "rgb(var(--amber))", label: "SAFETY CAR", delay: 2.35 },
  { x: 42, y: 82, tone: "rgb(var(--accent))", label: "NORRIS", value: "1:24.991", delay: 2.5 },
  { x: 76, y: 74, tone: "#60b2ff", label: "SECTOR 2", value: "27.341", delay: 2.65 },
];

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      className={cx("hero-canvas relative overflow-hidden rounded-3xl", className)}
      aria-label="A Grand Prix drawn as position traces, with race annotations"
      role="img">
      {/* the light in the room, behind everything */}
      <span aria-hidden className="hero-bloom absolute inset-0" />

      <svg viewBox="0 0 730 210" fill="none" preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          {/* Each trace fades in at both ends so it reads as a section of a much
              longer race rather than a line that starts and stops here. */}
          <linearGradient id="hv-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="14%" stopColor="#fff" stopOpacity="1" />
            <stop offset="86%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="hv-mask">
            <rect x="-20" y="0" width="770" height="210" fill="url(#hv-fade)" />
          </mask>
          <filter id="hv-bloom" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <g mask="url(#hv-mask)">
          {/* bloom layer: the same paths, blurred, underneath — this is what
              gives the strokes the feeling of emitting light rather than being
              drawn on top of a dark rectangle */}
          <g filter="url(#hv-bloom)" opacity="0.55">
            {TRACES.map((t, i) => (
              <path key={`b${i}`} d={t.d} stroke={t.color} strokeWidth={t.width * 2.4}
                fill="none" strokeLinecap="round" pathLength={100}
                className="hv-draw" style={{ animationDelay: `${0.25 + i * 0.12}s` }} />
            ))}
          </g>

          {TRACES.map((t, i) => (
            <g key={i}>
              <path d={t.d} stroke={t.color} strokeWidth={t.width} fill="none"
                strokeLinecap="round" pathLength={100}
                className="hv-draw" style={{ animationDelay: `${0.25 + i * 0.12}s` }} />
              {/* the travelling highlight — a short bright dash running the
                  length of the trace, which is what keeps the picture alive
                  once it has finished drawing */}
              <path d={t.d} stroke="#fff" strokeWidth={t.width * 0.9} fill="none"
                strokeLinecap="round" pathLength={100}
                className="hv-spark" style={{ animationDelay: `${2 + t.delay}s` }} />
            </g>
          ))}
        </g>

        {/* nodes: where something happened */}
        {[[250, 68], [470, 46], [262, 100], [508, 84], [272, 148], [490, 126], [296, 176]].map(
          ([cx2, cy], i) => (
            <g key={i} className="hv-node" style={{ animationDelay: `${1.5 + i * 0.09}s` }}>
              <circle cx={cx2} cy={cy} r="7" fill={TRACES[i % TRACES.length].color} opacity="0.16" />
              <circle cx={cx2} cy={cy} r="2.6" fill={TRACES[i % TRACES.length].color} />
            </g>
          ))}
      </svg>

      {/* annotations float above the drawing on their own plane */}
      {PINS.map((p) => (
        <span key={p.label} className="hv-pin absolute" aria-hidden
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.delay}s` }}>
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/[0.10] bg-base-950/70 px-2 py-1 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.tone }} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: p.tone }}>{p.label}</span>
            {p.value && (
              <span className="font-mono text-[10px] tabular-nums text-ink">{p.value}</span>
            )}
          </span>
        </span>
      ))}

      {/* vignette, over everything, so the composition has edges */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{ boxShadow: "inset 0 0 90px 24px rgb(var(--base-950) / 0.85)" }} />
    </div>
  );
}
