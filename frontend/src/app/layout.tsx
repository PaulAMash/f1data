import type { Metadata } from "next";
import "./globals.css";
import { ModeProvider } from "@/lib/mode";

export const metadata: Metadata = {
  title: "Pitwall IQ — F1 Race Intelligence",
  description:
    "Ask why a race unfolded the way it did. Explore strategy, pace, tyres, pit stops, weather and race control — built on real F1 data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <ModeProvider>{children}</ModeProvider>
      </body>
    </html>
  );
}
