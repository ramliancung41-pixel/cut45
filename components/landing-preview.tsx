type VideoFrame = {
  kind: "video";
  src: string;
  label: string;
};

type SceneFrame = {
  kind: "scene";
  src: string;
  label: string;
  alt: string;
  motion: "preview-cruise" | "preview-descent";
  rain?: boolean;
};

const FRAMES: Array<VideoFrame | SceneFrame> = [
  {
    kind: "scene",
    src: "/landing/cut45-cyberpunk-hypercar.png",
    label: "0:00",
    alt: "Glossy chrome hypercar on a rain-slicked street under pink and cyan neon.",
    motion: "preview-cruise",
    rain: true,
  },
  {
    kind: "video",
    src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    label: "0:05",
  },
  {
    kind: "scene",
    src: "/landing/cut45-colony-descent.png",
    label: "0:10",
    alt: "Futuristic colony ship descending over an alien surface beneath ringed moons.",
    motion: "preview-descent",
  },
  {
    kind: "video",
    src: "https://upload.wikimedia.org/wikipedia/commons/9/93/Axonal_nerve_fibers_in_a_brain_-_the_neural_network_that_is_us.webm",
    label: "0:15",
  },
];

export function LandingPreview() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#070707]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-6 sm:px-8 sm:py-10 md:justify-center">
        {FRAMES.map((frame) => (
          <figure key={frame.label} className="w-32 shrink-0 snap-center sm:w-40 lg:w-44">
            <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              {frame.kind === "video" ? (
                <video
                  src={frame.src}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                <>
                  <img src={frame.src} alt={frame.alt} className={frame.motion} />
                  {frame.rain ? (
                    <div aria-hidden className="preview-rain pointer-events-none absolute inset-0" />
                  ) : null}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/35"
                  />
                </>
              )}
              <figcaption className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                {frame.label}
              </figcaption>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
