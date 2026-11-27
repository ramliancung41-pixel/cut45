export type TimedCue = {
  startSec?: number;
  endSec?: number;
  subtitleText?: string;
  voiceText?: string;
  [key: string]: unknown;
};

export type SubtitleAnchor = "bottom" | "lower-mid" | "top";

export const SUBTITLE_ANCHORS: Array<{ id: SubtitleAnchor; label: string; hint: string }> = [
  { id: "bottom", label: "Bottom", hint: "Safe lower area · ~7% from bottom" },
  { id: "lower-mid", label: "Lower-Mid", hint: "Above TikTok/Reels UI · ~16% from bottom" },
  { id: "top", label: "Top", hint: "Top safe area when bottom is crowded" },
];

/** MarginV as a fraction of frame height for ASS burn-in. */
export function marginVForAnchor(anchor: SubtitleAnchor, frameH: number): number {
  const h = Math.max(360, frameH);
  if (anchor === "top") return Math.round(h * 0.08);
  if (anchor === "lower-mid") return Math.round(h * 0.16);
  return Math.round(h * 0.07);
}

export function assAlignmentForAnchor(anchor: SubtitleAnchor): number {
  return anchor === "top" ? 8 : 2;
}

/**
 * Collapse overlapping / duplicate cues so only one caption is active at a time.
 */
export function mergeOverlappingCues<T extends TimedCue>(cues: T[]): T[] {
  const cleaned = cues
    .map((cue) => ({
      ...cue,
      startSec: Math.max(0, Number(cue.startSec) || 0),
      endSec: Math.max(0, Number(cue.endSec) || 0),
      subtitleText: String(cue.subtitleText || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((cue) => cue.subtitleText && cue.endSec - cue.startSec >= 0.2)
    .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);

  if (cleaned.length === 0) return [];

  const merged: typeof cleaned = [];
  for (const cue of cleaned) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(cue);
      continue;
    }
    const sameText = normalizeCompare(prev.subtitleText) === normalizeCompare(cue.subtitleText);
    const overlaps = cue.startSec < prev.endSec - 0.05;
    if (sameText && (overlaps || cue.startSec - prev.endSec < 0.35)) {
      prev.endSec = Math.max(prev.endSec, cue.endSec);
      continue;
    }
    if (overlaps) {
      // Prefer the newer cue; close the previous one just before it starts.
      const gap = Math.max(0.12, Math.min(0.35, (cue.endSec - cue.startSec) * 0.15));
      prev.endSec = Math.max(prev.startSec + 0.25, cue.startSec - gap);
      if (prev.endSec <= prev.startSec + 0.2) {
        merged.pop();
      }
    }
    merged.push(cue);
  }

  return merged.map((cue) => ({
    ...cue,
    subtitleText: wrapSubtitleLines(cue.subtitleText, 42),
  })) as T[];
}

/** Soft-wrap long captions to at most 2 balanced lines for on-screen readability. */
export function wrapSubtitleLines(text: string, maxChars = 42): string {
  const flat = text.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.includes("\n")) {
    return flat
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join("\n");
  }
  if (flat.length <= maxChars) return flat;
  const words = flat.split(" ");
  const lines: string[] = [""];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      lines[lines.length - 1] = next;
      continue;
    }
    if (lines.length >= 2) {
      lines[1] = `${lines[1]} ${word}`.trim();
      break;
    }
    lines.push(word);
  }
  if (lines.length === 2 && lines[1] && lines[1].length > maxChars + 8) {
    lines[1] = `${lines[1].slice(0, maxChars).trim()}…`;
  }
  return lines.filter(Boolean).slice(0, 2).join("\n");
}

function normalizeCompare(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function activeCueAt<T extends TimedCue>(cues: T[], timeSec: number): T | null {
  for (const cue of cues) {
    const start = cue.startSec ?? 0;
    const end = cue.endSec ?? 0;
    if (timeSec >= start && timeSec < end && (cue.subtitleText || "").trim()) return cue;
  }
  return null;
}
