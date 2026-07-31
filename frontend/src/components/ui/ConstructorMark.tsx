"use client";
import { useEffect, useState } from "react";
import { logoSrc, teamIdentity } from "@/lib/constructors";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The constructor emblem.                                                    */
/*                                                                            */
/* A shield, because that is the shape motorsport has used for team heraldry   */
/* for a century and it reads as a badge at 24px where a square reads as a     */
/* button. Filled with the constructor's own livery, split by its second       */
/* colour along the bottom edge — which is what separates the two teams who    */
/* share a blue, or a red, at a glance.                                        */
/*                                                                            */
/* If a licensed logo exists at /teams/<id>.svg it wins and the shield never   */
/* renders. The <img> falls back on error rather than on a build-time check,   */
/* so adding the asset is the whole integration.                              */
/* -------------------------------------------------------------------------- */

export function ConstructorMark({
  team, color, size = 30, className,
}: { team: string; color: string; size?: number; className?: string }) {
  const id = teamIdentity(team);
  const accent = id.accent ?? color;

  /* Probed, not error-handled. An <img> whose src 404s fires `error` during the
     gap before React attaches its handler, so an onError fallback loses the race
     and the browser's broken-image glyph — plus the alt text, at full paragraph
     width — ends up in the layout. Loading it detached means a missing asset is
     simply never shown, and the shield below is what was always on screen. */
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const src = logoSrc(team);
    const probe = new window.Image();
    probe.onload = () => { if (live) setLogo(src); };
    probe.src = src;
    return () => { live = false; };
  }, [team]);

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" width={size} height={size} aria-hidden
        className={cx("shrink-0 object-contain", className)}
        style={{ width: size, height: size }} />
    );
  }

  return (
    <span className={cx("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size * 1.1 }} aria-label={team} role="img">
      <svg viewBox="0 0 30 33" width={size} height={size * 1.1} aria-hidden
        className="absolute inset-0">
        <defs>
          <linearGradient id={`cm-${id.id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
          <clipPath id={`cmc-${id.id}`}>
            <path d="M15 0.8 L28.4 5.2 V17 C28.4 24.6 22.6 29.6 15 32.2 C7.4 29.6 1.6 24.6 1.6 17 V5.2 Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#cmc-${id.id})`}>
          <rect x="0" y="0" width="30" height="33" fill={`url(#cm-${id.id})`} />
          {/* the second livery colour, as a chevron across the foot of the
              shield — present enough to tell two blues apart, quiet enough not
              to compete with the code */}
          <path d="M-2 26 L15 20 L32 26 V36 H-2 Z" fill={accent} opacity="0.9" />
          {/* woven carbon, the same texture the team card uses, so the emblem
              belongs to the card rather than sitting on top of it */}
          <g opacity="0.14">
            {Array.from({ length: 14 }).map((_, i) => (
              <line key={i} x1={-6 + i * 3} y1="-2" x2={6 + i * 3} y2="36"
                stroke="#000" strokeWidth="1" />
            ))}
          </g>
          {/* top-left light source, as everywhere else in the product */}
          <path d="M15 0.8 L28.4 5.2 V9 L15 4.4 L1.6 9 V5.2 Z" fill="#fff" opacity="0.22" />
        </g>
        <path d="M15 0.8 L28.4 5.2 V17 C28.4 24.6 22.6 29.6 15 32.2 C7.4 29.6 1.6 24.6 1.6 17 V5.2 Z"
          fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
      </svg>
      <span className="relative font-black leading-none tracking-tight text-pure"
        style={{ fontSize: Math.max(8, size * 0.32), textShadow: "0 1px 2px rgba(0,0,0,.55)" }}>
        {id.code}
      </span>
    </span>
  );
}
