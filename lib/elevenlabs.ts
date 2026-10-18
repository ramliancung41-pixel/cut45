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

const VOICE_WAIT_MS = 8000;

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

function audioPayload(bytes: Uint8Array) {
  return { bytes, audioSrc: `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}` };
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
}) {
  try {
    return await renderElevenSpeech(input);
  } catch (error) {
    if (stoppedByUser(error, input.signal)) throw error;
    console.error("[elevenlabs] voice request failed; using the local voice of that gender");
    return synthesizeLocalSpeech([{ text: input.script, gender: voiceGender(input.elevenLabsVoiceId) }]);
  }
}

async function renderElevenSpeech(input: {
  script: string;
  elevenLabsVoiceId: string;
  language: string;
  signal?: AbortSignal;
  minChars?: number;
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
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${input.elevenLabsVoiceId}`, {
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
          stability: 0.45,
          similarity_boost: 0.75,
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
      throw new Error("ElevenLabs rejected the API key.");
    }
    if (response.status === 402 || /quota|credit/i.test(detail)) {
      throw new ElevenLabsQuotaError("ElevenLabs could not record this narration right now.");
    }
    throw new Error(`ElevenLabs could not render the voice (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("ElevenLabs returned an empty voice track.");
  }
  return audioPayload(bytes);
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
