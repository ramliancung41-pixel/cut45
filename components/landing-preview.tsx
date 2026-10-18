const SHOWCASES = [
  {
    src: "/landing/cut45-pixar-robot.mp4",
    label: "Cute 3D robot exploring a glowing bioluminescent forest.",
    border: "from-cyan-300/80 via-amber-200/40 to-teal-400/70",
    glow: "shadow-[0_0_42px_rgba(45,212,191,0.32)]",
  },
  {
    src: "/landing/cut45-anime-magic.mp4",
    label: "3D anime character leaping through glowing magic rings.",
    border: "from-fuchsia-400/80 via-amber-200/35 to-violet-500/70",
    glow: "shadow-[0_0_42px_rgba(217,70,239,0.32)]",
  },
  {
    src: "/landing/cut45-cyber-city.mp4",
    label: "Cyberpunk character in a neon city with volumetric rain light.",
    border: "from-cyan-300/80 via-fuchsia-400/40 to-blue-500/70",
    glow: "shadow-[0_0_42px_rgba(34,211,238,0.32)]",
  },
  {
    src: "/landing/cut45-clay-diorama.mp4",
    label: "Claymation miniature village on a floating island under studio light.",
    border: "from-amber-200/80 via-white/30 to-emerald-300/70",
    glow: "shadow-[0_0_42px_rgba(251,191,36,0.28)]",
  },
] as const;

export function LandingPreview() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {SHOWCASES.map((frame) => (
        <figure key={frame.src} className="min-w-0">
          <div className={`rounded-2xl bg-gradient-to-br p-px ${frame.border} ${frame.glow}`}>
            <div className="relative aspect-[9/16] overflow-hidden rounded-[15px] bg-black">
              <video
                src={frame.src}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-label={frame.label}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
