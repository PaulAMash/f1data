"use client";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/lib/prefs";
import { MiniTrack } from "@/lib/miniTrack";

/* -------------------------------------------------------------------------- */
/* The room, and what is running in it.                                        */
/*                                                                            */
/* Two canvases, because they want different resolutions and that is the whole */
/* trick to making this cheap:                                                 */
/*                                                                            */
/*   THE ROOM (0.4x)   the surface itself and the light on it. Nothing in it   */
/*                     has an edge, so a 1440px window is drawn at 576px and   */
/*                     there is no way to tell.                                */
/*   THE FEED (1.5x)   everything with a line in it — telemetry streams, the   */
/*                     packets travelling along them, a ghosted circuit, the   */
/*                     radar sweep, the nodes. These are hairlines and they    */
/*                     need the resolution or they shimmer.                    */
/*                                                                            */
/* WHAT IS DRAWN HERE IS NOT DATA AND DOES NOT PRETEND TO BE. It is the shape  */
/* of a system working: a signal arriving, a lap being timed, a sweep looking  */
/* for something. Every readout that makes a CLAIM — connected, synchronised,  */
/* how large the archive is — lives in the instrument panels instead, and each */
/* of those is answered by the real API. The line matters: atmosphere may be   */
/* invented, assertions may not.                                               */
/*                                                                            */
/* AND IT STAYS OUT OF THE MIDDLE. The type sits in the centre on a scrim, so  */
/* the feed is drawn edge-weighted: streams cross the full width but the mask  */
/* takes them down to nothing where the headline is. A background you have to  */
/* read around is not a background.                                            */
/* -------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   TWO ROOMS, NOT ONE ROOM WITH THE LIGHTS ON.

   The dark room is a black volume with sources IN it: light is additive, two
   lamps overlapping make the air between them brighter than either, and a
   hairline is legible because it is brighter than its surroundings.

   Paper is the opposite arrangement in every one of those respects. There is
   no air to light; there is a surface that already reflects nearly everything,
   and colour arrives as a TINT OF THE PAPER rather than as a glow above it. So
   the light room does not composite additively, does not multiply a saturated
   red into a pale grey (which is where the "washed out, inverted" look came
   from — accent × paper is mud), and does not try to make anything glow. Each
   lamp is mixed most of the way to the paper colour first and then laid down
   normally, which is what a tinted wash actually does, and the ink is drawn at
   print weights instead of at the alphas that read on black.

   Everything below therefore comes out of ONE table with two columns. Nothing
   in the drawing code branches on the theme; it asks the surface how heavy a
   mark should be, and the surface answers.
   --------------------------------------------------------------------------- */

const ROOM = 0.4;
const FEED_DPR = 1.5;
const GRID = 74;

/** How heavy every kind of mark is, on this surface. */
interface Weights {
  grid: number;
  circuit: number;
  car: number;
  sweep: number;
  ring: number;
  nodeLo: number; nodeHi: number;
  traceA: number; traceB: number;
  tail: number; head: number;
  /** peak alpha of a lamp, as a multiplier on its own declared strength */
  lampK: number;
}

const DARK_W: Weights = {
  grid: 0.042, circuit: 0.055, car: 0.70,
  sweep: 0.100, ring: 0.035,
  nodeLo: 0.045, nodeHi: 0.055,
  traceA: 0.075, traceB: 0.055,
  tail: 0.34, head: 0.62,
  lampK: 1,
};

/* Paper hides a thin mark that black would show, and the light theme's own
   accents are print colours (a deep red, a deep teal) rather than broadcast
   ones — so ink sits two to three times heavier here and still reads quieter,
   because a dark line on white recedes where a bright line on black advances. */
const LIGHT_W: Weights = {
  grid: 0.045, circuit: 0.075, car: 0.82,
  sweep: 0.05, ring: 0.06,
  nodeLo: 0.06, nodeHi: 0.085,
  traceA: 0.14, traceB: 0.10,
  tail: 0.40, head: 0.78,
  lampK: 1.15,
};

interface Lamp {
  v: string;
  r: number;
  ax: number; ay: number; sx: number; sy: number;
  px: number; py: number;
  a: number;
}

