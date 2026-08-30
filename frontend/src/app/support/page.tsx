"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardBody } from "@/components/ui/Card";
import { trackPageView } from "@/lib/analytics";

/* -------------------------------------------------------------------------- */
/* SUPPORT.                                                                   */
/*                                                                            */
/* One page, one job: a person with a problem leaves with a way to reach us.  */
/* App stores require a public support URL, and a reader who lands here from   */
/* one has already had something go wrong — so the email is the largest        */
/* element on the page, it is a plain anchor in the prerendered HTML (no       */
/* JavaScript between a frustrated reader and the address), and everything     */
/* else on the page is one glance long.                                        */
/*                                                                            */
/* The address is written once, in SUPPORT_EMAIL, so the visible text and the  */
/* mailto: can never disagree.                                                 */
/* -------------------------------------------------------------------------- */

const SUPPORT_EMAIL = "support@pitwalliq.com";

const REASONS = [
  ["App issues", "Something not working the way it should"],
  ["Bug reports", "Crashes, blank screens, controls that do nothing"],
  ["Data problems", "A result, lap time or standing that looks wrong"],
  ["Questions", "How a number is computed, what a term means"],
  ["Feature requests", "What you wish Pitwall IQ did next"],
] as const;

export default function SupportPage() {
  useEffect(() => { trackPageView("/support"); }, []);

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            <span className="font-mono text-accent-soft">Help</span>
            <span className="h-px w-6 bg-white/[0.14]" />
            Support
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-[-0.03em] text-transparent sm:text-4xl">
            Pitwall IQ Support
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Found a bug, spotted a data problem, have a question, or want to
            request a feature? Get in touch — every message is read.
          </p>
        </header>

        <Card>
          <CardBody>
            <p className="label">Contact us</p>
            {/* The one thing this page exists to deliver. A plain anchor,
                rendered into the static HTML, readable and tappable with
                JavaScript disabled. */}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-lg border
                         border-accent/25 bg-accent/[0.07] px-4 py-3 text-[15px] font-semibold
                         text-ink transition-colors hover:border-accent/40 hover:bg-accent/[0.12]
                         sm:text-base"
            >
              <Mail size={17} className="shrink-0 text-accent-soft" />
              <span className="break-all">{SUPPORT_EMAIL}</span>
            </a>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
              Saying which page you were on — and, for a data problem, which
              Grand Prix and session — helps us find it faster.
            </p>
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardBody>
            <p className="label">What to write in about</p>
            <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {REASONS.map(([title, note]) => (
                <li key={title} className="text-[13.5px]">
                  <span className="font-medium text-ink">{title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-faint">{note}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* The same statement the footer carries, where a store reviewer or a
            confused reader will actually look for it. */}
        <p className="mt-6 text-[12.5px] leading-relaxed text-ink-faint">
          Pitwall IQ is an independent product. It is not associated with,
          endorsed by, or affiliated with Formula 1, the FIA, or any competing
          team.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] text-ink-muted
                     transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Pitwall IQ
        </Link>
      </main>
      <Footer />
    </div>
  );
}
