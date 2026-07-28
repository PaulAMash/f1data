"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cx } from "@/lib/format";
import { DriverAvatar } from "@/components/ui/DriverBadge";

/* -------------------------------------------------------------------------- */
/* Driver browser — scan the grid, don't read a settings list. Teams are laid  */
/* out as cards, two-up, each pairing its drivers with their portraits and a   */
/* team-colour spine so the eye recognises the team before it reads a name.    */
/* One interaction: click a driver → focus and close. Search filters instantly.*/
/* -------------------------------------------------------------------------- */

/**
 * A short, legible constructor mark. Real logos aren't in our asset pipeline, so
 * rather than approximate them we build an honest one from the team's own colour
 * and initials — recognisable at a glance, and never a wrong logo.
 */
const TEAM_MARK: Record<string, string> = {
  // initials alone collide for these two, and a mark that identifies the wrong
  // team is worse than no mark at all
  "red bull racing": "RBR",
  "racing bulls": "RB",
  "kick sauber": "SAU",
  "haas f1 team": "HAA",
  "aston martin": "AM",
  "alpine": "ALP",
  "williams": "WIL",
  "mclaren": "MCL",
  "mercedes": "MER",
  "ferrari": "FER",
  "audi": "AUD",
  "cadillac": "CAD",
};
function teamMark(team: string): string {
  const known = TEAM_MARK[team.trim().toLowerCase()];
  if (known) return known;
  const words = team.replace(/\bF1 Team\b/gi, "").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

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
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[6vh]"
      role="dialog" aria-modal="true" aria-label="Choose a driver">
      <div className="absolute inset-0 bg-base-950/72 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-4xl animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-base-850 shadow-glow">
        {/* title row, then the search field — the instruction used to share a
            line with the input and wrapped to two ragged lines on narrow modals */}
        <div className="border-b border-white/[0.07] px-4 pb-3 pt-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Pick a driver
            </span>
            <span className="text-[12px] text-ink-faint">· click to focus their line on the chart</span>
            <button onClick={onClose} aria-label="Close"
              className="ml-auto grid h-6 w-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink">
              <X size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-base-900/60 px-2.5 py-2 transition-colors focus-within:border-accent/40">
            <Search size={15} className="shrink-0 text-ink-faint" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search a driver or constructor…"
              onKeyDown={(e) => { if (e.key === "Enter" && flat[0]) pick(flat[0].code); }}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" />
            {q && (
              <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                {flat.length} match{flat.length === 1 ? "" : "es"}
              </span>
            )}
          </div>
        </div>

        <div className="max-h-[74vh] overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-faint">No drivers match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {filtered.map(([team, g]) => (
                <div key={team} className="rounded-xl border p-2.5"
                  style={{ borderColor: `${g.color}33`, background: `linear-gradient(135deg, ${g.color}12, transparent 55%)` }}>
                  {/* a constructor mark rather than a bullet: the colour block
                      carries the initials, so the team is recognisable at a
                      glance without relying on reading the name */}
                  <div className="mb-2.5 flex items-center gap-2 px-0.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-black tracking-tight"
                      style={{ background: `${g.color}26`, color: g.color, boxShadow: `inset 0 0 0 1px ${g.color}59` }}>
                      {teamMark(team)}
                    </span>
                    <span className="truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      {team}
                    </span>
                    <span className="ml-auto h-1 w-8 shrink-0 rounded-full" style={{ background: `${g.color}80` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {g.drivers.map((d) => {
                      const on = focused.includes(d.code);
                      return (
                        <button key={d.code} onClick={() => pick(d.code)}
                          className={cx("group flex h-[54px] items-center gap-2.5 overflow-hidden rounded-lg border px-2 text-left transition-all duration-200",
                            on ? "border-white/25 bg-white/[0.06]"
                               : "border-white/[0.05] bg-white/[0.02] hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05]")}>
                          <DriverAvatar driver={d} size={34} />
                          <span className="min-w-0 leading-tight">
                            <span className="block text-[13px] font-extrabold tabular-nums" style={{ color: d.team_color }}>{d.code}</span>
                            <span className="block truncate text-[12.5px] text-ink-muted transition-colors group-hover:text-ink">{d.name}</span>
                          </span>
                        </button>
                      );
                    })}
                    {g.drivers.length === 1 && <span className="h-[54px] rounded-lg border border-dashed border-white/[0.05]" />}
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
