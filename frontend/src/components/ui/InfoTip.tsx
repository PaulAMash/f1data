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
          className="absolute left-1/2 top-5 z-50 w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-base-900 p-3 text-xs leading-relaxed text-ink-muted shadow-glow"
        >
          {label && <span className="mb-1 block font-semibold text-ink">{label}</span>}
          {text}
        </span>
      )}
    </span>
  );
}
