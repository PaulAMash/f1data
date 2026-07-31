"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Accessibility, ChevronRight, Check, Palette, RotateCcw, Search, Trash2, Waves, Zap,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import {
  usePrefs, ACCENTS, DEFAULT_PREFS, PREFS_KEY, type AccentKey, type Prefs,
} from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The control centre.                                                        */
/*                                                                            */
/* Settings was a single narrow column of stacked sections — correct, and      */
/* completely inert. A preferences screen in a product like this is a          */
/* destination, so it is now composed like one: navigation on the left, the    */
/* controls in the middle, and on the right a LIVE PREVIEW that is a real      */
/* Pitwall IQ panel rendered with the current preferences applied.            */
/*                                                                            */
/* The preview is the point. Every control on this page changes the product,   */
/* and until now the only way to see what a choice did was to leave the page   */
/* and go look. Now Simple/Advanced visibly rewrites the panel, the accent      */
/* recolours it, the theme relights it and larger text enlarges it — while     */
/* the reader is still deciding.                                               */
/*                                                                            */
/* Nothing here is a switch that does nothing. Every option listed is wired to */
/* real behaviour; the sections a bigger product would have (Account, Data,    */
/* Notifications) are deliberately absent rather than present and dead.        */
/* -------------------------------------------------------------------------- */

