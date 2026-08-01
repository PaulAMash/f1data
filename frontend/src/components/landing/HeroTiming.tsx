"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { COMPOUNDS, POOL, type Snapshot } from "@/lib/raceEngine";
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

export function HeroTiming({ snap }: { snap: Snapshot }) {
  const host = useRef<HTMLDivElement | null>(null);
  const lap = useRolling(snap.lap);
  const rows = useRef(new Map<number, HTMLDivElement>());
  const wasAt = useRef(new Map<number, number>());

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

  return (
    <div ref={host}
      className={cx("tele absolute bottom-14 right-8 hidden w-[322px] lg:block")}
      style={{ opacity: 0.35 + snap.alive * 0.65 }}>
      <div className="tele-row tele-head">
        <span className={cx("tele-flag", snap.status !== "GREEN" && "tele-flag-on")} />
        {snap.status}
        <span className="ml-auto tabular-nums opacity-70">
          LAP <span ref={lap}>{snap.lap}</span>/{snap.laps}
        </span>
      </div>

      <div className="tele-body">
        {snap.rows.slice(0, 5).map((r) => {
          const d = POOL[r.ref];
          const c = COMPOUNDS[r.tyre];
          return (
            <div key={r.car} ref={(el) => { if (el) rows.current.set(r.car, el); else rows.current.delete(r.car); }}
              className={cx("tele-line", r.flash && `is-${r.flash}`)}>
              <span className="tele-pos tabular-nums">{r.pos}</span>
              <span className="tele-tick" style={{ background: `var(--d${r.ref})` }} />
              <span className="tele-code">{d.code}</span>

              <span className={cx("tele-move", r.moved > 0 && "is-up", r.moved < 0 && "is-down")}>
                {r.moved > 0 ? "▲" : r.moved < 0 ? "▼" : ""}
              </span>

              {/* compound, and how much of it is left */}
              <span className="tele-tyre" style={{ color: c.tint, borderColor: `${c.tint}55` }}>
                {c.key}
              </span>
              <span className="tele-wear" title={`${r.tyreAge} laps`}>
                <i style={{ width: `${(1 - r.wear) * 100}%`, background: c.tint }} />
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
              </span>
            </div>
          );
        })}
      </div>

      <div className="tele-foot">
        <span className="tele-key">ERS</span>
        <span className="tele-bar"><i style={{ width: `${(snap.rows[0]?.ers ?? 0.5) * 100}%` }} /></span>
        <span className="tele-sep" />
        {/* the trap speed, which never sits still for a whole second */}
        <span className="tabular-nums">{Math.round(snap.trap)}<em>kph</em></span>
        <span className="tele-sep" />
        <span className="tabular-nums">{snap.trackTemp.toFixed(1)}°C</span>
        <span className="tele-sep" />
        <span>{snap.weather}</span>
      </div>
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
    </svg>
  );
}
