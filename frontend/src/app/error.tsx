"use client";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";

/* -------------------------------------------------------------------------- */
/* WHEN THE PRODUCT ITSELF FAILS.                                             */
/*                                                                            */
/* Every *data* failure in this app has a designed answer: an unavailable      */
/* session says which feed did not arrive, a historical lookup says the        */
/* archive is not answering and offers Retry. What had no answer at all was a  */
/* failure in the code — and there was one, reproducibly, on the Seasons page: */
/* a 200 from the API carrying a boolean where a list belonged, `.includes()`  */
/* called on it, a TypeError, and then nothing. No boundary, so React unwound  */
/* the route and the reader was left looking at the browser's own "this page   */
/* couldn't load", which is the least informative screen in computing and does */
/* not even say which product broke.                                           */
/*                                                                            */
/* The bug is fixed at both ends. This exists because the NEXT one is not, and */
/* a reader should meet the product's voice rather than the browser's: what    */
/* happened, that it is ours and not theirs, and two ways out that actually    */
/* work — re-render this route without a full reload, or leave.                */
/* -------------------------------------------------------------------------- */

export default function ExplorerError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The console is where this is diagnosable; the page is where it is
    // survivable. Both, not one.
    console.error("Pitwall IQ hit an unexpected error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-amber/15 bg-amber/[0.03] px-6 py-8 text-center">
        <AlertTriangle size={22} className="mx-auto text-amber" />
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">
          Something on this page broke
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          That is a fault in Pitwall IQ rather than in the F1 data — the race is
          fine. Trying again usually clears it, because the state that caused it
          is thrown away with the attempt.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button onClick={reset} className="pill-btn border-accent/30 text-accent-soft hover:bg-accent/10">
            <RefreshCw size={14} /> Try again
          </button>
          <a href="/explorer" className="pill-btn text-ink-muted hover:text-ink">Race Explorer</a>
          <a href="/" className="pill-btn text-ink-muted hover:text-ink">Home</a>
        </div>
        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-ink-faint">ref {error.digest}</p>
        )}
      </div>
    </div>
  );
}
