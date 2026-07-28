"use client";
import { AlertTriangle, Inbox } from "lucide-react";
import { cx } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-lg bg-white/[0.04]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/15 border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Centered "we're fetching data" state — the same everywhere the user waits on
 * the backend, so a first load never looks frozen. Announces itself to screen
 * readers and, by default, warns that the first load can take up to a minute.
 */
export function LoadingState({
  title = "Fetching session data…",
  hint = "The first load can take up to a minute while we pull and process the lap-by-lap timing data. It's cached and instant after that.",
  size = 40,
}: { title?: string; hint?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {/* two rings turning at different speeds: the outer one carries the accent
          and reads as progress, the inner one keeps the centre alive even when a
          fetch takes a while. Nothing here is a fake progress bar. */}
      <span className="relative inline-block" style={{ width: size, height: size }}>
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
        <span className="absolute inset-[7px] animate-spin rounded-full border-2 border-transparent border-b-speed/70"
          style={{ animationDuration: "1.6s", animationDirection: "reverse" }} />
      </span>
      <div>
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
