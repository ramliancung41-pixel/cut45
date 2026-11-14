import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Line = { speaker: "A" | "B"; text: string; imageIndex: number };
type Gender = "male" | "female";

const MALE_VOICE = "pNInz6obpgDQGcFmaJgB";
const FEMALE_VOICE = "EXAVITQu4vr4xnSDxMaL";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    lines?: unknown;
    language?: unknown;
    hostAGender?: unknown;
    hostBGender?: unknown;
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
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const filePath = path.join(directory, `${String(index).padStart(2, "0")}-${line.speaker}.mp3`);
    try {
      const bytes = await speak(line, language, genders[line.speaker]);
      await writeFile(filePath, bytes);
      clips.push({
        speaker: line.speaker,
        text: line.text,
        imageIndex: line.imageIndex,
        path: filePath,
        durationSec: mp3Duration(bytes),
        audioBase64: bytes.toString("base64"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The voice could not be generated.";
      console.error("[news-podcast] voice failed", message);
      return Response.json({ error: `Could not voice line ${index + 1}. ${message}`.slice(0, 400), jobId, clips }, { status: 502 });
    }
  }

  return Response.json({ jobId, clips });
}

function parseLines(value: unknown): Line[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 14) return null;
  const lines: Line[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { speaker?: unknown; text?: unknown; imageIndex?: unknown };
    const speaker = record.speaker === "A" || record.speaker === "B" ? record.speaker : null;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 400) : "";
    const imageIndex = typeof record.imageIndex === "number" && record.imageIndex >= 0 ? Math.min(2, Math.floor(record.imageIndex)) : 0;
    if (!speaker || !text) return null;
    lines.push({ speaker, text, imageIndex });
  }
  return lines;
}

async function speak(line: Line, language: "english" | "burmese", gender: Gender) {
  if (language === "burmese") return burmeseSpeak(line, gender);
  return elevenSpeak(line, gender, "eleven_flash_v2_5");
}

async function burmeseSpeak(line: Line, gender: Gender) {
  const voice = gender === "female" ? "my-MM-NilarNeural" : "my-MM-ThihaNeural";
  let lastError = "The Burmese voice could not be reached.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 20000, synthesisTimeoutMs: 30000 });
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(line.text, { rate: "+5%" });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 200) throw new Error("The Burmese voice returned empty audio.");
      return bytes;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === 2) break;
    } finally {
      tts.close();
    }
  }
  throw new Error(lastError);
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
    const payload = (await response.json().catch(() => null)) as { detail?: { message?: string } | string } | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : payload?.detail?.message;
    lastError = detail || `ElevenLabs failed (${response.status}).`;
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
