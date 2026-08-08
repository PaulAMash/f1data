"use client";
import { cloneElement, useEffect, useRef, useState, type ReactElement } from "react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* WHY THIS EXISTS INSTEAD OF RECHARTS' OWN ResponsiveContainer.              */
/*                                                                            */
/* Every chart in this product went blank in production while rendering       */
/* perfectly on a laptop, with no console error, for four releases. The cause  */
/* is three lines inside recharts' ResponsiveContainer:                        */
/*                                                                            */
/*     import { isElement } from 'react-is';                                   */
/*     ...                                                                    */
/*     return React.Children.map(children, child =>                            */
/*       isElement(child) ? cloneElement(child, { width, height }) : child);   */
/*                                                                            */
/* recharts depends on react-is@16, whose isElement() asks whether an element's */
/* `$$typeof` is `Symbol.for('react.element')`. React 19 renamed that symbol to */
/* `Symbol.for('react.transitional.element')`. So under React 19 the check      */
/* silently returns false, the clone never happens, the chart is handed no      */
/* width and no height, and every recharts chart returns null for want of a     */
/* size. The container div renders at its correct 555x440 with nothing inside.  */
/*                                                                            */
/* Confirmed from the deployed page rather than inferred:                      */
/*     elementSymbol: "Symbol(react.transitional.element)"                     */
/*     childName:     "LineChart"                                             */
/*     widthProp:     undefined                                               */
/*                                                                            */
/* THE POINT OF FIXING IT HERE RATHER THAN BY PINNING REACT. The version drift  */
/* is worth correcting too, but a dependency pin is a promise about the build   */
/* environment, and this product has now been burned twice by things that were  */
/* true locally and false in production. This removes the fragile step instead  */
/* of restating the promise: we measure the box with a ResizeObserver we own    */
/* and clone with the application's own React, so no third-party copy of        */
/* react-is is ever asked to recognise an element. It cannot be broken by a     */
/* React upgrade, a duplicated react-is, or a bundler hoisting decision.        */
/*                                                                            */
/* Behaviour is otherwise identical to ResponsiveContainer: fill the parent,    */
/* re-measure on resize, and render nothing until a real size is known (a chart */
/* drawn at zero width is worse than a chart drawn a frame later).              */
/* -------------------------------------------------------------------------- */

export function ChartBox({
  children, className,
}: {
  /** A single recharts chart element — it receives numeric width/height. */
  children: ReactElement<{ width?: number; height?: number }>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      // same guard recharts used: never re-render for an unchanged box
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();                 // synchronous first measurement, before paint
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={cx("h-full w-full", className)}>
      {size.w > 0 && size.h > 0
        ? cloneElement(children, { width: size.w, height: size.h })
        : null}
    </div>
  );
}
