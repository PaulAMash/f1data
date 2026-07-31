"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Icons that animate the thing they depict.                                  */
/*                                                                            */
/* The previous set took a stock glyph and transformed the whole box: a flag   */
/* rotated 11°, a chart rotated 18°, a crown scaled up 18%. Technically motion, */
/* but every icon moved the same three ways regardless of what it showed, so   */
/* the animation carried no meaning — a wobble is a wobble.                    */
/*                                                                            */
/* You cannot draw a graph left-to-right, or ripple cloth, by transforming the */
/* glyph that contains it. The motion has to live INSIDE the artwork, which is  */
/* why these are hand-drawn rather than imported: every part that should move   */
/* is its own addressable element.                                             */
/*                                                                            */
/*   flag        the cloth ripples in bands; the pole never moves              */
/*   trend       the line draws itself left to right, then the head lands      */
/*   timer       the hand ticks in twelve discrete steps, like a real one      */
/*   gauge       the needle sweeps up, overshoots, settles                     */
/*   thermometer the column climbs out of the bulb                             */
/*   weather     rays turn, the cloud drifts across them                       */
/*   crown       a specular highlight travels across the metal                 */
/*   sparkles    three stars twinkle out of phase                              */
/*   target      rings close in, then the centre lands                         */
/*   bolt        strikes: a hard flash, not a fade                             */
/*   repeat      the arrows chase around the loop                              */
/*   sort        bars settle into descending order                             */
/*                                                                            */
/* They are drop-in replacements for the lucide glyphs they succeed — same     */
/* 24×24 box, same 2px round-capped stroke, same currentColor — so they sit    */
/* beside any remaining stock icon without looking like a different set.       */
/*                                                                            */
/* Nothing moves at rest. Motion begins when the reader reaches for the card    */
/* (see the .group/card:hover rules in globals.css) and is removed entirely     */
/* under prefers-reduced-motion. An icon that animates unprompted is a          */
/* distraction; one that animates when you reach for it is feedback.            */
/* -------------------------------------------------------------------------- */

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Call sites tint these inline the same way they tint a lucide glyph. */
  style?: React.CSSProperties;
}

