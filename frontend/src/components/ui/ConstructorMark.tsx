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
/* WHY THIS IS DRAWN AND NOT PHOTOGRAPHED. Formula 1 team logos are registered */
/* trademarks; the product cannot ship them and redrawing them is the same     */
/* thing with extra steps. What it CAN do is give every constructor a mark in  */
/* one house style, built from facts the sport publishes — the two livery      */
/* colours and the team's own short code — so twenty teams across seventy      */
/* seasons look like one set rather than like whichever assets happened to     */
/* exist. That is the consistency a logo row is actually for.                  */
/*                                                                            */
/* If a licensed logo IS added at /teams/<id>.svg it wins and the shield never */
/* renders. The <img> is probed rather than error-handled, so dropping the     */
/* asset in is the whole integration.                                         */
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
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.78" />
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
          <g opacity="0.1">
            {Array.from({ length: 14 }).map((_, i) => (
              <line key={i} x1={-6 + i * 3} y1="-2" x2={6 + i * 3} y2="36"
                stroke="#000" strokeWidth="1" />
            ))}
          </g>
          {/* top-left light source, as everywhere else in the product */}
          <path d="M15 0.8 L28.4 5.2 V9 L15 4.4 L1.6 9 V5.2 Z" fill="#fff" opacity="0.22" />
        </g>
        {/* Two rims, not one: a dark outer that separates the badge from
            whatever it sits on (a white row, a dark row, a livery-tinted card)
            and a bright inner that keeps it lit from above. One rim looked
            drawn-on against a pale surface and vanished against a dark one. */}
        <path d="M15 0.8 L28.4 5.2 V17 C28.4 24.6 22.6 29.6 15 32.2 C7.4 29.6 1.6 24.6 1.6 17 V5.2 Z"
          fill="none" stroke="#0b0e16" strokeOpacity="0.32" strokeWidth="2" />
        <path d="M15 2 L27.2 6 V16.8 C27.2 23.7 22 28.4 15 30.8 C8 28.4 2.8 23.7 2.8 16.8 V6 Z"
          fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1" />
      </svg>
      <span /* `text-pure`, not `text-white`: white resolves through --tint and
           inverts with the theme, which would put dark navy type on a
           saturated shield the moment the reader chose daylight. */
        className="relative font-black leading-none tracking-[-0.02em] text-pure"
        style={{ fontSize: Math.max(8, size * 0.34), textShadow: "0 1px 2px rgba(0,0,0,.7)" }}>
        {id.code}
      </span>
    </span>
  );
}
