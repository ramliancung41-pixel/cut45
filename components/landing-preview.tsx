const SHOWCASES = [
  {
    id: "studio",
    label: "Studio landing page with a hero and three features.",
    border: "from-cyan-300/80 via-amber-200/40 to-teal-400/70",
    glow: "shadow-[0_0_42px_rgba(45,212,191,0.32)]",
    wash: "from-cyan-400/30 to-teal-900/40",
  },
  {
    id: "product",
    label: "Product page with a price block and a call to action.",
    border: "from-fuchsia-400/80 via-amber-200/35 to-violet-500/70",
    glow: "shadow-[0_0_42px_rgba(217,70,239,0.32)]",
    wash: "from-fuchsia-400/30 to-violet-950/40",
  },
  {
    id: "portfolio",
    label: "Portfolio with an introduction and selected work.",
    border: "from-cyan-300/80 via-fuchsia-400/40 to-blue-500/70",
    glow: "shadow-[0_0_42px_rgba(34,211,238,0.32)]",
    wash: "from-sky-400/30 to-blue-950/40",
  },
  {
    id: "waitlist",
    label: "Waitlist page with a headline and an email capture.",
    border: "from-amber-200/80 via-white/30 to-emerald-300/70",
    glow: "shadow-[0_0_42px_rgba(251,191,36,0.28)]",
    wash: "from-amber-300/30 to-emerald-950/40",
  },
] as const;

export function LandingPreview() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {SHOWCASES.map((frame) => (
        <figure key={frame.id} className="min-w-0">
          <div className={`rounded-2xl bg-gradient-to-br p-px ${frame.border} ${frame.glow}`}>
            <div className={`relative flex aspect-[9/16] flex-col justify-end overflow-hidden rounded-[15px] bg-gradient-to-b p-4 ${frame.wash}`}>
              <p className="text-sm leading-5 text-white">{frame.label}</p>
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
