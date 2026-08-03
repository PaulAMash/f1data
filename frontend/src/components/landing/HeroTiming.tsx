"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { COMPOUNDS, POOL, type Row, type Snapshot } from "@/lib/raceEngine";
import { useLocale } from "@/lib/locale";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Live timing.                                                               */
/*                                                                            */
/* The panel used to re-render its rows in the new order, which is what an     */
/* HTML table does and what a timing screen never does. On a real feed, when   */
/* two cars swap you watch one row rise past the other — the movement IS the   */
/* information, and replacing it with an instant swap throws that away.        */
/*                                                                            */
/* This is FLIP, the only technique that animates a reorder correctly:         */
/*                                                                            */
/*   First   remember where every row was, before React commits               */
/*   Last    let React put them where they now belong                          */
/*   Invert  transform each row back to where it started                       */
/*   Play    release the transform, on the house easing curve                  */
/*                                                                            */
/* The browser animates a transform on the compositor, so a reorder costs no   */
/* layout at all — which is why it can run at 11Hz next to a canvas without    */
/* touching the frame budget.                                                  */
/*                                                                            */
/* WHY THERE IS SO MUCH MOVING IN HERE.                                        */
/*                                                                            */
/* An operations room is never still, and it is never frantic either. What     */
/* makes one feel alive is that a dozen small things are each changing on      */
/* their own schedule, and every one of them is reporting something. That is   */
/* the whole rule this panel is built on: NOTHING IN IT ANIMATES ON A TIMER.   */
/* The throttle bar is where the car is around the lap. The wear bar is the    */
/* tyre. The trend arrow is the interval's own derivative. The row washes when */
/* that car sets a sector. Take the race away and every one of them stops —    */
/* which is exactly what separates telemetry from decoration.                  */
/* -------------------------------------------------------------------------- */

/**
 * A number that rolls rather than jumps.
 *
 * Exported here because the hero is where the behaviour is defined, but it is
 * deliberately generic: anywhere in the product where a figure changes under
 * the reader rather than because the reader asked, it should arrive this way.
 */
export function useRolling(value: number, ms = 420) {
  const ref = useRef(value);
  const el = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const from = ref.current;
    if (from === value) return;
    ref.current = value;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      if (el.current) el.current.textContent = Math.round(from + (value - from) * eased).toString();
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return el;
}

/** 84.62 → "1:24.620" — the only format a timing screen ever shows. */
function lapTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
}

