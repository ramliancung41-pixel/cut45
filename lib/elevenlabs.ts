import { logApiKey } from "@/lib/api-keys";
import { synthesizeLocalSpeech } from "@/lib/local-speech";
import { resolveNarrationLanguage } from "@/lib/narration";

const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 4500;
const ALTERNATE_VOICE: Record<string, string> = {
  pNInz6obpgDQGcFmaJgB: "onwK4e9ZLuTAKqWW03F9",
  onwK4e9ZLuTAKqWW03F9: "pNInz6obpgDQGcFmaJgB",
  "21m00Tcm4TlvDq8ikWAM": "EXAVITQu4vr4xnSDxMaL",
  EXAVITQu4vr4xnSDxMaL: "21m00Tcm4TlvDq8ikWAM",
};

export class ElevenLabsQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElevenLabsQuotaError";
  }
}

const VOICE_WAIT_MS = 60000;

function voiceGender(elevenLabsVoiceId: string): "male" | "female" {
  return elevenLabsVoiceId === "21m00Tcm4TlvDq8ikWAM" || elevenLabsVoiceId === "EXAVITQu4vr4xnSDxMaL" ? "female" : "male";
}

function boundedSignal(parent: AbortSignal | undefined, ms = VOICE_WAIT_MS) {
  const timeout = AbortSignal.timeout(ms);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function stoppedByUser(_error: unknown, signal?: AbortSignal) {
  return Boolean(signal?.aborted);
}

function narrationText(script: string) {
  return script.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
}

function pcmToWav(pcm: Uint8Array, sampleRate: number, padSeconds: number) {
  const bytesPerSample = 2;
  const speechSamples = Math.floor(pcm.byteLength / bytesPerSample);
  const targetSamples = Math.max(speechSamples, Math.round(Math.max(padSeconds, 0) * sampleRate));
  const dataBytes = targetSamples * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, speechSamples * bytesPerSample).copy(wav, 44);
  return new Uint8Array(wav);
}

