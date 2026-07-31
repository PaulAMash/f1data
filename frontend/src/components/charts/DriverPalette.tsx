"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { ConstructorMark } from "@/components/ui/ConstructorMark";

/* -------------------------------------------------------------------------- */
/* The driver gallery.                                                        */
/*                                                                            */
/* It began as a settings list, became a searchable grid, and is now what it   */
/* should always have been: a wall of faces you recognise before you read      */
/* anything. Three decisions carry it.                                        */
/*                                                                            */
/* CONSTRUCTOR FIRST. Each team is a card wearing its own colour — a woven     */
/* carbon texture tinted to the livery, a colour bar down the leading edge, a  */
/* mark and the name. You know whose garage you are looking at before the      */
/* first driver's name registers.                                             */
/*                                                                            */
/* THE PORTRAIT IS THE ANCHOR. It is the largest thing in a driver tile, the   */
/* three-letter code is strong secondary branding beneath it, and the full     */
/* name is quiet support — which is the order people actually recognise a      */
/* grid in.                                                                   */
/*                                                                            */
/* IT HAS TO OUTLIVE THE GRID. Nothing here counts to two: a team card lays    */
/* its drivers on an auto-fill track, so a third car, a reserve driver or a    */
/* 24-car grid slots in without touching this file — and a team fielding one   */
/* entry doesn't leave a hole where the placeholder used to be.                */
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[5vh]"
      role="dialog" aria-modal="true" aria-label="Choose a driver">
      <div className="absolute inset-0 bg-base-950/80 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-white/10 bg-base-850 shadow-glow">

        {/* ---- header. Title and search are two different jobs, so they get
                two rows, their own surface and a rule between them: the eye
                lands on the title, then the field, then the gallery. ---- */}
        <div className="shrink-0 border-b border-white/[0.08] bg-base-900/50 px-5 pb-4 pt-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[15px] font-bold tracking-tight text-ink">Driver focus</span>
            <span className="hidden text-[12.5px] text-ink-muted sm:inline">
              Pick a driver to follow their line on the chart
            </span>
            <button onClick={onClose} aria-label="Close"
              className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-all duration-200 hover:bg-white/[0.08] hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <div className="group/search flex items-center gap-2.5 rounded-xl border border-white/[0.09] bg-base-950/60 px-3 py-2.5 transition-all duration-200 focus-within:border-accent/45 focus-within:bg-base-950 focus-within:shadow-[0_0_0_3px_rgba(255,59,59,0.10)]">
            <Search size={16} className="shrink-0 text-ink-faint transition-colors duration-200 group-focus-within/search:text-accent-soft" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search a driver or constructor…"
              onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) pick(flat[0].code); }}
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint" />
            {q && (
              <span className="shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums text-ink-muted">
                {flat.length} match{flat.length === 1 ? "" : "es"}
              </span>
            )}
          </div>
        </div>

        {/* ---- the gallery ------------------------------------------------ */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-ink-muted">No drivers match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filtered.map(([team, g]) => (
                <ConstructorCard key={team} team={team} color={g.color}
                  drivers={g.drivers} focused={focused} onPick={pick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function ConstructorCard({
  team, color, drivers, focused, onPick,
}: {
  team: string; color: string; drivers: Driver[];
  focused: string[]; onPick: (code: string) => void;
}) {
  return (
    <section className="group/team relative overflow-hidden rounded-xl border transition-all duration-300 ease-out"
      style={{ borderColor: `${color}2e`, background: `linear-gradient(150deg, ${color}14, transparent 62%)` }}>
      {/* the livery bar down the leading edge — the fastest possible read of
          "whose garage is this", and it thickens when you reach for the card */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] transition-all duration-300 group-hover/team:w-[5px]"
        style={{ background: color }} />
      {/* woven carbon, tinted to the livery. Barely there at rest; a little
          more present under the cursor, which is all a texture should ever do. */}
      <span aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16] transition-opacity duration-300 group-hover/team:opacity-[0.26]"
        style={{
          backgroundImage:
            `repeating-linear-gradient(45deg, ${color} 0 1px, transparent 1px 6px),` +
            `repeating-linear-gradient(-45deg, ${color} 0 1px, transparent 1px 6px)`,
        }} />

      <header className="relative flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
        {/* The emblem is the identifier. It replaced a "2 cars" counter that was
            true of every constructor since 1950 and therefore said nothing about
            any of them — that space now carries the one thing the reader is
            actually scanning for. */}
        <span className="transition-transform duration-300 ease-out group-hover/team:scale-110">
          <ConstructorMark team={team} color={color} size={26} />
        </span>
        <span className="truncate text-[12.5px] font-bold uppercase tracking-[0.13em] text-ink-muted transition-colors duration-200 group-hover/team:text-ink">
          {team}
        </span>
      </header>

      {/* auto-fill, not two fixed columns: a third entry, a reserve driver or a
          bigger grid slots in without a redesign */}
      {/* auto-FIT, not auto-fill: a team running a single car fills its row
          instead of leaving the empty half a placeholder used to occupy, and a
          third entry or a bigger grid slots in without touching this file */}
      <div className="relative grid gap-2 p-2.5 pt-0"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))" }}>
        {drivers.map((d) => (
          <DriverTile key={d.code} d={d} on={focused.includes(d.code)} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
function DriverTile({ d, on, onPick }: { d: Driver; on: boolean; onPick: (c: string) => void }) {
  const c = d.team_color;
  return (
    <button onClick={() => onPick(d.code)} aria-pressed={on}
      className={cx(
        "group/drv relative flex flex-col items-center gap-1.5 overflow-hidden rounded-lg border px-2 pb-2.5 pt-3",
        "transition-all duration-200 ease-out",
        on
          ? "-translate-y-0.5 bg-white/[0.07]"
          : "border-white/[0.06] bg-white/[0.025] hover:-translate-y-0.5 hover:bg-white/[0.06]")}
      style={{
        borderColor: on ? `${c}cc` : undefined,
        boxShadow: on ? `0 0 0 1px ${c}77, 0 10px 26px -12px ${c}` : undefined,
      }}>
      {/* the chosen car glows out from under its own portrait, so "which one is
          selected" is answered from across the dialog */}
      {on && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-24 opacity-70"
          style={{ background: `radial-gradient(circle at 50% 60%, ${c}44, transparent 68%)` }} />
      )}
      <span className={cx("relative transition-transform duration-300 ease-out",
        on ? "scale-105" : "group-hover/drv:scale-105")}>
        <DriverAvatar driver={d} size={52} />
      </span>
      {/* the code is the branding; the name is the caption */}
      <span className="relative block text-[15px] font-extrabold leading-none tracking-tight tabular-nums"
        style={{ color: c }}>
        {d.code}
      </span>
      <span className={cx("relative block max-w-full truncate text-[11.5px] leading-tight transition-colors duration-200",
        on ? "text-ink" : "text-ink-muted group-hover/drv:text-ink")}>
        {d.name}
      </span>
    </button>
  );
}
