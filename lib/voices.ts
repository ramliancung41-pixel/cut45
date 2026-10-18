export const VOICES = [
  {
    id: "adam",
    name: "Adam",
    gender: "male",
    description: "Male character voice",
    elevenLabsVoiceId: "pNInz6obpgDQGcFmaJgB",
  },
  {
    id: "marcus",
    name: "Marcus",
    gender: "male",
    description: "Male character voice",
    elevenLabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
  },
  {
    id: "rachel",
    name: "Rachel",
    gender: "female",
    description: "Female character voice",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  {
    id: "bella",
    name: "Bella",
    gender: "female",
    description: "Female character voice",
    elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
export type VoiceGender = (typeof VOICES)[number]["gender"];

export const DEFAULT_VOICE_ID: VoiceId = "rachel";

const LEGACY_VOICE_IDS: Record<string, VoiceId> = {
  "warm-narrator": "rachel",
  "friendly-explainer": "bella",
  "deep-cinematic": "adam",
  "calm-documentary": "marcus",
  "energetic-host": "marcus",
};

export function isVoiceId(value: string): value is VoiceId {
  return VOICES.some((voice) => voice.id === value);
}

export function resolveVoiceId(value: string): VoiceId | null {
  if (isVoiceId(value)) return value;
  return LEGACY_VOICE_IDS[value] ?? null;
}

export function getVoice(id: string) {
  const resolved = resolveVoiceId(id);
  return resolved ? VOICES.find((voice) => voice.id === resolved) : undefined;
}

export function voicesForGender(gender: VoiceGender) {
  return VOICES.filter((voice) => voice.gender === gender);
}
