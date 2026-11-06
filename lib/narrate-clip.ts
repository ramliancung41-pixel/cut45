import { dialogueAudioLabel, parseDialogue } from "@/lib/dialogue";
import { synthesizeDialogue, synthesizeSpeech } from "@/lib/elevenlabs";
import { deliverFrame, lipSyncVideo, muxVideoAudio, uploadAudio } from "@/lib/fal-video";
import type { AspectRatio } from "@/lib/frame";
import type { NarrationLanguageId } from "@/lib/narration";
import { getVoice, type VoiceId } from "@/lib/voices";

export type NarratedClip = {
  audioSrc: string;
  audioLabel: string;
  videoUrl?: string;
  embedded: boolean;
  lipSynced: boolean;
  elevenLabs: boolean;
  notice?: string;
};

export async function narrateClip(input: {
  script: string;
  voiceId: VoiceId;
  language: NarrationLanguageId;
  videoUrl: string | null;
  aspect: AspectRatio;
  mock: boolean;
  signal: AbortSignal;
}): Promise<NarratedClip> {
  const voice = getVoice(input.voiceId);
  if (!voice) throw new Error("Select a voice style.");

  const turns = parseDialogue(input.script, voice.id);
  const spoken = turns
    ? await synthesizeDialogue({ turns, language: input.language, signal: input.signal })
    : await synthesizeSpeech({
        script: input.script,
        elevenLabsVoiceId: voice.elevenLabsVoiceId,
        language: input.language,
        signal: input.signal,
      });
  const audioLabel = turns ? dialogueAudioLabel(turns) : `${voice.name} · ElevenLabs`;
  const elevenLabs = !spoken.audioSrc.startsWith("data:audio/wav");
  const voiceNote = elevenLabs ? undefined : "ElevenLabs did not answer, so a local male and female voice was used.";
  const base = { audioSrc: spoken.audioSrc, audioLabel, elevenLabs, lipSynced: false };

  if (input.mock) {
    return {
      ...base,
      videoUrl: input.videoUrl ?? undefined,
      embedded: false,
      notice: voiceNote ?? "Dialogue is on the voice track. The stock picture stays in the timeline at 0:00.",
    };
  }
  if (!input.videoUrl) return { ...base, embedded: false, ...(voiceNote ? { notice: voiceNote } : {}) };

  const mime = spoken.bytes[0] === 0x52 && spoken.bytes[1] === 0x49 ? "audio/wav" : "audio/mpeg";
  const uploaded = await uploadAudio(spoken.bytes, input.signal, mime);
  if ("error" in uploaded) {
    console.error("[elevenlabs] narration audio was not uploaded", uploaded.error);
    return { ...base, embedded: false, notice: voiceNote ?? uploaded.error };
  }

  const [muxed, synced] = await Promise.all([
    muxVideoAudio(input.videoUrl, uploaded.fileUrl, input.signal),
    turns ? lipSyncVideo(input.videoUrl, uploaded.fileUrl, input.signal, 45000) : Promise.resolve({ error: "" }),
  ]);
  const withSound = "videoUrl" in synced ? synced.videoUrl : "videoUrl" in muxed ? muxed.videoUrl : "";
  if (!withSound) {
    const reason = "error" in muxed ? muxed.error : "Dialogue audio is ready.";
    console.error("[elevenlabs] narration was not mixed into the mp4", reason);
    return { ...base, embedded: false, notice: voiceNote ?? reason };
  }
  const lipSynced = "videoUrl" in synced;
  return {
    ...base,
    videoUrl: await deliverFrame(withSound, input.signal, input.aspect),
    embedded: true,
    lipSynced,
    ...(!lipSynced && turns
      ? { notice: voiceNote ?? "Dialogue audio is on the video. Mouth sync could not be applied." }
      : voiceNote
        ? { notice: voiceNote }
        : {}),
  };
}
