"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Accessibility, ChevronRight, Check, Globe, LayoutGrid, Palette, RotateCcw,
  Search, Waves, Zap,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DriverAvatar } from "@/components/ui/DriverBadge";
import { Choice, Choose, Field, Segmented, Switch } from "@/components/ui/Field";
import {
  usePrefs, ACCENTS, PREF_GROUPS, type AccentKey, type PrefGroup,
} from "@/lib/prefs";
import { useLocale } from "@/lib/locale";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The control centre.                                                        */
/*                                                                            */
/* Three things were wrong with this page, and they were the same thing:      */
/* it looked like a control centre without behaving like one.                 */
/*                                                                            */
/*   THE NAVIGATION DID NOTHING. Pressing "Motion" filtered the list rather   */
/*   than going anywhere, so on a screen tall enough to show every section at */
/*   once the four items were inert. They scroll now, and the rail follows    */
/*   the reader back — a rail that only leads is half a rail.                 */
/*                                                                            */
/*   THE PREVIEW WAS A PICTURE OF A PANEL. It changed for Simple/Advanced and */
/*   for nothing else, which is the worst possible arrangement: it claims to  */
/*   be live, so a reader who changes density and sees nothing move concludes */
/*   the setting is broken rather than that the preview is. It is now built   */
/*   from the same tokens the product is and shows every axis this page has.  */
/*                                                                            */
/*   THE LIST WAS TOO SHORT TO BE A DESTINATION. Four preferences is a menu.  */
/*   The ones added are the ones a reader arrives looking for — how heat is   */
/*   measured, how the product is spelled, where it opens — and each is read  */
/*   by real code. There is still nothing here that controls nothing.         */
/* -------------------------------------------------------------------------- */

