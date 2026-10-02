export type CaptionCue = {
  text: string;
  start: number;
  end: number;
};

function cueSize(words: string[], index: number) {
  const remaining = words.length - index;
  if (remaining <= 3) return remaining;
  const first = words[index]?.replace(/[^a-z]/gi, "") ?? "";
  if (first.length > 0 && first.length <= 3) return 3;
  return 2;
}

export function buildCaptionCues(script: string): CaptionCue[] {
  const words = script.trim().split(/\s+/).filter(Boolean);
  const cues: CaptionCue[] = [];
  let index = 0;

  while (index < words.length) {
    const size = cueSize(words, index);
    const slice = words.slice(index, index + size);
    cues.push({
      text: slice.join(" "),
      start: index,
      end: index + slice.length,
    });
    index += slice.length;
  }

  return cues;
}

export function captionAtPlayhead(script: string, playhead: number) {
  const words = script.trim().split(/\s+/).filter(Boolean);
  const cues = buildCaptionCues(script);
  if (words.length === 0 || cues.length === 0) return "";

  const wordIndex = Math.min(
    words.length - 1,
    Math.floor(Math.min(Math.max(playhead, 0), 0.999) * words.length),
  );
  const cue = cues.find((item) => wordIndex >= item.start && wordIndex < item.end);
  return cue?.text ?? cues[cues.length - 1].text;
}
