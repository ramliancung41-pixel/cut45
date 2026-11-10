import {
  RESOLUTION_MULTIPLIER,
  VIDEO_CLIP_DURATIONS,
  VIDEO_RATE_MATRIX,
  VIDEO_RESOLUTIONS,
  VOICE_PREMIUM_CREDITS,
  findVideoModel,
  videoCreditQuote,
  type VideoRateKey,
} from "@/lib/video-models";

export type PricingView = "video" | "voice" | "compare";

const ROWS: Array<{ key: VideoRateKey; label: string; badge: string; tone: string }> = [
  { key: "Veo", label: "Wan 2.1", badge: "3 credits/sec", tone: "bg-sky-400/15 text-sky-200" },
];

export function VoiceSwitch({ withVoice, onChange }: { withVoice: boolean; onChange: (next: boolean) => void }) {
  const options = [
    { on: false, label: "Without Voice" },
    { on: true, label: `With Voice (+${VOICE_PREMIUM_CREDITS} Credits)` },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Voiceover pricing"
      className="relative grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-semibold sm:text-sm"
    >
      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-[transform,background-color] duration-300 ease-out ${
          withVoice ? "translate-x-full bg-violet-400" : "translate-x-0 bg-white"
        }`}
      />
      {options.map((option) => {
        const active = withVoice === option.on;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.on)}
            className={`relative z-10 rounded-full px-4 py-2 whitespace-nowrap transition-colors duration-300 ${
              active ? (option.on ? "text-white" : "text-black") : "text-zinc-300 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PricingMatrix({ view }: { view: PricingView }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-white/[0.03]">
            <th scope="col" rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-zinc-300">
              Model
            </th>
            <th scope="col" rowSpan={2} className="px-3 py-3 text-right text-xs font-semibold text-zinc-300">
              Rate
            </th>
            {VIDEO_RESOLUTIONS.map((resolution) => (
              <th
                key={resolution.id}
                scope="colgroup"
                colSpan={VIDEO_CLIP_DURATIONS.length}
                className="border-l border-white/[0.06] px-3 pt-3 pb-1 text-center text-xs font-semibold text-white"
              >
                {resolution.label}
                <span className="ml-1 font-normal text-zinc-500">{RESOLUTION_MULTIPLIER[resolution.id]}×</span>
              </th>
            ))}
          </tr>
          <tr className="bg-white/[0.03]">
            {VIDEO_RESOLUTIONS.flatMap((resolution) =>
              VIDEO_CLIP_DURATIONS.map((seconds, index) => (
                <th
                  key={`${resolution.id}-${seconds}`}
                  scope="col"
                  className={`px-3 pb-2.5 text-center text-[11px] font-medium text-zinc-500 ${index === 0 ? "border-l border-white/[0.06]" : ""}`}
                >
                  {seconds}s
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const entry = findVideoModel(row.key);
            return (
              <tr key={row.key} className="border-t border-white/[0.06] transition hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3 text-left font-medium text-white">
                  <span className="flex flex-wrap items-center gap-2">
                    {row.label}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${row.tone}`}>
                      {row.badge}
                    </span>
                  </span>
                </th>
                <td className="px-3 py-3 text-right text-xs text-zinc-400 tabular-nums">{VIDEO_RATE_MATRIX[row.key]}/s</td>
                {VIDEO_RESOLUTIONS.flatMap((resolution) =>
                  VIDEO_CLIP_DURATIONS.map((seconds, index) => {
                    const quote = videoCreditQuote(row.key, resolution.id, seconds);
                    const capped = Boolean(entry) && quote.resolution !== resolution.id;
                    const withVoice = quote.credits + VOICE_PREMIUM_CREDITS;
                    return (
                      <td
                        key={`${resolution.id}-${seconds}`}
                        className={`px-3 py-3 text-center tabular-nums ${index === 0 ? "border-l border-white/[0.06]" : ""}`}
                        title={capped ? `Renders and bills at ${quote.resolution} on this model` : undefined}
                      >
                        {view === "compare" ? (
                          <span className="flex flex-col items-center leading-tight">
                            <span className="text-zinc-100">{quote.credits}</span>
                            <span className="text-[11px] font-semibold text-violet-300">{withVoice}</span>
                          </span>
                        ) : (
                          <span
                            key={view}
                            className={`inline-block animate-[pricing-cell_260ms_ease-out] ${
                              view === "voice" ? "font-semibold text-violet-200" : "text-zinc-100"
                            }`}
                          >
                            {view === "voice" ? withVoice : quote.credits}
                          </span>
                        )}
                        {capped ? <sup className="ml-0.5 text-amber-300">*</sup> : null}
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PricingNotes() {
  return (
    <div className="grid gap-2 text-xs leading-5 text-zinc-400 sm:grid-cols-2">
      <p className="flex items-start gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2.5 text-violet-100">
        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
        Voice generation adds a flat +{VOICE_PREMIUM_CREDITS} credits fee per generation.
      </p>
      <p className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2.5">
        <span aria-hidden className="text-amber-300">*</span>
        A 5-second 720p clip costs 15 credits. A 10-second clip costs 30 credits.
      </p>
      <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:col-span-2">
        Credits are checked before the Veo render starts. A zero balance cannot generate a video.
      </p>
    </div>
  );
}
