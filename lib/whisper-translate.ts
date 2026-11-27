import {
  isSubtitleLanguageCode,
  labelForWhisperLanguage,
  subtitlePromptName,
  type SubtitleLanguageCode,
} from "@/lib/subtitle-languages";
import { assertNoHallucinatedCues, filterHallucinatedSegments, isHallucinatedSubtitle } from "@/lib/subtitle-hallucinations";
import { mergeAudioAndOcr, readBurnedInSubtitles, type OcrFrame } from "@/lib/ocr-subtitles";
import { mergeOverlappingCues } from "@/lib/subtitle-cues";

export type DubCue = {
  startSec: number;
  endSec: number;
  subtitleText: string;
  voiceText?: string;
  speakerType?: string;
};

export type WhisperSegment = { start: number; end: number; text: string };

export type TranscribeResult = {
  language: string;
  languageLabel: string;
  segments: WhisperSegment[];
};

const CONTEXT_TRANSLATION_SYSTEM = `You are an expert audiovisual subtitle translator for real video dialogue.
Translate ONLY the numbered segments provided.
Rules:
- Preserve tone, slang, idioms, and pronouns using the read-only context lines when given.
- Never invent news stories, encyclopedia facts, or filler dialogue.
- Never skip, merge, or renumber IDs. Return exactly one translation for every requested id.
- Keep each caption readable on screen (prefer under ~42 characters per line; use \\n only when needed for dual-line captions).
Return JSON only: {"translations":[{"id":1,"translatedText":"..."}]}`;

const TRANSLATE_BATCH_SIZE = 25;
const TRANSLATE_CONTEXT_LINES = 2;
const MAX_TRANSLATE_OUTPUT_TOKENS = 8192;

export function parseSubtitleLanguage(value: unknown, fallback: SubtitleLanguageCode = "english"): SubtitleLanguageCode {
  return isSubtitleLanguageCode(value) ? value : fallback;
}

export function translationInstruction(target: SubtitleLanguageCode): string {
  if (target === "none") return 'Set every "subtitleText" field to an empty string. Captions are off.';
  if (target === "dual") {
    return 'Set "subtitleText" to natural spoken Burmese on the first line, then a newline, then natural English on the second line.';
  }
  if (target === "dual_lai_en") {
    return `Do this in two steps for every cue. First understand the spoken meaning in clear English. Then write authentic conversational Hakha Lai (Laiholh) with real Hakha vocabulary and the underdot letter ṭ. Do not mix in Mizo, Falam, or Burmese. Set "subtitleText" to the Hakha Lai line, a newline, then the English line.`;
  }
  if (target === "hakha_lai") {
    return `Do this in two steps for every cue. First understand the spoken meaning in clear English. Then write authentic conversational Hakha Lai (Laiholh) with real Hakha vocabulary and the underdot letter ṭ (e.g. "a si", "zei tin", "nan dam maw"). Do not mix in Mizo, Falam, or Burmese. Set "subtitleText" to the Hakha Lai line only.`;
  }
  return `Set "subtitleText" to a natural, context-aware translation into ${subtitlePromptName(target)}. Prefer idiomatic phrasing over literal translation.`;
}