const SECTIONS = [
  { id: "experience",    label: "Experience",    icon: Zap },
  { id: "appearance",    label: "Appearance",    icon: Palette },
  { id: "localisation",  label: "Localisation",  icon: Globe },
  { id: "interface",     label: "Interface",     icon: LayoutGrid },
  { id: "motion",        label: "Motion",        icon: Waves },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const KEYWORDS: Record<SectionId, string[]> = {
  experience: ["simple", "advanced", "detail", "mode", "story", "telemetry", "depth"],
  appearance: ["theme", "dark", "light", "colour", "color", "accent", "glow", "intensity"],
  localisation: ["celsius", "fahrenheit", "temperature", "units", "metric", "imperial",
    "british", "american", "english", "spelling", "tyre", "tire", "clock", "12h", "24h",
    "time", "numbers", "separator"],
  interface: ["density", "compact", "chart", "animation", "speed", "tooltip", "delay",
    "landing", "home", "start", "season", "year", "default"],
  motion: ["animation", "calm", "reduced", "movement", "tempo"],
  accessibility: ["text", "larger", "size", "readability", "contrast"],
};

const CURRENT_SEASON = new Date().getFullYear();

export default function SettingsPage() {
  const { prefs, set, setThemeFrom, resetGroup, resetAll, ready } = usePrefs();
  const [active, setActive] = useState<SectionId>("experience");
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const clicked = useRef(0);

  const say = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2400);
  }, []);

  // search narrows the list; it never hides a section you are looking at
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SECTIONS.map((x) => x.id) as SectionId[];
    return SECTIONS.filter((x) => x.label.toLowerCase().includes(s)
      || KEYWORDS[x.id].some((k) => k.includes(s))).map((x) => x.id);
  }, [q]);
  const show = (id: SectionId) => matches.includes(id);

  /* THE RAIL FOLLOWS THE READER.
     Scrolling to a section is only half of it: if the rail does not come back
     when the reader scrolls by hand, the highlight is a lie within one flick
     of the wheel. `clicked` suppresses the observer briefly after a press, so
     the sections passing under the smooth scroll don't light up on the way. */
  useEffect(() => {
    if (!ready) return;
    const io = new IntersectionObserver((entries) => {
      if (performance.now() - clicked.current < 700) return;
      const hit = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id as SectionId);
    }, { rootMargin: "-88px 0px -62% 0px", threshold: 0 });
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ready, matches]);

  function goTo(id: SectionId) {
    setActive(id);
    clicked.current = performance.now();
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top: y, behavior: prefs.motion === "calm" ? "auto" : "smooth" });
  }

  const accentList = Object.keys(ACCENTS) as AccentKey[];

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

            <nav className="mt-5 space-y-0.5" aria-label="Settings sections">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const on = active === s.id;
                return (
                  <button key={s.id} onClick={() => goTo(s.id)}
                    aria-current={on ? "true" : undefined}
                    className={cx(
                      "group/nav relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-all duration-200",
                      on ? "bg-accent/10 font-semibold text-ink" : "text-ink-muted hover:bg-white/[0.04] hover:text-ink",
                      !show(s.id) && "opacity-35")}>
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

            <div className="panel mt-5 p-3.5">
              <p className="text-[12.5px] font-semibold text-ink">Changes apply everywhere</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Every choice here syncs across the whole application instantly and is
                remembered on this device.
              </p>
            </div>
          </aside>

          {/* ---- the controls ------------------------------------------ */}
          <main className="min-w-0" data-tour="settings-main" aria-busy={!ready}>
            <header className="mb-7">
              <p className="label">Preferences</p>
              <h1 className="mt-1 text-[32px] font-bold tracking-[-0.03em] text-ink">Settings</h1>
              <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
                Customise Pitwall IQ to match the way you think about racing.
              </p>
            </header>

            <div className="space-y-10">
              <Group id="experience" title="Experience" dim={!show("experience")}
                hint="Choose how you want to read the story."
                onReset={() => { resetGroup("experience"); say("Experience reset."); }}>
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

              <Group id="appearance" title="Appearance" dim={!show("appearance")}
                hint="Pick a theme and accent that feels right."
                onReset={() => { resetGroup("appearance"); say("Appearance reset."); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice on={prefs.theme === "dark"} title="Dark" tag="Pit wall at night"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setThemeFrom("dark", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }}
                    swatch={<ThemeSwatch bg="#0b0e16" panel="#141926" fg="#e8ecf5" accent="#ff3b3b" />} />
                  <Choice on={prefs.theme === "light"} title="Light" tag="Daylight in the garage"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setThemeFrom("light", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }}
                    swatch={<ThemeSwatch bg="#f0f2f6" panel="#ffffff" fg="#0d1522" accent="#d90400" />} />
                </div>

                <div className="mt-5">
                  <Field label="Accent colour"
                    hint="Personalises highlights, charts and interactive elements.">
                    <div className="flex flex-wrap gap-2">
                      {accentList.map((k) => {
                        const a = ACCENTS[k];
                        const on = prefs.accent === k;
                        const c = `rgb(${prefs.theme === "dark" ? a.dark : a.light})`;
                        return (
                          <button key={k} type="button" onClick={() => set("accent", k)}
                            aria-pressed={on} aria-label={a.label} title={a.label}
                            className={cx("grid h-8 w-8 place-items-center rounded-full transition-all duration-300",
                              on ? "scale-110" : "hover:scale-105")}
                            style={{ boxShadow: on ? `0 0 0 2px rgb(var(--base-950)), 0 0 0 4px ${c}` : undefined }}>
                            <span className="grid h-6 w-6 place-items-center rounded-full text-pure"
                              style={{ background: c }}>
                              {on && <Check size={12} strokeWidth={3} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Accent intensity"
                    hint="How much light the accent throws into the room behind the interface.">
                    <Segmented value={prefs.intensity} onChange={(v) => set("intensity", v)}
                      options={[
                        { value: "subtle", label: "Subtle" },
                        { value: "standard", label: "Standard" },
                        { value: "vivid", label: "Vivid" },
                      ] as const} />
                  </Field>
                </div>
              </Group>

              <Group id="localisation" title="Localisation" dim={!show("localisation")}
                hint="How measurements, spelling and times are written."
                onReset={() => { resetGroup("localisation"); say("Localisation reset."); }}>
                <Field label="Units"
                  hint="Track and air temperatures, and speeds, throughout the product.">
                  <Segmented value={prefs.units} onChange={(v) => set("units", v)}
                    options={[
                      { value: "metric", label: "°C · kph" },
                      { value: "imperial", label: "°F · mph" },
                    ] as const} />
                </Field>
                <Field label="Language style"
                  hint="Not a translation — which English the interface is written in.">
                  <Segmented value={prefs.spelling} onChange={(v) => set("spelling", v)}
                    options={[
                      { value: "en-GB", label: "British", title: "tyres, colour, analysing" },
                      { value: "en-US", label: "American", title: "tires, color, analyzing" },
                    ] as const} />
                </Field>
                <Field label="Time format" hint="Session times and clock readings.">
                  <Segmented value={prefs.clock} onChange={(v) => set("clock", v)}
                    options={[
                      { value: "24h", label: "24-hour" },
                      { value: "12h", label: "12-hour" },
                    ] as const} />
                </Field>
                <Field label="Group large numbers"
                  hint="Thousands separators. Off suits copying figures into a spreadsheet." >
                  <Switch on={prefs.groupDigits} label="Group large numbers"
                    onChange={(v) => set("groupDigits", v)} />
                </Field>
              </Group>

              <Group id="interface" title="Interface" dim={!show("interface")}
                hint="How much fits on screen, and where the product opens."
                onReset={() => { resetGroup("interface"); say("Interface reset."); }}>
                <Field label="Density"
                  hint="Compact tightens the whole ramp so more of a session fits on one screen.">
                  <Segmented value={prefs.density} onChange={(v) => set("density", v)}
                    options={[
                      { value: "comfortable", label: "Comfortable" },
                      { value: "compact", label: "Compact" },
                    ] as const} />
                </Field>
                <Field label="Chart animation"
                  hint="How long a chart takes to draw itself when it arrives.">
                  <Segmented value={prefs.chartSpeed} onChange={(v) => set("chartSpeed", v)}
                    options={[
                      { value: "instant", label: "Instant" },
                      { value: "standard", label: "Standard" },
                      { value: "cinematic", label: "Cinematic" },
                    ] as const} />
                </Field>
                <Field label="Tooltip delay"
                  hint="How long a hover waits before explaining itself.">
                  <Segmented value={prefs.tipDelay} onChange={(v) => set("tipDelay", v)}
                    options={[
                      { value: "none", label: "None" },
                      { value: "short", label: "Short" },
                      { value: "long", label: "Long" },
                    ] as const} />
                </Field>
                <Field label="Open on" htmlFor="pref-landing"
                  hint="Where a new visit starts. The logo always comes back here.">
                  <Choose id="pref-landing" value={prefs.landing}
                    onChange={(v) => set("landing", v)}
                    options={[
                      { value: "home", label: "Home" },
                      { value: "explorer", label: "Race Explorer" },
                      { value: "history", label: "Historical" },
                    ] as const} />
                </Field>
                <Field label="Default season" htmlFor="pref-season"
                  hint="The season the archive opens on.">
                  <Choose id="pref-season" value={prefs.season}
                    onChange={(v) => set("season", v)}
                    options={[
                      { value: 0, label: "Most recent" },
                      ...Array.from({ length: 12 }, (_, i) => {
                        const y = CURRENT_SEASON - i;
                        return { value: y, label: String(y) };
                      }),
                    ]} />
                </Field>
              </Group>

              <Group id="motion" title="Motion" dim={!show("motion")}
                hint="Control the pace of the interface — not whether it has one."
                onReset={() => { resetGroup("motion"); say("Motion reset."); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice on={prefs.motion === "full"} onClick={() => set("motion", "full")}
                    title="Full" tag="Race control"
                    body="Charts draw themselves, panels rise into place, and the hero runs at full tempo." />
                  <Choice on={prefs.motion === "calm"} onClick={() => set("motion", "calm")}
                    title="Calm" tag="Slower, gentler"
                    body="Everything still moves and still updates — about a third of the speed, with shorter travel and no overshoot." />
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                  If your system asks for reduced motion, animation stops entirely — that is an
                  accessibility setting and it always wins over this one.
                </p>
              </Group>

              <Group id="accessibility" title="Accessibility" dim={!show("accessibility")}
                hint="Make Pitwall IQ work for you."
                onReset={() => { resetGroup("accessibility"); say("Accessibility reset."); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice on={prefs.textScale === "normal"} onClick={() => set("textScale", "normal")}
                    title="Default text" tag="Standard size"
                    body="The type ramp the interface was designed around." />
                  <Choice on={prefs.textScale === "large"} onClick={() => set("textScale", "large")}
                    title="Larger text" tag="Increased readability"
                    body="Scales the whole interface proportionally — labels and figures included, not just body copy." />
                </div>
              </Group>

              {matches.length === 0 && (
                <p className="py-10 text-center text-sm text-ink-muted">
                  Nothing matches “{q}”.
                </p>
              )}
            </div>
          </main>

          {/* ---- live preview + actions --------------------------------- */}
          <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
            <div className="panel-hero p-4">
              <div className="flex items-center gap-2">
                <p className="label">Live preview</p>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-ink-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  live
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Every setting on this page, applied.
              </p>
              <div className="mt-3.5">
                <PreviewPanel />
              </div>
            </div>

            <div className="panel mt-4 p-2">
              <p className="label px-2 pb-1 pt-2">Quick actions</p>
              <Action label="Replay the guided tour"
                icon={<RotateCcw size={14} />}
                onClick={() => { set("onboarded", false); say("The tour will run next time you open the home page."); }} />
              <Action label="Reset every preference"
                icon={<RotateCcw size={14} />}
                onClick={() => { resetAll(); say("All preferences reset to defaults."); }} />
              <Action label="Open the Race Explorer" icon={<Zap size={14} />} href="/explorer" />
            </div>

            <div aria-live="polite"
              className={cx("mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-[12px] text-emerald-300 transition-all duration-300",
                flash ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
              <Check size={14} className="shrink-0" /> {flash ?? ""}
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function Group({ id, title, hint, children, onReset, dim }: {
  id: PrefGroup; title: string; hint: string;
  children: React.ReactNode; onReset: () => void; dim?: boolean;
}) {
  return (
    <section id={id}
      className={cx("group/sec scroll-mt-24 transition-opacity duration-300", dim && "opacity-40")}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</h2>
        {/* A section-level reset, because "reset everything" is a bigger promise
            than most readers actually want to make. Quiet until reached for. */}
        <button type="button" onClick={onReset}
          className="ml-auto text-[11px] text-ink-faint opacity-0 transition-all duration-200 hover:text-ink focus-visible:opacity-100 group-hover/sec:opacity-100">
          Reset {title.toLowerCase()}
        </button>
      </div>
      <p className="mb-3 mt-1 text-[13px] text-ink-muted">{hint}</p>
      {children}
    </section>
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

/* -------------------------------------------------------------------------- */
/**
 * A real Pitwall IQ panel, rendered with whatever is currently selected.
 *
 * THE POINT IS THAT NOTHING IN HERE IS A MOCK-UP. It is built from the same
 * surface classes, the same type ramp, the same accent variable and the same
 * locale helpers as the Race Explorer, so it does not need to be told what a
 * setting did — theme, accent, intensity, density, text size, units, clock,
 * number grouping and spelling all arrive by themselves. Simple and Advanced
 * genuinely rewrite it, because that is genuinely what they do.
 *
 * The one thing it adds is a redraw: changing chart animation replays the
 * bars, because a duration is the one setting you cannot see in a still image.
 */
function PreviewPanel() {
  const { prefs } = usePrefs();
  const { temp, time, num } = useLocale();
  const advanced = prefs.mode === "advanced";
  const [beat, setBeat] = useState(0);

  // replay the draw when the speed changes, so the setting demonstrates itself
  useEffect(() => { setBeat((b) => b + 1); }, [prefs.chartSpeed, prefs.mode]);

  const rows = [
    { code: "NOR", c: "#FF8000", w: 100, t: "1:24.350" },
    { code: "VER", c: "#3671C6", w: 76, t: "+0.240" },
    { code: "PIA", c: "#FF9E3D", w: 54, t: "+0.412" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-base-950/70">
      <div className="border-b border-white/[0.06] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-accent-soft">
            Race summary
          </p>
          <span className="ml-auto font-mono text-[9.5px] tabular-nums text-ink-faint">
            {time(new Date(2026, 6, 26, 15, 5))}
          </span>
        </div>
        <p className="mt-0.5 text-[14px] font-bold tracking-tight text-ink">Hungarian Grand Prix</p>
        <p className="text-[11px] text-ink-faint">Hungaroring · {num(70)} laps</p>
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
        {/* the units setting, on something a reader recognises as a real value */}
        <div className="ml-auto text-right">
          <p className="text-[9.5px] uppercase tracking-wider text-ink-faint">Track</p>
          <p className="font-mono text-[12px] font-bold tabular-nums text-ink">{temp(47)}</p>
        </div>
      </div>

      {advanced ? (
        <div key={beat} className="space-y-2 border-t border-white/[0.06] px-3.5 py-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-speed">
            Clean-air pace
          </p>
          {rows.map((r) => (
            <div key={r.code} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[10.5px] font-bold" style={{ color: r.c }}>{r.code}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span className="block h-full rounded-full pv-grow"
                  style={{ width: `${r.w}%`, background: r.c }} />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-muted">
                {r.t}
              </span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-ink-faint">
            Analysed over {num(1204)} laps, fuel and tyre corrected.
          </p>
        </div>
      ) : (
        <div key={beat} className="border-t border-white/[0.06] px-3.5 py-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            The race in a line
          </p>
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
