export const VOICES = [
  {
    id: "warm-narrator",
    name: "Warm Narrator",
    description: "Steady and close. Fits explainers that should feel unhurried.",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  {
    id: "energetic-host",
    name: "Energetic Host",
    description: "Brighter pace for lists, rankings, and quick claims.",
    elevenLabsVoiceId: "TxGEqnHWrfWFTfGW9XjX",
  },
  {
    id: "calm-documentary",
    name: "Calm Documentary",
    description: "Lower and drier, closer to a history or nature cut.",
    elevenLabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
  },
  {
    id: "deep-cinematic",
    name: "Deep Cinematic",
    description: "Low register with space around each sentence.",
    elevenLabsVoiceId: "pNInz6obpgDQGcFmaJgB",
  },
  {
    id: "friendly-explainer",
    name: "Friendly Explainer",
    description: "Conversational, as if a friend is walking you through it.",
    elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const DEFAULT_VOICE_ID: VoiceId = "warm-narrator";

export function isVoiceId(value: string): value is VoiceId {
  return VOICES.some((voice) => voice.id === value);
}

export function getVoice(id: string) {
  return VOICES.find((voice) => voice.id === id);
}
