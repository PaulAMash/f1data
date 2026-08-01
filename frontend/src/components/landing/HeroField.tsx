"use client";
import { useEffect, useRef } from "react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The hero field.                                                            */
/*                                                                            */
/* WHY THIS IS CANVAS AND NOT SVG.                                            */
/*                                                                            */
/* The previous version kept an array of lap positions, shifted it left every */
/* few seconds, and ran a CSS transform to cover the gap. Two clocks — a      */
/* setInterval and a CSS animation — cannot stay in phase, so they drifted,   */
/* and every drift showed up as the snap, the jitter and the visible          */
/* regeneration that made it read as "an animated SVG" rather than as motion  */
/* graphics. There was also a real beginning and a real end to every path.    */
/*                                                                            */
/* There is no array here and nothing respawns. Each line is a pure function  */
/* of position and time:                                                     */
/*                                                                            */
/*     y(x, t) = lane + Σ Aₖ · sin(x·fₖ + t·sₖ + φ)                           */
/*                                                                            */
/* sampled fresh every frame across the viewport. The field moves because t   */
/* advances, not because anything was moved — so it is continuous by          */
/* construction, has no seam, no reset, and never repeats within any period a */
/* viewer will sit through. The incommensurable frequencies are the trick.    */
/*                                                                            */
/* FIBRE OPTIC, NOT A STROKE. Every line is drawn four times. What those four */
/* passes ARE depends on the room, and that is the whole reason the light     */
/* theme took a second recipe rather than a lower opacity:                    */
/*                                                                            */
/*   dark  — additive. Light is emitted: a wide halo, a bloom, the body, and  */
/*           a near-white core. Overlaps get brighter, as light does.         */
/*   light — subtractive. Light is absorbed: the same four passes run in      */
/*           `multiply`, so the line behaves like saturated ink on paper and  */
/*           overlaps get deeper instead of washing out to grey. An additive  */
/*           glow on white has nowhere to go — it can only desaturate — which */
/*           is exactly why the first light build looked like fog.            */
/*                                                                            */
/* A pulse travels each line on its own cycle: a brighter packet in the dark, */
/* a denser one in the light. It is the only literal "data" metaphor here.    */
/* -------------------------------------------------------------------------- */

interface Lane {
  hueDark: string;
  hueLight: string;
  /** base lane, 0..1 down the canvas */
  base: number;
  /** the wave components: amplitude, spatial frequency, temporal speed */
  waves: [number, number, number][];
  /** how fast this line's pulse travels, and where in the cycle it starts */
  pulseSpeed: number;
  pulsePhase: number;
  width: number;
}

/* Frequencies deliberately share no common factor, so the composite never
   returns to a previous state — the field cannot visibly loop. */
const LANES: Lane[] = [
  { hueDark: "#ff8000", hueLight: "#c2410c", base: 0.20, width: 2.1, pulseSpeed: 0.061, pulsePhase: 0.0,
    waves: [[0.052, 1.7, 0.031], [0.026, 3.1, -0.019], [0.012, 6.7, 0.043]] },
  { hueDark: "#3671c6", hueLight: "#1d4ed8", base: 0.34, width: 1.9, pulseSpeed: 0.048, pulsePhase: 0.37,
    waves: [[0.061, 1.3, -0.024], [0.021, 4.3, 0.033], [0.010, 7.9, -0.051]] },
  { hueDark: "#ff3b3b", hueLight: "#dc2626", base: 0.47, width: 2.3, pulseSpeed: 0.055, pulsePhase: 0.62,
    waves: [[0.058, 2.1, 0.027], [0.024, 3.7, -0.037], [0.011, 5.3, 0.047]] },
  { hueDark: "#27f4d2", hueLight: "#0f766e", base: 0.60, width: 2.0, pulseSpeed: 0.043, pulsePhase: 0.19,
    waves: [[0.066, 1.1, -0.029], [0.019, 4.9, 0.041], [0.009, 8.3, -0.023]] },
  { hueDark: "#a78bfa", hueLight: "#6d28d9", base: 0.73, width: 1.6, pulseSpeed: 0.038, pulsePhase: 0.83,
    waves: [[0.049, 2.7, 0.035], [0.023, 5.1, -0.021], [0.008, 9.1, 0.039]] },
  { hueDark: "#4ade80", hueLight: "#15803d", base: 0.86, width: 1.5, pulseSpeed: 0.034, pulsePhase: 0.51,
    waves: [[0.055, 1.9, -0.033], [0.018, 6.1, 0.025], [0.008, 10.3, -0.045]] },
];

/** One pass of the four-pass stack: how wide, how blurred, how present. */
interface Pass {
  op: GlobalCompositeOperation;
  /** multiplier on the lane's own width */
  scale: number;
  blur: number;
  alpha: number;
  /** true for the near-white centre line the dark recipe uses */
  white?: boolean;
}

