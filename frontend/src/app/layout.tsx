import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider, NO_FLASH_SCRIPT } from "@/lib/prefs";
import { SpellingBridge } from "@/lib/locale";
import { NavHistoryProvider } from "@/lib/nav";
import { TourProvider } from "@/lib/tour";
import { GuidedTour } from "@/components/ui/GuidedTour";

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
          <NavHistoryProvider>
            {/* The tour crosses pages, so it cannot be owned by one — a page
                that unmounts halfway through a sentence takes the tour with
                it. See lib/tour.tsx. */}
            <TourProvider>
              {children}
              <GuidedTour />
            </TourProvider>
          </NavHistoryProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