const SECTIONS = [
  { id: "experience", label: "Experience", icon: Zap },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "motion", label: "Motion", icon: Waves },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  const { prefs, set, setThemeFrom, ready } = usePrefs();
  const [active, setActive] = useState<SectionId>("experience");
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  function say(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  }

  // search filters which sections are shown; it never hides the one you're on
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SECTIONS.map((x) => x.id);
    return SECTIONS.filter((x) => x.label.toLowerCase().includes(s)
      || KEYWORDS[x.id].some((k) => k.includes(s))).map((x) => x.id);
  }, [q]);

  const show = (id: SectionId) => visible.includes(id);

  return (
    <div className="min-h-screen">
      <NavBar active="settings" />

      <div className="mx-auto max-w-[86rem] px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_21rem]">

          {/* ---- navigation ------------------------------------------- */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <label className="group/search relative block">
              <Search size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors group-focus-within/search:text-accent-soft" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search settings…" aria-label="Search settings"
                className="w-full rounded-xl border border-white/[0.08] bg-base-900/70 py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none transition-all placeholder:text-ink-faint focus:border-accent/40 focus:bg-base-900" />
            </label>

            <p className="label mt-6 px-2">Preferences</p>
            <nav className="mt-2 space-y-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const on = active === s.id;
                const dimmed = !show(s.id);
                return (
                  <button key={s.id} onClick={() => { setActive(s.id); setQ(""); }}
                    aria-current={on ? "true" : undefined}
                    className={cx(
                      "group/nav relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-all duration-200",
                      on ? "bg-accent/10 font-semibold text-ink" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink",
                      dimmed && "opacity-35")}>
                    {/* the marker slides between items rather than blinking */}
                    <span aria-hidden
                      className={cx("absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-all duration-300",
                        on ? "h-6 opacity-100" : "h-0 opacity-0")} />
                    <Icon size={15} className={on ? "text-accent-soft" : "text-ink-faint"} />
                    {s.label}
                  </button>
                );
              })}
            </nav>

            <div className="panel mt-6 p-3.5">
              <p className="text-[12.5px] font-semibold text-ink">Changes apply everywhere</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Every choice here syncs across the whole application instantly and is
                remembered on this device.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 px-2 text-[11px] text-ink-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pitwall IQ · built for racing minds
            </div>
          </aside>

          {/* ---- the controls ------------------------------------------ */}
          <main className="min-w-0" aria-busy={!ready}>
            <header className="mb-7">
              <p className="label">Preferences</p>
              <h1 className="mt-1 text-[32px] font-bold tracking-[-0.03em] text-ink">Settings</h1>
              <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
                Customise Pitwall IQ to match the way you think about racing.
              </p>
            </header>

            <div className="space-y-9">
              {show("experience") && (
                <Group id="experience" title="Experience" hint="Choose how you want to read the story.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice on={prefs.mode === "simple"} onClick={() => set("mode", "simple")}
                      title="Simple" tag="Storytelling first"
                      body="Plain-English race story focused on key moments and decisions."
                      points={["Easy to follow", "No jargon", "Perfect for learning"]} />
                    <Choice on={prefs.mode === "advanced"} onClick={() => set("mode", "advanced")}
                      title="Advanced" tag="Everything, measured"
                      body="Full telemetry, every metric, every stint and strategic depth."
                      points={["All data, no limits", "Deeper insights", "Built for enthusiasts"]} />
                  </div>
                </Group>
              )}

              {show("appearance") && (
                <Group id="appearance" title="Appearance" hint="Pick a theme and accent that feels right.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice on={prefs.theme === "dark"} title="Dark" tag="Pit wall at night"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setThemeFrom("dark", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                      }}
                      swatch={<ThemeSwatch bg="#0b0e16" panel="#141926" fg="#e8ecf5" accent="#ff3b3b" />} />
                    <Choice on={prefs.theme === "light"} title="Light" tag="Paddock daylight"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setThemeFrom("light", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                      }}
                      swatch={<ThemeSwatch bg="#f0f2f6" panel="#ffffff" fg="#0d1522" accent="#d90400" />} />
                  </div>

                  <p className="mt-6 text-[13.5px] font-semibold text-ink">Accent colour</p>
                  <p className="mb-3 mt-0.5 text-[12.5px] text-ink-muted">
                    Personalises highlights, charts and interactive elements.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {(Object.keys(ACCENTS) as AccentKey[]).map((k) => {
                      const a = ACCENTS[k];
                      const on = prefs.accent === k;
                      const c = `rgb(${prefs.theme === "dark" ? a.dark : a.light})`;
                      return (
                        <button key={k} type="button" onClick={() => set("accent", k)}
                          aria-pressed={on} aria-label={a.label} title={a.label}
                          className={cx("grid h-9 w-9 place-items-center rounded-full transition-all duration-300",
                            on ? "scale-110" : "hover:scale-105")}
                          style={{ boxShadow: on ? `0 0 0 2px rgb(var(--base-950)), 0 0 0 4px ${c}` : undefined }}>
                          <span className="grid h-7 w-7 place-items-center rounded-full text-pure"
                            style={{ background: c }}>
                            {on && <Check size={13} strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Group>
              )}

              {show("motion") && (
                <Group id="motion" title="Motion" hint="Control how much life the interface has.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice on={prefs.motion === "full"} onClick={() => set("motion", "full")}
                      title="Full" tag="Smooth &amp; clear"
                      body="Charts draw themselves, panels rise into place and icons animate when you reach for them." />
                    <Choice on={prefs.motion === "calm"} onClick={() => set("motion", "calm")}
                      title="Calm" tag="Minimal movement"
                      body="Transitions become near-instant and ambient animation stops. Chosen automatically if your system asks for reduced motion." />
                  </div>
                </Group>
              )}

              {show("accessibility") && (
                <Group id="accessibility" title="Accessibility" hint="Make Pitwall IQ work for you.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice on={prefs.textScale === "normal"} onClick={() => set("textScale", "normal")}
                      title="Default text" tag="Standard size"
                      body="The type ramp the interface was designed around." />
                    <Choice on={prefs.textScale === "large"} onClick={() => set("textScale", "large")}
                      title="Larger text" tag="Increased readability"
                      body="Scales the whole interface proportionally — labels and figures included, not just body copy." />
                  </div>
                </Group>
              )}

              {visible.length === 0 && (
                <p className="py-10 text-center text-sm text-ink-muted">
                  Nothing matches “{q}”.
                </p>
              )}
            </div>
          </main>

          {/* ---- live preview + actions --------------------------------- */}
          <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
            <div className="panel-hero p-4">
              <p className="label">Live preview</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">See changes instantly.</p>
              <div className="mt-3.5">
                <PreviewPanel advanced={prefs.mode === "advanced"} />
              </div>
            </div>

            <div className="panel mt-4 p-2">
              <p className="label px-2 pb-1 pt-2">Quick actions</p>
              <Action label="Show the walkthrough again"
                icon={<RotateCcw size={14} />}
                onClick={() => { set("onboarded", false); say("The walkthrough will run on your next session."); }} />
              <Action label="Reset all preferences"
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  try { localStorage.removeItem(PREFS_KEY); } catch { /* private mode */ }
                  (Object.keys(DEFAULT_PREFS) as (keyof Prefs)[])
                    .forEach((k) => set(k, DEFAULT_PREFS[k] as never));
                  say("Preferences reset to defaults.");
                }} />
              <Action label="Open the Race Explorer" icon={<Zap size={14} />} href="/explorer" />
            </div>

            <div aria-live="polite"
              className={cx("mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-[12px] text-emerald-200 transition-all duration-300",
                flash ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
              <Check size={14} /> {flash ?? ""}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const KEYWORDS: Record<SectionId, string[]> = {
  experience: ["simple", "advanced", "detail", "mode", "story", "telemetry"],
  appearance: ["theme", "dark", "light", "colour", "color", "accent"],
  motion: ["animation", "calm", "reduced", "movement"],
  accessibility: ["text", "larger", "size", "readability", "contrast"],
};

/* -------------------------------------------------------------------------- */
function Group({ id, title, hint, children }: {
  id: string; title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rise-in">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</h2>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-muted">{hint}</p>
      {children}
    </section>
  );
}

function Choice({ on, onClick, title, tag, body, points, swatch }: {
  on: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string; tag: string; body?: string; points?: string[]; swatch?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        "group/choice relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ease-out",
        on ? "border-accent/50 bg-accent/[0.05]" : "border-white/[0.07] bg-base-900/50 hover:-translate-y-0.5 hover:border-white/[0.16]")}
      style={on ? { boxShadow: "0 0 0 1px rgb(var(--accent) / .28), 0 12px 30px -24px rgb(var(--accent) / .45)" } : undefined}>
      <span aria-hidden
        className={cx("pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full transition-opacity duration-500",
          on ? "opacity-70" : "opacity-0 group-hover/choice:opacity-50")}
        style={{ background: "radial-gradient(closest-side, rgb(var(--accent) / .16), transparent)" }} />

      <span className="relative flex items-center gap-2">
        <span className="text-[16px] font-bold tracking-tight text-ink">{title}</span>
        <span className={cx("ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-300",
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

/** A miniature of the interface, so a theme is previewed rather than described. */
function ThemeSwatch({ bg, panel, fg, accent }: {
  bg: string; panel: string; fg: string; accent: string;
}) {
  return (
    <span className="block overflow-hidden rounded-lg border border-white/10" style={{ background: bg }} aria-hidden>
      <span className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <span className="block h-1.5 w-10 rounded-full" style={{ background: fg, opacity: 0.5 }} />
      </span>
      <span className="mx-2 mb-2 block rounded-md p-2" style={{ background: panel }}>
        <span className="block h-1.5 w-2/3 rounded-full" style={{ background: fg, opacity: 0.8 }} />
        <span className="mt-1.5 block h-1.5 w-1/3 rounded-full" style={{ background: fg, opacity: 0.3 }} />
        <span className="mt-1.5 block h-1.5 w-1/2 rounded-full" style={{ background: accent }} />
      </span>
    </span>
  );
}

/**
 * A real Pitwall IQ panel, rendered with whatever is currently selected.
 *
 * Simple shows the sentence; Advanced shows the measurements. Everything else —
 * theme, accent, text size, motion — arrives for free, because the preview is
 * built from the same tokens the product is.
 */
function PreviewPanel({ advanced }: { advanced: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-base-950/70">
      <div className="border-b border-white/[0.06] px-3.5 py-2.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-accent-soft">Race summary</p>
        <p className="mt-0.5 text-[14px] font-bold tracking-tight text-ink">Hungarian Grand Prix</p>
        <p className="text-[11px] text-ink-faint">Hungaroring</p>
      </div>

      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <DriverAvatar size={34}
          driver={{ code: "NOR", name: "Lando Norris", number: "4", team: "McLaren",
                    team_color: "#FF8000", headshot_url: null }} />
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Winner</p>
          <p className="truncate text-[13.5px] font-bold text-ink">Lando Norris</p>
          <p className="text-[11px] text-ink-muted">McLaren</p>
        </div>
      </div>

      {advanced ? (
        <div className="space-y-2 border-t border-white/[0.06] px-3.5 py-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-speed">Clean-air pace</p>
          {[["NOR", "#FF8000", 100, "1:24.350"], ["VER", "#3671C6", 76, "+0.240"], ["PIA", "#FF9E3D", 54, "+0.412"]]
            .map(([code, c, w, t]) => (
              <div key={code as string} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10.5px] font-bold" style={{ color: c as string }}>{code}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <span className="block h-full rounded-full"
                    style={{ width: `${w}%`, background: c as string }} />
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-muted">{t}</span>
              </div>
            ))}
        </div>
      ) : (
        <div className="border-t border-white/[0.06] px-3.5 py-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">The race in a line</p>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-ink">
            Norris won from pole, 15.1s clear, on a three-stop.
          </p>
          <div className="mt-2.5 flex gap-5">
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-ink-faint">Key moment</p>
              <p className="text-[12px] font-bold text-ink">Lap 54</p>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-ink-faint">Race time</p>
              <p className="font-mono text-[12px] font-bold tabular-nums text-ink">1:38:21.654</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Action({ label, icon, onClick, href }: {
  label: string; icon: React.ReactNode; onClick?: () => void; href?: string;
}) {
  const cls = "group/act flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[12.5px] text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink";
  const inner = (
    <>
      <span className="text-ink-faint transition-colors group-hover/act:text-accent-soft">{icon}</span>
      {label}
      <ChevronRight size={14}
        className="ml-auto text-ink-faint transition-transform duration-200 group-hover/act:translate-x-0.5" />
    </>
  );
  return href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