/** Zero-hallucination hybrid: Whisper and/or Gemini multimodal + OCR → translated cues. */
export async function hybridTranscribeAndTranslate(options: {
  audioBase64?: string;
  audioMimeType?: string;
  videoUrl?: string;
  ocrFrames?: OcrFrame[];
  target: SubtitleLanguageCode;
  groqKey?: string;
  openaiKey?: string;
  geminiKey?: string;
}): Promise<{
  lines: DubCue[];
  detectedLanguage: string;
  detectedLanguageLabel: string;
  pipeline: string;
}> {
  const groqKey = options.groqKey || "";
  const openaiKey = options.openaiKey || "";
  const geminiKey = options.geminiKey || "";
  const errors: string[] = [];
  const hasAudio = Boolean(options.audioBase64 && options.audioMimeType);

  if (!groqKey && !openaiKey && !geminiKey) {
    throw new Error("No transcription keys configured. Add GROQ_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in Vercel.");
  }
  if (!groqKey && !openaiKey) {
    errors.push("Whisper skipped: GROQ_API_KEY and OPENAI_API_KEY are not set on this deployment.");
  }
  if (!hasAudio && !options.videoUrl) {
    throw new Error("No browser-extracted audio was received. Re-upload the video and try again.");
  }
  if (hasAudio && options.audioBase64) {
    const bytes = Buffer.byteLength(options.audioBase64, "base64");
    if (bytes < 800) errors.push(`Audio payload too small (${bytes} bytes).`);
  }

  let heard: TranscribeResult | null = null;
  let pipelineBase = "none";

  if (hasAudio && options.audioBase64 && options.audioMimeType) {
    if (groqKey) {
      try {
        heard = await groqTranscribeAudio(groqKey, options.audioBase64, options.audioMimeType);
        if (heard.segments.length > 0) pipelineBase = "groq-whisper";
        else errors.push("Groq Whisper returned no speech segments.");
      } catch (error) {
        errors.push(`Groq Whisper: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if ((!heard || heard.segments.length === 0) && openaiKey) {
      try {
        heard = await openaiTranscribeAudio(openaiKey, options.audioBase64, options.audioMimeType);
        if (heard.segments.length > 0) pipelineBase = "openai-whisper";
        else errors.push("OpenAI Whisper returned no speech segments.");
      } catch (error) {
        errors.push(`OpenAI Whisper: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    // Production often has only GEMINI_API_KEY — use multimodal audio (no server FFmpeg).
    if ((!heard || heard.segments.length === 0) && geminiKey) {
      try {
        heard = await geminiTranscribeAudio(geminiKey, options.audioBase64, options.audioMimeType, options.ocrFrames || []);
        if (heard.segments.length > 0) pipelineBase = "gemini-audio";
        else errors.push("Gemini multimodal returned no speech segments.");
      } catch (error) {
        errors.push(`Gemini audio: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  } else if (options.videoUrl) {
    if (groqKey) {
      try {
        heard = await groqTranscribeVideoUrl(groqKey, options.videoUrl);
        if (heard.segments.length > 0) pipelineBase = "groq-whisper-video";
      } catch (error) {
        errors.push(`Groq video Whisper: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }

  let ocr: Array<{ timeSec: number; text: string }> = [];
  try {
    ocr = await readBurnedInSubtitles({
      frames: options.ocrFrames || [],
      geminiKey,
      openaiKey,
    });
  } catch (error) {
    errors.push(`OCR: ${error instanceof Error ? error.message : "failed"}`);
  }

  const audioSegments = heard?.segments ?? [];
  const merged = mergeAudioAndOcr(audioSegments, ocr).filter((segment) => !isHallucinatedSubtitle(segment.text));

  if (merged.length === 0) {
    if (heard && audioSegments.length > 0) {
      throw new Error(
        `Transcription looked like unrelated fallback text and was discarded. ${errors.join(" · ") || "Retry with clearer speech or visible on-screen captions."}`,
      );
    }
    const detail = errors.length > 0 ? errors.join(" · ") : "No speech or on-screen subtitles were detected.";
    throw new Error(detail);
  }

  const language = heard?.language || guessLanguageFromText(merged.map((item) => item.text).join(" "));
  const languageLabel = heard?.languageLabel || labelForWhisperLanguage(language);

  const lines = await translateSegmentsContextAware({
    segments: merged.map((item) => ({ start: item.start, end: item.end, text: item.text })),
    target: options.target,
    sourceLanguageLabel: languageLabel,
    geminiKey,
    openaiKey,
    groqKey,
  });

  assertNoHallucinatedCues(lines);
  const deduped = mergeOverlappingCues(lines);
  if (deduped.length === 0) {
    throw new Error(`Translation returned no usable subtitle lines. ${errors.join(" · ")}`);
  }

  return {
    lines: deduped,
    detectedLanguage: language,
    detectedLanguageLabel: languageLabel,
    pipeline: ocr.length > 0 ? `${pipelineBase}+ocr` : pipelineBase,
  };
}

/** Gemini multimodal transcription — works on Vercel without FFmpeg or Whisper keys. */
async function geminiTranscribeAudio(
  apiKey: string,
  audioBase64: string,
  mime: string,
  frames: OcrFrame[],
): Promise<TranscribeResult> {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-flash"];
  const audioMime = mime === "audio/wav" || mime === "audio/webm" || mime === "audio/mp3" || mime === "audio/mpeg" ? mime : "audio/wav";
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    {
      inline_data: { mime_type: audioMime, data: audioBase64 },
    },
    {
      text: `Transcribe the spoken dialogue in this audio. Auto-detect the language (Malay, Chinese, Burmese, English, etc.).
Also use any burned-in on-screen captions visible in the attached frames if present.
Return JSON only: {"detectedLanguage":"ms","segments":[{"start":0,"end":2.4,"text":"..."}]}.
Rules:
- text must be the original spoken / on-screen words (do not translate yet).
- times are seconds relative to this audio clip.
- Never invent news, encyclopedia, or unrelated sample dialogue.
- If nothing is spoken and no captions are readable, return {"detectedLanguage":"unknown","segments":[]}.`,
    },
  ];
  for (const frame of frames.slice(0, 12)) {
    parts.push({ text: `On-screen crop at ${frame.timeSec.toFixed(2)}s:` });
    parts.push({
      inline_data: {
        mime_type: frame.mime === "image/png" || frame.mime === "image/webp" ? frame.mime : "image/jpeg",
        data: frame.imageBase64,
      },
    });
  }

  let last = "Gemini could not transcribe the audio.";
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      } | null;
      if (!response.ok) {
        last = payload?.error?.message || `Gemini transcribe failed (${response.status}) on ${model}.`;
        continue;
      }
      const text = (payload?.candidates?.[0]?.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      const parsed = parseGeminiTranscript(text);
      if (parsed) return parsed;
      last = `Gemini ${model} returned an unreadable transcript JSON.`;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

function parseGeminiTranscript(raw: string): TranscribeResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { detectedLanguage?: unknown; language?: unknown; segments?: unknown; lines?: unknown };
  const list = Array.isArray(record.segments) ? record.segments : Array.isArray(record.lines) ? record.lines : null;
  if (!list) return null;
  const segments = filterHallucinatedSegments(
    list.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { start?: unknown; end?: unknown; startSec?: unknown; endSec?: unknown; text?: unknown; subtitleText?: unknown };
      const segStart = typeof row.start === "number" ? row.start : typeof row.startSec === "number" ? row.startSec : -1;
      const segEnd = typeof row.end === "number" ? row.end : typeof row.endSec === "number" ? row.endSec : -1;
      const text =
        (typeof row.text === "string" ? row.text : typeof row.subtitleText === "string" ? row.subtitleText : "")
          .trim()
          .slice(0, 400);
      if (!text || segStart < 0 || segEnd - segStart < 0.15) return [];
      return [{ start: Math.min(3600, segStart), end: Math.min(3600, segEnd), text }];
    }),
  );
  const language =
    (typeof record.detectedLanguage === "string"
      ? record.detectedLanguage
      : typeof record.language === "string"
        ? record.language
        : guessLanguageFromText(segments.map((s) => s.text).join(" "))
    )
      .trim()
      .toLowerCase() || "unknown";
  return {
    language,
    languageLabel: labelForWhisperLanguage(language),
    segments,
  };
}

export async function groqTranscribeAudio(
  apiKey: string,
  audioBase64: string,
  mime: string,
  model: "whisper-large-v3" | "whisper-large-v3-turbo" = "whisper-large-v3",
): Promise<TranscribeResult> {
  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), mime === "audio/wav" ? "chunk.wav" : "chunk.webm");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Omit `language` so Whisper auto-detects Malay/Chinese/Burmese/English/etc.
  const heard = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const transcript = (await heard.json().catch(() => null)) as {
    error?: { message?: string };
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>;
    text?: string;
  } | null;
  if (!heard.ok) {
    if (model === "whisper-large-v3") {
      return groqTranscribeAudio(apiKey, audioBase64, mime, "whisper-large-v3-turbo");
    }
    throw new Error(transcript?.error?.message || `Groq could not transcribe the audio (${heard.status}).`);
  }
  return normalizeWhisperResult(transcript);
}

export async function openaiTranscribeAudio(apiKey: string, audioBase64: string, mime: string): Promise<TranscribeResult> {
  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), mime === "audio/wav" ? "chunk.wav" : "chunk.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const heard = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const transcript = (await heard.json().catch(() => null)) as {
    error?: { message?: string };
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>;
  } | null;
  if (!heard.ok) throw new Error(transcript?.error?.message || `OpenAI Whisper could not transcribe (${heard.status}).`);
  return normalizeWhisperResult(transcript);
}

