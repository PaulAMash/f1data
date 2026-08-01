"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import {
  HISTORY_S, N, POOL, RaceEngine,
  type Annotation, type Snapshot,
} from "@/lib/raceEngine";
import { MiniTrack } from "@/lib/miniTrack";
import { HeroTiming } from "./HeroTiming";
import { HeroCard } from "./HeroCard";

/* -------------------------------------------------------------------------- */
/* The hero.                                                                  */
/*                                                                            */
/* WHY THE GLOW MOVED OFF THE STROKE.                                         */
/*                                                                            */
/* Every previous version gave each line its own blurred copy — a halo, a     */
/* bloom, a core, drawn per path. That is glow, and glow is not atmosphere.    */
/* The difference is that light in a real room is ADDITIVE ACROSS THE WHOLE    */
/* SCENE: where two bright things overlap, the air between them gets brighter  */
/* than either. Per-stroke haloes cannot do that, because each stroke only     */
/* knows about itself, and that is precisely why the old hero read flat next   */
/* to any reference with real lighting in it.                                  */
/*                                                                            */
/* Bloom here is a screen-space pass, the way it is done in a renderer:        */
/*                                                                            */
/*   1. draw the scene once into a 0.42x buffer, and once more into a 0.15x    */
/*      mip of that                                                            */
/*   2. composite both back, blurred — the small one is the volumetric haze    */
/*   3. draw the scene again, crisp, on top                                    */
/*                                                                            */
/* Light therefore pools where the field converges and thins where it spreads, */
/* which is the entire "expensive" feeling. The downsampling is not a          */
/* compromise: blurring a mip is both cheaper AND wider than blurring the      */
/* original, which is the whole reason mip chains exist.                       */
/*                                                                            */
/* WHAT IS BEING DRAWN is in lib/raceEngine.ts. The short version: x is time,  */
/* the right edge is now, and every curve is one car's real position history.  */
/* Nothing here invents motion — it draws whatever the race is doing.          */
/* -------------------------------------------------------------------------- */

const FIELD_H = 0.78;   // share of the canvas height the running order occupies
const FIELD_C = 0.50;   // where its centre sits
const NOW_U = 0.955;    // the live edge, as a fraction of the width

