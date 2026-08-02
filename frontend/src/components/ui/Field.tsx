"use client";
import { Check } from "lucide-react";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The vocabulary a preferences screen is written in.                         */
/*                                                                            */
/* Settings was built out of one control: a large card with a title, a tag, a  */
/* paragraph and a tick. That reads beautifully when there are two of them and */
/* collapses at eight — every choice claims the same weight, the page becomes  */
/* a wall of equal boxes, and adding "Celsius or Fahrenheit" costs as much     */
/* vertical space as choosing how the entire product is written.               */
/*                                                                            */
/* So there are two levels here, and the difference between them is how much   */
/* the choice actually changes:                                               */
/*                                                                            */
/*   Choice   a card, with a preview of what it does. Reserved for the two     */
/*            decisions that rewrite the product — depth, and theme.          */
/*   Field    a row: what it is, what it does, and the control, right-aligned. */
/*            Everything else. It is the pattern every settings screen worth   */
/*            copying settles on, for the same reason: a reader scanning for   */
/*            one preference reads a column of labels, not a gallery.          */
/* -------------------------------------------------------------------------- */

export function Field({ label, hint, children, htmlFor }: {
  label: string; hint?: string; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div className="flex items-center gap-5 border-b border-white/[0.05] py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[13.5px] font-medium text-ink">{label}</label>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * A segmented control.
 *
 * The sliding indicator is one absolutely-positioned element rather than a
 * background on the active button, so a change of option is a movement between
 * two places rather than one thing going out and another coming on. It is the
 * whole difference between a control that feels mechanical and one that does
 * not, and it costs a transform.
 */
export function Segmented<T extends string>({ value, onChange, options, size = "md" }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; title?: string }[];
  size?: "sm" | "md";
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={cx("seg", size === "sm" && "seg-sm")}
      style={{ ["--n" as string]: options.length, ["--i" as string]: i }}
      role="radiogroup">
      <span aria-hidden className="seg-thumb" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          title={o.title} onClick={() => onChange(o.value)}
          className={cx("seg-opt", o.value === value && "is-on")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** On or off, for the handful of preferences that genuinely are. */
export function Switch({ on, onChange, label }: {
  on: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("sw", on && "is-on")}>
      <span className="sw-knob" />
    </button>
  );
}

/** A native select, dressed. Used only where the list is genuinely long. */
export function Choose<T extends string | number>({ value, onChange, options, id }: {
  value: T; onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  id?: string;
}) {
  return (
    <div className="relative">
      <select id={id} value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="appearance-none rounded-lg border border-white/[0.1] bg-base-800 py-1.5 pl-3 pr-8 text-[12.5px] text-ink outline-none transition-colors hover:border-white/[0.2] focus:border-accent/50">
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      <span aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-ink-faint">
        ▼
      </span>
    </div>
  );
}

/** The big one. A card that previews the thing it selects. */
export function Choice({ on, onClick, title, tag, body, points, swatch }: {
  on: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string; tag: string; body?: string; points?: string[]; swatch?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        "group/choice relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-[--dur-3] ease-out",
        on ? "border-accent/50 bg-accent/[0.05]" : "border-white/[0.07] bg-base-900/50 hover:-translate-y-0.5 hover:border-white/[0.16]")}
      style={on ? { boxShadow: "0 0 0 1px rgb(var(--accent) / .28), 0 12px 30px -24px rgb(var(--accent) / .45)" } : undefined}>
      <span aria-hidden
        className={cx("pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full transition-opacity duration-500",
          on ? "opacity-70" : "opacity-0 group-hover/choice:opacity-50")}
        style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .16), transparent)" }} />

      <span className="relative flex items-center gap-2">
        <span className="text-[16px] font-bold tracking-tight text-ink">{title}</span>
        <span className={cx("ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-[--dur-3]",
          on ? "scale-100 border-accent bg-accent text-pure" : "scale-90 border-white/15 text-transparent")}>
          <Check size={12} strokeWidth={3} />
        </span>
      </span>
      <span className="relative mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
        {tag}
      </span>
      {body && <span className="relative mt-2.5 block text-[12.5px] leading-relaxed text-ink-muted">{body}</span>}
      {swatch && <span className="relative mt-3 block">{swatch}</span>}
      {points && (
        <ul className="relative mt-3 space-y-1.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2 text-[12.5px] text-ink-muted">
              <Check size={12} className="shrink-0 text-accent-soft" />{p}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
