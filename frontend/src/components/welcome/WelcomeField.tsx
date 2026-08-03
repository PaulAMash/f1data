"use client";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/lib/prefs";

/* -------------------------------------------------------------------------- */
/* The room the welcome screen is in.                                          */
/*                                                                            */
/* It used to borrow the landing page's hero — the same renderer, in an        */
/* "ambient" configuration. That was the wrong instinct dressed as economy.    */
/* The racing line IS the home page: it is the first thing a reader is meant   */
/* to see when they arrive there, and spending it on the screen before means   */
/* the home page opens with something already familiar. A first screen cannot  */
/* be a preview of the second one.                                             */
/*                                                                            */
/* So this draws no race. There is no lap trace, no running order, no timing   */
/* and no data of any kind — nothing here can be read, because there is        */
/* nothing here to read. What it draws is a ROOM:                              */
/*                                                                            */
/*   THE LAMPS   three large soft sources drifting on slow, incommensurate     */
/*               paths, composited additively so the air between two of them   */
/*               is brighter than either. That additive overlap is the whole   */
/*               difference between "lighting" and "a gradient" — it is why    */
/*               the colour in the middle of the screen keeps changing without */
/*               anything visibly moving.                                      */
/*   THE GRID    a hairline lattice, erased toward the edges, drifting a few   */
/*               pixels over a minute. This is the operations-terminal note,   */
/*               and it is spent exactly once: any more of it and the screen   */
/*               starts pretending to be an instrument.                        */
/*                                                                            */
/* Everything is low-frequency, so the buffer is 0.4x and upscaled — a 1440px  */
/* window is drawn at 576px and nobody can tell, because there is not a single */
/* hard edge in the image. The grid is the one crisp thing, and it is built    */
/* once per resize rather than per frame.                                      */
/* -------------------------------------------------------------------------- */

const SCALE = 0.4;
const GRID = 74;          // css pixels between hairlines

interface Lamp {
  /** CSS custom property holding "r g b". */
  v: string;
  /** radius as a share of the diagonal */
  r: number;
  /** drift amplitude and rate, per axis */
  ax: number; ay: number; sx: number; sy: number;
  /** phase, so the three never share a beat */
  px: number; py: number;
  a: number;
}

const LAMPS: Lamp[] = [
  { v: "--accent", r: 0.62, ax: 0.26, ay: 0.15, sx: 0.021, sy: 0.013, px: 0.0, py: 1.1, a: 0.30 },
  { v: "--speed", r: 0.55, ax: 0.31, ay: 0.21, sx: 0.016, sy: 0.019, px: 2.2, py: 0.4, a: 0.26 },
  /* The third lamp was amber, and amber added to the accent gives brown — the
     one colour a room like this cannot have. Violet is the product's own
     "worth knowing" tone and it stays a colour wherever the red reaches it. */
  { v: "--best", r: 0.70, ax: 0.20, ay: 0.13, sx: 0.009, sy: 0.011, px: 4.1, py: 3.3, a: 0.16 },
];

