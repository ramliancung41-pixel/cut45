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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {FRAMES.map((frame) => (
        <figure key={frame.label} className="min-w-0">
          <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
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
            <figcaption className="absolute bottom-3 left-3 rounded-full border border-gray-800 bg-black/70 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur">
              {frame.label}
            </figcaption>
          </div>
        </figure>
      ))}
    </div>
  );
}
