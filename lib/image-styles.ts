export const IMAGE_STYLES = [
  {
    id: "3d",
    name: "3D Animation",
    guidance:
      "Transform into a polished 3D animated character with rounded forms, soft studio light, and expressive features.",
  },
  {
    id: "portrait",
    name: "Cinematic Portrait",
    guidance: "Cinematic portrait with shallow depth of field, filmic color, and a dramatic key light.",
  },
  {
    id: "anime",
    name: "Anime/Manga",
    guidance: "Anime and manga illustration with clean linework, cel shading, and expressive features.",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    guidance: "Cyberpunk style with neon rim light, rain-soaked color, and a futuristic wardrobe.",
  },
  {
    id: "oil",
    name: "Oil Painting",
    guidance: "Oil painting with visible brush texture, rich pigment, and gallery lighting.",
  },
] as const;

export type ImageStyleId = (typeof IMAGE_STYLES)[number]["id"];

export function isImageStyleId(value: string): value is ImageStyleId {
  return IMAGE_STYLES.some((style) => style.id === value);
}

export function imageStyleName(id: ImageStyleId) {
  return IMAGE_STYLES.find((style) => style.id === id)?.name ?? id;
}

export function composeImagePrompt(prompt: string, style: ImageStyleId | null) {
  const guidance = style ? IMAGE_STYLES.find((item) => item.id === style)?.guidance ?? "" : "";
  return [prompt.trim(), guidance].filter(Boolean).join(" ").slice(0, 800);
}
