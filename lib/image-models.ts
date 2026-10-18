export const IMAGE_MODELS = [
  {
    id: "nano",
    name: "Nano Banana 2.1",
    shortName: "Nano Banana 2.1",
    badge: "LOW COST",
    credits: 10,
    note: "Default",
    textEndpoint: "fal-ai/nano-banana-2",
    editEndpoint: "fal-ai/nano-banana-2/edit",
    imageField: "image_urls",
    extras: { num_images: 1, output_format: "png", resolution: "1K" },
  },
  {
    id: "grok",
    name: "Grok",
    shortName: "Grok",
    badge: "TRENDING",
    credits: 12,
    textEndpoint: "xai/grok-imagine-image/v2.0/text-to-image",
    editEndpoint: "xai/grok-imagine-image/v2.0/edit",
    imageField: "image_urls",
    extras: { num_images: 1, resolution: "1k", quality: "low" },
  },
  {
    id: "kling",
    name: "Kling 3.0",
    shortName: "Kling 3.0",
    badge: "NEW",
    credits: 14,
    textEndpoint: "fal-ai/kling-image/v3/text-to-image",
    editEndpoint: "fal-ai/kling-image/v3/image-to-image",
    imageField: "image_url",
    extras: { num_images: 1, output_format: "png", resolution: "1K" },
  },
  {
    id: "flux2",
    name: "Flux 2 Pro",
    shortName: "Flux 2 Pro",
    badge: "HOT",
    credits: 18,
    textEndpoint: "fal-ai/flux-2-pro",
    editEndpoint: "fal-ai/flux-2-pro/edit",
    imageField: "image_urls",
    extras: { output_format: "png" },
  },
  {
    id: "seedream",
    name: "Seedream 5 Lite",
    shortName: "Seedream 5 Lite",
    badge: "LOW COST",
    credits: 8,
    textEndpoint: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    editEndpoint: "fal-ai/bytedance/seedream/v5/lite/edit",
    imageField: "image_urls",
    extras: { num_images: 1 },
  },
  {
    id: "gpt",
    name: "GPT Image 2",
    shortName: "GPT Image 2",
    badge: "NEW",
    credits: 22,
    textEndpoint: "openai/gpt-image-2",
    editEndpoint: "openai/gpt-image-2/edit",
    imageField: "image_urls",
    extras: { num_images: 1, quality: "medium", output_format: "png" },
  },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];
export type ImageModelBadge = (typeof IMAGE_MODELS)[number]["badge"];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "nano";

export function isImageModelId(value: string): value is ImageModelId {
  return IMAGE_MODELS.some((model) => model.id === value);
}

export function getImageModel(id: string | null | undefined) {
  return IMAGE_MODELS.find((model) => model.id === id) ?? IMAGE_MODELS[0];
}

export function imageModelCreditCost(id: string | null | undefined) {
  return getImageModel(id).credits;
}
