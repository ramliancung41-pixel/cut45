import { NextResponse, type NextRequest } from "next/server";
import { renderStudioImage } from "@/lib/fal-image";
import { parseReferenceImage } from "@/lib/fal-video";
import { DEFAULT_IMAGE_ASPECT, isImageAspectId } from "@/lib/image-aspects";
import { DEFAULT_IMAGE_MODEL, getImageModel, isImageModelId } from "@/lib/image-models";
import { composeImagePrompt, isImageStyleId } from "@/lib/image-styles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    style?: unknown;
    model?: unknown;
    aspect?: unknown;
    referenceImage?: unknown;
  } | null;

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const styleValue = typeof body?.style === "string" ? body.style : "";
  const style = styleValue && isImageStyleId(styleValue) ? styleValue : null;
  if (styleValue && !style) {
    return NextResponse.json({ error: "Choose a style preset from the list." }, { status: 400 });
  }

  const modelValue = typeof body?.model === "string" ? body.model : DEFAULT_IMAGE_MODEL;
  if (!isImageModelId(modelValue)) {
    return NextResponse.json({ error: "Choose an image model from the list." }, { status: 400 });
  }
  const model = getImageModel(modelValue);
  const aspectValue = typeof body?.aspect === "string" ? body.aspect : DEFAULT_IMAGE_ASPECT;
  if (!isImageAspectId(aspectValue)) {
    return NextResponse.json({ error: "Choose an aspect ratio from the list." }, { status: 400 });
  }

  const composed = composeImagePrompt(prompt, style);
  if (composed.length < 3) {
    return NextResponse.json({ error: "Write a style prompt or pick a preset." }, { status: 400 });
  }

  const image = parseReferenceImage(body?.referenceImage);
  if (image === "invalid") {
    return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP input image." }, { status: 400 });
  }

  try {
    const rendered = await renderStudioImage({
      prompt: composed,
      model: model.id,
      aspect: aspectValue,
      image,
      signal: request.signal,
    });
    if ("error" in rendered) {
      console.error("Fal image generation failed", rendered.error);
      return NextResponse.json({ error: rendered.error }, { status: 502 });
    }
    return NextResponse.json({
      id: `img_${Date.now().toString(36)}`,
      imageUrl: rendered.imageUrl,
      prompt: composed,
      model: model.id,
      modelName: model.name,
      aspect: aspectValue,
      creditsCharged: model.credits,
    });
  } catch (error) {
    console.error("Fal image generation failed", error);
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Image generation was stopped." }, { status: 499 });
    }
    const message = error instanceof Error && error.message ? error.message : "Could not render that image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
