"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Check, Lightbulb, Loader2, MessageSquarePlus, X } from "lucide-react";
import { sendFeedback } from "@/lib/analytics";
import { usePageContext, useContextLabel } from "@/lib/pageContext";
import { usePrefs } from "@/lib/prefs";
import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* THE FEEDBACK DOCK.                                                         */
/*                                                                            */
/* One control, always in the same corner, on every page where there is        */
/* something to have an opinion about.                                         */
/*                                                                            */
/* WHY BOTTOM-LEFT. The right-hand side of a page is where a product puts the  */
/* things it wants you to press — and it is also where every tooltip, hover     */
/* card and chart legend in this product opens, because content is             */
/* left-aligned and overlays grow away from it. The bottom-left corner is the   */
/* one region of a Pitwall IQ screen that is reliably empty at every width, so  */
/* a control living there covers nothing and is covered by nothing.             */
/*                                                                            */
/* WHY IT STOPS AT THE FOOTER. A control welded to the viewport corner sits on  */
/* top of the footer at the end of every page, which is the one place a reader  */
/* is deliberately reading the small print — the sources, the trademark line.   */
/* So it follows the viewport until the footer arrives and then rides above it, */
/* which is the behaviour of something docked to the CONTENT rather than glued  */
/* to the glass. Scrolling back up hands it to the viewport again.              */
/*                                                                            */
/* WHY IT OUTRANKS A MODAL. z-90 puts it over the dialog layer (z-70) and       */
/* under the tour (z-100). Those two are deliberate and opposite: a reader who  */
/* hits a bug INSIDE a dialog is exactly the reader with something to report,   */
/* so the dock stays reachable there; a reader being taught the product is      */
/* mid-sentence and the tutorial owns the whole screen until it is done.        */
/* -------------------------------------------------------------------------- */

/** Pages with no feedback control. */
const HIDDEN = new Set([
  "/welcome",   // the first-run setup: nothing has been seen to have a view on
  "/",          // the landing page, for the same reason
  "/admin",     // not a reader-facing page; it has the other end of this pipe
]);

/** So the attention animation happens once per browser, ever. */
const SEEN_KEY = "pitwall.fb.seen";
/** How long the success state holds before the panel folds itself away. */
const DONE_MS = 1900;
/** Clear of the footer's top edge by this much when docked. */
const FOOTER_GAP = 16;
/** The resting distance from the bottom of the viewport. */
const BASE_BOTTOM = 20;

type Kind = "bug" | "suggestion";
type Phase = "idle" | "sending" | "done" | "error";

