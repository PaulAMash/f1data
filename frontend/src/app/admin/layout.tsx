import type { Metadata } from "next";

/* page.tsx below is "use client" and cannot export metadata itself — this
 * layout is the whole reason it exists. Belt-and-braces with robots.ts'
 * disallow: that stops crawling, this stops indexing if the URL is ever
 * reached some other way (a link, a bookmark, a referrer header). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