function Svg({
  size = 16, className, strokeWidth = 2, style, children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={style}
      className={cx("mi", className)} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/* --- flag ----------------------------------------------------------------- */
/* Cloth in three overlapping bands. Each carries the same ripple a beat later
   than the one to its left, which is what makes a wave travel rather than a
   whole flag flap. The bands overlap by a hair so the seams never show. */
export function Flag(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="4" y1="22" x2="4" y2="3" className="mi-pole" />
      <g className="mi-cloth">
        <path className="mi-cloth-a" d="M4 4.2 C6.6 2.6 9.2 5.4 11.8 4.2 L11.8 12 C9.2 13.2 6.6 10.4 4 12 Z" />
        <path className="mi-cloth-b" d="M11.6 4.2 C14.2 3 16.8 5.8 19.4 4.6 L19.4 12.4 C16.8 13.6 14.2 10.8 11.6 12 Z" />
      </g>
    </Svg>
  );
}

/* --- trends --------------------------------------------------------------- */
/* The single most literal one: a line chart should be drawn, and a dash offset
   is how you draw a line. The arrowhead is held back until the stroke reaches
   it, so the gesture reads as travel arriving somewhere. */
function Trend({ down = false, ...p }: IconProps & { down?: boolean }) {
  const line = down ? "M3 7 L9 13 L13 9 L21 17" : "M3 17 L9 11 L13 15 L21 7";
  const head = down ? "M15 17 L21 17 L21 11" : "M15 7 L21 7 L21 13";
  return (
    <Svg {...p}>
      <path className="mi-draw" d={line} pathLength={100} />
      <path className="mi-head" d={head} />
    </Svg>
  );
}
export const TrendingUp = (p: IconProps) => <Trend {...p} />;
export const TrendingDown = (p: IconProps) => <Trend {...p} down />;

/* A chart in a frame — same draw-on, plus bars that grow under it. */
export function LineChart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 3 L3 21 L21 21" />
      <path className="mi-draw" d="M6.5 15.5 L10.5 11 L14 13.5 L19 7" pathLength={100} />
      <circle className="mi-dot" cx="19" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --- clocks --------------------------------------------------------------- */
/* steps(12) is the whole point: a smooth sweep is a decoration, a tick is a
   stopwatch. The second hand jumps, the case does not move. */
function Watch({ crown = true, ...p }: IconProps & { crown?: boolean }) {
  return (
    <Svg {...p}>
      {crown && <><line x1="9.5" y1="2" x2="14.5" y2="2" /><line x1="12" y1="2" x2="12" y2="4.4" /></>}
      <circle cx="12" cy="13.5" r="8" />
      <g className="mi-tick" style={{ transformOrigin: "12px 13.5px" }}>
        <line x1="12" y1="13.5" x2="12" y2="8.4" />
      </g>
      <circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}
export const Timer = (p: IconProps) => <Watch {...p} />;
export const Clock = (p: IconProps) => <Watch {...p} crown={false} />;

/* --- gauge ---------------------------------------------------------------- */
/* Sweeps up, overshoots, settles — the way a needle with mass behaves. A
   linear rotation would read as a dial being set by software. */
export function Gauge(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 18 A9 9 0 1 1 20.5 18" />
      <g className="mi-needle" style={{ transformOrigin: "12px 18px" }}>
        <line x1="12" y1="18" x2="7.6" y2="12.6" />
      </g>
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --- thermometer ---------------------------------------------------------- */
/* The column climbs out of the bulb. Everything else holds still, because on a
   real thermometer everything else does. */
export function Thermometer(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 13.5 V5 a2 2 0 0 1 4 0 v8.5" />
      <path d="M10 13.5 a4.2 4.2 0 1 0 4 0" />
      <line className="mi-mercury" x1="12" y1="17.6" x2="12" y2="8"
        strokeWidth={2.6} style={{ transformOrigin: "12px 17.6px" }} />
      <circle className="mi-bulb" cx="12" cy="17.6" r="1.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --- weather -------------------------------------------------------------- */
/* Two independent motions, as in the sky: the rays turn slowly about the sun,
   the cloud drifts across in front of them. */
export function CloudSun(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="mi-rays" style={{ transformOrigin: "8.5px 8.5px" }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="8.5" y1="2.4" x2="8.5" y2="4.1" transform={`rotate(${a} 8.5 8.5)`} />
        ))}
      </g>
      <circle cx="8.5" cy="8.5" r="3" className="mi-sun" style={{ transformOrigin: "8.5px 8.5px" }} />
      <path className="mi-cloud"
        d="M9 20 h8.6a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.1-1.1A3.9 3.9 0 0 0 9 20 Z"
        fill="var(--mi-bg, #0d111a)" />
    </Svg>
  );
}

/* --- honours -------------------------------------------------------------- */
/* A crown is metal, and metal catches the light. The highlight is a real band
   travelling across the shape through a clip — not the whole glyph brightening,
   which is what "shimmer" used to mean here and read as a lamp being turned up. */
function Honour({ kind, ...p }: IconProps & { kind: "crown" | "medal" | "award" }) {
  const id = `mi-clip-${kind}`;
  const shape = kind === "crown"
    ? "M3 17 L4.7 7 L9 11.4 L12 5.2 L15 11.4 L19.3 7 L21 17 Z"
    : kind === "medal"
      ? "M12 3 L14.6 8.6 L20.6 9.4 L16.3 13.7 L17.4 19.8 L12 16.9 L6.6 19.8 L7.7 13.7 L3.4 9.4 L9.4 8.6 Z"
      : "M12 2.6 a5.6 5.6 0 1 1 0 11.2 a5.6 5.6 0 0 1 0-11.2 Z";
  return (
    <Svg {...p}>
      <defs>
        <clipPath id={id}><path d={shape} /></clipPath>
      </defs>
      <path d={shape} />
      {kind === "crown" && <line x1="3.6" y1="20.4" x2="20.4" y2="20.4" />}
      {kind === "award" && <path d="M8.4 13.2 L7 21.4 L12 18.9 L17 21.4 L15.6 13.2" />}
      <g clipPath={`url(#${id})`}>
        <rect className="mi-gleam" x="-26" y="-4" width="12" height="32"
          fill="currentColor" stroke="none" opacity="0.85" transform="skewX(-18)" />
      </g>
    </Svg>
  );
}
export const Crown = (p: IconProps) => <Honour {...p} kind="crown" />;
export const Medal = (p: IconProps) => <Honour {...p} kind="medal" />;
export const Award = (p: IconProps) => <Honour {...p} kind="award" />;

/* --- sparkles ------------------------------------------------------------- */
/* Out of phase on purpose. Three stars pulsing together is a throb; three
   stars pulsing in sequence is a glint. */
export function Sparkles(p: IconProps) {
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r} L${cx + r * 0.32} ${cy - r * 0.32} L${cx + r} ${cy} `
    + `L${cx + r * 0.32} ${cy + r * 0.32} L${cx} ${cy + r} `
    + `L${cx - r * 0.32} ${cy + r * 0.32} L${cx - r} ${cy} `
    + `L${cx - r * 0.32} ${cy - r * 0.32} Z`;
  return (
    <Svg {...p}>
      <path className="mi-star-a" d={star(10, 10, 7)} fill="currentColor"
        style={{ transformOrigin: "10px 10px" }} />
      <path className="mi-star-b" d={star(18.5, 5.5, 3.1)} fill="currentColor"
        style={{ transformOrigin: "18.5px 5.5px" }} />
      <path className="mi-star-c" d={star(18, 17.5, 3.6)} fill="currentColor"
        style={{ transformOrigin: "18px 17.5px" }} />
    </Svg>
  );
}

/* --- target --------------------------------------------------------------- */
/* The rings close inward and the centre lands last — an arrow arriving, rather
   than a circle growing. */
export function Target(p: IconProps) {
  return (
    <Svg {...p}>
      <circle className="mi-ring-1" cx="12" cy="12" r="9.2" style={{ transformOrigin: "12px 12px" }} />
      <circle className="mi-ring-2" cx="12" cy="12" r="5.4" style={{ transformOrigin: "12px 12px" }} />
      <circle className="mi-hit" cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"
        style={{ transformOrigin: "12px 12px" }} />
    </Svg>
  );
}

/* --- bolt ----------------------------------------------------------------- */
/* Lightning does not fade in. It arrives at full brightness and decays. */
export function Zap(p: IconProps) {
  return (
    <Svg {...p}>
      <path className="mi-strike" d="M13.2 2 L4.4 13.4 h6.1 L10.2 22 l8.8 -11.4 h-6.1 Z"
        fill="currentColor" fillOpacity="0.18" style={{ transformOrigin: "12px 12px" }} />
    </Svg>
  );
}

/* --- repeat --------------------------------------------------------------- */
/* The arrows chase each other around the loop, which is what "repeat" means. */
export function Repeat(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="mi-loop" style={{ transformOrigin: "12px 12px" }}>
        <path d="M4 9.5 A8 8 0 0 1 19.2 7.4" /><path d="M20 3.4 v4.6 h-4.6" />
        <path d="M20 14.5 A8 8 0 0 1 4.8 16.6" /><path d="M4 20.6 v-4.6 h4.6" />
      </g>
    </Svg>
  );
}

/* --- ruler ---------------------------------------------------------------- */
export function Ruler(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.2" y="8.4" width="19.6" height="7.2" rx="1.6" />
      <g className="mi-ticks">
        <line x1="6.4" y1="8.4" x2="6.4" y2="12" /><line x1="10.2" y1="8.4" x2="10.2" y2="13.4" />
        <line x1="14" y1="8.4" x2="14" y2="12" /><line x1="17.8" y1="8.4" x2="17.8" y2="13.4" />
      </g>
    </Svg>
  );
}

/* --- sort ----------------------------------------------------------------- */
/* The bars re-order themselves into a descending stack. */
export function ArrowDownWideNarrow(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5 v14" /><path d="M1.4 15.6 L4 19 L6.6 15.6" />
      <g className="mi-bars">
        <line className="mi-bar-1" x1="10" y1="6.2" x2="21" y2="6.2" />
        <line className="mi-bar-2" x1="10" y1="12" x2="18" y2="12" />
        <line className="mi-bar-3" x1="10" y1="17.8" x2="14.6" y2="17.8" />
      </g>
    </Svg>
  );
}

/* --- alert ---------------------------------------------------------------- */
export function AlertTriangle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.4 L22 20 H2 Z" />
      <g className="mi-bang">
        <line x1="12" y1="9.4" x2="12" y2="14" /><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </g>
    </Svg>
  );
}