export function FeedbackDock() {
  const path = usePathname();
  const ctx = usePageContext();
  const contextLabel = useContextLabel();
  const { prefs } = usePrefs();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bottom, setBottom] = useState(BASE_BOTTOM);
  const [nudge, setNudge] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hidden = HIDDEN.has(path ?? "");

  /* THE ONE-TIME INVITATION.
     A floating button that has never moved reads as furniture. One short
     shimmer the first time it is ever seen says "this is a control" without
     asking for anything — and it is remembered in localStorage rather than in
     state, so it happens once per browser rather than once per page load,
     which is the difference between an introduction and a tic. */
  useEffect(() => {
    if (hidden) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, "1");
    } catch { /* private mode: it simply plays each visit */ }
    const start = setTimeout(() => setNudge(true), 1400);
    const stop = setTimeout(() => setNudge(false), 6000);
    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [hidden]);

  /* RIDING THE FOOTER.
     Measured from the footer's own rect rather than from a scroll threshold,
     because page heights differ per route and a magic number would be wrong on
     all but one of them. Passive listeners and a rAF coalesce, so this costs
     one rect read per frame only while the reader is actually scrolling. */
  useEffect(() => {
    if (hidden) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const footer = document.querySelector("footer");
      if (!footer) { setBottom(BASE_BOTTOM); return; }
      const top = footer.getBoundingClientRect().top;
      const overlap = window.innerHeight - top;
      setBottom(overlap > BASE_BOTTOM - FOOTER_GAP
        ? Math.round(overlap + FOOTER_GAP) : BASE_BOTTOM);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [hidden, path]);

  const close = useCallback(() => {
    setOpen(false);
    setPhase("idle");
    setError(null);
    // Focus goes back to the control that opened the panel, so a keyboard
    // reader is not returned to the top of the document.
    requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, []);

  /* Escape closes the panel and nothing else. `stopPropagation` because a
     dialog underneath is also listening for Escape, and one key press must
     not close two things. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // The field is what the reader came for, so the keyboard starts there.
  useEffect(() => {
    if (open) requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }));
  }, [open]);

  async function submit() {
    const text = message.trim();
    if (!text || phase === "sending") return;
    setPhase("sending");
    setError(null);
    try {
      await sendFeedback({
        kind, message: text,
        path: path ?? undefined,
        feature: ctx.feature,
        year: ctx.year, gp: ctx.gp, session: ctx.session,
        mode: prefs.mode,
      });
      /* CLEARED THE MOMENT IT LANDS. The success state and a field still
         holding the text is how the same report gets sent twice — the reader
         sees their words, wonders whether it went, and presses Send again. */
      setMessage("");
      setPhase("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "That did not send.");
      setPhase("error");
    }
  }

  /* The success state folds itself away. Long enough to be read, short enough
     that nobody has to dismiss a confirmation they did not ask for. */
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(close, DONE_MS);
    return () => clearTimeout(t);
  }, [phase, close]);

  if (hidden) return null;

  const kinds: { id: Kind; label: string; blurb: string; icon: typeof Bug }[] = [
    { id: "bug", label: "Bug report", icon: Bug,
      blurb: "Something is broken, wrong, confusing, or not behaving the way you expected." },
    { id: "suggestion", label: "Suggestion", icon: Lightbulb,
      blurb: "A feature you want, an improvement, or anything you think would make this better." },
  ];

  return (
    <div ref={rootRef} className="fb-dock" style={{ bottom }}>
      {open ? (
        <div className="fb-panel modal-scroll" role="dialog" aria-modal="false"
          aria-label="Send feedback">
          <div className="flex items-start gap-2 border-b border-white/[0.07] px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-tight text-ink">
                Tell us what you found
              </p>
              {/* WHAT IS BEING SENT, SAID OUT LOUD. The page and the session
                  travel with the report so nobody has to describe where they
                  were — and a reader is owed the knowledge that they do. */}
              <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                {contextLabel
                  ? <>Sent with <span className="text-ink-muted">{contextLabel}</span> and this page.</>
                  : <>Sent with the page you are on.</>}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Close feedback"
              className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg
                         text-ink-faint transition-colors hover:bg-white/[0.07] hover:text-ink">
              <X size={14} />
            </button>
          </div>

          {phase === "done" ? (
            /* THE CONFIRMATION IS THE WHOLE PANEL, not a line under a form.
               A reader who has just handed over a paragraph should be in no
               doubt at all that it arrived. */
            <div className="fb-done grid place-items-center gap-2 px-6 py-9 text-center">
              <span className="fb-tick grid h-10 w-10 place-items-center rounded-full">
                <Check size={19} strokeWidth={2.6} />
              </span>
              <p className="text-[13.5px] font-semibold text-ink">
                {kind === "bug" ? "Bug report sent" : "Suggestion sent"}
              </p>
              <p className="max-w-[16rem] text-[11.5px] leading-relaxed text-ink-faint">
                Thank you — it went through with the page and session attached.
              </p>
            </div>
          ) : (
            <div className="px-3.5 py-3">
              <div role="radiogroup" aria-label="What kind of feedback"
                className="grid gap-1.5">
                {kinds.map((k) => {
                  const on = kind === k.id;
                  const Icon = k.icon;
                  return (
                    <button key={k.id} type="button" role="radio" aria-checked={on}
                      onClick={() => setKind(k.id)}
                      className={cx("fb-kind text-left", on && "is-on")}>
                      <span className="fb-kind-icon"><Icon size={14} /></span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-ink">
                          {k.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">
                          {k.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-2.5 block">
                <span className="sr-only">
                  {kind === "bug" ? "Describe the bug" : "Describe your suggestion"}
                </span>
                <textarea ref={fieldRef} value={message} rows={4}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // Send on ⌘/Ctrl+Enter. Plain Enter stays a newline —
                    // this is a paragraph field, not a search box.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder={kind === "bug"
                    ? "What happened, and what did you expect instead?"
                    : "What would you like Pitwall IQ to do?"}
                  className="fb-field" />
              </label>

              {error && (
                <p className="mt-2 text-[11.5px] leading-snug text-amber">{error}</p>
              )}

              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-ink-faint">
                  {message.trim().length > 0 && `${message.trim().length}/2000`}
                </span>
                <button type="button" onClick={() => void submit()}
                  disabled={!message.trim() || phase === "sending"}
                  className="pressable ml-auto inline-flex items-center gap-1.5 rounded-lg
                             bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-pure
                             disabled:cursor-not-allowed disabled:opacity-40">
                  {phase === "sending"
                    ? <><Loader2 size={13} className="animate-spin" /> Sending</>
                    : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button ref={buttonRef} type="button" onClick={() => setOpen(true)}
          aria-label="Send feedback"
          className={cx("fb-button pressable", nudge && "is-new")}>
          <MessageSquarePlus size={15} />
          <span className="fb-button-text">Feedback</span>
        </button>
      )}
    </div>
  );
}
