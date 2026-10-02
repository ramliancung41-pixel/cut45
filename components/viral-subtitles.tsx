"use client";

import { captionAtPlayhead } from "@/lib/captions";

export function ViralSubtitles({
  script,
  playhead,
  visible,
}: {
  script: string;
  playhead: number;
  visible: boolean;
}) {
  if (!visible) return null;

  const line = captionAtPlayhead(script, playhead);
  if (!line) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3">
      <p key={line} className="viral-caption" aria-hidden>
        {line}
      </p>
    </div>
  );
}
