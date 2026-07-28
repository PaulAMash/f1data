import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Pit wall at night" palette — deep slate with an F1 accent.
        base: {
          950: "#07090f",
          900: "#0b0e16",
          850: "#0f131d",
          800: "#141926",
          700: "#1c2333",
          600: "#28324a",
        },
        // Three levels of ink, and every one of them is comfortable to read.
        // `faint` used to be #5f6b84 — 3.6:1 on the panel surface, which passes
        // "technically legible" and fails "pleasant for an hour". It carries the
        // uppercase micro-labels, every scale and every caption in the product,
        // so it is now 5.5:1. Hierarchy still reads; eye strain doesn't.
        ink: {
          DEFAULT: "#e8ecf5",
          muted: "#a8b4cb",
          faint: "#7d8aa5",
        },
        accent: {
          DEFAULT: "#ff3b3b", // F1 red
          soft: "#ff6a5a",
        },
        speed: "#00e0c6",
        amber: "#ffb020",
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
