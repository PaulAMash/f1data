"use client";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The loading state, as a Formula 1 broadcast would shoot it.                */
/*                                                                            */
/* The previous version drew the right objects and moved them the wrong way:   */
/* everything rotated at one constant speed, forever, which is how a machine   */
/* moves. Nothing here has mass. That is what made it read as a diagram of a   */
/* wheel rather than a wheel.                                                  */
/*                                                                            */
/* This one is a shot, not an illustration. Every motion is something a real   */
/* car does, and they run at different periods so the loop never lands on      */
/* itself:                                                                    */
/*                                                                            */
/*   INERTIA      the wheel spins up from rest, settles at speed, then eases   */
/*                as the car lifts — a four-second breath, not a metronome.    */
/*   BLUR         the tread band smears through a real SVG blur at speed and   */
/*                sharpens as it slows, which is the single strongest cue that */
/*                fast rather than merely rotating. The hub stays sharp — it   */
/*                is the one part of a spinning wheel the eye can track.        */
/*   SUSPENSION   the whole assembly travels on a damped curve and the contact */
/*                patch squashes in sympathy. A wheel pinned to one Y is a     */
/*                logo; a wheel that works is a car.                           */
/*   SMOKE        three puffs leave the contact patch on staggered delays,     */
/*                rising, spreading and thinning out the way rubber smoke      */
/*                actually behaves.                                            */
/*   BRAKE        the disc glows harder under load and cools off it, in phase  */
/*                with the spin-up rather than on its own timer.               */
/*   ROAD         tarmac, a dashed centre line and lateral seams running       */
/*                beneath at the wheel's speed, so the car travels.            */
/*                                                                            */
/* Still one element, still pure SVG with nothing to download, still scales    */
/* from a 20px inline spinner to a full page state, still reduced-motion safe.  */
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
            <stop offset="0%" stopColor="#e8ecf5" />
            <stop offset="45%" stopColor="#8b98b2" />
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
            <g className="rl-spin-fast" style={{ transformOrigin: "60px 46px" }}>
              <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="26 190" opacity="0.95" />
              <circle cx="60" cy="46" r="34.5" fill="none" stroke="#ff3b3b" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="26 190" strokeDashoffset="-108" opacity="0.5" />
            </g>
          </g>

          {/* the wheel well, so the brake glows out of a shadow */}
          <circle cx="60" cy="46" r="22" fill="#07090f" />
          <circle cx="60" cy="46" r="16" fill="url(#rl-brake-g)" className="rl-brake" />
          <g className="rl-spin" style={{ transformOrigin: "60px 46px" }} opacity="0.5">
            {[18, 90, 162, 234, 306].map((a) => (
              <circle key={a} cx="60" cy="34.5" r="1.1" fill="#2a1206"
                transform={`rotate(${a} 60 46)`} />
            ))}
          </g>

          {/* the rim — also blurred, so spokes smear at speed like real ones */}
          <g className="rl-smear-soft">
            <g className="rl-spin" style={{ transformOrigin: "60px 46px" }}>
              {[0, 72, 144, 216, 288].map((a) => (
                <path key={a} d="M57.2 45 L59.2 27.5 L60.8 27.5 L62.8 45 Z"
                  fill="url(#rl-rim)" transform={`rotate(${a} 60 46)`} />
              ))}
              <circle cx="60" cy="46" r="23" fill="none" stroke="url(#rl-rim)" strokeWidth="3.4" />
            </g>
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
      <span className="rl-spin absolute inset-0 rounded-full border-2 border-white/12 border-t-accent" />
      <span className="rl-brake absolute inset-[26%] rounded-full"
        style={{ background: "radial-gradient(circle, #ffb478 0%, #c2410c 70%, transparent 100%)" }} />
    </span>
  );
}
