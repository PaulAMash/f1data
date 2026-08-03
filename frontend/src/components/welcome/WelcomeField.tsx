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
/*   THE ROOM (0.4x)   three large soft lamps drifting on slow incommensurate  */
/*                     paths, composited additively so the air where two of    */
/*                     them overlap is brighter than either. Nothing in it has */
/*                     an edge, so a 1440px window is drawn at 576px and there */
/*                     is no way to tell.                                      */
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

const ROOM = 0.4;
const FEED_DPR = 1.5;
const GRID = 74;

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

export function WelcomeField() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const roomC = useRef<HTMLCanvasElement | null>(null);
  const feedC = useRef<HTMLCanvasElement | null>(null);
  const { prefs } = usePrefs();
  const theme = prefs.theme;
  const motion = prefs.motion;

  useEffect(() => {
    const host = wrap.current;
    const rc = roomC.current, fc = feedC.current;
    if (!host || !rc || !fc) return;
    const room = rc.getContext("2d");
    const feed = fc.getContext("2d");
    if (!room || !feed) return;

    const css = getComputedStyle(document.documentElement);
    const rgb = (n: string) => css.getPropertyValue(n).trim() || "255 255 255";
    const lampColour = LAMPS.map((l) => rgb(l.v));
    const wire = [rgb("--accent"), rgb("--speed"), rgb("--best")];
    const tint = rgb("--tint");
    const base = rgb("--base-950");

    /* Light is additive in a dark room and subtractive on paper. `lighter` is
       right on black — two overlapping sources make the air between them
       brighter than either — and on white it pushes everything toward white,
       which turned the whole screen into a pink haze. The light theme paints an
       opaque base and multiplies into it: same lamps, opposite operator. */
    const light = theme === "light";
    const op: GlobalCompositeOperation = light ? "multiply" : "lighter";
    const gain = light ? 0.5 : 1;
    // hairlines have to be darker on paper and brighter on black to weigh the same
    const wireK = light ? 1.25 : 1;

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
      gctx.strokeStyle = `rgb(${tint} / ${light ? 0.03 : 0.042})`;
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
      if (light) {
        room!.globalCompositeOperation = "source-over";
        room!.fillStyle = `rgb(${base})`;
        room!.fillRect(0, 0, rw, rh);
      }
      const diag = Math.hypot(rw, rh);
      room!.globalCompositeOperation = op;
      LAMPS.forEach((l, i) => {
        const x = rw * (0.5 + l.ax * Math.sin(t * l.sx + l.px));
        const y = rh * (0.5 + l.ay * Math.cos(t * l.sy + l.py));
        const g = room!.createRadialGradient(x, y, 0, x, y, diag * l.r);
        g.addColorStop(0, `rgb(${lampColour[i]} / ${l.a * gain})`);
        g.addColorStop(0.45, `rgb(${lampColour[i]} / ${l.a * gain * 0.32})`);
        g.addColorStop(1, `rgb(${lampColour[i]} / 0)`);
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

      /* The centre belongs to the type. Everything below is drawn full-width
         and then erased out of the middle in one pass at the end, which is far
         cheaper than clipping every stroke and gives a softer boundary than any
         clip could. */

      // ---- ghosted circuit, low and left; morphs to another every few laps
      track.step(dt);
      const tw = Math.min(w * 0.30, 420), th = tw * 0.62;
      const tx = w * 0.055, ty = h * 0.60;
      feed!.strokeStyle = `rgb(${tint} / ${0.055 * wireK})`;
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
      feed!.fillStyle = `rgb(${wire[0]} / ${light ? 0.55 : 0.7})`;
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
        sweep.addColorStop(0, `rgb(${wire[1]} / ${0.10 * wireK})`);
        sweep.addColorStop(0.06, `rgb(${wire[1]} / 0)`);
        sweep.addColorStop(1, `rgb(${wire[1]} / 0)`);
        feed!.fillStyle = sweep;
        feed!.beginPath();
        feed!.arc(radX, radY, radR, 0, Math.PI * 2);
        feed!.fill();
      }
      feed!.strokeStyle = `rgb(${tint} / ${0.035 * wireK})`;
      feed!.lineWidth = 1;
      [0.45, 0.72, 1].forEach((k) => {
        feed!.beginPath();
        feed!.arc(radX, radY, radR * k, 0, Math.PI * 2);
        feed!.stroke();
      });

      // ---- nodes, breathing
      NODES.forEach((n) => {
        const a = 0.045 + 0.055 * (0.5 + 0.5 * Math.sin(t * n.s + n.p));
        feed!.fillStyle = `rgb(${wire[n.hue]} / ${a * wireK})`;
        feed!.beginPath();
        feed!.arc(n.x * w, n.y * h, 1.6, 0, Math.PI * 2);
        feed!.fill();
      });

      // ---- telemetry streams, with packets running along them
      STREAMS.forEach((s, si) => {
        const col = wire[s.hue];
        feed!.strokeStyle = `rgb(${col} / ${(si % 2 ? 0.055 : 0.075) * wireK})`;
        feed!.lineWidth = 1.1;
        feed!.beginPath();
        const yOf = (x: number) =>
          h * (s.y + s.amp * Math.sin(x * s.freq * Math.PI * 2 + t * s.drift * Math.PI * 2));
        for (let i = 0; i <= 96; i++) {
          const x = i / 96;
          const X = x * w, Y = yOf(x);
          if (i === 0) feed!.moveTo(X, Y); else feed!.lineTo(X, Y);
        }
        feed!.stroke();

        s.packets.forEach((p0, pi) => {
          const x = (p0 + t * s.speed[pi]) % 1;
          const X = x * w, Y = yOf(x);
          // a short bright trail behind the head, so it reads as travelling
          const tail = feed!.createLinearGradient(X - 46, Y, X, Y);
          tail.addColorStop(0, `rgb(${col} / 0)`);
          tail.addColorStop(1, `rgb(${col} / ${0.34 * wireK})`);
          feed!.strokeStyle = tail;
          feed!.lineWidth = 1.6;
          feed!.beginPath();
          for (let i = 0; i <= 12; i++) {
            const xx = Math.max(0, x - (12 - i) / 96 * 0.5);
            const XX = xx * w, YY = yOf(xx);
            if (i === 0) feed!.moveTo(XX, YY); else feed!.lineTo(XX, YY);
          }
          feed!.stroke();
          feed!.fillStyle = `rgb(${col} / ${0.62 * wireK})`;
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
         keeps the type legible, so this only has to take the edge off. */
      keep.addColorStop(0, "rgba(0,0,0,0.88)");
      keep.addColorStop(0.52, "rgba(0,0,0,0.6)");
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

    if (still) {
      frame(0, 0);
      return () => ro.disconnect();
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
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [theme, motion]);

  return (
    <div ref={wrap} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={roomC} className="absolute inset-0 block h-full w-full" />
      <canvas ref={feedC} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
