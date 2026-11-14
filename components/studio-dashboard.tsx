import Link from "next/link";

const studios = [
  {
    href: "/generator",
    title: "Website & Video Builder",
    detail: "Templates, the page builder, and saved video work.",
  },
  {
    href: "/news-podcast",
    title: "AI News Studio",
    detail: "A vertical news conversation with hosts, images, and subtitles.",
  },
] as const;

export function StudioDashboard() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#07090e] text-zinc-100">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-16">
        <header>
          <p className="text-xs tracking-[0.22em] text-zinc-500 uppercase">Cut45</p>
          <h1 className="mt-3 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-4xl font-semibold text-transparent">
            Studio
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">Choose a workspace. You can switch again from the bar inside either tool.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          {studios.map((studio) => (
            <Link
              key={studio.href}
              href={studio.href}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition hover:border-indigo-300/40"
            >
              <h2 className="text-lg font-medium">{studio.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{studio.detail}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
