export const IMAGE_ASPECTS = [
  { id: "21:9", label: "21:9", note: "Ultrawide" },
  { id: "16:9", label: "16:9", note: "Landscape" },
  { id: "4:3", label: "4:3", note: "Standard" },
  { id: "1:1", label: "1:1", note: "Square" },
  { id: "3:4", label: "3:4", note: "Portrait" },
  { id: "9:16", label: "9:16", note: "Vertical" },
] as const;

export type ImageAspectId = (typeof IMAGE_ASPECTS)[number]["id"];

export const DEFAULT_IMAGE_ASPECT: ImageAspectId = "16:9";

const FLUX_SIZE: Record<ImageAspectId, string | { width: number; height: number }> = {
  "21:9": { width: 1920, height: 824 },
  "16:9": "landscape_16_9",
  "4:3": "landscape_4_3",
  "1:1": "square_hd",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
};

const SEEDREAM_SIZE: Record<ImageAspectId, { width: number; height: number }> = {
  "21:9": { width: 3360, height: 1440 },
  "16:9": { width: 2560, height: 1440 },
  "4:3": { width: 2560, height: 1920 },
  "1:1": { width: 2048, height: 2048 },
  "3:4": { width: 1920, height: 2560 },
  "9:16": { width: 1440, height: 2560 },
};

export function isImageAspectId(value: string): value is ImageAspectId {
  return IMAGE_ASPECTS.some((item) => item.id === value);
}

export function getImageAspect(id: string | null | undefined) {
  return IMAGE_ASPECTS.find((item) => item.id === id) ?? IMAGE_ASPECTS[1];
}

export function imageAspectFrameClass(id: ImageAspectId) {
  if (id === "21:9") return "aspect-[21/9]";
  if (id === "16:9") return "aspect-video";
  if (id === "4:3") return "aspect-[4/3]";
  if (id === "1:1") return "aspect-square";
  if (id === "3:4") return "aspect-[3/4]";
  return "aspect-[9/16]";
}

export function falImageAspectFields(
  modelId: "nano" | "grok" | "kling" | "flux2" | "seedream" | "gpt",
  aspect: ImageAspectId,
) {
  if (modelId === "seedream") return { image_size: SEEDREAM_SIZE[aspect] };
  if (modelId === "flux2" || modelId === "gpt") return { image_size: FLUX_SIZE[aspect] };
  return { aspect_ratio: aspect };
}
