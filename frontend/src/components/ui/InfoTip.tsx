"use client";
import { Info } from "lucide-react";
import { useState } from "react";

/**
 * Small "why this matters" tooltip. Every advanced metric in the app is paired
 * with one of these so a new fan can learn what they're looking at.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      <button
        type="button"
        aria-label={label || "More info"}
        className="text-ink-faint transition-colors hover:text-ink-muted"
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          // normal-case / tracking-normal / font-normal / normal whitespace reset
          // the header's uppercase + letter-spacing so the copy wraps inside the
          // box instead of overflowing it and bleeding onto the text behind.
          className="absolute left-1/2 top-5 z-50 w-64 max-w-[min(16rem,80vw)] -translate-x-1/2 whitespace-normal break-words rounded-lg border border-white/10 bg-base-900 p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-muted shadow-glow"
        >
          {label && <span className="mb-1 block font-semibold text-ink">{label}</span>}
          {text}
        </span>
      )}
    </span>
  );
}
