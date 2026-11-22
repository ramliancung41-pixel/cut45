import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Communicate } from "edge-tts-universal";
import ffmpegPath from "ffmpeg-static";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Line = {
  speaker: "A" | "B";
  text: string;
  imageIndex: number;
  voiceType: "male" | "male_elder" | "female" | "female_elder" | "child_boy" | "child_girl";
  startSec?: number;
  endSec?: number;
  subtitleText?: string;
};
type Gender = "male" | "female";
type VoiceType = Line["voiceType"];

const MALE_VOICE = "pNInz6obpgDQGcFmaJgB";
const FEMALE_VOICE = "EXAVITQu4vr4xnSDxMaL";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    lines?: unknown;
    language?: unknown;
    hostAGender?: unknown;
    hostBGender?: unknown;
    mediaMode?: unknown;
  } | null;
  const language = body?.language === "burmese" ? "burmese" : body?.language === "english" ? "english" : "";
  const lines = parseLines(body?.lines);
  const genders = {
    A: body?.hostAGender === "female" ? "female" : "male",
    B: body?.hostBGender === "male" ? "male" : "female",
  } as const;
  if (!language || !lines) {
    return Response.json({ error: "Send a language and the dialogue array." }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const directory = path.join(os.tmpdir(), `podcast-${jobId}`);
  await mkdir(directory, { recursive: true });

  const clips = [];
  for (let start = 0; start < lines.length; start += 4) {
    const batch = lines.slice(start, start + 4);
    const spoken = await Promise.all(
      batch.map(async (line, offset) => {
        const index = start + offset;
        const detected = body?.mediaMode === "video" ? line.voiceType : genders[line.speaker];
        let bytes: Buffer | null = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            bytes = await speak(line, language, detected);
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : "The voice could not be generated.";
            console.error("[news-podcast] voice failed", index + 1, attempt, message);
          }
        }
        if (!bytes) return null;
        const filePath = path.join(directory, `${String(index).padStart(2, "0")}-${line.speaker}.mp3`);
        await writeFile(filePath, bytes);
        return {
          speaker: line.speaker,
          speakerType: detected,
          text: line.text,
          subtitleText: line.subtitleText ?? "",
          imageIndex: line.imageIndex,
          startSec: line.startSec,
          endSec: line.endSec,
          actualDurationSec: mp3Duration(bytes),
          path: filePath,
          audioDataUrl: `data:audio/mpeg;base64,${bytes.toString("base64")}`,
          durationSec: mp3Duration(bytes),
        };
      }),
    );
    clips.push(...spoken.filter((clip) => clip !== null));
  }
  if (clips.length === 0) return Response.json({ error: "The voices could not be generated." }, { status: 502 });

  return Response.json({ jobId, clips });
}

function parseLines(value: unknown): Line[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 60) return null;
  const lines: Line[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as {
      speaker?: unknown;
      speakerType?: unknown;
      voiceType?: unknown;
      voiceText?: unknown;
      text?: unknown;
      subtitleText?: unknown;
      imageIndex?: unknown;
      startSec?: unknown;
      endSec?: unknown;
    };
    const dubbed = typeof record.startSec === "number" && typeof record.endSec === "number";
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : dubbed ? "A" : null;
    const text = (typeof record.voiceText === "string" ? record.voiceText : typeof record.text === "string" ? record.text : "").trim().slice(0, 400);
    const named = normalizeRole(record.speakerType) || normalizeRole(record.voiceType);
    const voiceType = named || (speaker === "B" ? "female" : "male");
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    const startSec = dubbed ? Math.max(0, record.startSec as number) : undefined;
    const endSec = dubbed ? Math.max(startSec ?? 0, record.endSec as number) : undefined;
    const subtitleText = typeof record.subtitleText === "string" ? record.subtitleText.slice(0, 400) : "";
    if (!speaker || !text) return null;
    lines.push({ speaker, text, imageIndex, voiceType, startSec, endSec, subtitleText });
  }
  return lines;
}

async function speak(line: Line, language: "english" | "burmese", voiceType: VoiceType) {
  try {
    return await edgeSpeak(line, language, voiceType, 3500);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Edge TTS failed.";
    console.error("[news-podcast] edge tts failed", message);
  }
  try {
    return await googleSpeak(line.text, language, voiceType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google TTS failed.";
    console.error("[news-podcast] google tts failed", message);
  }
  const male = voiceType === "male" || voiceType === "male_elder" || voiceType === "child_boy";
  return elevenSpeak(line, male ? "male" : "female", language === "burmese" ? "eleven_v3" : "eleven_flash_v2_5");
}

const ROLES = ["male", "male_elder", "female", "female_elder", "child_boy", "child_girl"] as const;

function normalizeRole(value: unknown): VoiceType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ROLES as readonly string[]).includes(key)) return key as VoiceType;
  if (key === "child" || key === "boy") return "child_boy";
  if (key === "girl") return "child_girl";
  if (key === "elder_male" || key === "old_man") return "male_elder";
  if (key === "elder_female" || key === "old_woman") return "female_elder";
  return null;
}

function speechChunks(text: string) {
  const pieces = text.split(/(?<=[။.!?])\s+/).flatMap((part) => {
    const words = part.trim();
    if (!words) return [];
    if (words.length <= 180) return [words];
    const chunks: string[] = [];
    for (let index = 0; index < words.length; index += 180) chunks.push(words.slice(index, index + 180));
    return chunks;
  });
  return pieces.length > 0 ? pieces : [text.slice(0, 180)];
}

