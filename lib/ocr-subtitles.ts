import { filterHallucinatedSegments, isHallucinatedSubtitle } from "@/lib/subtitle-hallucinations";

export type OcrFrame = {
  timeSec: number;
  /** Raw base64 without data: prefix */
  imageBase64: string;
  mime?: string;
};

export type OcrCue = {
  timeSec: number;
  text: string;
};

const OCR_SYSTEM = `You read burned-in / hardcoded on-screen subtitles from video frames.
Rules:
- Only return text that is visibly written as captions/subtitles in the lower portion of the frame.
- Preserve the original language exactly (Malay, Chinese, Burmese, English, etc.). Do not translate.
- Ignore UI chrome (likes, comments, usernames, watermarks, stickers) unless it is clearly dialogue caption text.
- Never invent dialogue. If a frame has no readable subtitle, omit it.
- Never output unrelated encyclopedia or news prose.
Return JSON only: {"cues":[{"timeSec":number,"text":string}]}.`;

export async function readBurnedInSubtitles(options: {
  frames: OcrFrame[];
  geminiKey?: string;
  openaiKey?: string;
}): Promise<OcrCue[]> {
  const frames = options.frames
    .filter((frame) => frame.imageBase64 && Number.isFinite(frame.timeSec))
    .slice(0, 36);
  if (frames.length === 0) return [];

  if (options.geminiKey) {
    try {
      const cues = await geminiOcr(options.geminiKey, frames);
      if (cues.length) return cues;
    } catch {
      /* Fall through. */
    }
  }
  if (options.openaiKey) {
    try {
      const cues = await openaiOcr(options.openaiKey, frames);
      if (cues.length) return cues;
    } catch {
      /* Ignore OCR failure — audio path may still succeed. */
    }
  }
  return [];
}

async function geminiOcr(apiKey: string, frames: OcrFrame[]): Promise<OcrCue[]> {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-3.5-flash"];
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    {
      text: `Read burned-in subtitle text from these ${frames.length} frames. timeSec values: ${frames.map((f) => f.timeSec.toFixed(2)).join(", ")}.`,
    },
  ];
  for (const frame of frames) {
    parts.push({ text: `Frame at ${frame.timeSec.toFixed(2)}s:` });
    parts.push({
      inline_data: {
        mime_type: frame.mime === "image/jpeg" || frame.mime === "image/webp" ? frame.mime : "image/jpeg",
        data: frame.imageBase64,
      },
    });
  }

  let last = "Gemini could not read on-screen subtitles.";
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: OCR_SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      } | null;
      if (!response.ok) {
        last = payload?.error?.message || last;
        continue;
      }
      const text = (payload?.candidates?.[0]?.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      const cues = parseOcrCues(text);
      if (cues) return cues;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

async function openaiOcr(apiKey: string, frames: OcrFrame[]): Promise<OcrCue[]> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: `Read burned-in subtitle text from these ${frames.length} frames.` },
  ];
  for (const frame of frames) {
    const mime = frame.mime === "image/webp" || frame.mime === "image/png" ? frame.mime : "image/jpeg";
    content.push({ type: "text", text: `Frame at ${frame.timeSec.toFixed(2)}s` });
    content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${frame.imageBase64}` } });
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OCR_SYSTEM },
        { role: "user", content },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI OCR failed (${response.status}).`);
  return parseOcrCues(payload?.choices?.[0]?.message?.content ?? "") ?? [];
}

function parseOcrCues(raw: string): OcrCue[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const list =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { cues?: unknown }).cues)
      ? (parsed as { cues: unknown[] }).cues
      : Array.isArray(parsed)
        ? parsed
        : null;
  if (!list) return null;
  const cues = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { timeSec?: unknown; text?: unknown };
    const timeSec = typeof record.timeSec === "number" ? Math.max(0, Math.min(3600, record.timeSec)) : -1;
    const text = typeof record.text === "string" ? record.text.replace(/\s+/g, " ").trim().slice(0, 240) : "";
    if (timeSec < 0 || !text || isHallucinatedSubtitle(text)) return [];
    return [{ timeSec, text }];
  });
  return filterHallucinatedSegments(cues.map((cue) => ({ ...cue, text: cue.text })));
}

/** Merge Whisper timing with OCR source text when on-screen captions exist. */
export function mergeAudioAndOcr(
  audio: Array<{ start: number; end: number; text: string }>,
  ocr: OcrCue[],
): Array<{ start: number; end: number; text: string; source: "audio" | "ocr" | "merged" }> {
  const cleanAudio = filterHallucinatedSegments(audio);
  const cleanOcr = filterHallucinatedSegments(ocr.map((cue) => ({ ...cue, text: cue.text })));

  if (cleanOcr.length === 0) {
    return cleanAudio.map((segment) => ({ ...segment, source: "audio" as const }));
  }
  if (cleanAudio.length === 0) {
    // Build short cues from OCR timestamps alone (0.8–3.5s windows).
    return cleanOcr.map((cue, index) => {
      const next = cleanOcr[index + 1];
      const end = next ? Math.max(cue.timeSec + 0.8, Math.min(cue.timeSec + 3.5, next.timeSec - 0.05)) : cue.timeSec + 2.5;
      return { start: cue.timeSec, end, text: cue.text, source: "ocr" as const };
    });
  }

  return cleanAudio.map((segment) => {
    const mid = (segment.start + segment.end) / 2;
    const hits = cleanOcr
      .map((cue) => ({ cue, distance: Math.abs(cue.timeSec - mid) }))
      .filter((item) => item.distance <= Math.max(1.2, (segment.end - segment.start) * 0.75))
      .sort((left, right) => left.distance - right.distance);
    const best = hits[0]?.cue;
    if (best?.text) {
      return {
        start: segment.start,
        end: segment.end,
        text: best.text,
        source: "merged" as const,
      };
    }
    return { ...segment, source: "audio" as const };
  });
}
