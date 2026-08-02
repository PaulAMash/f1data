"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The loading state, as a Formula 1 broadcast would shoot it.                */
/*                                                                            */
/* The previous version varied the wheel's speed across the loop and stuttered */
/* for it — see globals.css for why an easing curve on a five-keyframe spin    */
/* makes a wheel stop dead four times a minute.                               */
/*                                                                            */
/* This one is built the way the object actually behaves. A rolling wheel      */
/* turns at CONSTANT angular velocity, so the roll is one linear rotation and  */
/* there is nothing in it that can stutter. Momentum is expressed once, by a   */
/* nested rotation that starts held back and eases to identity: the wheel      */
/* spins up, then blends into the steady roll and stays there.                 */
/*                                                                            */
/*   BLUR         arrives with the speed and stays, because constant speed is  */
/*                constant blur. The hub stays sharp — it is the one part of a */
/*                spinning wheel the eye can actually track.                   */
/*   SUSPENSION   damped travel, and a contact patch that squashes in sympathy.*/
/*   SMOKE        rubber leaves the patch, rises, spreads and thins.           */
/*   SPARKS       debris flicks off the patch on a short, gravity-bent arc.    */
/*   HEAT         haze rising off the disc, seen through the spokes.           */
/*   GLEAM        a specular highlight travelling around the rim.              */
/*   ROAD         tarmac, a centre line and lateral seams running beneath at   */
/*                two different speeds, so it reads as ground rather than as a */
/*                sliding texture.                                             */
/*                                                                            */
/* No two periods divide into each other, so the composition never lands on    */
/* itself. Still one element, still pure SVG with nothing to download, still   */
/* scales from a 20px inline spinner to a full page state.                     */
/* -------------------------------------------------------------------------- */

