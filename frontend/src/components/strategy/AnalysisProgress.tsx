"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// The Ask tab's "analyzing" state — rotates through what the analyst is checking
// so answers feel considered, not like an instant lookup.
const DEFAULT_STEPS = [
  "Reading the loaded session data…",
  "Checking position changes…",
  "Evaluating pit windows…",
  "Comparing tyre age and lap pace…",
  "Looking for race-control events…",
  "Building the explanation…",
];

export function AnalysisProgress({ steps }: { steps?: string[] }) {
  const list = steps && steps.length ? steps : DEFAULT_STEPS;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, list.length - 1)), 700);
    return () => clearInterval(t);
  }, [list.length]);

  return (
    <div className="animate-fade-in rounded-xl border border-white/[0.06] bg-base-850/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Loader2 size={15} className="animate-spin text-accent-soft" />
        Analyzing…
      </div>
      <ul className="mt-3 space-y-1.5">
        {list.map((s, idx) => (
          <li key={s} className={`flex items-center gap-2 text-xs transition-colors ${
            idx < i ? "text-ink-faint" : idx === i ? "text-ink-muted" : "text-ink-faint/40"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              idx < i ? "bg-emerald-400/70" : idx === i ? "bg-accent-soft animate-pulse" : "bg-white/15"
            }`} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