export function WelcomeField() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const { prefs } = usePrefs();
  const theme = prefs.theme;
  const motion = prefs.motion;

  useEffect(() => {
    const host = wrap.current;
    const canvas = cv.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* The palette is read once per theme rather than per frame. getComputedStyle
       is a layout read and doing it sixty times a second to fetch three colours
       that change twice a session is the kind of cost that never shows up in a
       profile as one big number. */
    const css = getComputedStyle(document.documentElement);
    const rgb = (name: string) => css.getPropertyValue(name).trim() || "255 255 255";
    const palette = LAMPS.map((l) => rgb(l.v));
    const tint = rgb("--tint");
    const base = rgb("--base-950");

    /* LIGHT IS ADDITIVE IN A DARK ROOM AND SUBTRACTIVE ON PAPER.
       Compositing the lamps with `lighter` is right on black — two overlapping
       sources make the air between them brighter than either, which is the
       whole reason the dark screen reads as lit rather than as a gradient. Run
       the same code on white and every lamp pushes toward white: the screen
       went pink and hazy and the cards on it stopped having edges.
       So the light theme paints its own opaque base and MULTIPLIES into it,
       which is what coloured light actually does to a white surface. Same
       lamps, same paths, same palette — the opposite operator. */
    const light = theme === "light";
    const op: GlobalCompositeOperation = light ? "multiply" : "lighter";
    const gain = light ? 0.5 : 1;

    /* Calm slows the room down; the system-level request stops it. Two
       different answers to two different questions — "I would rather things
       moved less" and "movement makes me ill" — and collapsing them into one
       switch has always been the mistake. */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tempo = motion === "calm" ? 0.45 : 1;

    let w = 0, h = 0, bw = 0, bh = 0;
    const grid = document.createElement("canvas");
    const gctx = grid.getContext("2d");

    function size() {
      const r = host!.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      bw = Math.max(1, Math.round(w * SCALE));
      bh = Math.max(1, Math.round(h * SCALE));
      canvas!.width = bw;
      canvas!.height = bh;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      buildGrid();
    }

    /* The lattice, with its own edges erased.
       Masking with `destination-out` on a dedicated buffer is the only way to
       fade the grid without also fading the light: doing it on the main canvas
       would erase whatever the lamps had already put there. */
    function buildGrid() {
      if (!gctx) return;
      grid.width = bw;
      grid.height = bh;
      gctx.clearRect(0, 0, bw, bh);
      const step = GRID * SCALE;
      gctx.strokeStyle = `rgb(${tint} / ${light ? 0.03 : 0.042})`;
      gctx.lineWidth = 1;
      gctx.beginPath();
      for (let x = ((bw / 2) % step); x < bw; x += step) {
        gctx.moveTo(Math.round(x) + 0.5, 0);
        gctx.lineTo(Math.round(x) + 0.5, bh);
      }
      for (let y = ((bh / 2) % step); y < bh; y += step) {
        gctx.moveTo(0, Math.round(y) + 0.5);
        gctx.lineTo(bw, Math.round(y) + 0.5);
      }
      gctx.stroke();

      const m = gctx.createRadialGradient(bw / 2, bh * 0.46, 0, bw / 2, bh * 0.46, Math.max(bw, bh) * 0.62);
      m.addColorStop(0, "rgba(0,0,0,0)");
      m.addColorStop(0.55, "rgba(0,0,0,0.5)");
      m.addColorStop(1, "rgba(0,0,0,1)");
      gctx.globalCompositeOperation = "destination-out";
      gctx.fillStyle = m;
      gctx.fillRect(0, 0, bw, bh);
      gctx.globalCompositeOperation = "source-over";
    }

    function frame(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, bw, bh);

      const diag = Math.hypot(bw, bh);
      if (light) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgb(${base})`;
        ctx.fillRect(0, 0, bw, bh);
      }
      ctx.globalCompositeOperation = op;
      LAMPS.forEach((l, i) => {
        const x = bw * (0.5 + l.ax * Math.sin(t * l.sx + l.px));
        const y = bh * (0.5 + l.ay * Math.cos(t * l.sy + l.py));
        const r = diag * l.r;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgb(${palette[i]} / ${l.a * gain})`);
        g.addColorStop(0.45, `rgb(${palette[i]} / ${l.a * gain * 0.32})`);
        g.addColorStop(1, `rgb(${palette[i]} / 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, bw, bh);
      });
      ctx.globalCompositeOperation = "source-over";

      // the lattice, drifting a couple of pixels over about a minute
      const dx = Math.sin(t * 0.006) * 5 * SCALE;
      const dy = Math.cos(t * 0.004) * 4 * SCALE;
      ctx.drawImage(grid, dx, dy);
    }

    size();
    const ro = new ResizeObserver(() => { size(); if (still) frame(0); });
    ro.observe(host);

    if (still) {
      // a room with the lights on, holding still. Drawn, never animated.
      frame(0);
      return () => ro.disconnect();
    }

    let raf = 0;
    let t0 = 0;
    const loop = (now: number) => {
      if (!t0) t0 = now;
      frame(((now - t0) / 1000) * tempo);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [theme, motion]);

  return (
    <div ref={wrap} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={cv} className="block h-full w-full" />
    </div>
  );
}
