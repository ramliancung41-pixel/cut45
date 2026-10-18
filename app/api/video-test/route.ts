import { NextResponse } from "next/server";
import { renderFalClip } from "@/lib/fal-video";
import { BUDGET_GENERATION_COST, ULTRA_GENERATION_COST } from "@/lib/credits";
import { PROMPT_MAX } from "@/lib/motion-styles";
import { getVoice } from "@/lib/voices";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STYLES = ["realistic", "cinematic", "anime"] as const;
type TestStyle = (typeof STYLES)[number];

const STYLE_LOOK: Record<TestStyle, string> = {
  realistic: "photoreal, natural light, handheld documentary",
  cinematic: "cinematic widescreen lighting, shallow depth, film grain",
  anime: "anime illustration, clean linework, expressive motion",
};

function isStyle(value: unknown): value is TestStyle {
  return typeof value === "string" && (STYLES as readonly string[]).includes(value);
}

function engineForStyle(style: TestStyle) {
  return style === "cinematic" ? "ultra" : "budget";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    step?: unknown;
    prompt?: unknown;
    style?: unknown;
    script?: unknown;
    visualPrompt?: unknown;
  } | null;

  const step = body?.step;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const style = isStyle(body?.style) ? body.style : null;
  if (!style || prompt.length < 3 || prompt.length > PROMPT_MAX) {
    return NextResponse.json({ error: "Enter a prompt and choose a style." }, { status: 400 });
  }

  try {
    if (step === "script") {
      const planned = await writeTestScript(prompt, style, request.signal);
      return NextResponse.json(planned);
    }
    if (step === "voice") {
      const script = typeof body?.script === "string" ? body.script.trim() : "";
      if (script.length < 20) {
        return NextResponse.json({ error: "The script is too short to voice." }, { status: 400 });
      }
      const audioSrc = await synthesizeTestVoice(script.slice(0, 1600), request.signal);
      return NextResponse.json({ audioSrc });
    }
    if (step === "video") {
      const visualPrompt = typeof body?.visualPrompt === "string" ? body.visualPrompt.trim() : "";
      if (visualPrompt.length < 12) {
        return NextResponse.json({ error: "The visual prompt is too short." }, { status: 400 });
      }
      const engine = engineForStyle(style);
      const rendered = await renderFalClip({
        engine,
        prompt: `${STYLE_LOOK[style]}. Vertical 9:16 medium close-up, faces and mouths visible, characters speaking. No on-screen text. ${visualPrompt}`.slice(0, 1200),
        image: null,
        signal: request.signal,
      });
      if ("pending" in rendered) {
        return NextResponse.json(
          { pending: true, statusUrl: rendered.statusUrl, responseUrl: rendered.responseUrl },
          { status: 202 },
        );
      }
      if ("error" in rendered) {
        console.error("[fal] video render failed", rendered.error);
        return NextResponse.json({ error: rendered.error }, { status: 502 });
      }
      return NextResponse.json({
        videoUrl: rendered.videoUrl,
        engine,
        credits: engine === "ultra" ? ULTRA_GENERATION_COST : BUDGET_GENERATION_COST,
      });
    }
    return NextResponse.json({ error: "Unknown test step." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The test step failed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}

async function writeTestScript(prompt: string, style: TestStyle, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing from the server environment.");

  const endpoint = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  endpoint.searchParams.set("key", apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: `Return JSON only: {"script":"...","visualPrompt":"..."}. script is direct dialogue, each line Name: "spoken line", two characters, 90 to 120 spoken words. visualPrompt is 40 to 70 words, 9:16 medium close-up, faces and mouths visible, no on-screen text. Style: ${STYLE_LOOK[style]}.`,
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 800,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message?.slice(0, 240) || "Gemini could not write the script.");
  }
  const raw = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const parsed = parsePlan(raw);
  if (!parsed) throw new Error("Gemini returned an unreadable script.");
  return parsed;
}

function parsePlan(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as { script?: unknown; visualPrompt?: unknown };
    const script = typeof value.script === "string" ? value.script.trim() : "";
    const visualPrompt = typeof value.visualPrompt === "string" ? value.visualPrompt.trim() : "";
    if (script.length < 20 || visualPrompt.length < 12) return null;
    return { script, visualPrompt };
  } catch {
    return null;
  }
}

async function synthesizeTestVoice(script: string, signal: AbortSignal) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  const voiceId = getVoice("rachel")?.elevenLabsVoiceId;
  if (!voiceId) throw new Error("A narration voice is not configured.");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    signal,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: script,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs could not render the voice (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("ElevenLabs returned an empty voice track.");
  return `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}
