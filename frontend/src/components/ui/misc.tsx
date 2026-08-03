"use client";
import { Inbox } from "lucide-react";
import { AlertTriangle } from "@/components/ui/MotionIcon";
import { RaceLoader, RaceSpinner } from "./RaceLoader";
import { cx } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-lg bg-white/[0.04]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

/** Inline "working" indicator — the loading wheel at button scale. */
export function Spinner({ size = 18 }: { size?: number }) {
  return <RaceSpinner size={size} />;
}

/**
 * Centered "we're fetching data" state — the same everywhere the user waits on
 * the backend, so a first load never looks frozen. Announces itself to screen
 * readers and, by default, warns that the first load can take up to a minute.
 */
export function LoadingState({
  title = "Fetching session data…",
  hint = "The first load can take up to a minute while we pull and process the lap-by-lap timing data. It's cached and instant after that.",
  size = 116,
}: { title?: string; hint?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite"
      className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <RaceLoader size={size} label={title} />
      <div className="mt-3">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({
  title, hint, icon,
}: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.04] text-ink-faint">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A HOLE, NAMED.                                                             */
/*                                                                            */
/* Several panels used to `return null` when the facet they draw was not in    */
/* the session — the timeline, the neutralisation rail, the weather readout.   */
/* The panel simply was not there, and there is no way for a reader to tell a  */
/* component that has nothing to say from a component that failed, or from a   */
/* feature that does not exist. Absence is not an explanation.                 */
/*                                                                            */
/* So a missing facet says so, in one line, in the space it would have         */
/* occupied — and it names the FACET rather than the component, because that   */
/* is the word the Sources panel uses for the same gap. Small and quiet: this  */
/* is a footnote about the data, not an error about the app.                   */
/* -------------------------------------------------------------------------- */
export function FacetGap({ what, why }: { what: string; why?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-ink-faint">
      <Inbox size={13} className="mt-[3px] shrink-0" />
      <span>
        <span className="text-ink-muted">{what}</span>
        {why ? ` ${why}` : " wasn\u2019t published for this session, so this part is empty rather than estimated."}
      </span>
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-amber/10 text-amber ring-1 ring-amber/25">
        <AlertTriangle size={22} />
      </div>
      <p className="max-w-md text-[13.5px] leading-relaxed text-ink-muted">{message}</p>
      {onRetry && (
        <button className="pill-btn" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export function SectionTitle({
  children, kicker, info,
}: { children: React.ReactNode; kicker?: string; info?: React.ReactNode }) {
  return (
    <div className="mb-3">
      {kicker && <div className="label mb-1">{kicker}</div>}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{children}</h2>
        {info}
      </div>
    </div>
  );
}
