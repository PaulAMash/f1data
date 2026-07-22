"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X, Check, Crosshair } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Driver command palette.                                                    */
/*                                                                            */
/* Replaces the twenty-row dropdown with a fast, searchable, team-grouped     */
/* overlay. Two clean affordances per row: a checkbox toggles whether the     */
/* line is drawn; clicking the driver focuses them (and closes). A star pins  */
/* favourites. ⌘K / "/" opens it, Esc closes, the field autofocuses — it      */
/* should feel like Linear or Figma's quick-switcher, not a form.             */
/* -------------------------------------------------------------------------- */

export function DriverPalette({
  open, onClose, drivers, finishOrder, visible, onToggleVisible, onSetVisible,
  onFocus, favourites, onToggleFav,
}: {
  open: boolean; onClose: () => void;
  drivers: Driver[]; finishOrder: string[];
  visible: Set<string>; onToggleVisible: (code: string) => void; onSetVisible: (codes: string[]) => void;
  onFocus: (code: string) => void;
  favourites: Set<string>; onToggleFav: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setFavOnly(false); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const byCode = useMemo(() => Object.fromEntries(drivers.map((d) => [d.code, d])), [drivers]);

  // Drivers grouped by team, teams ordered by their best finisher — the same
  // running-order logic the rest of the chart uses, so nothing feels arbitrary.
  const groups = useMemo(() => {
    const rank: Record<string, number> = {};
    finishOrder.forEach((c, i) => (rank[c] = i));
    const teams = new Map<string, { color: string; drivers: Driver[]; best: number }>();
    for (const d of drivers) {
      const g = teams.get(d.team) ?? { color: d.team_color, drivers: [], best: 99 };
      g.drivers.push(d); g.best = Math.min(g.best, rank[d.code] ?? 99);
      teams.set(d.team, g);
    }
    for (const g of teams.values()) g.drivers.sort((a, b) => (rank[a.code] ?? 99) - (rank[b.code] ?? 99));
    return [...teams.entries()].sort((a, b) => a[1].best - b[1].best);
  }, [drivers, finishOrder]);

  const matches = (d: Driver) => {
    if (favOnly && !favourites.has(d.code)) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return d.code.toLowerCase().includes(s) || d.name.toLowerCase().includes(s) || d.team.toLowerCase().includes(s);
  };
  const filtered = groups
    .map(([team, g]) => [team, { ...g, drivers: g.drivers.filter(matches) }] as const)
    .filter(([, g]) => g.drivers.length > 0);
  const flat = filtered.flatMap(([, g]) => g.drivers);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]"
      role="dialog" aria-modal="true" aria-label="Select drivers">
      <div className="absolute inset-0 bg-base-950/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-base-850 shadow-glow">
        {/* search */}
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-faint" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search drivers, teams…"
            onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) { onFocus(flat[0].code); onClose(); } }}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" />
          <button onClick={() => setFavOnly((f) => !f)} aria-pressed={favOnly}
            className={cx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              favOnly ? "bg-amber/15 text-amber" : "text-ink-faint hover:text-ink")}>
            <Star size={12} className={favOnly ? "fill-amber" : ""} /> Favourites
          </button>
          <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink"><X size={16} /></button>
        </div>

        {/* rows */}
        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">No drivers match “{q}”.</p>
          )}
          {filtered.map(([team, g]) => (
            <div key={team} className="px-1.5 py-0.5">
              <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{team}</span>
              </div>
              {g.drivers.map((d) => {
                const on = visible.has(d.code);
                const fav = favourites.has(d.code);
                return (
                  <div key={d.code}
                    className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04]">
                    <button onClick={() => onToggleVisible(d.code)} aria-pressed={on}
                      aria-label={on ? `Hide ${d.name}` : `Show ${d.name}`}
                      className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
                        on ? "border-transparent" : "border-white/15 bg-transparent")}
                      style={on ? { background: d.team_color } : undefined}>
                      {on && <Check size={13} className="text-base-950" strokeWidth={3} />}
                    </button>
                    <button onClick={() => { onFocus(d.code); onClose(); }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className="w-9 shrink-0 text-xs font-bold tabular-nums" style={{ color: d.team_color }}>{d.code}</span>
                      <span className="truncate text-sm text-ink">{d.name}</span>
                      <Crosshair size={13} className="ml-auto shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                    <button onClick={() => onToggleFav(d.code)} aria-pressed={fav}
                      aria-label={fav ? `Unfavourite ${d.name}` : `Favourite ${d.name}`}
                      className={cx("shrink-0 transition-colors", fav ? "text-amber" : "text-ink-faint/50 hover:text-ink-faint")}>
                      <Star size={14} className={fav ? "fill-amber" : ""} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2.5 text-xs">
          <span className="text-ink-faint">{visible.size} of {drivers.length} shown · click a driver to focus</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onSetVisible(drivers.map((d) => d.code))} className="text-ink-muted hover:text-ink">Show all</button>
            <span className="text-ink-faint">·</span>
            <button onClick={() => onSetVisible(finishOrder.slice(0, 5))} className="text-ink-muted hover:text-ink">Top 5</button>
            <span className="text-ink-faint">·</span>
            <button onClick={onClose} className="rounded-md bg-accent/15 px-3 py-1 font-semibold text-accent-soft ring-1 ring-accent/30">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
