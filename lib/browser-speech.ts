import { browserSpeechLang } from "@/lib/narration";
import type { VoiceId } from "@/lib/voices";

const SPEECH_STYLE: Record<VoiceId, { rate: number; pitch: number; match: RegExp }> = {
  rachel: { rate: 0.96, pitch: 1, match: /samantha|female|zira|google uk english female/i },
  bella: { rate: 1.02, pitch: 1.05, match: /samantha|karen|female|google uk english female/i },
  adam: { rate: 0.86, pitch: 0.78, match: /daniel|fred|alex|male/i },
  marcus: { rate: 0.9, pitch: 0.86, match: /daniel|david|uk english male/i },
};

let keepAlive = 0;

function pickVoice(voiceId: VoiceId, lang: string) {
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  const inLang = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = inLang.length > 0 ? inLang : voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const style = SPEECH_STYLE[voiceId];
  return pool.find((voice) => style.match.test(voice.name)) ?? pool[0] ?? voices[0];
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function primeSpeechVoices() {
  if (!canSpeak()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  }, { once: true });
}

export function stopNarration() {
  if (keepAlive) {
    window.clearInterval(keepAlive);
    keepAlive = 0;
  }
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}

export type NarrationHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
};

function holdSpeechOpen() {
  const synth = window.speechSynthesis;
  if (keepAlive) window.clearInterval(keepAlive);
  keepAlive = window.setInterval(() => {
    if (!synth.speaking && !synth.pending) {
      window.clearInterval(keepAlive);
      keepAlive = 0;
      return;
    }
    synth.pause();
    synth.resume();
  }, 10000);
}

export function speakNarration(
  script: string,
  voiceId: VoiceId,
  handlers?: NarrationHandlers,
) {
  if (!canSpeak() || !script.trim()) return false;

  const synth = window.speechSynthesis;
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(script);
  const style = SPEECH_STYLE[voiceId];
  const lang = browserSpeechLang(script);
  utterance.rate = style.rate;
  utterance.pitch = style.pitch;
  utterance.lang = lang;
  const voice = pickVoice(voiceId, lang);
  if (voice) utterance.voice = voice;

  utterance.onstart = () => handlers?.onStart?.();
  utterance.onend = () => handlers?.onEnd?.();
  utterance.onerror = () => handlers?.onEnd?.();

  const begin = () => {
    synth.resume();
    synth.speak(utterance);
    synth.resume();
    holdSpeechOpen();
  };

  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  if (busy) window.setTimeout(begin, 0);
  else begin();
  return true;
}