export async function groqTranscribeVideoUrl(apiKey: string, videoUrl: string): Promise<TranscribeResult> {
  const source = await fetch(videoUrl);
  if (!source.ok) throw new Error(`The uploaded video could not be read (${source.status}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const mime = sniffVideoMime(bytes) || "video/mp4";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), mime.includes("webm") ? "clip.webm" : "clip.mp4");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const heard = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const transcript = (await heard.json().catch(() => null)) as {
    error?: { message?: string };
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>;
  } | null;
  if (!heard.ok) throw new Error(transcript?.error?.message || `Groq could not transcribe the video (${heard.status}).`);
  return normalizeWhisperResult(transcript);
}

function normalizeWhisperResult(
  transcript: {
    language?: string;
    segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>;
    text?: string;
  } | null,
): TranscribeResult {
  // Keep quiet speech: only drop near-certain non-speech / empty rows. No hard segment cap.
  const segments = filterHallucinatedSegments(
    (transcript?.segments ?? [])
      .map((segment) => ({
        start: typeof segment.start === "number" ? segment.start : 0,
        end: typeof segment.end === "number" ? segment.end : 0,
        text: (segment.text || "").trim(),
        avg_logprob: segment.avg_logprob,
        no_speech_prob: segment.no_speech_prob,
      }))
      .filter((segment) => {
        if (!segment.text || segment.end - segment.start < 0.12) return false;
        // Only drop when Whisper is extremely confident there is no speech.
        if (typeof segment.no_speech_prob === "number" && segment.no_speech_prob > 0.92) return false;
        return true;
      })
      .map(({ start, end, text }) => ({ start, end, text }))
      .slice(0, 500),
  );

  // If verbose segments were empty but full text is a hallucination, reject it.
  if (segments.length === 0 && transcript?.text && isHallucinatedSubtitle(transcript.text)) {
    throw new Error("Whisper returned unrelated fallback text instead of the video dialogue.");
  }

  const language = (transcript?.language || "").trim().toLowerCase() || "unknown";
  return {
    language,
    languageLabel: labelForWhisperLanguage(language),
    segments,
  };
}

type NumberedSegment = WhisperSegment & { id: number };

export async function translateSegmentsContextAware(options: {
  segments: WhisperSegment[];
  target: SubtitleLanguageCode;
  sourceLanguageLabel: string;
  geminiKey?: string;
  openaiKey?: string;
  groqKey?: string;
}): Promise<DubCue[]> {
  const { segments, target, sourceLanguageLabel } = options;
  const clean = filterHallucinatedSegments(segments);
  if (clean.length === 0) {
    throw new Error("No valid transcript segments remained after hallucination filtering.");
  }
  if (target === "none") {
    return clean.map((segment) => ({
      startSec: segment.start,
      endSec: Math.max(segment.end, segment.start + 0.5),
      subtitleText: "",
      voiceText: segment.text,
    }));
  }

  const numbered: NumberedSegment[] = clean.map((segment, index) => ({
    id: index + 1,
    start: segment.start,
    end: segment.end,
    text: segment.text,
  }));
  const translations = new Map<number, string>();

  for (let offset = 0; offset < numbered.length; offset += TRANSLATE_BATCH_SIZE) {
    const batch = numbered.slice(offset, offset + TRANSLATE_BATCH_SIZE);
    const context = numbered.slice(Math.max(0, offset - TRANSLATE_CONTEXT_LINES), offset);
    const batchMap = await translateBatchWithIdRetry({
      batch,
      context,
      target,
      sourceLanguageLabel,
      geminiKey: options.geminiKey,
      openaiKey: options.openaiKey,
      groqKey: options.groqKey,
    });
    for (const [id, text] of batchMap) translations.set(id, text);
  }

  // Final sweep: any still-missing IDs get one more dedicated retry.
  const missing = numbered.filter((item) => !(translations.get(item.id) || "").trim());
  if (missing.length > 0) {
    for (let offset = 0; offset < missing.length; offset += TRANSLATE_BATCH_SIZE) {
      const batch = missing.slice(offset, offset + TRANSLATE_BATCH_SIZE);
      const batchMap = await translateBatchWithIdRetry({
        batch,
        context: [],
        target,
        sourceLanguageLabel,
        geminiKey: options.geminiKey,
        openaiKey: options.openaiKey,
        groqKey: options.groqKey,
        forceRetry: true,
      });
      for (const [id, text] of batchMap) translations.set(id, text);
    }
  }

  const cues = numbered.map((item) => {
    const translated = (translations.get(item.id) || "").trim();
    return {
      startSec: item.start,
      endSec: Math.max(item.end, item.start + 0.5),
      subtitleText: translated || item.text,
      voiceText: item.text,
    };
  });
  assertNoHallucinatedCues(cues);
  return cues;
}

async function translateBatchWithIdRetry(options: {
  batch: NumberedSegment[];
  context: NumberedSegment[];
  target: SubtitleLanguageCode;
  sourceLanguageLabel: string;
  geminiKey?: string;
  openaiKey?: string;
  groqKey?: string;
  forceRetry?: boolean;
}): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  let pending = [...options.batch];
  for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
    const user = buildIdBatchPrompt({
      batch: pending,
      context: options.context,
      target: options.target,
      sourceLanguageLabel: options.sourceLanguageLabel,
      attempt,
    });
    const raw = await translateRawText(user, options);
    const parsed = parseIdTranslations(raw);
    for (const item of parsed) {
      if (!pending.some((row) => row.id === item.id)) continue;
      if (!item.translatedText.trim()) continue;
      if (isHallucinatedSubtitle(item.translatedText)) continue;
      results.set(item.id, item.translatedText.trim().slice(0, 400));
    }
    pending = pending.filter((row) => !(results.get(row.id) || "").trim());
    if (pending.length === 0) break;
  }

  // Absolute last resort for stubborn IDs: keep verified source text (never drop the cue).
  if (options.forceRetry || pending.length > 0) {
    for (const row of pending) {
      if (!(results.get(row.id) || "").trim()) results.set(row.id, row.text);
    }
  }
  return results;
}

function buildIdBatchPrompt(options: {
  batch: NumberedSegment[];
  context: NumberedSegment[];
  target: SubtitleLanguageCode;
  sourceLanguageLabel: string;
  attempt: number;
}) {
  const contextBlock =
    options.context.length > 0
      ? `Read-only prior context (do NOT translate or return these):\n${JSON.stringify(
          options.context.map((row) => ({ id: row.id, text: row.text })),
        )}\n\n`
      : "";
  const retryNote =
    options.attempt > 0
      ? `RETRY ${options.attempt}: The previous response omitted some IDs. Return translations for EVERY id listed below. Missing IDs are not allowed.\n\n`
      : "";
  return `${retryNote}Source language (auto-detected / OCR): ${options.sourceLanguageLabel}.
Target subtitle language: ${subtitlePromptName(options.target)}.
${translationInstruction(options.target)}

${contextBlock}Translate these segments. Return {"translations":[{"id":number,"translatedText":string}]} with the SAME ids only:
${JSON.stringify(
  options.batch.map((row) => ({
    id: row.id,
    startSec: Number(row.start.toFixed(3)),
    endSec: Number(row.end.toFixed(3)),
    text: row.text,
  })),
)}

Required ids: [${options.batch.map((row) => row.id).join(", ")}]`;
}

async function translateRawText(
  user: string,
  options: { geminiKey?: string; openaiKey?: string; groqKey?: string },
): Promise<string> {
  let lastError = "Could not translate the subtitles.";
  if (options.geminiKey) {
    try {
      const raw = await geminiTranslate(options.geminiKey, user);
      if (raw.trim()) return raw;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  if (options.openaiKey) {
    try {
      const raw = await openaiTranslate(options.openaiKey, user);
      if (raw.trim()) return raw;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  if (options.groqKey) {
    try {
      const raw = await groqTranslate(options.groqKey, user);
      if (raw.trim()) return raw;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function geminiTranslate(apiKey: string, user: string) {
  const models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3.5-flash"];
  let last = "Gemini could not translate the subtitles.";
  for (const model of models) {
    try {
      const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CONTEXT_TRANSLATION_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: MAX_TRANSLATE_OUTPUT_TOKENS,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      } | null;
      if (!response.ok) {
        last = payload?.error?.message || `Gemini translate failed (${response.status}).`;
        continue;
      }
      const text = (payload?.candidates?.[0]?.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (text) return text;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

async function openaiTranslate(apiKey: string, user: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: MAX_TRANSLATE_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CONTEXT_TRANSLATION_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI could not translate (${response.status}).`);
  return payload?.choices?.[0]?.message?.content ?? "";
}

