import { BUDGET_GENERATION_COST, EXTEND_VIDEO_COST, BUDGET_IMAGE_GENERATION_COST } from "@/lib/credits";

export const MOVIE_SCENE_COUNT = 3;

export type MovieScene = {
  title: string;
  narration: string;
  visualPrompt: string;
  referenceNote: string;
};

export function movieCreditCost(sceneCount: number, firstHasImage: boolean) {
  if (sceneCount <= 0) return 0;
  const first = firstHasImage ? BUDGET_IMAGE_GENERATION_COST : BUDGET_GENERATION_COST;
  return first + Math.max(0, sceneCount - 1) * EXTEND_VIDEO_COST;
}

export function parseMovieScenes(value: unknown): MovieScene[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const scenes: MovieScene[] = [];
  for (const item of value.slice(0, MOVIE_SCENE_COUNT)) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
    const narration = typeof record.narration === "string" ? record.narration.trim().slice(0, 1200) : "";
    const visualPrompt = typeof record.visualPrompt === "string" ? record.visualPrompt.trim().slice(0, 800) : "";
    const referenceNote =
      typeof record.referenceNote === "string" ? record.referenceNote.trim().slice(0, 240) : "";
    if (title.length < 2 || narration.length < 20 || visualPrompt.length < 12) return null;
    scenes.push({
      title,
      narration,
      visualPrompt,
      referenceNote: referenceNote || "Keep the same subject, wardrobe, and lighting in every scene.",
    });
  }
  return scenes.length > 0 ? scenes : null;
}
