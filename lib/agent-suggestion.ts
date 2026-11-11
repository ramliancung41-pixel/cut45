import { DEFAULT_IMAGE_ASPECT, IMAGE_ASPECTS, isImageAspectId, type ImageAspectId } from "@/lib/image-aspects";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  getImageModel,
  imageModelCreditCost,
  isImageModelId,
  type ImageModelId,
} from "@/lib/image-models";
import { isImageStyleId, type ImageStyleId } from "@/lib/image-styles";
import { clipCredits, VOICE_PREMIUM_CREDITS } from "@/lib/pricing.config";

const PAGE_ASPECTS = ["9:16", "1:1", "16:9"] as const;
type PageAspect = (typeof PAGE_ASPECTS)[number];
const PAGE_RESOLUTIONS = ["360p", "720p", "1080p"] as const;
type PageResolution = (typeof PAGE_RESOLUTIONS)[number];

function isPageAspect(value: string): value is PageAspect {
  return (PAGE_ASPECTS as readonly string[]).includes(value);
}

export type AgentSuggestion =
  | {
      kind: "video";
      title: string;
      prompt: string;
      model: string;
      aspect: PageAspect;
      durationSec: 5 | 10;
      resolution?: PageResolution;
      voice?: "none";
    }
  | {
      kind: "image";
      title: string;
      prompt: string;
      model: ImageModelId;
      aspect: ImageAspectId;
      style?: ImageStyleId;
    };

export function agentModelGuide() {
  const image = IMAGE_MODELS.map((model) => `${model.id} = ${model.name} (${model.badge.toLowerCase()})`).join("; ");
  const aspects = IMAGE_ASPECTS.map((aspect) => aspect.id).join(", ");
  return `Image models: ${image}. Image aspect: ${aspects}.`;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? Array.from(value.trim()).slice(0, max).join("").trim() : "";
}

export function parseAgentSuggestion(value: unknown, maxPrompt: number): AgentSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const prompt = text(record.prompt, maxPrompt);
  if (prompt.length < 3) return null;
  const model = typeof record.model === "string" ? record.model : "";
  const aspect = typeof record.aspect === "string" ? record.aspect : "";

  if (record.kind === "video") {
    const title = text(record.title, 60) || "Generate Video";
    return {
      kind: "video",
      title,
      prompt,
      model: model || "wan",
      aspect: isPageAspect(aspect) ? aspect : "9:16",
      durationSec: typeof record.durationSec === "number" && record.durationSec >= 10 ? 10 : 5,
      ...(typeof record.resolution === "string" && (PAGE_RESOLUTIONS as readonly string[]).includes(record.resolution)
        ? { resolution: record.resolution as PageResolution }
        : {}),
      ...(record.voice === "none" ? { voice: "none" as const } : {}),
    };
  }

  if (record.kind === "image") {
    const title = text(record.title, 60) || "Generate Image";
    return {
      kind: "image",
      title,
      prompt,
      model: isImageModelId(model) ? model : DEFAULT_IMAGE_MODEL,
      aspect: isImageAspectId(aspect) ? aspect : DEFAULT_IMAGE_ASPECT,
      ...(typeof record.style === "string" && isImageStyleId(record.style) ? { style: record.style } : {}),
    };
  }

  return null;
}

export function suggestionModelName(suggestion: AgentSuggestion) {
  return suggestion.kind === "video" ? suggestion.model : getImageModel(suggestion.model).name;
}

export function suggestionHasVoice(suggestion: AgentSuggestion, voiceoverPlugin: boolean) {
  return suggestion.kind === "video" && voiceoverPlugin && suggestion.voice !== "none";
}

export function suggestionCreditCost(suggestion: AgentSuggestion, voiceoverPlugin = false) {
  return suggestion.kind === "video"
    ? clipCredits("Veo", "720p", suggestion.durationSec) +
        (suggestionHasVoice(suggestion, voiceoverPlugin) ? VOICE_PREMIUM_CREDITS : 0)
    : imageModelCreditCost(suggestion.model);
}

export function suggestionResolution(suggestion: Extract<AgentSuggestion, { kind: "video" }>) {
  return suggestion.resolution ?? "720p";
}