async function groqTranslate(apiKey: string, user: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: MAX_TRANSLATE_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CONTEXT_TRANSLATION_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `Groq could not translate (${response.status}).`);
  return payload?.choices?.[0]?.message?.content ?? "";
}

function parseIdTranslations(raw: string): Array<{ id: number; translatedText: string }> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw.slice(arrayStart, arrayEnd + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Array.isArray((parsed as { translations?: unknown }).translations)
        ? (parsed as { translations: unknown[] }).translations
        : Array.isArray((parsed as { lines?: unknown }).lines)
          ? (parsed as { lines: unknown[] }).lines
          : []
      : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { id?: unknown; translatedText?: unknown; subtitleText?: unknown; text?: unknown };
    const id = typeof record.id === "number" && record.id > 0 ? Math.floor(record.id) : -1;
    const translatedText =
      (typeof record.translatedText === "string"
        ? record.translatedText
        : typeof record.subtitleText === "string"
          ? record.subtitleText
          : typeof record.text === "string"
            ? record.text
            : ""
      ).trim();
    if (id < 1 || !translatedText) return [];
    return [{ id, translatedText }];
  });
}

/** Legacy timed-cue parser kept for any residual callers. */
export function parseTranslatedCues(raw: string): DubCue[] | null {
  const idRows = parseIdTranslations(raw);
  if (idRows.length > 0) return null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw.slice(objectStart, objectEnd + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown }).lines)
      ? (parsed as { lines: unknown[] }).lines
      : null;
  if (!list || list.length < 1) return null;
  const cues = filterHallucinatedSegments(
    list.slice(0, 500).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { startSec?: unknown; endSec?: unknown; subtitleText?: unknown; text?: unknown; voiceText?: unknown };
      const startSec = typeof record.startSec === "number" && record.startSec >= 0 ? Math.min(3600, record.startSec) : -1;
      const endSec = typeof record.endSec === "number" ? Math.min(3600, record.endSec) : -1;
      const subtitleText =
        (typeof record.subtitleText === "string" ? record.subtitleText : typeof record.text === "string" ? record.text : "")
          .trim()
          .slice(0, 400);
      const voiceText = typeof record.voiceText === "string" ? record.voiceText.trim().slice(0, 240) : "";
      if (!subtitleText || startSec < 0 || endSec - startSec < 0.2) return [];
      return [{ startSec, endSec, subtitleText, voiceText: voiceText || subtitleText, text: subtitleText }];
    }),
  ).map(({ startSec, endSec, subtitleText, voiceText }) => ({ startSec, endSec, subtitleText, voiceText }));
  return cues.length > 0 ? cues : null;
}

function guessLanguageFromText(text: string) {
  if (/[\u1000-\u109F]/.test(text)) return "my";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/\b(awak|nak|tidak|lah|kah|dengan|yang)\b/i.test(text)) return "ms";
  return "unknown";
}

function sniffVideoMime(bytes: Buffer) {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  return "";
}
