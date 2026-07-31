"use client";
import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { usePrefs, DEFAULT_PREFS, PREFS_KEY, type Prefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Settings.                                                                  */
/*                                                                            */
/* Preferences used to be scattered: display mode was a toggle repeated inside */
/* every page that respected it, theme did not exist, and nothing survived a   */
/* refresh. One page now owns all of it.                                      */
/*                                                                            */
/* Every option is shown as a CHOICE, not a switch — two cards side by side,   */
/* each stating what it gives you. A checkbox labelled "Advanced" asks the     */
/* reader to guess; two cards let them decide.                                 */
/* -------------------------------------------------------------------------- */

export default function SettingsPage() {
  const { prefs, set, setThemeFrom, ready } = usePrefs();
  const [reset, setReset] = useState(false);

  return (
    <div className="min-h-screen">
      <NavBar active="settings" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="label">Preferences</div>
          <h1 className="mt-1 bg-gradient-to-br from-ink to-ink-muted bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            These apply everywhere in Pitwall IQ and are remembered on this device.
          </p>
        </header>

        {/* aria-busy rather than a spinner: the controls are already correct
            for the default, and the stored answer lands within a frame */}
        <div className="space-y-8" aria-busy={!ready}>
          <Section title="How much detail"
            hint="Every panel in the app renders both ways. You can change this whenever you like — nothing is hidden for good.">
            <ChoiceGrid>
              <Choice
                on={prefs.mode === "simple"} onClick={() => set("mode", "simple")}
                title="Simple" tag="Storytelling first"
                points={["Plain-English race story", "The moments that decided it", "No jargon without an explanation"]} />
              <Choice
                on={prefs.mode === "advanced"} onClick={() => set("mode", "advanced")}
                title="Advanced" tag="Everything, measured"
                points={["Full field, every metric", "Clean-air pace and stint deltas", "Strategy verdicts and pit economics"]} />
            </ChoiceGrid>
          </Section>

          <Section title="Appearance"
            hint="Pitwall IQ was designed dark, so that is where a first visit starts. Your choice here is remembered from then on.">
            <ChoiceGrid>
              <Choice
                on={prefs.theme === "dark"} title="Dark" tag="Pit wall at night"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setThemeFrom("dark", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
                swatch={<Swatch bg="#0b0e16" fg="#e8ecf5" accent="#ff3b3b" />} />
              <Choice
                on={prefs.theme === "light"} title="Light" tag="Paddock daylight"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setThemeFrom("light", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
                swatch={<Swatch bg="#ffffff" fg="#0d1522" accent="#d90400" />} />
            </ChoiceGrid>
          </Section>

          <Section title="Motion"
            hint="Charts draw themselves in, panels slide, icons animate when you reach for them. Calm keeps the interface still. If your system already asks for reduced motion, that is the default here."
            >
            <ChoiceGrid>
              <Choice on={prefs.motion === "full"} onClick={() => set("motion", "full")}
                title="Full" tag="Everything moves" />
              <Choice on={prefs.motion === "calm"} onClick={() => set("motion", "calm")}
                title="Calm" tag="Motion reduced" />
            </ChoiceGrid>
          </Section>

          <Section title="Walkthrough"
            hint="The short guided tour shown the first time you open a session.">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button"
                onClick={() => set("onboarded", false)}
                className="pressable inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-base-850 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-white/[0.16]">
                <RotateCcw size={14} /> Show it again
              </button>
              {!prefs.onboarded && (
                <span className="text-[12.5px] text-ink-muted">
                  It will run the next time you open a session.
                </span>
              )}
            </div>
          </Section>

          <Section title="Reset" hint="Clears every preference on this device and returns to the defaults.">
            <button type="button"
              onClick={() => {
                try { localStorage.removeItem(PREFS_KEY); } catch { /* private mode */ }
                (Object.keys(DEFAULT_PREFS) as (keyof Prefs)[])
                  .forEach((k) => set(k, DEFAULT_PREFS[k] as never));
                setReset(true);
                setTimeout(() => setReset(false), 2200);
              }}
              className="pressable inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-base-850 px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-rose-400/30 hover:text-rose-300">
              {reset ? <><Check size={14} className="text-emerald-400" /> Reset</> : "Reset preferences"}
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      {hint && <p className="mb-3 mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{hint}</p>}
      {children}
    </section>
  );
}

function ChoiceGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Choice({
  on, onClick, title, tag, points, swatch,
}: {
  on: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string; tag: string; points?: string[]; swatch?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        "group/choice relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ease-out",
        on
          ? "border-accent/45 bg-accent/[0.06] shadow-[0_0_0_1px_rgb(var(--accent)/0.25)]"
          : "border-white/[0.07] bg-base-850/60 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-base-800/70")}>
      <span aria-hidden
        className={cx("pointer-events-none absolute inset-0 transition-opacity duration-300",
          on ? "opacity-100" : "opacity-0")}
        style={{ background: "radial-gradient(120% 90% at 0% 0%, rgb(var(--accent) / 0.10), transparent 60%)" }} />
      <span className="relative flex items-center gap-2">
        <span className="text-[15px] font-bold tracking-tight text-ink">{title}</span>
        <span className={cx("ml-auto grid h-5 w-5 place-items-center rounded-full border transition-all duration-200",
          on ? "border-accent bg-accent text-pure" : "border-white/15 text-transparent")}>
          <Check size={12} strokeWidth={3} />
        </span>
      </span>
      <span className="relative mt-0.5 block text-[12px] font-medium uppercase tracking-wider text-accent-soft">
        {tag}
      </span>
      {swatch && <span className="relative mt-3 block">{swatch}</span>}
      {points && (
        <ul className="relative mt-3 space-y-1">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-[12.5px] leading-snug text-ink-muted">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{p}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

/** A miniature of the interface, so a theme is previewed rather than described. */
function Swatch({ bg, fg, accent }: { bg: string; fg: string; accent: string }) {
  return (
    <span className="flex h-14 w-full overflow-hidden rounded-lg border border-white/10"
      style={{ background: bg }} aria-hidden>
      <span className="w-1.5 shrink-0" style={{ background: accent }} />
      <span className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
        <span className="block h-1.5 w-2/3 rounded-full" style={{ background: fg, opacity: 0.85 }} />
        <span className="block h-1.5 w-1/3 rounded-full" style={{ background: fg, opacity: 0.35 }} />
        <span className="block h-1.5 w-1/2 rounded-full" style={{ background: accent, opacity: 0.8 }} />
      </span>
    </span>
  );
}
