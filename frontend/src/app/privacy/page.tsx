"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardBody } from "@/components/ui/Card";
import { trackPageView } from "@/lib/analytics";

/* -------------------------------------------------------------------------- */
/* THE PRIVACY POLICY.                                                        */
/*                                                                            */
/* Every sentence in this document is checked against the code, and the code   */
/* is the easier half of that bargain to keep because there is so little to    */
/* describe: no accounts, no cookies, no ads, no fingerprinting, two random    */
/* identifiers and the text people type on purpose. The document's job is to   */
/* say that plainly enough that a reader — or an App Store reviewer — can      */
/* check any line of it against the product's behaviour.                       */
/*                                                                            */
/* IF THE CODE CHANGES, THIS PAGE CHANGES IN THE SAME COMMIT. The sources for  */
/* each claim: lib/analytics.ts (what the browser sends and stores, and the    */
/* Do Not Track opt-out), backend/app/analytics/store.py (what is kept and     */
/* for how long), backend/app/main.py (the closed event vocabulary),           */
/* backend/app/analysis/qa.py (_maybe_polish — what the optional AI wording    */
/* step sees), and docs/ANALYTICS.md (the whole argument).                     */
/* -------------------------------------------------------------------------- */

const CONTACT_EMAIL = "support@pitwalliq.com";
const LAST_UPDATED = "29 August 2026";

