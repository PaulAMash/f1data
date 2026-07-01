import Link from "next/link";
import { Github, Radar } from "lucide-react";

export function NavBar({ active }: { active?: "home" | "explorer" | "history" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-base-950/70 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
            <Radar size={16} className="text-accent-soft" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Pitwall<span className="text-accent-soft"> IQ</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/explorer" className={link(active === "explorer")}>Race Explorer</Link>
          <Link href="/history" className={link(active === "history")}>Historical</Link>
          <a
            href="https://github.com/darshjoshi/pitwall"
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-muted hover:text-ink"
          >
            <Github size={15} /> <span className="hidden sm:inline">pitwall</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

function link(active: boolean) {
  return `rounded-lg px-3 py-1.5 transition-colors ${
    active ? "text-ink bg-white/[0.05]" : "text-ink-muted hover:text-ink hover:bg-white/[0.04]"
  }`;
}
