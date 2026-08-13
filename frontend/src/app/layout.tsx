import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider, NO_FLASH_SCRIPT } from "@/lib/prefs";
import { SpellingBridge } from "@/lib/locale";
import { NavHistoryProvider } from "@/lib/nav";
import { PageContextProvider } from "@/lib/pageContext";
import { TourProvider } from "@/lib/tour";
import { GuidedTour } from "@/components/ui/GuidedTour";
import { FeedbackDock } from "@/components/feedback/FeedbackDock";

export const metadata: Metadata = {
  title: "Pitwall IQ — F1 Race Intelligence",
  description:
    "Ask why a race unfolded the way it did. Explore strategy, pace, tyres, pit stops, weather and race control — built on real F1 data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script below writes data-theme onto this
    // element before React sees it, which is the entire point — the server
    // cannot know what the reader chose last time.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint. Without it the page renders in the default
            theme and is corrected a frame later, which is a flash of the wrong
            colour — the most common way a themed app gives itself away. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <PrefsProvider>
          {/* Renders nothing. Spells the rendered document the reader's way —
              see the note in lib/locale.tsx for why this is a document pass
              rather than four hundred call sites. */}
          <SpellingBridge />
          {/* The tour crosses pages, so it cannot be owned by one — a page
              that unmounts halfway through a sentence takes the tour with it.
              See lib/tour.tsx. */}
          <NavHistoryProvider>
            {/* Which race the reader has open, published by whichever page
                knows. The feedback box lives above the router — see
                lib/pageContext.tsx — so this is how a bug report arrives
                already knowing where it happened. */}
            <PageContextProvider>
              <TourProvider>
                {children}
                <GuidedTour />
                {/* Last, and a sibling of the page rather than a child of it:
                    `position: fixed` only means "the viewport" while no
                    ancestor carries a transform, and nearly every panel in
                    this product finishes an animation holding one. Same
                    reasoning as Modal's portal — see components/ui/Modal.tsx. */}
                <FeedbackDock />
              </TourProvider>
            </PageContextProvider>
          </NavHistoryProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