/** One section of the policy: an anchor-friendly heading over flowing prose. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink sm:text-base">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[13.5px] leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="text-[13.5px] leading-relaxed text-ink-muted">
      <span className="font-medium text-ink">{term}</span>{" — "}{children}
    </li>
  );
}

export default function PrivacyPage() {
  useEffect(() => { trackPageView("/privacy"); }, []);

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            <span className="font-mono text-accent-soft">Legal</span>
            <span className="h-px w-6 bg-white/[0.14]" />
            Privacy
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-white to-ink-muted bg-clip-text text-3xl font-bold tracking-[-0.03em] text-transparent sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            This policy covers the Pitwall IQ website (pitwalliq.com) and the
            Pitwall IQ iOS app, which use the same service. Last updated{" "}
            <span className="whitespace-nowrap">{LAST_UPDATED}</span>.
          </p>
        </header>

        {/* Answer-first, like everything else in the product: the whole policy
            in six lines, for the reader who will not scroll. */}
        <Card>
          <CardBody>
            <p className="label flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-accent-soft" />
              The short version
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-ink-muted">
              <li>No account and no sign-in — we never ask who you are.</li>
              <li>No cookies, no advertising, no fingerprinting, and we never sell or share data for marketing.</li>
              <li>We count usage under a random identifier that is generated on your device and says nothing about you.</li>
              <li>The only free text we keep is what you type on purpose: an Ask question or a feedback report.</li>
              <li>We do not store IP addresses, device details, or browsing history in our analytics.</li>
              <li>
                Questions or deletion requests:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-dotted underline-offset-2 hover:text-white">
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Section title="Who we are">
          <p>
            Pitwall IQ is an independent product for exploring Formula 1 races.
            It is not associated with, endorsed by, or affiliated with Formula 1,
            the FIA, or any competing team. You can reach us any time at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-dotted underline-offset-2 hover:text-white">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="No account, no sign-in">
          <p>
            Pitwall IQ does not have user accounts. There is nothing to register
            for and nothing to sign in to, so we never collect your name, email
            address, password, or any other account information. The only way we
            learn your email address is if you choose to write to us.
          </p>
        </Section>

        <Section title="Information stored on your device">
          <p>
            The website keeps a small amount of data in your browser&rsquo;s local
            storage (the iOS app keeps the equivalents in the app&rsquo;s own storage
            on your device). None of it leaves your device except as described in
            the next section, and clearing your browser&rsquo;s site data — or
            deleting the app — removes all of it:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <Item term="Your preferences">
              display mode, theme, motion, units, spelling, and the rest of the
              Settings page, plus small interface flags such as whether you have
              finished the welcome screen.
            </Item>
            <Item term="A random visitor identifier">
              a random string generated on your device the first time you use
              Pitwall IQ. It is derived from nothing about you or your device and
              cannot be used to identify you; it exists only so our usage counts
              can tell &ldquo;one person read eight pages&rdquo; apart from
              &ldquo;eight people read one page&rdquo;.
            </Item>
            <Item term="A visit identifier">
              a second random string that expires after 30 minutes of inactivity,
              so we can count visits.
            </Item>
            <Item term="Convenience records">
              for example, which Ask answers you have already rated, so the
              control remembers your choice.
            </Item>
          </ul>
          <p>We do not use cookies at all.</p>
        </Section>

        <Section title="Information we receive and store">
          <p>
            Our service records a short, fixed list of things, each kept with the
            random identifiers above rather than with anything about you:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <Item term="Usage events">
              which pages are viewed, which race sessions are opened (season,
              Grand Prix, session type), which features are used and for how
              long, whether Simple or Advanced mode was active, and when the
              interface hits an error or an unavailable session. The list of
              event types is fixed in our code — our service refuses anything
              else.
            </Item>
            <Item term="Ask questions">
              when you ask a question, we store the question text, the answer our
              analysis produced, which race it was about, how well the system
              handled it, and your thumbs-up or thumbs-down if you give one. This
              is how we decide what Ask should learn next.
            </Item>
            <Item term="Feedback reports">
              when you send a bug report or a suggestion, we store your message
              together with the page, race, and session you were on when you sent
              it.
            </Item>
            <Item term="Service health records">
              our server measures its own requests — which API path was called,
              whether it succeeded, and how long it took — so we can tell when
              something is broken or slow. These records describe our server, not
              you or your device.
            </Item>
          </ul>
          <p>
            On the website, we honour your browser&rsquo;s &ldquo;Do Not
            Track&rdquo; setting: if it is enabled, no usage events are sent at
            all. In private browsing, where no identifier can be stored, usage
            events are not sent either.
          </p>
        </Section>

        <Section title="What we do not collect">
          <p>
            We do not collect, and our analytics database has no place to store:
            IP addresses, cookies, device or browser fingerprints, user-agent
            strings, referrers, advertising identifiers, precise or approximate
            location, contacts, photos, or anything from elsewhere on your device.
            We do not track you across other apps or websites, and we show no
            advertising.
          </p>
        </Section>

        <Section title="How we use information">
          <p>
            Everything above is used for exactly two things: operating the
            service, and improving it — deciding what to build next, finding what
            is broken, and keeping the service fast. We do not sell information,
            we do not share it for advertising or marketing, and we do not build
            profiles of people.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            Pitwall IQ runs on infrastructure operated by service providers who
            process data on our behalf, only to provide the service:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <Item term="Cloudflare">
              delivers the website. Like any host, it processes your IP address
              transiently to serve you the page.
            </Item>
            <Item term="Render">
              runs our API and the database that holds the records described
              above. Connections to it necessarily carry your IP address, which
              may appear briefly in routine, short-lived infrastructure logs; we
              never copy IP addresses into our own records.
            </Item>
            <Item term="Formula 1 media servers">
              driver portrait photographs are public images loaded by your device
              directly from Formula 1&rsquo;s media servers, which — as with any
              image on the web — see your IP address when the image is fetched.
              All race data itself is fetched by our servers, not by your device.
            </Item>
            <Item term="Anthropic">
              when our optional wording assistance is enabled, the text of an Ask
              question and the answer our own analysis computed may be sent to
              Anthropic&rsquo;s AI service purely to improve the phrasing. No
              identifiers accompany it, and every fact in the answer comes from
              our analysis, not from the AI.
            </Item>
          </ul>
          <p>
            Depending on where you are, this processing may involve transferring
            data to servers in another country. All connections to our service
            are encrypted in transit (HTTPS).
          </p>
        </Section>

        <Section title="How long we keep things">
          <ul className="ml-4 list-disc space-y-2">
            <Item term="Usage events">
              deleted after 90 days. Before deletion they are reduced to daily
              totals (&ldquo;how many session opens on this day&rdquo;) that
              contain no identifiers.
            </Item>
            <Item term="Ask questions">deleted after 400 days.</Item>
            <Item term="Feedback reports">
              deleted after roughly two years — a bug report stays useful until
              it is fixed.
            </Item>
            <Item term="Emails you send us">
              kept as long as needed to deal with what you wrote about.
            </Item>
          </ul>
        </Section>

        <Section title="Your choices and deletion">
          <p>
            Because nothing we store is tied to your identity, the strongest
            privacy control is already in your hands: clearing the site&rsquo;s
            browser data (or deleting the app) removes your preferences and your
            random identifiers, permanently severing any link between your device
            and the usage counts on our side.
          </p>
          <p>
            You can also email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-dotted underline-offset-2 hover:text-white">{CONTACT_EMAIL}</a>{" "}
            to ask what we hold or to request deletion. One honest caveat:
            because our records are anonymous, we usually cannot tell which rows
            are yours unless you can point us at them — for example by quoting a
            question or feedback message you submitted. Anything you identify
            that way, we will delete.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All traffic between your device and our service is encrypted. The
            stored records are readable only through an authenticated,
            single-administrator interface, and — the stronger protection — they
            simply do not contain identities, payment details, or credentials
            that could be lost.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Pitwall IQ is a general-audience product about motorsport. It has no
            accounts, no social features, and does not knowingly collect personal
            information from anyone, including children under 13. If you believe
            a child has sent us personal information — for example in a feedback
            message — email us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If what Pitwall IQ collects ever changes, this page changes with it,
            and the date at the top is updated. A change that meaningfully
            expands what we collect will be called out in the product, not
            slipped into a document nobody re-reads.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy, or about your data:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline decoration-dotted underline-offset-2 hover:text-white">{CONTACT_EMAIL}</a>.
            For anything else, see{" "}
            <Link href="/support" className="text-ink underline decoration-dotted underline-offset-2 hover:text-white">Support</Link>.
          </p>
        </Section>

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-1.5 text-[13.5px] text-ink-muted
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
