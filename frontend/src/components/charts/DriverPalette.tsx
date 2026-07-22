"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Driver browser — pick a driver the way you'd scan the grid, not a settings  */
/* list. Teams are laid out two-up, each driver a compact card with a team-    */
/* colour spine. One interaction only: click a driver → focus them and close.  */
/* Search filters instantly by name, surname, code or team. No checkboxes, no  */
/* favourites, no confirm button — the click IS the confirmation.              */
/* -------------------------------------------------------------------------- */

export function DriverPalette({
  open, onClose, drivers, finishOrder, focused, onFocus,
}: {
  open: boolean; onClose: () => void;
  drivers: Driver[]; finishOrder: string[];
  focused: string[]; onFocus: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Teams ordered by their best finisher — the same running order the chart uses.
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
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return d.code.toLowerCase().includes(s) || d.name.toLowerCase().includes(s) || d.team.toLowerCase().includes(s);
  };
  const filtered = groups
    .map(([team, g]) => [team, { ...g, drivers: g.drivers.filter(matches) }] as const)
    .filter(([, g]) => g.drivers.length > 0);
  const flat = filtered.flatMap(([, g]) => g.drivers);

  function pick(code: string) { onFocus(code); onClose(); }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[8vh]"
      role="dialog" aria-modal="true" aria-label="Choose a driver">
      <div className="absolute inset-0 bg-base-950/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-base-850 shadow-glow">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-faint" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search a driver or team…"
            onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) pick(flat[0].code); }}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" />
          <span className="hidden text-[11px] text-ink-faint sm:inline">Click a driver to focus</span>
          <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink"><X size={16} /></button>
        </div>

        <div className="max-h-[64vh] overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">No drivers match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
              {filtered.map(([team, g]) => (
                <div key={team}>
                  <div className="mb-1.5 flex items-center gap-2 px-0.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{team}</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.drivers.map((d) => {
                      const on = focused.includes(d.code);
                      return (
                        <button key={d.code} onClick={() => pick(d.code)}
                          className={cx("group flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-white/[0.02] py-2 pl-0 pr-3 text-left transition-all",
                            on ? "border-white/25 bg-white/[0.06]" : "border-white/[0.06] hover:-translate-y-px hover:bg-white/[0.05]")}
                          style={{ boxShadow: on ? `inset 3px 0 0 0 ${d.team_color}` : undefined }}>
                          <span className="h-9 w-1 shrink-0 rounded-r" style={{ background: d.team_color }} />
                          <span className="w-9 shrink-0 text-sm font-extrabold tabular-nums" style={{ color: d.team_color }}>{d.code}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{d.name}</span>
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">Focus →</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
