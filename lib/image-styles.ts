export const IMAGE_STYLE_CATEGORIES = [
  { id: "popular", label: "Popular" },
  { id: "artistic", label: "Artistic" },
  { id: "playful", label: "Playful" },
] as const;

export type ImageStyleCategory = (typeof IMAGE_STYLE_CATEGORIES)[number]["id"];

export const IMAGE_STYLES = [
  {
    id: "photoreal",
    name: "Photorealism",
    category: "popular",
    guidance: "Photorealistic photograph with natural skin texture, true-to-life color, and soft natural light.",
  },
  {
    id: "pixar",
    name: "Pixar 3D",
    category: "popular",
    guidance:
      "Pixar-style 3D animated film still with big expressive eyes, rounded shapes, subsurface skin, and warm cinematic light.",
  },
  {
    id: "portrait",
    name: "Cinematic Portrait",
    category: "popular",
    guidance: "Cinematic portrait with shallow depth of field, filmic color, and a dramatic key light.",
  },
  {
    id: "3d",
    name: "3D Animation",
    category: "popular",
    guidance:
      "Transform into a polished 3D animated character with rounded forms, soft studio light, and expressive features.",
  },
  {
    id: "watercolour",
    name: "Watercolour",
    category: "artistic",
    guidance: "Watercolour painting with soft bleeding washes, visible paper grain, and loose delicate edges.",
  },
  {
    id: "surreal",
    name: "Surreal",
    category: "artistic",
    guidance: "Surrealist dreamscape with impossible scale, melting forms, and an uncanny, dreamlike atmosphere.",
  },
  {
    id: "vangogh",
    name: "Van Gogh",
    category: "artistic",
    guidance: "Post-impressionist painting in the style of Van Gogh with swirling impasto brushstrokes and vivid blues and yellows.",
  },
  {
    id: "graffiti",
    name: "Graffiti",
    category: "artistic",
    guidance: "Street graffiti mural with bold spray-paint outlines, drips, vibrant colors, and a brick wall texture.",
  },
  {
    id: "oil",
    name: "Oil Painting",
    category: "artistic",
    guidance: "Oil painting with visible brush texture, rich pigment, and gallery lighting.",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    category: "artistic",
    guidance: "Cyberpunk style with neon rim light, rain-soaked color, and a futuristic wardrobe.",
  },
  {
    id: "cartoon",
    name: "Cartoon",
    category: "playful",
    guidance: "Bright 2D cartoon with thick clean outlines, flat bold colors, and exaggerated friendly expressions.",
  },
  {
    id: "pixel",
    name: "Pixel Art",
    category: "playful",
    guidance: "16-bit pixel art with a limited retro palette, crisp square pixels, and no anti-aliasing.",
  },
  {
    id: "funko",
    name: "Funko Pop",
    category: "playful",
    guidance:
      "Funko Pop vinyl collectible figure with an oversized square head, tiny body, glossy plastic finish, and product-photo lighting.",
  },
  {
    id: "anime",
    name: "Anime/Manga",
    category: "playful",
    guidance: "Anime and manga illustration with clean linework, cel shading, and expressive features.",
  },
] as const satisfies ReadonlyArray<{ id: string; name: string; category: ImageStyleCategory; guidance: string }>;

export type ImageStyleId = (typeof IMAGE_STYLES)[number]["id"];

export function isImageStyleId(value: string): value is ImageStyleId {
  return IMAGE_STYLES.some((style) => style.id === value);
}

export function imageStyleName(id: ImageStyleId) {
  return IMAGE_STYLES.find((style) => style.id === id)?.name ?? id;
}

const CONVERSATIONAL =
  /^(hi|hello|hey|sure|okay|ok|thanks|thank you|of course|absolutely|great|here(?:'s| is)|let me|i can|i will|i'll|do you|would you|want me|what is the video|please tell|note:|reply:)/i;

function visualFieldsFromJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof value.characterSheetPrompt === "string") parts.push(value.characterSheetPrompt);
    if (typeof value.visualPrompt === "string") parts.push(value.visualPrompt);
    if (Array.isArray(value.scenes)) {
      for (const scene of value.scenes) {
        if (!scene || typeof scene !== "object") continue;
        const visual = (scene as { visualPrompt?: unknown }).visualPrompt;
        if (typeof visual === "string") parts.push(visual);
      }
    }
    return parts.map((part) => part.trim()).filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

function isConversational(line: string) {
  const clean = line.trim();
  if (!clean) return true;
  if (clean.endsWith("?") && clean.split(/\s+/).length < 18) return true;
  return CONVERSATIONAL.test(clean);
}

export function sanitizeVisualPrompt(prompt: string) {
  const fromJson = visualFieldsFromJson(prompt);
  const source = (fromJson || prompt).replace(/```(?:json)?/gi, " ");
  const lines = source
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^(scene script|image prompt|motion prompt|character reference sheet|voiceover|narration)\s*:\s*/gim, "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  const visual = lines.filter((line) => !isConversational(line));
  return (visual.length > 0 ? visual : lines).join(" ").replace(/\s+/g, " ").trim().slice(0, 800);
}

export function composeImagePrompt(prompt: string, style: ImageStyleId | null) {
  const guidance = style ? IMAGE_STYLES.find((item) => item.id === style)?.guidance ?? "" : "";
  return [sanitizeVisualPrompt(prompt), guidance].filter(Boolean).join(" ").slice(0, 800);
}
