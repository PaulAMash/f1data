"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import {
  DRIVERS, HISTORY_S, N, RaceEngine,
  type Annotation, type Snapshot,
} from "@/lib/raceEngine";
import { MiniTrack } from "@/lib/miniTrack";

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

    /* ---- geometry --------------------------------------------------------- */
    const laneY = () => {
      const span = h * FIELD_H * race.spread;
      const cy = h * FIELD_C;
      const gap = span / (N - 1);
      return (pos: number) => cy + (pos - (N - 1) / 2) * gap;
    };
    const ageAt = (x: number) => Math.max(0, (1 - x / w) * HISTORY_S);
    const uToX = (u: number) => u * w;

    /* CURVES, NOT SEGMENTS.
       Sampling every 7px and joining with lineTo draws a polygon, and wherever
       the field turned quickly the polygon showed — a visible corner at every
       sample. A Catmull-Rom spline converted to cubic beziers is C1 continuous
       by construction: no join anywhere can form an angle, whatever the data
       does. It is also cheaper, because 16px samples through a curve read
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
        const colour = light ? DRIVERS[d].light : DRIVERS[d].dark;
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
        const alpha = light ? 0.7 + lead * 0.3 : 0.46 + lead * 0.5;

        // the blurred pass is sampled half as finely; nothing survives the blur
        spline(c, (x) => Y(race.posAt(d, ageAt(x))), -SAMPLE, w + SAMPLE * 2,
          crisp ? SAMPLE : SAMPLE * 2);
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
        const colour = light ? DRIVERS[p.driver].light : DRIVERS[p.driver].dark;
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
        spline(c, (x) => Y(race.posAt(p.driver, ageAt(x))),
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
        c.fillStyle = light ? DRIVERS[d].light : DRIVERS[d].dark;
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
    };

    /* Layer 6 — background intelligence. A handful of sharp strokes, so these
       stay on the main canvas where they can hold a hairline. Everything here
       is between 3% and 9%: the reader should find it on a second visit. */
    const drawMarks = (light: boolean) => {
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

      /* The minimap. One source of truth: the marker is placed on the same
         curve that is stroked, by arc length, so it cannot leave the road and
         cannot surge through corners. The road itself bends into a different
         circuit at the end of every lap.

         Not on a phone. At 390px it is sixty pixels wide, which is a smudge
         rather than a circuit — and the brief's last instruction is the one
         worth obeying here: increase sophistication, not complexity. */
      if (w < 720) return;
      const cw = Math.min(w * 0.155, 200), ch = cw * 0.62;
      const ox = w - cw - 26, oy = h * 0.045;
      const tp = mini.track;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(cw, ch);
      // brighter than the rest of layer 6, and brighter again on paper, where
      // a 6% line over white is not a line
      ctx.strokeStyle = light
        ? `rgba(${faint}, ${0.2 * mini.settled})`
        : `rgba(${faint}, ${0.155 * mini.settled})`;
      ctx.lineWidth = 1.7 / cw;
      ctx.lineJoin = "round";
      ctx.stroke(tp.path());
      ctx.restore();

      const [mx, my] = tp.at(mini.u);
      const px = ox + mx * cw, py = oy + my * ch;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 9);
      glow.addColorStop(0, light ? "rgba(190,18,60,.34)" : "rgba(255,140,110,.42)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(px - 9, py - 9, 18, 18);
      ctx.fillStyle = light ? "rgb(190, 18, 60)" : "rgb(255, 168, 140)";
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
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

      const s = race.snapshot();
      for (let r = 0; r < s.order.length; r++) rankOf[s.order[r]] = r;

      const light = root.dataset.theme === "light";
      const HAZE = light ? 0.34 : 0.95;
      const BLOOM = light ? 0.26 : 0.8;
      const Y0 = laneY();

      if (++roomAge >= 3 || light !== roomLight) {
        roomAge = 0; roomLight = light;
        paintRoom(light, Y0(race.posAt(s.leader, 0)));
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(room, 0, 0, w, h);
      drawMarks(light);

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
        const y = Y(race.posAt(a.driver, ageAt(x)));
        const age = race.t - a.born;
        /* In over 400ms, out over the last third of its own life. Tying the
           fade to `life` rather than to a screen position means a two-second
           card and a four-second card breathe the same way — the only thing
           that differs between them is how long they hold. */
        const fade = Math.min(1, age / 0.4)
          * Math.min(1, (1 - age / a.life) / 0.32)
          * Math.min(1, (u - 0.5) / 0.06);
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.opacity = String(Math.max(0, Math.min(1, fade)));
        // a card born near the live edge would hang off the page; it opens to
        // the left instead, and keeps its stem on the point it describes
        el.dataset.flip = x > w - 210 ? "1" : "0";
      }

      // eleven times a second. At five the gaps visibly stepped between
      // values, which reads as a display refreshing rather than as a number
      // changing — and React is still nowhere near the frame budget.
      if (now - publish > 90) { publish = now; setSnap(s); }
    };
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
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
          <div key={a.id} className="ann absolute left-0 top-0 opacity-0"
            ref={(el) => {
              if (el) cardRefs.current.set(a.id, el);
              else cardRefs.current.delete(a.id);
            }}>
            <span className="ann-stem" />
            <span className="ann-anchor" style={{ background: `var(--d${a.driver})` }} />
            <span className="ann-card">
              <span className="ann-head">
                <span className="ann-dot" style={{ background: `var(--d${a.driver})` }} />
                {a.label}
              </span>
              {a.value && <span className="ann-value">{a.value}</span>}
              {a.spark && <Spark points={a.spark} driver={a.driver} />}
            </span>
          </div>
        ))}
      </div>

      {snap && <Telemetry snap={snap} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/** Layer 4. Authentic enough to believe, small enough not to invite study. */
function Spark({ points, driver }: { points: number[]; driver: number }) {
  const d = points
    .map((v, i) => `${(i / (points.length - 1)) * 46} ${14 - v * 12}`)
    .map((p, i) => (i ? `L ${p}` : `M ${p}`))
    .join(" ");
  return (
    <svg width="46" height="14" viewBox="0 0 46 14" fill="none" className="ann-spark">
      <path d={d} stroke={`var(--d${driver})`} strokeWidth="1.2" strokeLinecap="round"
        strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/**
 * The instrument cluster.
 *
 * Deliberately at the threshold of readability. Its job is not to inform — the
 * product does that on the pages behind this one — it is to make the claim that
 * something is being measured continuously, and a number that never moves makes
 * the opposite claim. Everything here is a real value from the simulation, so
 * the gap really is the gap between the first two lines on screen.
 */
function Telemetry({ snap }: { snap: Snapshot }) {
  return (
    <div className="tele absolute bottom-14 right-8 hidden w-[248px] lg:block">
      <div className="tele-row tele-head">
        <span className={cx("tele-flag", snap.status !== "GREEN" && "tele-flag-on")} />
        {snap.status}
        <span className="ml-auto tabular-nums opacity-70">LAP {snap.lap}</span>
      </div>

      <div className="tele-body">
        {snap.order.slice(0, 4).map((d, i) => (
          <div key={d} className="tele-line">
            <span className="tele-pos tabular-nums">{i + 1}</span>
            <span className="tele-tick" style={{ background: `var(--d${d})` }} />
            <span className="tele-code">{DRIVERS[d].code}</span>
            {/* an arrow for six seconds after a place changes, then nothing —
                a permanent indicator would stop meaning "just now" */}
            <span className={cx("tele-move", snap.moved[d] > 0 && "is-up",
              snap.moved[d] < 0 && "is-down")}>
              {snap.moved[d] > 0 ? "▲" : snap.moved[d] < 0 ? "▼" : ""}
            </span>
            <span className="tele-gap tabular-nums">
              {i === 0 ? "LEADER" : `+${(snap.gap * i * 0.92).toFixed(3)}`}
            </span>
          </div>
        ))}

        <div className="tele-split" />

        <div className="tele-line">
          <span className="tele-key">ERS</span>
          <span className="tele-bar"><i style={{ width: `${snap.ers * 100}%` }} /></span>
          <span className="tele-gap tabular-nums">{Math.round(snap.ers * 100)}%</span>
        </div>
        <div className="tele-line">
          <span className="tele-key">DEG</span>
          <span className="tele-bar"><i className="tele-bar-warm" style={{ width: `${snap.deg * 145}%` }} /></span>
          <span className="tele-gap tabular-nums">{snap.deg.toFixed(2)}</span>
        </div>
        <div className="tele-line">
          <span className="tele-key">TRK</span>
          <span className="tele-sectors">
            {snap.sectors.map((s, i) => (
              <i key={i} className={s < 0 ? "is-up" : ""}>{s < 0 ? "▲" : "▼"}</i>
            ))}
          </span>
          <span className="tele-gap tabular-nums">{snap.trackTemp.toFixed(1)}°C</span>
        </div>
      </div>
    </div>
  );
}

export { N as HERO_LANES };
