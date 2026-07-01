import { cx } from "@/lib/format";

type Tone = "neutral" | "up" | "down" | "good" | "bad" | "key" | "accent" | "speed";

const TONES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-ink-muted",
  up: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  down: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  bad: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  key: "border-amber/40 bg-amber/10 text-amber",
  accent: "border-accent/40 bg-accent/10 text-accent-soft",
  speed: "border-speed/30 bg-speed/10 text-speed",
};

export function Badge({
  tone = "neutral", children, className,
}: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      TONES[tone], className,
    )}>
      {children}
    </span>
  );
}

export function TeamDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}
