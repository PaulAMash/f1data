"use client";
import { Info } from "lucide-react";
import { HoverCard } from "./HoverCard";
import { useHoverTip } from "@/lib/useHoverTip";

/**
 * Small "why this matters" tooltip. Every advanced metric in the app is paired
 * with one of these so a new fan can learn what they're looking at.
 *
 * It renders through the shared HoverCard, which puts it in a portal. It used
 * to be an absolutely-positioned span, so any `overflow-hidden` panel it sat in
 * sliced it off — and the panels most in need of explanation (Head-to-head
 * metrics, Track conditions, every story) are exactly the rounded, clipped ones.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const { at, open, close, toggle } = useHoverTip<{ x: number; y: number }>();

  const where = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 4 };
  };

  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={(e) => open(where(e.currentTarget))}
      onMouseLeave={close}>
      <button type="button" aria-label={label || "More info"}
        aria-expanded={at != null}
        onClick={(e) => { e.stopPropagation(); toggle(where(e.currentTarget)); }}
        className="text-ink-faint transition-colors duration-200 hover:text-ink">
        <Info size={13} />
      </button>
      {at && (
        <HoverCard x={at.x} y={at.y} width={264}
          title={label}
          footer={undefined}>
          {/* normal-case resets the uppercase headers these usually sit in */}
          <p className="whitespace-normal break-words text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-ink-muted">
            {text}
          </p>
        </HoverCard>
      )}
    </span>
  );
}
