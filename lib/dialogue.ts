import { getVoice, type VoiceId } from "@/lib/voices";

export type DialogueTurn = {
  speaker: string;
  text: string;
  voiceId: VoiceId;
  elevenLabsVoiceId: string;
};

const TURN =
  /^(?:[-*]\s*)?(?:\d+[.)]\s*)?([\p{L}][\p{L}\p{M}0-9 .'"()[\]-]{0,48})\s*:\s*(.+)$/u;
const GENDER_TAG = /\((male|female|man|woman|m|f)\)|\[(male|female|man|woman|m|f)\]/i;

function stripQuotes(value: string) {
  return value.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}

function hintedGender(speaker: string): "male" | "female" | null {
  const match = GENDER_TAG.exec(speaker);
  const token = (match?.[1] || match?.[2] || "").toLowerCase();
  if (token === "f" || token === "female" || token === "woman") return "female";
  if (token === "m" || token === "male" || token === "man") return "male";
  if (/^(man|male|boy)$/i.test(speaker)) return "male";
  if (/^(woman|female|girl)$/i.test(speaker)) return "female";
  return null;
}

function displayName(speaker: string) {
  return speaker.replace(GENDER_TAG, "").replace(/\s+/g, " ").trim();
}

function voiceForGender(gender: "male" | "female", selectedId: string) {
  const selected = getVoice(selectedId);
  if (selected?.gender === gender) return selected;
  return getVoice(gender === "male" ? "adam" : "bella");
}

function readTurns(script: string) {
  const turns: Array<{ speaker: string; text: string }> = [];
  for (const chunk of script.split(/\r?\n+|\s+\/\s+/)) {
    const line = chunk.trim().replace(/\*\*/g, "");
    if (!line) continue;
    const match = TURN.exec(line);
    if (!match) continue;
    const speaker = match[1].trim();
    const text = stripQuotes(match[2]);
    if (speaker.length < 2 || text.length < 1) continue;
    if (/^(script|narration|scene|shot|visual|motion|prompt|title)$/i.test(speaker)) continue;
    turns.push({ speaker, text });
  }
  return turns;
}

export function parseDialogue(script: string, selectedVoiceId: string): DialogueTurn[] | null {
  const turns = readTurns(script);
  if (turns.length < 2) return null;
  const speakers = [...new Set(turns.map((turn) => turn.speaker.toLowerCase()))];
  if (speakers.length < 2) return null;

  const selected = getVoice(selectedVoiceId) ?? getVoice("adam");
  const opposite = selected?.gender === "male" ? getVoice("bella") : getVoice("adam");
  if (!selected || !opposite) return null;

  return turns.map((turn) => {
    const hint = hintedGender(turn.speaker);
    const index = speakers.indexOf(turn.speaker.toLowerCase());
    const voice = hint
      ? voiceForGender(hint, selected.id) ?? (hint === "male" ? selected : opposite)
      : index % 2 === 0
        ? selected
        : opposite;
    return {
      speaker: displayName(turn.speaker),
      text: turn.text,
      voiceId: voice.id,
      elevenLabsVoiceId: voice.elevenLabsVoiceId,
    };
  });
}

export function dialogueAudioLabel(turns: DialogueTurn[]) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const turn of turns) {
    const key = turn.speaker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const voice = getVoice(turn.voiceId);
    parts.push(`${turn.speaker} · ${voice?.name ?? "Voice"}`);
  }
  return parts.join(" · ");
}