const LAMPS: Lamp[] = [
  { v: "--accent", r: 0.62, ax: 0.26, ay: 0.15, sx: 0.021, sy: 0.013, px: 0.0, py: 1.1, a: 0.30 },
  { v: "--speed", r: 0.55, ax: 0.31, ay: 0.21, sx: 0.016, sy: 0.019, px: 2.2, py: 0.4, a: 0.26 },
  /* Amber added to the accent gives brown — the one colour a room like this
     cannot have. Violet stays a colour wherever the red reaches it. */
  { v: "--best", r: 0.70, ax: 0.20, ay: 0.13, sx: 0.009, sy: 0.011, px: 4.1, py: 3.3, a: 0.16 },
];

/** A telemetry trace: where it sits, how it waves, how fast the signal runs. */
interface Stream {
  y: number;        // 0..1 of the height
  amp: number;      // 0..1 of the height
  freq: number;     // waves across the screen
  drift: number;    // phase per second
  hue: 0 | 1 | 2;   // index into the palette
  packets: number[]; // 0..1 along the width
  speed: number[];
}

const STREAMS: Stream[] = [
  { y: 0.14, amp: 0.045, freq: 1.7, drift: 0.10, hue: 1, packets: [0.10, 0.62], speed: [0.055, 0.041] },
  { y: 0.28, amp: 0.030, freq: 2.4, drift: -0.07, hue: 0, packets: [0.40], speed: [0.070] },
  { y: 0.47, amp: 0.055, freq: 1.2, drift: 0.05, hue: 2, packets: [0.78], speed: [0.033] },
  { y: 0.66, amp: 0.035, freq: 2.9, drift: -0.12, hue: 1, packets: [0.24, 0.86], speed: [0.048, 0.062] },
  { y: 0.81, amp: 0.048, freq: 1.5, drift: 0.08, hue: 0, packets: [0.55], speed: [0.038] },
  { y: 0.93, amp: 0.026, freq: 3.3, drift: -0.05, hue: 2, packets: [0.06], speed: [0.058] },
];

/** Deterministic, so the node field is the same shape every load. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "r g b" parsed, or null if the variable was not a triplet. */
function triplet(v: string): [number, number, number] | null {
  const p = v.trim().split(/[\s,]+/).map(Number);
  return p.length >= 3 && p.every((n) => Number.isFinite(n))
    ? [p[0], p[1], p[2]] : null;
}

/** A colour moved `k` of the way toward another, as an "r g b" string. */
function toward(v: string, dest: [number, number, number], k: number): string {
  const c = triplet(v);
  if (!c) return v;
  return c.map((n, i) => Math.round(n + (dest[i] - n) * k)).join(" ");
}

/** Everything the drawing needs to know about the surface it is drawing on. */
interface Surface {
  light: boolean;
  w: Weights;
  /** lamp colours, already adapted to the surface */
  lamp: string[];
  /** the three signal colours, for anything with a line in it */
  wire: string[];
  tint: string;
  base: string;
}

function readSurface(): Surface {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim() || "255 255 255";
  const light = document.documentElement.dataset.theme === "light";
  const base = v("--base-950");
  return {
    light,
    w: light ? LIGHT_W : DARK_W,
    /* A LAMP ON PAPER MAKES THE PAPER BRIGHTER, NOT DARKER.
       Mixed 85% of the way to white before it is ever laid down, so where two
       of them gather the page lifts toward white with a tint in it — which is
       what light on a pale surface does. Mixing toward the PAGE colour instead
       was the first attempt and it was exactly backwards: every wash was then
       slightly darker than the sheet it sat on, three of them piled up in the
       middle, and the result was a mauve bruise under the headline. */
    lamp: LAMPS.map((l) => (light ? toward(v(l.v), [255, 255, 255], 0.85) : v(l.v))),
    wire: [v("--accent"), v("--speed"), v("--best")],
    tint: v("--tint"),
    base,
  };
}