async function googleSpeak(text: string, language: "english" | "burmese", voiceType: VoiceType) {
  const buffers: Buffer[] = [];
  for (const chunk of speechChunks(text)) {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${language === "burmese" ? "my" : "en"}&q=${encodeURIComponent(chunk)}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Google TTS could not speak that line (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 200) throw new Error("Google TTS returned empty audio.");
    buffers.push(bytes);
  }
  return pitchShift(Buffer.concat(buffers), voiceType);
}

const PITCH_FACTOR: Record<VoiceType, number> = {
  male: 0.8,
  male_elder: 0.73,
  female: 1,
  female_elder: 0.92,
  child_boy: 1.26,
  child_girl: 1.26,
};

async function pitchShift(bytes: Buffer, voiceType: VoiceType) {
  const factor = PITCH_FACTOR[voiceType];
  if (Math.abs(factor - 1) < 0.02 || typeof ffmpegPath !== "string" || !ffmpegPath) return bytes;
  const id = crypto.randomUUID();
  const input = path.join(os.tmpdir(), `${id}.mp3`);
  const output = path.join(os.tmpdir(), `${id}-pitched.mp3`);
  await writeFile(input, bytes);
  const filter = `asetrate=${Math.round(24000 * factor)},aresample=24000,atempo=${(1 / factor).toFixed(3)}`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-y", "-i", input, "-af", filter, "-c:a", "libmp3lame", "-q:a", "5", output], { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Pitch shift failed."))));
  }).catch(() => null);
  try {
    return await readFile(output);
  } catch {
    return bytes;
  }
}

function edgeVoice(language: "english" | "burmese", voiceType: VoiceType) {
  if (language === "burmese") {
    if (voiceType === "female" || voiceType === "female_elder" || voiceType === "child_girl") return "my-MM-NilarNeural";
    return "my-MM-ThihaNeural";
  }
  if (voiceType === "male_elder") return "en-US-BrianNeural";
  if (voiceType === "female") return "en-US-AvaNeural";
  if (voiceType === "female_elder") return "en-US-EmmaNeural";
  if (voiceType === "child_boy" || voiceType === "child_girl") return "en-US-AnaNeural";
  return "en-US-AndrewNeural";
}

function prosody(voiceType: VoiceType) {
  if (voiceType === "male_elder") return { pitch: "-18Hz", rate: "-6%" };
  if (voiceType === "female_elder") return { pitch: "-14Hz", rate: "-5%" };
  if (voiceType === "child_boy") return { pitch: "+42Hz", rate: "+8%" };
  if (voiceType === "child_girl") return { pitch: "+40Hz", rate: "+8%" };
  return null;
}

async function edgeSpeak(line: Line, language: "english" | "burmese", voiceType: VoiceType, timeoutMs: number, voiceOverride?: string) {
  const shape = prosody(voiceType);
  const communicate = new Communicate(line.text, {
    voice: voiceOverride || edgeVoice(language, voiceType),
    connectionTimeout: timeoutMs,
    ...(shape ?? {}),
  });
  const audio = (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === "audio" && chunk.data) chunks.push(Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 200) throw new Error("The Myanmar voice returned empty audio.");
    return bytes;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Buffer>((_, reject) => {
    timer = setTimeout(() => reject(new Error(language === "burmese" ? "The Myanmar voice timed out." : "Edge TTS timed out.")), timeoutMs);
  });
  try {
    return await Promise.race([audio, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function elevenSpeak(line: Line, gender: Gender, modelId: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const voiceId = gender === "female" ? FEMALE_VOICE : MALE_VOICE;
  let lastError = "ElevenLabs could not speak that line.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: line.text, model_id: modelId }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    const raw = await response.text();
    let detail = raw.trim().slice(0, 300);
    try {
      const payload = JSON.parse(raw) as { detail?: { message?: string; status?: string } | string; message?: string };
      const nested = typeof payload.detail === "string" ? payload.detail : payload.detail?.message || payload.detail?.status;
      detail = nested || payload.message || detail;
    } catch {
      detail = detail || "empty error body";
    }
    lastError = `ElevenLabs ${response.status}: ${detail}`;
    if (response.status < 500 || attempt === 2) break;
  }
  throw new Error(lastError);
}

function mp3Duration(bytes: Buffer) {
  let offset = 0;
  if (bytes.subarray(0, 3).toString() === "ID3" && bytes.length > 10) {
    const size =
      ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  let samples = 0;
  let sampleRate = 44100;
  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const rates = [44100, 48000, 32000];
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (bytes[offset + 1] >> 3) & 0x3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0xf;
    const rateIndex = (bytes[offset + 2] >> 2) & 0x3;
    const padding = (bytes[offset + 2] >> 1) & 0x1;
    const bitrate = mpeg1Bitrates[bitrateIndex] * 1000;
    const mpeg1 = version === 3;
    const rateTable = mpeg1 ? rates : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const rate = rateTable[rateIndex];
    if (!bitrate || !rate) {
      offset += 1;
      continue;
    }
    const frameLength = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / rate) + padding;
    if (frameLength < 4 || offset + frameLength > bytes.length) break;
    samples += mpeg1 ? 1152 : 576;
    sampleRate = rate;
    offset += frameLength;
  }
  if (samples === 0) return 0;
  return Math.round((samples / sampleRate) * 100) / 100;
}
