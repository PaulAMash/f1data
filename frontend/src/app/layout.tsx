import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider, NO_FLASH_SCRIPT } from "@/lib/prefs";

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
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