export function WelcomeField() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const roomC = useRef<HTMLCanvasElement | null>(null);
  const feedC = useRef<HTMLCanvasElement | null>(null);
  const { prefs } = usePrefs();
  const motion = prefs.motion;

  useEffect(() => {
    const host = wrap.current;
    const rc = roomC.current, fc = feedC.current;
    if (!host || !rc || !fc) return;
    const room = rc.getContext("2d");
    const feed = fc.getContext("2d");
    if (!room || !feed) return;

    /* THE CANVAS AGREES WITH THE DOCUMENT, NOT WITH REACT.
       This used to capture the palette once, keyed on `prefs.theme` — and React
       runs a child's effects BEFORE its parent's, so this read `<html>` before
       PrefsProvider had written the new theme onto it. Switching to Light on
       this screen therefore repainted every CSS layer and left the canvas
       painting the dark room underneath: white scrim, black room, which is
       exactly what "inverted dark mode" looks like. It came right on reload,
       which is the tell.

       So the source of truth is the element the theme actually lives on. The
       observer also catches the accent, which is written as inline custom
       properties by the same provider and could never have been picked up. */
    let s = readSurface();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tempo = motion === "calm" ? 0.45 : 1;

    let w = 0, h = 0, rw = 0, rh = 0, fw = 0, fh = 0;
    const gridC = document.createElement("canvas");
    const gctx = gridC.getContext("2d");

    // the node field: fixed positions, each with its own slow pulse
    const rnd = mulberry32(20260803);
    const NODES = Array.from({ length: 22 }, () => ({
      x: rnd(), y: rnd(), p: rnd() * Math.PI * 2, s: 0.25 + rnd() * 0.5, hue: Math.floor(rnd() * 3),
    }));

    const track = new MiniTrack(mulberry32(7));
    let lastT = 0;

    function size() {
      const r = host!.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      rw = Math.max(1, Math.round(w * ROOM)); rh = Math.max(1, Math.round(h * ROOM));
      fw = Math.max(1, Math.round(w * FEED_DPR)); fh = Math.max(1, Math.round(h * FEED_DPR));
      rc!.width = rw; rc!.height = rh;
      rc!.style.width = `${w}px`; rc!.style.height = `${h}px`;
      fc!.width = fw; fc!.height = fh;
      fc!.style.width = `${w}px`; fc!.style.height = `${h}px`;
      buildGrid();
    }

    function buildGrid() {
      if (!gctx) return;
      gridC.width = rw; gridC.height = rh;
      gctx.clearRect(0, 0, rw, rh);
      const step = GRID * ROOM;
      gctx.strokeStyle = `rgb(${s.tint} / ${s.w.grid})`;
      gctx.lineWidth = 1;
      gctx.beginPath();
      for (let x = ((rw / 2) % step); x < rw; x += step) {
        gctx.moveTo(Math.round(x) + 0.5, 0); gctx.lineTo(Math.round(x) + 0.5, rh);
      }
      for (let y = ((rh / 2) % step); y < rh; y += step) {
        gctx.moveTo(0, Math.round(y) + 0.5); gctx.lineTo(rw, Math.round(y) + 0.5);
      }
      gctx.stroke();
      const m = gctx.createRadialGradient(rw / 2, rh * 0.46, 0, rw / 2, rh * 0.46, Math.max(rw, rh) * 0.62);
      m.addColorStop(0, "rgba(0,0,0,0)");
      m.addColorStop(0.55, "rgba(0,0,0,0.5)");
      m.addColorStop(1, "rgba(0,0,0,1)");
      gctx.globalCompositeOperation = "destination-out";
      gctx.fillStyle = m;
      gctx.fillRect(0, 0, rw, rh);
      gctx.globalCompositeOperation = "source-over";
    }

    /* ---------------------------------------------------------------- room */
    function drawRoom(t: number) {
      room!.clearRect(0, 0, rw, rh);
      const diag = Math.hypot(rw, rh);

      if (s.light) {
        /* The paper, and the daylight on it. A sheet on a desk is brightest
           near the top and settles a shade as it goes down — that single
           gradient is most of why this reads as a lit surface rather than as a
           flat fill, and it is the opposite of the dark room's vignette. */
        room!.globalCompositeOperation = "source-over";
        room!.fillStyle = `rgb(${s.base})`;
        room!.fillRect(0, 0, rw, rh);
        const day = room!.createLinearGradient(0, 0, 0, rh);
        day.addColorStop(0, "rgb(255 255 255 / .78)");
        day.addColorStop(0.42, "rgb(255 255 255 / .28)");
        day.addColorStop(1, "rgb(255 255 255 / 0)");
        room!.fillStyle = day;
        room!.fillRect(0, 0, rw, rh);
      }

      /* Additive on black, plain on paper. `lighter` on a pale surface pushes
         everything toward white and turns the whole screen into a haze; the
         light room's lamps are pre-mixed into the paper instead, so they lay
         down as washes and stop being lights at all. */
      room!.globalCompositeOperation = s.light ? "source-over" : "lighter";
      LAMPS.forEach((l, i) => {
        const x = rw * (0.5 + l.ax * Math.sin(t * l.sx + l.px));
        const y = rh * (0.5 + l.ay * Math.cos(t * l.sy + l.py));
        const g = room!.createRadialGradient(x, y, 0, x, y, diag * l.r);
        const a = l.a * s.w.lampK;
        g.addColorStop(0, `rgb(${s.lamp[i]} / ${a})`);
        g.addColorStop(0.45, `rgb(${s.lamp[i]} / ${a * 0.32})`);
        g.addColorStop(1, `rgb(${s.lamp[i]} / 0)`);
        room!.fillStyle = g;
        room!.fillRect(0, 0, rw, rh);
      });
      room!.globalCompositeOperation = "source-over";
      room!.drawImage(gridC, Math.sin(t * 0.006) * 5 * ROOM, Math.cos(t * 0.004) * 4 * ROOM);
    }

    /* ---------------------------------------------------------------- feed */
    function drawFeed(t: number, dt: number) {
      feed!.clearRect(0, 0, fw, fh);
      feed!.save();
      feed!.scale(FEED_DPR, FEED_DPR);
      const { w: K, wire, tint } = s;

      /* The centre belongs to the type. Everything below is drawn full-width
         and then erased out of the middle in one pass at the end, which is far
         cheaper than clipping every stroke and gives a softer boundary than any
         clip could. */

      // ---- ghosted circuit, low and left; morphs to another every few laps
      track.step(dt);
      const tw = Math.min(w * 0.30, 420), th = tw * 0.62;
      const tx = w * 0.055, ty = h * 0.60;
      feed!.strokeStyle = `rgb(${tint} / ${K.circuit})`;
      feed!.lineWidth = 1.25;
      feed!.beginPath();
      for (let i = 0; i <= 160; i++) {
        const [px, py] = track.track.at(i / 160);
        const X = tx + px * tw, Y = ty + py * th;
        if (i === 0) feed!.moveTo(X, Y); else feed!.lineTo(X, Y);
      }
      feed!.stroke();
      // one car on it, because a circuit with nothing on it is a logo
      const u = (t * 0.055) % 1;
      const [cx0, cy0] = track.track.at(u);
      feed!.fillStyle = `rgb(${wire[0]} / ${K.car})`;
      feed!.beginPath();
      feed!.arc(tx + cx0 * tw, ty + cy0 * th, 2.6, 0, Math.PI * 2);
      feed!.fill();

      // ---- radar sweep, bottom right
      const radX = w * 0.9, radY = h * 0.30, radR = Math.min(w, h) * 0.34;
      const ang = (t * 0.42) % (Math.PI * 2);
      /* createConicGradient is Safari 16.4+ / Chrome 104+. Where it is absent
         the sweep is simply not drawn — the rings still say "radar", and a
         fallback built out of forty wedge fills would cost more than the
         feature is worth on a browser that old. */
      const sweep = typeof feed!.createConicGradient === "function"
        ? feed!.createConicGradient(ang, radX, radY)
        : null;
      if (sweep) {
        sweep.addColorStop(0, `rgb(${wire[1]} / ${K.sweep})`);
        sweep.addColorStop(0.06, `rgb(${wire[1]} / 0)`);
        sweep.addColorStop(1, `rgb(${wire[1]} / 0)`);
        feed!.fillStyle = sweep;
        feed!.beginPath();
        feed!.arc(radX, radY, radR, 0, Math.PI * 2);
        feed!.fill();
      }
      feed!.strokeStyle = `rgb(${tint} / ${K.ring})`;
      feed!.lineWidth = 1;
      [0.45, 0.72, 1].forEach((k) => {
        feed!.beginPath();
        feed!.arc(radX, radY, radR * k, 0, Math.PI * 2);
        feed!.stroke();
      });

      // ---- nodes, breathing
      NODES.forEach((n) => {
        const a = K.nodeLo + K.nodeHi * (0.5 + 0.5 * Math.sin(t * n.s + n.p));
        feed!.fillStyle = `rgb(${wire[n.hue]} / ${a})`;
        feed!.beginPath();
        feed!.arc(n.x * w, n.y * h, 1.6, 0, Math.PI * 2);
        feed!.fill();
      });

      // ---- telemetry streams, with packets running along them
      STREAMS.forEach((s0, si) => {
        const col = wire[s0.hue];
        feed!.strokeStyle = `rgb(${col} / ${si % 2 ? K.traceB : K.traceA})`;
        feed!.lineWidth = 1.1;
        feed!.beginPath();
        const yOf = (x: number) =>
          h * (s0.y + s0.amp * Math.sin(x * s0.freq * Math.PI * 2 + t * s0.drift * Math.PI * 2));
        for (let i = 0; i <= 96; i++) {
          const x = i / 96;
          const X = x * w, Y = yOf(x);
          if (i === 0) feed!.moveTo(X, Y); else feed!.lineTo(X, Y);
        }
        feed!.stroke();

        s0.packets.forEach((p0, pi) => {
          const x = (p0 + t * s0.speed[pi]) % 1;
          const X = x * w, Y = yOf(x);
          // a short bright trail behind the head, so it reads as travelling
          const tail = feed!.createLinearGradient(X - 46, Y, X, Y);
          tail.addColorStop(0, `rgb(${col} / 0)`);
          tail.addColorStop(1, `rgb(${col} / ${K.tail})`);
          feed!.strokeStyle = tail;
          feed!.lineWidth = 1.6;
          feed!.beginPath();
          for (let i = 0; i <= 12; i++) {
            const xx = Math.max(0, x - (12 - i) / 96 * 0.5);
            const XX = xx * w, YY = yOf(xx);
            if (i === 0) feed!.moveTo(XX, YY); else feed!.lineTo(XX, YY);
          }
          feed!.stroke();
          feed!.fillStyle = `rgb(${col} / ${K.head})`;
          feed!.beginPath();
          feed!.arc(X, Y, 1.9, 0, Math.PI * 2);
          feed!.fill();
        });
      });

      feed!.restore();

      // ---- and out of the middle it comes
      const keep = feed!.createRadialGradient(fw / 2, fh * 0.47, 0, fw / 2, fh * 0.47, Math.min(fw, fh) * 0.62);
      /* Not all the way to opaque. Erasing the middle completely left the
         glass panels with nothing behind them to refract, which is precisely
         the thing that makes glass read as glass — the fog layer above is what
         keeps the type legible, so this only has to take the edge off.

         Paper is less forgiving: ink under the headline is a smudge where a
         hairline on black is atmosphere, so the light room clears more of it. */
      const k0 = s.light ? 0.97 : 0.88, k1 = s.light ? 0.76 : 0.6;
      keep.addColorStop(0, `rgba(0,0,0,${k0})`);
      keep.addColorStop(0.52, `rgba(0,0,0,${k1})`);
      keep.addColorStop(1, "rgba(0,0,0,0)");
      feed!.globalCompositeOperation = "destination-out";
      feed!.fillStyle = keep;
      feed!.fillRect(0, 0, fw, fh);
      feed!.globalCompositeOperation = "source-over";
    }

    function frame(t: number, dt: number) {
      drawRoom(t);
      drawFeed(t, dt);
    }

    size();
    const ro = new ResizeObserver(() => { size(); if (still) frame(0, 0); });
    ro.observe(host);

    // the theme (and the accent) live on <html>; the canvas follows them there
    const mo = new MutationObserver(() => {
      s = readSurface();
      buildGrid();
      if (still) frame(0, 0);
    });
    mo.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme", "data-accent", "style"],
    });

    if (still) {
      frame(0, 0);
      return () => { ro.disconnect(); mo.disconnect(); };
    }

    let raf = 0, t0 = 0;
    const loop = (now: number) => {
      if (!t0) t0 = now;
      const t = ((now - t0) / 1000) * tempo;
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      frame(t, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
  }, [motion]);

  return (
    <div ref={wrap} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={roomC} className="absolute inset-0 block h-full w-full" />
      <canvas ref={feedC} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
