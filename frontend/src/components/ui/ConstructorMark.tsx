"use client";
import { teamIdentity } from "@/lib/constructors";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The drawn emblem — tier two, for every constructor with no shipped mark.    */
/*                                                                            */
/* A shield, because that is the shape motorsport has used for team heraldry   */
/* for a century and it reads as a badge at 24px where a square reads as a     */
/* button. Filled with the constructor's own livery, split by its second       */
/* colour along the bottom edge — which is what separates the two teams who    */
/* share a blue, or a red, at a glance.                                        */
/*                                                                            */
/* WHY THIS IS DRAWN AND NOT PHOTOGRAPHED. A team that last raced in 1976 has  */
/* no asset and never will, and a product spanning seventy-seven seasons is    */
/* mostly made of those teams. What it CAN do is give every one of them a mark */
/* in one house style, built from facts the sport publishes — the two livery   */
/* colours and the team's own short code — so a field of them looks like one   */
/* set rather than like whichever assets happened to exist.                    */
/*                                                                            */
/* It no longer decides anything about which tier is used, and it no longer    */
/* draws a container: `ConstructorBadge` owns the circle, the livery wash and  */
/* the probe, and hands this the space that is left. Two components that each  */
/* had an opinion about the container is how the mark ended up 10% taller than */
/* the portrait beside it.                                                    */
/* -------------------------------------------------------------------------- */

export function ConstructorShield({
  team, color, size, className,
}: { team: string; color: string; size: number; className?: string }) {
  const id = teamIdentity(team);
  const accent = id.accent ?? color;
  /* Sized to the circle it sits in rather than to itself. A shield is taller
     than it is wide, so fitting it by HEIGHT is what keeps its footprint equal
     to a driver portrait's — fitting by width pushed the point through the
     bottom of the row. */
  const h = size * 0.96;
  const w = h / 1.1;

  return (
    <svg viewBox="0 0 30 33" width={w} height={h} aria-hidden
      className={cx("shrink-0", className)}>
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
      <text x="15" y="20.5" textAnchor="middle"
        fontSize={id.code.length > 3 ? 9.5 : 11} fontWeight="900"
        letterSpacing="-0.3"
        fill="#fff" style={{ paintOrder: "stroke" }}
        stroke="#000" strokeOpacity="0.55" strokeWidth="2.2" strokeLinejoin="round">
        {id.code}
      </text>
    </svg>
  );
}