/** Rounded rect, because canvas still does not have one everywhere. */
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function HeroField({ className }: { className?: string }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const main = useRef<HTMLCanvasElement | null>(null);
  const [cards, setCards] = useState<Annotation[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    const canvas = main.current;
    const host = wrap.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* The bloom chain, as a renderer does it: one scene buffer and one much
       smaller mip of it. Blurring a downsample is both cheaper AND wider than
       blurring the original, which is the whole reason mip chains exist — the
       first attempt at this ran blur(14px) across a half-resolution full-screen
       bitmap three times a frame and managed eleven frames a second. */
    const low = document.createElement("canvas");     // scene, 0.42x
    const lctx = low.getContext("2d");
    const blur = document.createElement("canvas");    // low, blurred, 0.42x
    const bctx = blur.getContext("2d");
    const mip = document.createElement("canvas");     // haze, blurred, 0.15x
    const mctx = mip.getContext("2d");
    /* The room — three soft lamps, one of which follows the leader. All of it
       is low-frequency, so it is drawn at a third of the resolution and reused
       for three frames at a time. Nobody can see a gradient arrive late. */
    const room = document.createElement("canvas");
    const rctx = room.getContext("2d");
    if (!lctx || !bctx || !mctx || !rctx) return;
    // Safari before 17 has no ctx.filter. The scene still renders; it simply
    // does not bloom, which is a lesser hero rather than a broken one.
    const canBlur = typeof ctx.filter === "string";
    let miniSeed = 0x1f2e3d4c;

    const root = document.documentElement;
    const calm = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || root.dataset.motion === "calm";

    /* ---- the engine, pre-rolled ------------------------------------------
       At t=0 every car sits exactly on its grid slot, so the opening frame
       would be seven straight lines. Thirty seconds are run before the first
       paint so the hero opens mid-race, with shape already in the history —
       then the staged moments are cleared so nothing is half-finished on
       screen at the moment the reader arrives. */
    const race = new RaceEngine();
    const mini = new MiniTrack(() => {
      // borrows the engine's determinism rather than Math.random, so the
      // sequence of circuits is the same on the server and the client
      miniSeed = (miniSeed * 1664525 + 1013904223) >>> 0;
      return miniSeed / 4294967296;
    });
    for (let i = 0; i < 900; i++) race.step(1 / 30);
    race.annotations.length = 0;
    race.pulses.length = 0;

    let w = 0, h = 0, dpr = 1;
    const LOW = 0.42, MIP = 0.15, ROOM = 0.32;
    const setup = (c: HTMLCanvasElement, x: CanvasRenderingContext2D, k: number) => {
      c.width = Math.max(1, Math.round(w * dpr * k));
      c.height = Math.max(1, Math.round(h * dpr * k));
      x.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    };
    let roomAge = 99;
    const resize = () => {
      const r = host.getBoundingClientRect();
      // 1, not the device ratio. Every glyph in this hero is DOM; the canvas
      // carries only soft light and 2px strokes, and doubling its pixel count
      // buys nothing a reader can see while costing a quarter of the frame.
      dpr = 1;
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      setup(canvas, ctx, 1);
      setup(low, lctx, LOW);
      setup(blur, bctx, LOW);
      setup(mip, mctx, MIP);
      setup(room, rctx, ROOM);
      roomAge = 99;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ---- the cursor -------------------------------------------------------
       The hero acknowledges the reader and never announces that it has, and it
       does so ONLY through light — see the note above drawScene for why the
       lines themselves are now untouchable. The lamp is eased toward, never
       snapped to, so moving the mouse quickly leaves a wake rather than a
       jump, and it decays to nothing the moment the pointer leaves.

       Pointer events are on the SECTION, not on this element: the field is
       pointer-events:none by design, because the buttons drawn over it have to
       stay clickable. */
    let mx = -1, my = -1, mStrength = 0, mWant = 0;
    const track = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      mWant = 1;
    };
    const leave = () => { mWant = 0; };
    const surface = host.parentElement ?? host;
    surface.addEventListener("pointermove", track, { passive: true });
    surface.addEventListener("pointerleave", leave, { passive: true });

    /* ---- geometry --------------------------------------------------------- */
    const laneY = () => {
      const span = h * FIELD_H * race.spread;
      const cy = h * FIELD_C;
      const gap = span / (N - 1);
      return (pos: number) => cy + (pos - (N - 1) / 2) * gap;
    };
    const ageAt = (x: number) => Math.max(0, (1 - x / w) * HISTORY_S);
    const uToX = (u: number) => u * w;

    /* THE CURSOR CHANGES THE LIGHT, NEVER THE DATA.
       Bending the lines toward the pointer was the wrong idea however smooth
       the falloff became: the anchors, the stems and the cards are all pinned
       to positions read out of the history buffer, and deforming the drawing
       after the fact detached every one of them from the value it described.
       A telemetry trace that moves because you waved at it is not telemetry.
       What is left is atmospheric — see the lamp in paintRoom — which the
       reader feels without being able to name. */

    /* CURVES, NOT SEGMENTS.
       Sampling every 7px and joining with lineTo draws a polygon, and wherever
       the field turned quickly the polygon showed — a visible corner at every
       sample. A Catmull-Rom spline converted to cubic beziers is C1 continuous
       by construction: no join anywhere can form an angle, whatever the data
       does. It is also cheaper, because 18px samples through a curve read
       smoother than 7px samples through straight lines. */
    const SAMPLE = 18;
    const xs: number[] = [];
    const ys: number[] = [];
    const spline = (
      c: CanvasRenderingContext2D, yOf: (x: number) => number, from: number, to: number,
      step = SAMPLE,
    ) => {
      xs.length = 0; ys.length = 0;
      // one sample beyond each end, so the tangents at the visible ends are
      // still informed by data rather than by the clamp
      for (let x = from - step; x <= to + step; x += step) {
        xs.push(x); ys.push(yOf(x));
      }
      if (xs.length < 2) return;
      const n = xs.length;
      c.beginPath();
      c.moveTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x0 = xs[i > 0 ? i - 1 : 0], y0 = ys[i > 0 ? i - 1 : 0];
        const x1 = xs[i], y1 = ys[i];
        const x2 = xs[i + 1], y2 = ys[i + 1];
        const x3 = xs[i + 2 < n ? i + 2 : n - 1], y3 = ys[i + 2 < n ? i + 2 : n - 1];
        c.bezierCurveTo(
          x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6,
          x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6,
          x2, y2,
        );
      }
    };

    /* ---- the scene, drawn twice per frame at two resolutions -------------- */
    // rank per driver, rebuilt once a frame. Looking this up inside the draw
    // loop meant re-sorting the field twenty-eight times per frame for an
    // answer that cannot change between two strokes of the same picture.
    const rankOf = new Int8Array(N);

    const drawScene = (c: CanvasRenderingContext2D, light: boolean, crisp: boolean, ord: number[]) => {
      const Y = laneY();
      c.lineCap = "round";
      c.lineJoin = "round";
      c.globalCompositeOperation = "source-over";

      /* THE DEPTH OF FIELD, FOR FREE.
         This used to be a full-screen `backdrop-filter` pane in the DOM, which
         meant the compositor re-filtered the entire hero on every frame the
         canvas changed — on its own it cost more than everything else on the
         page put together. It is now a property of the crisp pass: the sharp
         stroke is painted through a horizontal gradient that does not exist on
         the left, so behind the headline only the blurred bloom survives. Same
         focal falloff, no compositing, and it is physically the right model —
         out of focus IS "the sharp copy is missing". */
      /* The focal falloff is measured in fractions of the width, so on a phone
         the same numbers put the entire sharp pass in the last hundred pixels
         and the hero all but empties out. Narrow screens hand legibility to
         the vertical scrim instead and keep the field sharp nearly throughout
         — a depth of field needs a foreground and a background to separate,
         and one column has neither. */
      const narrow = w < 720;
      const focused = (colour: string, from: number, to: number) => {
        if (narrow) { from = 0; to = 0.1; }
        const g = c.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "transparent");
        g.addColorStop(from, "transparent");
        g.addColorStop(to, colour);
        g.addColorStop(1, colour);
        return g;
      };

      for (let d = N - 1; d >= 0; d--) {
        const colour = light ? POOL[race.cars[d].ref].light : POOL[race.cars[d].ref].dark;
        // The front of the race is the subject. Weight and brightness fall off
        // down the order so the eye is told where to look, instead of being
        // handed seven equal lines and left to choose.
        const rank = rankOf[d];
        const lead = 1 - rank / (N - 1);
        /* Weight and brightness fall off down the order, but they fall to a
           FLOOR, not to nothing. The first cut let the backmarkers reach 0.3
           alpha at 1.15px, where the vignette finished them off and the bottom
           third of the composition simply emptied out. A car the reader cannot
           see is not a subtle car, it is a missing one. */
        const width = (crisp ? 1 : 1.4) * (1.7 + lead * 1.7);
        /* `alive` dips to zero across a race changeover, so the whole field
           dims out and the next race arrives rather than replacing this one
           between two frames. */
        const alpha = (light ? 0.7 + lead * 0.3 : 0.46 + lead * 0.5)
          * (0.12 + 0.88 * race.alive);

        // the blurred pass is sampled half as finely; nothing survives the blur
        spline(c, (x) => Y(race.posAt(d, ageAt(x))),
          -SAMPLE, w + SAMPLE * 2, crisp ? SAMPLE : SAMPLE * 2);
        c.strokeStyle = crisp ? focused(colour, 0.30, 0.66) : colour;
        c.globalAlpha = alpha;
        c.lineWidth = width;
        c.stroke();

        // the hot centre, front three only — this is what makes a line read as
        // carrying light rather than as being painted in a colour
        if (crisp && rank < 3 && !light) {
          c.strokeStyle = focused("#ffffff", 0.40, 0.72);
          c.globalAlpha = 0.34 - rank * 0.09;
          c.lineWidth = width * 0.3;
          c.stroke();
        }
      }

      /* packets. Travelling toward the live edge, because that is the        */
      /* direction information moves in this picture: toward being analysed.  */
      for (const p of race.pulses) {
        const colour = light ? POOL[race.cars[p.car].ref].light : POOL[race.cars[p.car].ref].dark;
        const x0 = uToX(p.u);
        const tail = w * 0.055;
        const g = c.createLinearGradient(x0 - tail, 0, x0 + 6, 0);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.75, colour);
        g.addColorStop(1, light ? colour : "#ffffff");
        c.strokeStyle = g;
        c.globalAlpha = Math.min(1, p.heat) * (light ? 0.5 : 0.9);
        c.lineWidth = (crisp ? 2.8 : 3.8) * Math.min(1.5, p.heat);
        /* Only the packet's own span, not the whole width behind a clip. The
           first cut built a full-screen spline per packet per pass — six extra
           curves a frame for a highlight forty pixels long, which halved the
           frame rate the packets were supposed to be spending. */
        spline(c, (x) => Y(race.posAt(p.car, ageAt(x))),
          Math.max(-SAMPLE, x0 - tail), Math.min(w + SAMPLE, x0 + 6));
        c.stroke();
      }

      /* the live edge: where the engine is reading. Seven markers in running
         order, and between them they explain the whole visualisation. */
      const nx = uToX(NOW_U);
      for (let r = 0; r < ord.length; r++) {
        const d = ord[r];
        const y = Y(race.posAt(d, ageAt(nx)));
        c.globalAlpha = (light ? 0.75 : 0.95) * (1 - r / (N + 2));
        c.fillStyle = light ? POOL[race.cars[d].ref].light : POOL[race.cars[d].ref].dark;
        c.beginPath();
        c.arc(nx, y, crisp ? 2.1 : 2.8, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };

    /* ---- the room, cached -------------------------------------------------
       Three ambient lamps, one of which follows the leader so the colour in
       the air moves with the race rather than on its own timer. Pure gradient,
       so a third of the resolution upscales invisibly and three frames of
       staleness are three frames nobody can perceive. */
    const paintRoom = (light: boolean, leadY: number) => {
      rctx.setTransform(dpr * ROOM, 0, 0, dpr * ROOM, 0, 0);
      rctx.clearRect(0, 0, w, h);
      const lamp = (x: number, y: number, r: number, rgb: string, a: number) => {
        const g = rctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb}, ${a})`);
        g.addColorStop(0.55, `rgba(${rgb}, ${a * 0.32})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        rctx.fillStyle = g;
        rctx.fillRect(0, 0, w, h);
      };
      const k = light ? 0.3 : 1;
      lamp(w * 0.72, leadY, Math.max(w, h) * 0.58, "255, 92, 62", 0.15 * k);
      lamp(w * 0.32, h * 0.28, Math.max(w, h) * 0.5, "0, 186, 220", 0.1 * k);
      lamp(w * 0.92, h * 0.84, Math.max(w, h) * 0.42, "255, 168, 44", 0.075 * k);
      // and a little more light wherever the reader is looking
      if (mStrength > 0.01 && mx > 0) {
        lamp(mx, my, Math.max(w, h) * 0.2, light ? "120, 140, 190" : "255, 190, 170",
          0.09 * k * mStrength);
      }
    };

    /* Layer 6 — background intelligence. A handful of sharp strokes, so these
       stay on the main canvas where they can hold a hairline. Everything here
       is between 3% and 9%: the reader should find it on a second visit. */
    const drawMarks = (light: boolean, s: Snapshot) => {
      const faint = light ? "15, 23, 42" : "255, 255, 255";
      ctx.lineWidth = 1;

      ctx.strokeStyle = `rgba(${faint}, ${light ? 0.07 : 0.05})`;
      ctx.setLineDash([2, 7]);
      for (const u of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(uToX(u), h * 0.16); ctx.lineTo(uToX(u), h * 0.86);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // a timing ruler drifting at the same rate the history does
      ctx.strokeStyle = `rgba(${faint}, ${light ? 0.055 : 0.035})`;
      ctx.beginPath();
      const drift = (race.t * (w / HISTORY_S)) % 48;
      for (let x = -drift; x < w; x += 48) {
        ctx.moveTo(x, h * 0.9); ctx.lineTo(x, h * 0.9 + 5);
      }
      ctx.stroke();

      /* THE RACE TRACKER.
         A circuit and one dot was a decoration that filled a corner. This is
         the same race the lines are: every car's place around the lap comes
         from its gap to the leader, so the dots really are in the running
         order and really do close up and pass each other. One source of truth
         throughout — the marker is placed on the same curve that is stroked,
         by arc length, so it can neither leave the road nor surge through a
         corner.

         Not on a phone. At 390px it is sixty pixels wide, which is a smudge
         rather than a circuit, and the brief's last instruction is the one
         worth obeying: sophistication, not complexity. */
      if (w < 720) return;
      const cw = Math.min(w * 0.185, 236), ch = cw * 0.62;
      const ox = w - cw - 30, oy = h * 0.055;
      const tp = mini.track;

      // a pane of glass to sit it on, so it reads as an instrument
      const pad = 13;
      ctx.save();
      roundRect(ctx, ox - pad, oy - pad - 13, cw + pad * 2, ch + pad * 2 + 13, 11);
      ctx.fillStyle = light ? "rgba(255,255,255,.6)" : "rgba(14,18,28,.42)";
      ctx.fill();
      ctx.strokeStyle = `rgba(${faint}, ${light ? 0.1 : 0.07})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.clip();

      // the name of the circuit, which is the one label the widget earns
      ctx.font = "600 8px ui-monospace, monospace";
      ctx.fillStyle = `rgba(${faint}, ${light ? 0.55 : 0.4})`;
      ctx.letterSpacing = "1.4px";
      ctx.fillText(mini.name, ox - pad + 11, oy - pad - 1);
      ctx.letterSpacing = "0px";

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(cw, ch);
      const road = tp.path();
      // a soft bed under the road, then the road: two strokes read as depth
      ctx.strokeStyle = light
        ? `rgba(${faint}, ${0.09 * mini.settled})`
        : `rgba(${faint}, ${0.1 * mini.settled})`;
      ctx.lineWidth = 5.5 / cw;
      ctx.lineJoin = "round";
      ctx.stroke(road);
      ctx.strokeStyle = light
        ? `rgba(${faint}, ${0.34 * mini.settled})`
        : `rgba(${faint}, ${0.26 * mini.settled})`;
      ctx.lineWidth = 1.5 / cw;
      ctx.stroke(road);
      ctx.restore();

      /* the field, in running order. Drawn back to front so the leader's glow
         sits on top of the car it is lapping rather than under it. */
      for (let r = s.order.length - 1; r >= 0; r--) {
        const ci = s.order[r];
        const [mx, my] = tp.at(race.cars[ci].trackU);
        const px = ox + mx * cw, py = oy + my * ch;
        const colour = light ? POOL[race.cars[ci].ref].light : POOL[race.cars[ci].ref].dark;
        const lead = 1 - r / (N - 1);

        const g = ctx.createRadialGradient(px, py, 0, px, py, 7 + lead * 3);
        g.addColorStop(0, colour);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = light ? 0.16 + lead * 0.1 : 0.24 + lead * 0.16;
        ctx.fillStyle = g;
        ctx.fillRect(px - 10, py - 10, 20, 20);

        ctx.globalAlpha = light ? 0.85 : 0.95;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(px, py, 1.7 + lead * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // the status light, when the race is under anything but green
      if (s.status !== "GREEN") {
        const tint = s.status === "SAFETY CAR" ? "255,176,32"
          : s.status === "VSC" ? "255,208,64" : "255,196,0";
        const beat = 0.55 + 0.45 * Math.sin(race.t * 5);
        ctx.fillStyle = `rgba(${tint}, ${0.25 + beat * 0.5})`;
        roundRect(ctx, ox + cw - 26, oy - pad - 9, 26, 11, 3);
        ctx.fill();
      }
      ctx.restore();
    };

    /* ---- the frame -------------------------------------------------------- */
    let raf = 0;
    let last = performance.now();
    let publish = 0;
    let lastIds = "";
    let roomLight = false;
    let bloomAge = 9;
    let bloomStale = true;

    /* Every frame the display will give us.
       Thirty-one was a defensible trade while the render cost forty
       milliseconds. It is not defensible now: the lines are slow enough to
       survive it, but a small bright packet crossing the screen is exactly the
       kind of motion that shows every dropped frame, and it read as a
       different, worse animation than the one behind it. The bloom chain made
       the budget; the packets get to spend it. */
    const MIN_FRAME = 1000 / 61;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < MIN_FRAME) return;
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      const still = calm();
      if (!still) { race.step(dt); mini.step(dt); }
      // the bend is an animation, so a reader who asked for less gets none
      const want = still ? 0 : mWant;
      mStrength += (want - mStrength) * Math.min(1, dt * (want ? 3.4 : 5));

      const s = race.snapshot();
      for (let r = 0; r < s.order.length; r++) rankOf[s.order[r]] = r;

      const light = root.dataset.theme === "light";
      const HAZE = light ? 0.34 : 0.95;
      const BLOOM = light ? 0.26 : 0.8;
      const Y0 = laneY();

      if (++roomAge >= (mStrength > 0.01 ? 1 : 3) || light !== roomLight) {
        roomAge = 0; roomLight = light;
        paintRoom(light, Y0(race.posAt(s.order[0], 0)));
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(room, 0, 0, w, h);
      drawMarks(light, s);

      /* THE BLOOM SOURCE UPDATES AT HALF RATE.
         It is a heavily blurred, quarter-resolution copy of a scene that moves
         a few pixels a second. One frame of staleness in it is not perceivable
         by any means — and rebuilding it every frame was a third of the frame
         budget the packets needed in order to stop stepping. */
      if (++bloomAge >= 2) {
        bloomAge = 0;
        lctx.setTransform(dpr * LOW, 0, 0, dpr * LOW, 0, 0);
        lctx.clearRect(0, 0, w, h);
        drawScene(lctx, light, false, s.order);
        bloomStale = true;
      }

      /* Two composites, not three, and the wide one reads off a bitmap a
         seventh of the size — a blur of a downsample is both cheaper and
         wider than the same blur applied to the original. */
      /* BLUR SMALL, UPSCALE BIG.
         Blurring during the full-screen composite meant convolving a million
         pixels twice a frame; doing it while the image is still a 0.42x and a
         0.15x buffer is the same picture for a twentieth of the work, because
         the bilinear upscale afterwards is itself a smoothing operation. This
         is the difference between 23fps and the cap. */
      if (canBlur && bloomStale) {
        bloomStale = false;

        /* Both bloom layers are combined HERE, in the quarter-size buffer,
           rather than as two full-screen composites onto the canvas. Blending
           a million pixels twice was five of the seven milliseconds this frame
           costs; blending 190,000 twice and then compositing once is the same
           image for a third of the price. The per-layer weights are folded in
           as ratios of the strongest, since globalAlpha cannot exceed one. */
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.clearRect(0, 0, mip.width, mip.height);
        mctx.filter = "blur(2.5px)";
        mctx.drawImage(low, 0, 0, mip.width, mip.height);
        mctx.filter = "none";

        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, blur.width, blur.height);
        bctx.globalCompositeOperation = "source-over";
        bctx.globalAlpha = BLOOM / HAZE;
        bctx.filter = "blur(3px)";
        bctx.drawImage(low, 0, 0, blur.width, blur.height);
        bctx.filter = "none";
        bctx.globalCompositeOperation = "lighter";
        bctx.globalAlpha = 1;
        bctx.drawImage(mip, 0, 0, blur.width, blur.height);
        bctx.globalCompositeOperation = "source-over";
      }
      if (canBlur) {
        ctx.globalCompositeOperation = light ? "multiply" : "lighter";
        ctx.globalAlpha = HAZE;
        ctx.drawImage(blur, 0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      drawScene(ctx, light, true, s.order);

      /* ---- the DOM layer -------------------------------------------------- */
      const Y = Y0;
      const live = still ? [] : race.annotations;
      const ids = live.map((a) => a.id).join(",");
      if (ids !== lastIds) { lastIds = ids; setCards(live.slice()); }

      for (const a of live) {
        const el = cardRefs.current.get(a.id);
        if (!el) continue;
        const u = race.annotationU(a);
        const x = uToX(u);
        const y = Y(race.posAt(a.car, ageAt(x)));
        const age = race.t - a.born;
        /* In over 400ms, out over the last third of its own life. Tying the
           fade to `life` rather than to a screen position means a two-second
           card and a four-second card breathe the same way — the only thing
           that differs between them is how long they hold. */
        const fade = Math.min(1, age / 0.4)
          * Math.min(1, (1 - age / a.life) / 0.32)
          * Math.min(1, (u - 0.4) / 0.05);
        /* ALWAYS TO THE RIGHT, ALWAYS ATTACHED, NEVER BEHIND THE CHROME.
           The card keeps one relationship to its point for its whole life: a
           short stem out to the right, vertically centred. It does not flip
           sides near an edge and it does not open above or below by turns —
           either would break the only thing a telemetry label has to say,
           which is that it belongs to THAT point.

           The one concession is `--lift`: when a climbing line would carry the
           card up behind the navigation bar, the CARD is nudged down while the
           ANCHOR stays exactly on the data. The stem lengthens to cover the
           difference, so the attachment is still visible and still true. */
        const HALF = 17, TOP = 26, BOT = h - 26;
        const lift = Math.max(0, TOP + HALF - y) + Math.min(0, BOT - HALF - y);
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.setProperty("--lift", `${lift.toFixed(1)}px`);
        el.style.opacity = String(Math.max(0, Math.min(1, fade)));
      }

      // eleven times a second. At five the gaps visibly stepped between
      // values, which reads as a display refreshing rather than as a number
      // changing — and React is still nowhere near the frame budget.
      if (now - publish > 90) { publish = now; setSnap(s); }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      surface.removeEventListener("pointermove", track);
      surface.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={wrap} className={cx("hero-field pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden>
      <canvas ref={main} className="absolute inset-0 h-full w-full" />

      {/* Film. Grain and a vignette are most of the distance between "rendered
          in a browser" and "shot" — and as static composited layers they cost
          the frame loop nothing, which is where both of them used to live. */}
      <span className="hero-grain absolute inset-0" />
      <span className="hero-vignette absolute inset-0" />

      {/* THE DEPTH OF FIELD — one blurred pane between the field and the copy,
          masked so it is solid behind the headline and gone by the right edge */}
      <span className="hero-dof absolute inset-0" />

      {/* Layer 3: cards pinned to moments, not to screen positions. They ride
          the history leftward and retire long before they reach the headline. */}
      <div className="absolute inset-0 hidden md:block">
        {cards.map((a) => (
          <HeroCard key={a.id} a={a}
            ref={(el) => {
              if (el) cardRefs.current.set(a.id, el);
              else cardRefs.current.delete(a.id);
            }} />
        ))}
      </div>

      {snap && <HeroTiming snap={snap} />}
    </div>
  );
}

export { N as HERO_LANES };
