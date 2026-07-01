import { cx } from "@/lib/format";

export function Card({
  className, children, hover = false,
}: { className?: string; children: React.ReactNode; hover?: boolean }) {
  return <div className={cx("card", hover && "card-hover", className)}>{children}</div>;
}

export function CardHeader({
  title, subtitle, right, info,
}: {
  title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; info?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {info}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}
