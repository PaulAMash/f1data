"use client";
import { usePrefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The theme switch.                                                          */
/*                                                                            */
/* One control, two states, and the transition anchored to the button itself:  */
/* the new theme grows out of the thing you pressed, so cause and effect are   */
/* the same gesture. See --sweep-x/--sweep-y in globals.css.                   */
/*                                                                            */
/* The glyph is a single sun/moon that MORPHS rather than two icons that swap: */
/* the rays retract and a shadow slides across the disc to bite it into a      */
/* crescent. Swapping two icons is a cut; this is a dissolve, and it is the    */
/* one place in the product where the reader is looking directly at the thing  */
/* being animated.                                                            */
/* -------------------------------------------------------------------------- */

export function ThemeToggle({ className }: { className?: string }) {
  const { prefs, setThemeFrom } = usePrefs();
  const dark = prefs.theme === "dark";

  return (
    <button
      type="button"
      data-tour="theme"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setThemeFrom(dark ? "light" : "dark",
          { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      className={cx(
        "group/theme grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        "border border-white/[0.07] bg-base-850/70 text-ink-muted",
        "transition-colors duration-200 hover:border-white/[0.14] hover:text-ink",
        className)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
        className="overflow-visible">
        <defs>
          {/* the crescent is cut, not drawn: a second disc rides in from the
              top-right and masks the first, which is how the moon actually
              makes its shape */}
          <mask id="tt-bite">
            <rect x="0" y="0" width="24" height="24" fill="#fff" />
            <circle cx={dark ? 17 : 30} cy={dark ? 7 : -6} r="9" fill="#000"
              style={{ transition: "cx .45s cubic-bezier(.4,0,.2,1), cy .45s cubic-bezier(.4,0,.2,1)" }} />
          </mask>
        </defs>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{
            transformOrigin: "12px 12px",
            transform: dark ? "rotate(-35deg) scale(.35)" : "rotate(0deg) scale(1)",
            opacity: dark ? 0 : 1,
            transition: "transform .45s cubic-bezier(.4,0,.2,1), opacity .3s ease",
          }}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="1.6" x2="12" y2="4" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
        <circle cx="12" cy="12" fill="currentColor" mask="url(#tt-bite)"
          r={dark ? 8 : 5.4}
          style={{ transition: "r .45s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
    </button>
  );
}