function audioPayload(bytes: Uint8Array, mime = "audio/mpeg") {
  return { bytes, audioSrc: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` };
}

function joinMpeg(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

export async function synthesizeSpeech(input: {
  script: string;
  elevenLabsVoiceId: string;
  language: string;
  signal?: AbortSignal;
  minChars?: number;
  padSeconds?: number;
}) {
  try {
    return await renderElevenSpeech(input);
  } catch (error) {
    if (stoppedByUser(error, input.signal)) throw error;
    console.error(
      "[elevenlabs] voice request failed; using the local voice of that gender",
      error instanceof Error ? error.message : error,
    );
    const local = await synthesizeLocalSpeech([{ text: input.script, gender: voiceGender(input.elevenLabsVoiceId) }]);
    return { ...local, elevenLabs: false as const };
  }
}

async function renderElevenSpeech(input: {
  script: string;
  elevenLabsVoiceId: string;
  language: string;
  signal?: AbortSignal;
  minChars?: number;
  padSeconds?: number;
}) {
  if (!logApiKey("ELEVENLABS_API_KEY")) {
    throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  }
  const text = narrationText(input.script);
  if (text.length < (input.minChars ?? 8)) {
    throw new Error("The narration is too short to record.");
  }
  const languageCode = resolveNarrationLanguage(input.language, text);

  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${input.elevenLabsVoiceId}?output_format=pcm_44100`, {
      method: "POST",
      signal: boundedSignal(input.signal),
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        ...(languageCode ? { language_code: languageCode } : {}),
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          speed: 0.8,
        },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Could not reach ElevenLabs.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      console.error(`[elevenlabs] 401 Unauthorized for voice ${input.elevenLabsVoiceId}`);
      throw new Error("ElevenLabs rejected the API key.");
    }
    if (response.status === 429 || response.status === 402 || /quota|credit/i.test(detail)) {
      console.error(`[elevenlabs] ${response.status} quota or rate limit for voice ${input.elevenLabsVoiceId}`);
      throw new ElevenLabsQuotaError("ElevenLabs could not record this narration right now.");
    }
    console.error(`[elevenlabs] voice request failed (${response.status}) ${detail.slice(0, 180)}`);
    throw new Error(`ElevenLabs could not render the voice (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("ElevenLabs returned an empty voice track.");
  }
  const wav = pcmToWav(bytes, 44100, input.padSeconds ?? 5);
  return { ...audioPayload(wav, "audio/wav"), elevenLabs: true as const };
}

async function readVoiceError(response: Response) {
  const detail = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    throw new Error("ElevenLabs rejected the API key.");
  }
  if (response.status === 402 || /quota|credit/i.test(detail)) {
    throw new ElevenLabsQuotaError("ElevenLabs could not record this dialogue right now.");
  }
  throw new Error(`ElevenLabs could not render the voice (${response.status}).`);
}

export async function synthesizeDialogue(input: {
  turns: Array<{ text: string; elevenLabsVoiceId: string }>;
  language: string;
  signal?: AbortSignal;
}) {
  try {
    return await renderElevenDialogue(input);
  } catch (error) {
    if (stoppedByUser(error, input.signal)) throw error;
    console.error("[elevenlabs] multi-speaker request failed; using local male and female voices");
    return synthesizeLocalSpeech(
      input.turns.map((turn) => ({ text: turn.text, gender: voiceGender(turn.elevenLabsVoiceId) })),
    );
  }
}

async function renderElevenDialogue(input: {
  turns: Array<{ text: string; elevenLabsVoiceId: string }>;
  language: string;
  signal?: AbortSignal;
}) {
  if (!logApiKey("ELEVENLABS_API_KEY")) {
    throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing from the server environment.");
  }
  const turns = input.turns
    .map((turn) => ({
      text: turn.text.replace(/\s+/g, " ").trim().slice(0, 500),
      elevenLabsVoiceId: turn.elevenLabsVoiceId,
    }))
    .filter((turn) => turn.text.length > 0);
  if (turns.length === 0) {
    throw new Error("The dialogue is too short to record.");
  }
  if (turns.length === 1) {
    return synthesizeSpeech({
      script: turns[0].text,
      elevenLabsVoiceId: turns[0].elevenLabsVoiceId,
      language: input.language,
      signal: input.signal,
      minChars: 1,
    });
  }

  const spoken = turns.map((turn) => turn.text).join(" ");
  const languageCode = resolveNarrationLanguage(input.language, spoken);
  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128", {
      method: "POST",
      signal: boundedSignal(input.signal),
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        model_id: "eleven_v3",
        inputs: turns.map((turn) => ({ text: turn.text, voice_id: turn.elevenLabsVoiceId })),
        ...(languageCode ? { language_code: languageCode } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    response = new Response(null, { status: 503 });
  }

  if (response.ok) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 0) return audioPayload(bytes);
  } else if (response.status === 401 || response.status === 403) {
    await readVoiceError(response);
  } else {
    console.error(`[elevenlabs] dialogue request failed (${response.status}); recording each character line`);
  }

  const parts: Uint8Array[] = [];
  for (const turn of turns) {
    try {
      const line = await synthesizeSpeech({
        script: turn.text,
        elevenLabsVoiceId: turn.elevenLabsVoiceId,
        language: input.language,
        signal: input.signal,
        minChars: 1,
      });
      parts.push(line.bytes);
    } catch (error) {
      const alternate = ALTERNATE_VOICE[turn.elevenLabsVoiceId];
      if (!(error instanceof ElevenLabsQuotaError) || !alternate) throw error;
      console.error("[elevenlabs] selected voice needs a paid plan; using the other voice of that gender");
      const line = await synthesizeSpeech({
        script: turn.text,
        elevenLabsVoiceId: alternate,
        language: input.language,
        signal: input.signal,
        minChars: 1,
      });
      parts.push(line.bytes);
    }
  }
  return audioPayload(joinMpeg(parts));
}
