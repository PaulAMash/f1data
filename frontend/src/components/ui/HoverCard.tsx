"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* One hover card for the whole product.                                      */
/*                                                                            */
/* Two reasons this exists rather than an absolutely-positioned span at each   */
/* call site:                                                                 */
/*                                                                            */
/* 1. CLIPPING. A card positioned inside its panel is at the mercy of every    */
/*    ancestor's overflow. The Track Conditions panel is `overflow-hidden`     */
/*    (it has to be — the surface is rounded), so the sparkline's card was     */
/*    sliced off at the panel's top edge. Rendered through a portal at fixed   */
/*    coordinates, no ancestor can ever crop it.                              */
/*                                                                            */
/* 2. LEGIBILITY. Hover cards were the worst offenders for grey-on-grey: faint */
/*    labels on a translucent surface over a dark page. This one is opaque,    */
/*    sits on its own shadow, and keeps the key/value contrast fixed.          */
/* -------------------------------------------------------------------------- */

export interface HoverRow { k: string; v: React.ReactNode; }

export function HoverCard({
  x, y, title, value, accent, rows, footer, children, width = 200, gap = 12,
}: {
  /** Anchor point in viewport coordinates — usually the thing being hovered. */
  x: number; y: number;
  title?: React.ReactNode;
  /** The headline figure, in the accent colour. */
  value?: React.ReactNode;
  accent?: string;
  rows?: HoverRow[];
  footer?: React.ReactNode;
  children?: React.ReactNode;
  width?: number;
  /** Distance from the anchor. */
  gap?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  // flip below the anchor when there isn't room above it, and never let either
  // edge leave the viewport — a card you have to scroll to read is no card
  const above = y > 180;
  const left = Math.min(Math.max(10, x - width / 2), vw - width - 10);
  const top = above ? Math.max(10, y - gap) : Math.min(vh - 20, y + gap);

  return createPortal(
    // Two elements on purpose: the outer one owns the placement transform, the
    // inner one owns the entry animation. A keyframe that animates `transform`
    // wins over an inline `transform`, so combining them dropped the flip and
    // the card opened downward off the bottom of the screen.
    <div className="pointer-events-none fixed z-[80]"
      style={{ left, top, width, transform: above ? "translateY(-100%)" : undefined }}
      role="tooltip">
    <div className="animate-tip-in rounded-xl border border-white/[0.14] bg-base-900 p-3 shadow-glow">
      {title != null && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {title}
        </div>
      )}
      {value != null && (
        <div className="mt-0.5 text-[17px] font-bold leading-none tabular-nums"
          style={{ color: accent ?? "#e8ecf5" }}>
          {value}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className={cx("space-y-1", (title != null || value != null) && "mt-2 border-t border-white/[0.09] pt-2")}>
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px] leading-snug">
              <span className="text-ink-muted">{r.k}</span>
              <span className="text-right font-medium tabular-nums text-ink">{r.v}</span>
            </div>
          ))}
        </div>
      )}
      {children != null && (
        <div className={cx((title != null || value != null) && "mt-1.5")}>{children}</div>
      )}
      {footer && (
        <div className="mt-2 border-t border-white/[0.09] pt-2 text-[12px] leading-relaxed text-ink-muted">
          {footer}
        </div>
      )}
    </div>
    </div>,
    document.body,
  );
}
