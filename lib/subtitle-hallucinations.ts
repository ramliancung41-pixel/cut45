/** Known Whisper / model hallucination fingerprints that must never become subtitles. */

const HALLUCINATION_PATTERNS: RegExp[] = [
  /reid\s+boarded/i,
  /american\s+airlines\s+flight/i,
  /december\s+22,?\s*2001/i,
  /shoe\s*bomber/i,
  /richard\s+reid/i,
  /thank you for watching/i,
  /thanks for watching/i,
  /please\s+(like|subscribe|comment)/i,
  /subscribe\s+to\s+(my|the)\s+channel/i,
  /字幕由|由\s*Amara\.org/i,
  /www\.youtube\.com\/watch/i,
  /downloaded from/i,
  /transcribed by/i,
  /mbc\s*news/i,
  /bbc\s*news\s*world/i,
];

export function isHallucinatedSubtitle(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (HALLUCINATION_PATTERNS.some((pattern) => pattern.test(value))) return true;
  // Near-identical spam loops (classic Whisper silence hallucination).
  const words = value.toLowerCase().split(" ").filter(Boolean);
  if (words.length >= 8) {
    const unique = new Set(words);
    if (unique.size <= 3) return true;
  }
  return false;
}

export function filterHallucinatedSegments<T extends { text: string }>(segments: T[]): T[] {
  return segments.filter((segment) => !isHallucinatedSubtitle(segment.text));
}

export function assertNoHallucinatedCues(cues: Array<{ subtitleText?: string; voiceText?: string }>) {
  for (const cue of cues) {
    const text = `${cue.subtitleText || ""} ${cue.voiceText || ""}`;
    if (isHallucinatedSubtitle(text) && /(reid|american airlines|december 22|shoe.?bomb)/i.test(text)) {
      throw new Error("Transcription produced unrelated fallback text. Please retry — no sample subtitles were used.");
    }
  }
}
