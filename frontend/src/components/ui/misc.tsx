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

export function EmptyState({
  title, hint, icon,
}: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-ink-faint">{icon ?? <Inbox size={26} />}</div>
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="text-amber"><AlertTriangle size={26} /></div>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
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