interface Recipe {
  passes: Pass[];
  /** the three pulse layers: width multiplier, blur, alpha */
  pulse: [number, number, number][];
  pulseOp: GlobalCompositeOperation;
  pulseWhite: boolean;
  /** light lines need a touch more body to hold the page */
  widthScale: number;
}

const DARK: Recipe = {
  widthScale: 1,
  passes: [
    { op: "lighter", scale: 11, blur: 9, alpha: 0.07 },   // the air glows
    { op: "lighter", scale: 5, blur: 4, alpha: 0.16 },    // bloom
    { op: "lighter", scale: 1, blur: 0, alpha: 0.60 },    // body
    { op: "lighter", scale: 0.34, blur: 0, alpha: 0.50, white: true }, // the core
  ],
  pulse: [[5, 6, 0.09], [2.2, 0, 0.20], [0.9, 0, 0.75]],
  pulseOp: "lighter",
  pulseWhite: true,
};

const LIGHT: Recipe = {
  widthScale: 1.18,
  passes: [
    { op: "multiply", scale: 9, blur: 11, alpha: 0.10 },  // a coloured shadow, not fog
    { op: "multiply", scale: 4, blur: 4, alpha: 0.15 },
    { op: "source-over", scale: 1, blur: 0, alpha: 0.96 },
    // a second, thinner pass of the SAME hue in multiply: the centre deepens
    // on its own, which is how ink actually behaves. No second colour needed.
    { op: "multiply", scale: 0.4, blur: 0, alpha: 0.55 },
  ],
  pulse: [[6, 7, 0.10], [2.4, 0, 0.16], [1.0, 0, 0.5]],
  pulseOp: "multiply",
  pulseWhite: false,
};

export function HeroField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const root = document.documentElement;
    const calm = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || root.dataset.motion === "calm";

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    /* y of a lane at a given x (0..1 of the width) and time */
    const yAt = (l: Lane, u: number, t: number) => {
      let v = l.base;
      for (const [amp, freq, speed] of l.waves) v += amp * Math.sin(u * freq * Math.PI * 2 + t * speed);
      // a very slow independent drift, so the running order itself evolves
      v += 0.03 * Math.sin(t * 0.0037 + l.pulsePhase * 6.3);
      return v * h;
    };

    const STEP = 8;              // px between samples — fine enough to be smooth
    let raf = 0;
    let t = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // time only advances when motion is wanted; the picture still renders
      if (!calm()) t += dt * 0.06;

      const light = root.dataset.theme === "light";
      const r = light ? LIGHT : DARK;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const l of LANES) {
        const colour = light ? l.hueLight : l.hueDark;
        const width = l.width * r.widthScale;

        // sample once, draw four times — the stack is the whole look
        const pts: [number, number][] = [];
        for (let x = -STEP; x <= w + STEP; x += STEP) pts.push([x, yAt(l, x / w, t)]);

        const trace = () => {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i];
            const [x1, y1] = pts[i + 1];
            ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
          }
          ctx.stroke();
        };

        for (const pass of r.passes) {
          ctx.globalCompositeOperation = pass.op;
          ctx.strokeStyle = pass.white ? "#ffffff" : colour;
          ctx.globalAlpha = pass.alpha;
          ctx.lineWidth = width * pass.scale;
          ctx.filter = pass.blur ? `blur(${pass.blur}px)` : "none";
          trace();
        }
        ctx.filter = "none";

        /* The pulse: a short packet travelling the line, drawn as a gradient
           that fades at both ends so it has no hard edge — a highlight, not a
           dash. It leaves the right edge and re-enters at the left, which is
           invisible because the fade is longer than the overshoot. */
        const u = ((t * l.pulseSpeed * 0.01) + l.pulsePhase) % 1.35 - 0.175;
        if (u > -0.16 && u < 1.16) {
          const cx0 = u * w;
          const half = w * 0.075;
          ctx.globalCompositeOperation = r.pulseOp;
          r.pulse.forEach(([scale, blur, alpha], k) => {
            const spread = [1, 0.55, 0.22][k];
            const g = ctx.createLinearGradient(cx0 - half, 0, cx0 + half, 0);
            g.addColorStop(0, "transparent");
            g.addColorStop(0.5, r.pulseWhite ? "#ffffff" : colour);
            g.addColorStop(1, "transparent");
            ctx.strokeStyle = g;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = width * scale;
            ctx.filter = blur ? `blur(${blur}px)` : "none";
            ctx.beginPath();
            let started = false;
            for (let x = cx0 - half * spread; x <= cx0 + half * spread; x += 4) {
              if (x < -STEP || x > w + STEP) continue;
              const y = yAt(l, x / w, t);
              if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
          });
          ctx.filter = "none";
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div className={cx("hero-field pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden>
      {/* the light in the room */}
      <span className="hero-glow absolute inset-0" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* THE DEPTH OF FIELD — one blurred pane between the field and the copy,
          masked so it is solid behind the headline and gone by the right edge */}
      <span className="hero-dof absolute inset-0" />
    </div>
  );
}
