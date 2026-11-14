"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const modes = [
  { href: "/generator", label: "Website & Video Builder" },
  { href: "/news-podcast", label: "AI News Studio" },
] as const;

export function StudioModeBar() {
  const pathname = usePathname();
  const news = pathname.startsWith("/news-podcast");

  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-[#07090e]/80 px-4 py-3 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <Link href="/" className="text-sm font-semibold tracking-wide text-white">
          CUT45
        </Link>
        <nav className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs sm:text-sm" aria-label="Studios">
          {modes.map((mode) => {
            const active = mode.href === "/news-podcast" ? news : !news;
            return (
              <Link
                key={mode.href}
                href={mode.href}
                className={`rounded-full px-3 py-1.5 ${active ? "bg-white text-black" : "text-zinc-300"}`}
              >
                {mode.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
