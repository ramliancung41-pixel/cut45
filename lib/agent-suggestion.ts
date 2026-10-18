import { isAspectRatio, type AspectRatio } from "@/lib/frame";
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
import {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_MODELS,
  getVideoModel,
  isVideoModelId,
  isVideoResolution,
  videoClipCreditCost,
  videoClipDuration,
  type VideoClipDuration,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-models";

export type AgentSuggestion =
  | {
      kind: "video";
      title: string;
      prompt: string;
      model: VideoModelId;
      aspect: AspectRatio;
      durationSec: VideoClipDuration;
      resolution?: VideoResolution;
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
  const video = VIDEO_MODELS.map((model) => `${model.id} = ${model.name} (${model.tier}, ${model.note})`).join("; ");
  const image = IMAGE_MODELS.map((model) => `${model.id} = ${model.name} (${model.badge.toLowerCase()})`).join("; ");
  const aspects = IMAGE_ASPECTS.map((aspect) => aspect.id).join(", ");
  return `Video models: ${video}. Image models: ${image}. Video aspect: 9:16, 1:1, or 16:9. durationSec: 5 or 10. Image aspect: ${aspects}.`;
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
      model: isVideoModelId(model) ? model : DEFAULT_VIDEO_MODEL,
      aspect: isAspectRatio(aspect) ? aspect : "9:16",
      durationSec: videoClipDuration(typeof record.durationSec === "number" ? record.durationSec : 5),
      ...(typeof record.resolution === "string" && isVideoResolution(record.resolution)
        ? { resolution: record.resolution }
        : {}),
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
  return suggestion.kind === "video" ? getVideoModel(suggestion.model).name : getImageModel(suggestion.model).name;
}

export function suggestionCreditCost(suggestion: AgentSuggestion) {
  return suggestion.kind === "video"
    ? videoClipCreditCost(suggestion.model, suggestionResolution(suggestion), suggestion.durationSec)
    : imageModelCreditCost(suggestion.model);
}

export function suggestionResolution(suggestion: Extract<AgentSuggestion, { kind: "video" }>) {
  return suggestion.resolution ?? DEFAULT_VIDEO_RESOLUTION;
}
