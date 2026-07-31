"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Play, X } from "lucide-react";
import Link from "next/link";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* The second button.                                                         */
/*                                                                            */
/* "See how it works" scrolled the page down one section, which is not worth a */
/* hero button — a control that important has to be worth pressing.            */
/*                                                                            */
/* This answers a real question instead, the way the product does: the         */
/* evidence arrives one beat at a time, each line landing as the analysis      */
/* reaches it, and the verdict only once the working is on screen. Twenty      */
/* seconds, no narration, and at the end the reader has watched Pitwall IQ do  */
/* the thing it claims to do rather than read a promise that it can.           */
/* -------------------------------------------------------------------------- */

interface Beat {
  kind: "step" | "evidence" | "verdict";
  label?: string;
  text: string;
  value?: string;
  tone?: string;
}

const BEATS: Beat[] = [
  { kind: "step", text: "Reading 1,204 laps of timing data…" },
  { kind: "step", text: "Correcting for fuel load and tyre age…" },
  { kind: "evidence", label: "Clean-air pace", text: "Verstappen was quickest on merit",
    value: "1:24.35", tone: "rgb(var(--speed))" },
  { kind: "evidence", label: "Lap 34 · Virtual SC", text: "Pitted while the field ran slowly",
    value: "saved 10.3s", tone: "rgb(var(--amber))" },
  { kind: "evidence", label: "Undercut on Norris", text: "Emerged ahead through the pit cycle",
    value: "+1 place", tone: "rgb(var(--speed))" },
  { kind: "evidence", label: "Laps led", text: "Never headed after lap 34",
    value: "34 of 71", tone: "#a78bfa" },
  { kind: "verdict", text: "The Virtual Safety Car handed Verstappen a discounted pit stop he was already fast enough to convert. Norris had the pace to answer, but not the track position." },
];

export function SampleStory() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="pressable group/demo inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-base-850/60 px-5 py-3.5 text-sm font-medium text-ink backdrop-blur-md">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent-soft transition-transform duration-300 group-hover/demo:scale-110">
          <Play size={11} fill="currentColor" />
        </span>
        Why did Verstappen win?
      </button>
      {open && <Player onClose={() => setOpen(false)} />}
    </>
  );
}

function Player({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (shown >= BEATS.length) return;
    // the two "reading…" steps are quick; evidence needs a beat to be read
    const delay = BEATS[shown]?.kind === "step" ? 900 : 1500;
    const t = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [shown]);

  const done = shown >= BEATS.length;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="How Pitwall IQ answers a question">
      <div className="absolute inset-0 animate-fade-in bg-base-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="panel-hero relative w-full max-w-xl animate-fade-in p-6 sm:p-7">
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink">
          <X size={15} />
        </button>

        <p className="label text-accent-soft">Ask the race</p>
        <h2 className="mt-1.5 text-[22px] font-bold tracking-tight text-ink">
          Why did Verstappen win?
        </h2>

        <div className="mt-5 space-y-2">
          {BEATS.slice(0, shown).map((b, i) => (
            <div key={i} className="rise-in">
              {b.kind === "step" && (
                <p className="flex items-center gap-2 py-0.5 text-[12.5px] text-ink-faint">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-accent" />
                  {b.text}
                </p>
              )}
              {b.kind === "evidence" && (
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-base-900/70 px-3.5 py-2.5">
                  <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: b.tone }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: b.tone }}>{b.label}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink">{b.text}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums"
                    style={{ color: b.tone }}>{b.value}</span>
                </div>
              )}
              {b.kind === "verdict" && (
                <div className="mt-1 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
                  <p className="label text-accent-soft">The answer</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{b.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={cx("mt-5 flex items-center gap-3 transition-all duration-500",
          done ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0")}>
          <Link href="/explorer?tab=ask"
            className="pressable-glow inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-pure">
            Ask about a real race <ArrowRight size={14} />
          </Link>
          <button onClick={() => setShown(0)}
            className="text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
            Replay
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
