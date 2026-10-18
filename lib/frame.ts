export const FRAME_ASPECTS = [
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
] as const;

export type AspectRatio = (typeof FRAME_ASPECTS)[number]["id"];

export function isAspectRatio(value: string): value is AspectRatio {
  return FRAME_ASPECTS.some((item) => item.id === value);
}

export function frameSize(aspect: AspectRatio) {
  if (aspect === "16:9") return { width: 1920, height: 1080 };
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

export function frameCue(aspect: AspectRatio | string | null | undefined) {
  if (aspect === "16:9") return "Widescreen 16:9";
  if (aspect === "1:1") return "Square 1:1";
  return "Vertical 9:16";
}
