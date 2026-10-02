import type { VoiceId } from "@/lib/voices";

const SPEECH_STYLE: Record<VoiceId, { rate: number; pitch: number; match: RegExp }> = {
  "warm-narrator": { rate: 0.96, pitch: 1, match: /samantha|female|zira|google uk english female/i },
  "energetic-host": { rate: 1.12, pitch: 1.12, match: /daniel|david|google us english|male/i },
  "calm-documentary": { rate: 0.9, pitch: 0.86, match: /daniel|alex|david|uk english male/i },
  "deep-cinematic": { rate: 0.86, pitch: 0.72, match: /daniel|fred|alex|male/i },
  "friendly-explainer": { rate: 1.02, pitch: 1.05, match: /samantha|karen|female|google uk english female/i },
};

function pickVoice(voiceId: VoiceId) {
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const style = SPEECH_STYLE[voiceId];
  return voices.find((voice) => style.match.test(voice.name)) ?? voices[0];
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopNarration() {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}

export type NarrationHandlers = {
  onStart?: () => void;
  onProgress?: (progress: number) => void;
  onEnd?: () => void;
};

function estimateDurationMs(script: string, rate: number) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = 150 * rate;
  return Math.max(8000, (words / wordsPerMinute) * 60_000);
}

export function speakNarration(
  script: string,
  voiceId: VoiceId,
  handlers?: NarrationHandlers,
) {
  if (!canSpeak()) return false;

  const synth = window.speechSynthesis;
  const start = () => {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(script);
    const style = SPEECH_STYLE[voiceId];
    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.lang = "en-US";
    const voice = pickVoice(voiceId);
    if (voice) utterance.voice = voice;

    let sawBoundary = false;
    let frame = 0;
    const durationMs = estimateDurationMs(script, style.rate);

    const tick = (startedAt: number) => {
      if (sawBoundary) return;
      const elapsed = performance.now() - startedAt;
      if (!synth.speaking && elapsed > 250) return;
      const progress = Math.min(0.98, elapsed / durationMs);
      handlers?.onProgress?.(progress);
      frame = window.requestAnimationFrame(() => tick(startedAt));
    };

    utterance.onstart = () => {
      handlers?.onStart?.();
      const startedAt = performance.now();
      frame = window.requestAnimationFrame(() => tick(startedAt));
    };
    utterance.onboundary = (event) => {
      if (script.length === 0 || event.charIndex < 0) return;
      sawBoundary = true;
      window.cancelAnimationFrame(frame);
      handlers?.onProgress?.(Math.min(1, event.charIndex / script.length));
    };
    utterance.onend = () => {
      window.cancelAnimationFrame(frame);
      handlers?.onProgress?.(1);
      handlers?.onEnd?.();
    };
    utterance.onerror = () => {
      window.cancelAnimationFrame(frame);
      handlers?.onEnd?.();
    };

    synth.speak(utterance);
  };

  if (synth.getVoices().length > 0) {
    start();
    return true;
  }

  const onVoices = () => {
    synth.removeEventListener("voiceschanged", onVoices);
    start();
  };
  synth.addEventListener("voiceschanged", onVoices);
  return true;
}
