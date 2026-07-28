"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The loading state, as a Formula 1 car would tell it.                       */
/*                                                                            */
/* A generic spinner says "a computer is busy". This says "you are in a       */
/* Formula 1 product" before a single word of the page has loaded — which     */
/* matters, because on a cold session this is the first thing anyone sees and  */
/* they see it for up to a minute.                                            */
/*                                                                            */
/* Everything in it is a real thing on a real car, drawn in SVG — no images,  */
/* no libraries, nothing to download:                                         */
/*                                                                            */
/*   the wheel      a slick with a sidewall highlight and a coloured tread     */
/*                  band, so the rotation is visible at a glance              */
/*   the rim        five spokes turning inside the tyre                        */
/*   the brake      a carbon disc glowing through the spokes, breathing        */
/*                  between orange and white the way one does under load       */
/*   the track      tarmac and a dashed line running beneath, right to left,   */
/*                  so the car is travelling rather than idling                */
/*   the air        speed lines trailing off the back                          */
/*                                                                            */
/* The whole thing is one element, reduced-motion safe, and scales from a      */
/* 20px inline spinner to a 120px page state without redrawing anything.       */
/* -------------------------------------------------------------------------- */

export function RaceLoader({
  size = 104, className, label,
}: { size?: number; className?: string; label?: string }) {
  const h = Math.round(size * 0.86);
  return (
    <span className={cx("relative inline-flex flex-col items-center", className)}
      role="img" aria-label={label ?? "Loading"}>
      <svg width={size} height={h} viewBox="0 0 120 104" fill="none" aria-hidden>
        <defs>
          {/* carbon disc heat — a hot ring with a cooler bell in the middle,
              which is how a brake actually glows; a solid orange circle reads
              as an eye rather than as hardware */}
          <radialGradient id="rl-brake" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a1a12" />
            <stop offset="34%" stopColor="#7c2d12" />
            <stop offset="62%" stopColor="#ea7317" />
            <stop offset="86%" stopColor="#ffb673" />
            <stop offset="100%" stopColor="#5a1e06" />
          </radialGradient>
          <linearGradient id="rl-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e8ecf5" />
            <stop offset="45%" stopColor="#8b98b2" />
            <stop offset="100%" stopColor="#4a5468" />
          </linearGradient>
          <linearGradient id="rl-tarmac" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c2333" stopOpacity="0" />
            <stop offset="18%" stopColor="#1c2333" stopOpacity="1" />
            <stop offset="82%" stopColor="#1c2333" stopOpacity="1" />
            <stop offset="100%" stopColor="#1c2333" stopOpacity="0" />
          </linearGradient>
          {/* the road dashes scroll inside their own clip so they vanish at the
              edges instead of popping in and out */}
          <clipPath id="rl-clip"><rect x="6" y="86" width="108" height="8" /></clipPath>
        </defs>

        {/* --- the track ------------------------------------------------- */}
        <rect x="0" y="84" width="120" height="9" rx="2" fill="url(#rl-tarmac)" />
        <g clipPath="url(#rl-clip)">
          <g className="rl-road">
            {Array.from({ length: 10 }).map((_, i) => (
              <rect key={i} x={i * 24} y="88" width="12" height="2.5" rx="1.25" fill="#48536b" />
            ))}
          </g>
        </g>

        {/* contact patch: darker directly under the tyre */}
        <ellipse cx="60" cy="85" rx="20" ry="3" fill="#000" opacity="0.55" />

        {/* --- the air ---------------------------------------------------- */}
        <g className="rl-speed" stroke="#ff6a5a" strokeLinecap="round">
          <line x1="4" y1="34" x2="24" y2="34" strokeWidth="2" opacity="0.55" />
          <line x1="0" y1="46" x2="18" y2="46" strokeWidth="2.5" opacity="0.35" />
          <line x1="6" y1="58" x2="22" y2="58" strokeWidth="2" opacity="0.22" />
        </g>

        {/* --- the wheel -------------------------------------------------- */}
        {/* tyre carcass */}
        <circle cx="60" cy="46" r="35" fill="#0d1017" stroke="#242b38" strokeWidth="1.5" />
        {/* sidewall highlight — the light source is top-left, as everywhere else */}
        <circle cx="60" cy="46" r="31" fill="none" stroke="#171d28" strokeWidth="7" />
        <path d="M60 15 A31 31 0 0 0 29 46" fill="none" stroke="#2c3546" strokeWidth="7"
          strokeLinecap="round" opacity="0.9" />
        {/* the coloured tread band: two arcs, so the spin is unmistakable even
            though a plain black tyre would look static however fast it turned */}
        <g className="rl-spin-fast" style={{ transformOrigin: "60px 46px" }}>
          <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="26 190" opacity="0.95" />
          <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="26 190" strokeDashoffset="-108" opacity="0.5" />
        </g>

        {/* the wheel well behind the rim, so the brake glows out of a shadow
            rather than out of the page */}
        <circle cx="60" cy="46" r="22" fill="#07090f" />
        {/* glowing carbon brake, seen through the spokes */}
        <circle cx="60" cy="46" r="16" fill="url(#rl-brake)" className="rl-brake" />
        {/* the drilled face of the disc — the detail that makes it read as a
            brake and not a light */}
        <g className="rl-spin" style={{ transformOrigin: "60px 46px" }} opacity="0.5">
          {[18, 90, 162, 234, 306].map((a) => (
            <circle key={a} cx="60" cy="34.5" r="1.1" fill="#2a1206"
              transform={`rotate(${a} 60 46)`} />
          ))}
        </g>

        {/* the rim: five spokes and a hub, turning */}
        <g className="rl-spin" style={{ transformOrigin: "60px 46px" }}>
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d="M57.2 45 L59.2 27.5 L60.8 27.5 L62.8 45 Z"
              fill="url(#rl-rim)" transform={`rotate(${a} 60 46)`} />
          ))}
          <circle cx="60" cy="46" r="23" fill="none" stroke="url(#rl-rim)" strokeWidth="3.4" />
          <circle cx="60" cy="46" r="6.5" fill="#0f131d" stroke="url(#rl-rim)" strokeWidth="2.6" />
          {/* the wheel nut, so the hub reads as hardware rather than a dot */}
          <circle cx="60" cy="46" r="2.1" fill="#ff3b3b" />
        </g>
      </svg>
    </span>
  );
}

/**
 * The inline version — same idea at button scale, for anywhere a full page
 * state would be too much (a panel refetching, an answer being written).
 */
export function RaceSpinner({ size = 20 }: { size?: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
      <span className="rl-spin absolute inset-0 rounded-full border-2 border-white/12 border-t-accent" />
      <span className="rl-brake absolute inset-[26%] rounded-full"
        style={{ background: "radial-gradient(circle, #ffb478 0%, #c2410c 70%, transparent 100%)" }} />
    </span>
  );
}