export function HeroTiming({ snap }: { snap: Snapshot }) {
  const host = useRef<HTMLDivElement | null>(null);
  const lap = useRolling(snap.lap);
  const rows = useRef(new Map<number, HTMLDivElement>());
  const wasAt = useRef(new Map<number, number>());
  const { temp, speed, speedUnit } = useLocale();

  // FIRST: read positions before the DOM changes, every render
  useLayoutEffect(() => {
    const moves: [HTMLDivElement, number][] = [];
    rows.current.forEach((el, car) => {
      const prev = wasAt.current.get(car);
      const now = el.offsetTop;
      if (prev !== undefined && prev !== now) moves.push([el, prev - now]);
      wasAt.current.set(car, now);
    });
    // INVERT then PLAY, in one frame, so nothing is ever seen out of place
    for (const [el, dy] of moves) {
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      el.getBoundingClientRect();          // force the browser to accept it
      el.style.transition = "transform 620ms cubic-bezier(.22, 1, .36, 1)";
      el.style.transform = "";
    }
  });

  const leader = snap.rows[0];

  return (
    <div ref={host}
      /* A FOCAL POINT, NOT A FOOTNOTE.
         352px on a 1440px hero is about a quarter of the column and reads as a
         decoration in the corner; the panel is the one part of this composition
         that is actually the product, so it earns the space. It steps with the
         viewport rather than taking a single larger number — on a 1280px laptop
         the old width was already proportionally right, and it is the wide
         screens where it was getting lost. */
      className={cx("tele absolute bottom-14 right-8 hidden w-[380px] lg:block xl:w-[440px] 2xl:w-[496px]")}
      style={{ opacity: 0.35 + snap.alive * 0.65 }}>
      <div className="tele-row tele-head">
        <span className={cx("tele-flag", snap.status !== "GREEN" && "tele-flag-on")} />
        {snap.status}
        {/* The link to the car. Three bars that fill and empty on a period of
            their own — the one thing on this panel that is about the feed
            rather than about the race, which is why it is the only thing here
            allowed to run on a timer. */}
        <span className="tele-sig" aria-hidden><i /><i /><i /></span>
        <span className="ml-auto tabular-nums opacity-70">
          LAP <span ref={lap}>{snap.lap}</span>/{snap.laps}
        </span>
      </div>

      <div className="tele-body">
        {snap.rows.slice(0, 5).map((r) => (
          <TimingRow key={r.car} r={r}
            ref_={(el) => { if (el) rows.current.set(r.car, el); else rows.current.delete(r.car); }} />
        ))}
      </div>

      {/* ---- the selected car's telemetry ---------------------------------
          A timing tower on its own is a table. What makes a pit wall look like
          a pit wall is the strip underneath it: one car, in detail, moving
          much faster than the order above it. This is the leader, because the
          leader is who the picture behind is about. */}
      {leader && (
        <div className="tele-strip">
          <span className="tele-strip-code" style={{ color: `var(--d${leader.ref})` }}>
            {POOL[leader.ref].code}
          </span>
          <span className="tele-pedal" title="Throttle">
            <b>T</b>
            <span><i className="is-thr" style={{ transform: `scaleX(${leader.throttle.toFixed(3)})` }} /></span>
          </span>
          <span className="tele-pedal" title="Brake">
            <b>B</b>
            <span><i className="is-brk" style={{ transform: `scaleX(${leader.brake.toFixed(3)})` }} /></span>
          </span>
          <span className="tele-strip-num tabular-nums">{lapTime(leader.lastLap)}</span>
          <span className="tele-strip-num tabular-nums opacity-70">
            {leader.fuel.toFixed(1)}<em>kg</em>
          </span>
        </div>
      )}

      <div className="tele-foot">
        <span className="tele-key">ERS</span>
        <span className="tele-bar"><i style={{ width: `${(leader?.ers ?? 0.5) * 100}%` }} /></span>
        <span className="tele-sep" />
        {/* the trap speed, which never sits still for a whole second */}
        <span className="tabular-nums">{speed(snap.trap)}<em>{speedUnit}</em></span>
        <span className="tele-sep" />
        <span className="tabular-nums">{temp(snap.trackTemp, 1)}</span>
        <span className="tele-sep" />
        <span>{snap.weather}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function TimingRow({ r, ref_ }: { r: Row; ref_: (el: HTMLDivElement | null) => void }) {
  const d = POOL[r.ref];
  const c = COMPOUNDS[r.tyre];
  return (
    <div ref={ref_} className={cx("tele-line", r.flash && `is-${r.flash}`)}>
      <span className="tele-pos tabular-nums">{r.pos}</span>
      {/* the driver's colour, breathing with their own energy store */}
      <span className="tele-tick"
        style={{ background: `var(--d${r.ref})`, opacity: 0.45 + r.ers * 0.55 }} />
      <span className="tele-code">{d.code}</span>

      <span className={cx("tele-move", r.moved > 0 && "is-up", r.moved < 0 && "is-down")}>
        {r.moved > 0 ? "▲" : r.moved < 0 ? "▼" : ""}
      </span>

      {/* compound, and how much of it is left */}
      <span className="tele-tyre" style={{ color: c.tint, borderColor: `${c.tint}55` }}>
        <i>{c.key}</i>
      </span>
      <span className="tele-wear" title={`${r.tyreAge} laps`}>
        <i style={{ width: `${(1 - r.wear) * 100}%`, background: c.tint }} />
      </span>

      {/* Throttle. Reads left to right and empties into a braking zone, which
          is why the five bars are never in step: each car is somewhere
          different around the same lap. */}
      <span className="tele-thr" title="Throttle">
        <i style={{ transform: `scaleX(${r.throttle.toFixed(3)})` }} />
        <u style={{ opacity: r.brake > 0.05 ? 1 : 0, transform: `scaleX(${r.brake.toFixed(3)})` }} />
      </span>

      {/* three pips, each set when that car reaches that sector */}
      <span className="tele-sec">
        {r.sectors.map((v, i) => (
          <i key={i} className={["", "is-ok", "is-purple", "is-slow"][v]} />
        ))}
      </span>

      <span className={cx("tele-drs", r.drs && "is-on")}>DRS</span>
      <Form points={r.form} ref_={r.ref} />

      <span className="tele-gap tabular-nums">
        {r.pos === 1 ? "LEADER" : `+${r.interval.toFixed(3)}`}
        {/* which way that number is going, at the moment you read it */}
        <i className={cx("tele-trend", r.trend < -0.18 && "is-in", r.trend > 0.18 && "is-out")} />
      </span>
    </div>
  );
}

/** Five laps of form, small enough to be texture rather than a chart. */
function Form({ points, ref_ }: { points: number[]; ref_: number }) {
  const d = points
    .map((v, i) => `${(i / Math.max(1, points.length - 1)) * 22} ${9 - v * 7}`)
    .map((p, i) => (i ? `L ${p}` : `M ${p}`))
    .join(" ");
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" fill="none" className="tele-form">
      <path d={d} stroke={`var(--d${ref_})`} strokeWidth="1" strokeLinecap="round"
        strokeLinejoin="round" opacity="0.75" />
      {/* the newest reading, so the eye has somewhere to land on a 22px chart */}
      <circle cx="22" cy={9 - (points[points.length - 1] ?? 0.5) * 7} r="1.1"
        fill={`var(--d${ref_})`} />
    </svg>
  );
}
