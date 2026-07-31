import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Every colour is a CSS variable, which is what makes a theme possible
           at all: `bg-base-900` resolves through `--base-900`, so one attribute
           on <html> re-skins 43 components without touching one of them. */
        base: {
          950: "rgb(var(--base-950) / <alpha-value>)",
          900: "rgb(var(--base-900) / <alpha-value>)",
          850: "rgb(var(--base-850) / <alpha-value>)",
          800: "rgb(var(--base-800) / <alpha-value>)",
          700: "rgb(var(--base-700) / <alpha-value>)",
          600: "rgb(var(--base-600) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        speed: "rgb(var(--speed) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",

        /* The single highest-leverage line in this file.

           137 hairlines and washes across the app are written `white/[0.06]`,
           which on a light background is invisible. Rather than rewrite every
           one of them, `white` itself becomes a variable: it stays white in the
           dark theme and becomes near-black in the light one, so every border,
           every hover wash and every divider inverts for free and stays exactly
           as subtle as it was designed to be. */
        white: "rgb(var(--tint) / <alpha-value>)",
        /* …which leaves the handful of places that mean *actually* white — text
           on the red button, a code on a livery shield — needing a way to say so. */
        pure: "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 8px 40px -12px rgba(0,0,0,0.6)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -18px rgba(0,0,0,0.8)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "grow-x": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        progress: { from: { width: "0%" }, to: { width: "100%" } },
        // a hover card arrives from the direction it belongs to, rather than
        // blinking into existence on top of what you were reading
        "tip-in": { from: { opacity: "0", transform: "translateY(4px) scale(.985)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        // a live indicator: the dot itself stays put, a ring breathes out of it
        "ping-soft": { "0%": { transform: "scale(.85)", opacity: ".55" }, "70%,100%": { transform: "scale(2.1)", opacity: "0" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "grow-x": "grow-x 0.8s cubic-bezier(0.22,1,0.36,1) both",
        "tip-in": "tip-in 0.16s cubic-bezier(0.22,1,0.36,1) both",
        "ping-soft": "ping-soft 2.4s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