export function RaceLoader({
  size = 104, className, label,
}: { size?: number; className?: string; label?: string }) {
  const h = Math.round(size * 0.9);
  return (
    <span className={cx("relative inline-flex flex-col items-center", className)}
      role="img" aria-label={label ?? "Loading"}>
      <svg width={size} height={h} viewBox="0 0 120 108" fill="none" aria-hidden>
        <defs>
          {/* carbon disc heat — hot at the ring, cooler through the bell, which
              is how a brake actually glows; a solid orange circle reads as an
              eye rather than as hardware */}
          <radialGradient id="rl-brake-g" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a1a12" />
            <stop offset="34%" stopColor="#7c2d12" />
            <stop offset="62%" stopColor="#ea7317" />
            <stop offset="86%" stopColor="#ffb673" />
            <stop offset="100%" stopColor="#5a1e06" />
          </radialGradient>
          <linearGradient id="rl-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--ink))" />
            <stop offset="45%" stopColor="rgb(var(--axis))" />
            <stop offset="100%" stopColor="#4a5468" />
          </linearGradient>
          <linearGradient id="rl-tarmac" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c2333" stopOpacity="0" />
            <stop offset="16%" stopColor="#1c2333" stopOpacity="1" />
            <stop offset="84%" stopColor="#1c2333" stopOpacity="1" />
            <stop offset="100%" stopColor="#1c2333" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="rl-smoke" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c8d0e0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#c8d0e0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rl-haze-g" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb673" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffb673" stopOpacity="0" />
          </radialGradient>
          {/* the rim highlight: a short bright arc that travels round, which is
              what tells the eye the rim is metal and not a printed ring */}
          <linearGradient id="rl-gleam-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--tint))" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(var(--tint))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(var(--tint))" stopOpacity="0" />
          </linearGradient>
          <clipPath id="rl-road-clip"><rect x="4" y="88" width="112" height="14" /></clipPath>
        </defs>

        {/* --- the track -------------------------------------------------- */}
        <rect x="0" y="87" width="120" height="11" rx="2" fill="url(#rl-tarmac)" />
        <g clipPath="url(#rl-road-clip)">
          {/* lateral seams run faster than the centre line: two speeds is what
              stops a scrolling road reading as a single sliding texture */}
          <g className="rl-seams">
            {Array.from({ length: 14 }).map((_, i) => (
              <rect key={i} x={i * 18} y="87" width="1.5" height="11" fill="#2a3244" />
            ))}
          </g>
          <g className="rl-road">
            {Array.from({ length: 10 }).map((_, i) => (
              <rect key={i} x={i * 24} y="91.5" width="12" height="2.5" rx="1.25" fill="#48536b" />
            ))}
          </g>
        </g>

        {/* --- everything the suspension carries -------------------------- */}
        <g className="rl-susp">
          {/* smoke leaves the contact patch, not the hub */}
          <g className="rl-smoke-g">
            <circle className="rl-puff rl-puff-1" cx="44" cy="84" r="9" fill="url(#rl-smoke)" />
            <circle className="rl-puff rl-puff-2" cx="38" cy="84" r="11" fill="url(#rl-smoke)" />
            <circle className="rl-puff rl-puff-3" cx="48" cy="84" r="7.5" fill="url(#rl-smoke)" />
          </g>
          {/* debris — small, hot and brief. Three is enough to read as "stuff is
              coming off this tyre"; more reads as weather. */}
          <g>
            <rect className="rl-spark rl-spark-1" x="46" y="83" width="2.4" height="1" rx=".5" fill="#ffb673" />
            <rect className="rl-spark rl-spark-2" x="43" y="85" width="1.8" height="1" rx=".5" fill="#ff8a4c" />
            <rect className="rl-spark rl-spark-3" x="49" y="84.5" width="1.4" height="1" rx=".5" fill="#ffd7a8" />
          </g>

          {/* contact patch — squashes as the wheel loads */}
          <ellipse className="rl-patch" cx="60" cy="86" rx="20" ry="3" fill="#000" opacity="0.55"
            style={{ transformOrigin: "60px 86px" }} />

          {/* the air */}
          <g className="rl-speed" stroke="#ff6a5a" strokeLinecap="round">
            <line x1="6" y1="32" x2="26" y2="32" strokeWidth="2" opacity="0.55" />
            <line x1="0" y1="45" x2="20" y2="45" strokeWidth="2.5" opacity="0.35" />
            <line x1="8" y1="58" x2="24" y2="58" strokeWidth="2" opacity="0.22" />
          </g>

          {/* --- the wheel ------------------------------------------------ */}
          <circle cx="60" cy="46" r="35" fill="#0d1017" stroke="#242b38" strokeWidth="1.5" />
          <circle cx="60" cy="46" r="31" fill="none" stroke="#171d28" strokeWidth="7" />
          <path d="M60 15 A31 31 0 0 0 29 46" fill="none" stroke="#2c3546" strokeWidth="7"
            strokeLinecap="round" opacity="0.9" />

          {/* the tread band, through the blur filter: two arcs so the rotation
              is unmistakable even though a plain black tyre would look static
              however fast it turned */}
          <g className="rl-smear">
            {/* launch outside, roll inside: nested rotations compose, so the
                spin-up blends into the steady turn instead of replacing it */}
            <g className="rl-launch" style={{ transformOrigin: "60px 46px" }}>
            <g className="rl-roll-fast" style={{ transformOrigin: "60px 46px" }}>
              <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="26 190" opacity="0.95" />
              <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="26 190" strokeDashoffset="-108" opacity="0.5" />
            </g>
            </g>
          </g>

          {/* heat coming off the disc, drawn before the rim so it reads as
              rising through the spokes rather than sitting in front of them */}
          <g>
            <ellipse className="rl-haze rl-haze-1" cx="60" cy="30" rx="9" ry="5" fill="url(#rl-haze-g)" />
            <ellipse className="rl-haze rl-haze-2" cx="66" cy="32" rx="6.5" ry="4" fill="url(#rl-haze-g)" />
          </g>

          {/* the wheel well, so the brake glows out of a shadow */}
          <circle cx="60" cy="46" r="22" fill="#07090f" />
          <circle cx="60" cy="46" r="16" fill="url(#rl-brake-g)" className="rl-brake" />
          <g className="rl-launch" style={{ transformOrigin: "60px 46px" }} opacity="0.5">
          <g className="rl-roll" style={{ transformOrigin: "60px 46px" }}>
            {[18, 90, 162, 234, 306].map((a) => (
              <circle key={a} cx="60" cy="34.5" r="1.1" fill="#2a1206"
                transform={`rotate(${a} 60 46)`} />
            ))}
          </g>
          </g>

          {/* the rim — also blurred, so spokes smear at speed like real ones */}
          <g className="rl-smear-soft">
            <g className="rl-launch" style={{ transformOrigin: "60px 46px" }}>
            <g className="rl-roll" style={{ transformOrigin: "60px 46px" }}>
              {[0, 72, 144, 216, 288].map((a) => (
                <path key={a} d="M57.2 45 L59.2 27.5 L60.8 27.5 L62.8 45 Z"
                  fill="url(#rl-rim)" transform={`rotate(${a} 60 46)`} />
              ))}
              <circle cx="60" cy="46" r="23" fill="none" stroke="url(#rl-rim)" strokeWidth="3.4" />
            </g>
            </g>
          </g>
          {/* the travelling highlight — outside the blur, because a specular
              catch on a spinning rim is the sharpest thing on the wheel */}
          <g className="rl-gleam" style={{ transformOrigin: "60px 46px" }}>
            <circle cx="60" cy="46" r="23" fill="none" stroke="url(#rl-gleam-g)" strokeWidth="3.4"
              strokeLinecap="round" strokeDasharray="30 115" />
          </g>

          {/* hub and wheel nut stay sharp: the centre of a spinning wheel is the
              one part your eye can actually track */}
          <circle cx="60" cy="46" r="6.5" fill="#0f131d" stroke="url(#rl-rim)" strokeWidth="2.6" />
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
      <span className="rl-roll absolute inset-0 rounded-full border-2 border-white/[0.12] border-t-accent" />
      <span className="rl-brake absolute inset-[26%] rounded-full"
        style={{ background: "radial-gradient(circle, #ffb478 0%, #c2410c 70%, transparent 100%)" }} />
    </span>
  );
}
