import { CREDITS_PER_SECOND } from "@/lib/credits";

export const CLIP_DURATION_SEC = 5;
export const VIDEO_DURATIONS = [5, 10, 15, 30, 45, 60] as const;
export type VideoDurationSec = (typeof VIDEO_DURATIONS)[number];
export const MOVIE_SCENE_COUNT = 3;
export const MAX_MOVIE_SCENES = 12;

export function isVideoDuration(value: number): value is VideoDurationSec {
  return (VIDEO_DURATIONS as readonly number[]).includes(value);
}

export function sceneCountForDuration(durationSec: VideoDurationSec) {
  return durationSec / CLIP_DURATION_SEC;
}

export type MovieScene = {
  title: string;
  narration: string;
  visualPrompt: string;
  referenceNote: string;
  motionPrompt?: string;
};

export function movieCreditCost(sceneCount: number, _firstHasImage = false) {
  if (sceneCount <= 0) return 0;
  return sceneCount * CLIP_DURATION_SEC * CREDITS_PER_SECOND;
}

export function parseMovieScenes(value: unknown, maxCount = MAX_MOVIE_SCENES): MovieScene[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const limit = Math.min(MAX_MOVIE_SCENES, Math.max(1, maxCount));
  const scenes: MovieScene[] = [];
  for (const item of value.slice(0, limit)) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
    const narration = typeof record.narration === "string" ? record.narration.trim().slice(0, 1200) : "";
    const visualPrompt = typeof record.visualPrompt === "string" ? record.visualPrompt.trim().slice(0, 1200) : "";
    const referenceNote =
      typeof record.referenceNote === "string" ? record.referenceNote.trim().slice(0, 240) : "";
    const motionPrompt = typeof record.motionPrompt === "string" ? record.motionPrompt.trim().slice(0, 500) : "";
    if (title.length < 2 || narration.length < 20 || visualPrompt.length < 12) return null;
    scenes.push({
      title,
      narration,
      visualPrompt,
      referenceNote: referenceNote || "Keep the same subject, wardrobe, and lighting in every scene.",
      ...(motionPrompt ? { motionPrompt } : {}),
    });
  }
  return scenes.length > 0 ? scenes : null;
}
