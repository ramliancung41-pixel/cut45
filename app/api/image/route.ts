import { NextResponse, type NextRequest } from "next/server";
import { IMAGE_GENERATION_COST } from "@/lib/credits";
import { renderFluxImage } from "@/lib/fal-image";
import { parseReferenceImage } from "@/lib/fal-video";
import { composeImagePrompt, isImageStyleId } from "@/lib/image-styles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    style?: unknown;
    referenceImage?: unknown;
  } | null;

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const styleValue = typeof body?.style === "string" ? body.style : "";
  const style = styleValue && isImageStyleId(styleValue) ? styleValue : null;
  if (styleValue && !style) {
    return NextResponse.json({ error: "Choose a style preset from the list." }, { status: 400 });
  }

  const composed = composeImagePrompt(prompt, style);
  if (composed.length < 3) {
    return NextResponse.json({ error: "Write a style prompt or pick a preset." }, { status: 400 });
  }

  const image = parseReferenceImage(body?.referenceImage);
  if (image === "invalid" || !image) {
    return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP input image." }, { status: 400 });
  }

  try {
    const rendered = await renderFluxImage({
      prompt: composed,
      image,
      signal: request.signal,
    });
    if ("error" in rendered) {
      return NextResponse.json({ error: rendered.error }, { status: 502 });
    }
    return NextResponse.json({
      id: `img_${Date.now().toString(36)}`,
      imageUrl: rendered.imageUrl,
      prompt: composed,
      creditsCharged: IMAGE_GENERATION_COST,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Image generation was stopped." }, { status: 499 });
    }
    return NextResponse.json({ error: "Could not render that image." }, { status: 500 });
  }
}
