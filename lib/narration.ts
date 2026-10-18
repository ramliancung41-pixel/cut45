export const NARRATION_LANGUAGES = [
  { id: "auto", label: "Auto-detect", code: null },
  { id: "my", label: "Burmese", code: "my" },
  { id: "en", label: "English", code: "en" },
  { id: "es", label: "Spanish", code: "es" },
  { id: "ja", label: "Japanese", code: "ja" },
  { id: "zh", label: "Chinese", code: "zh" },
  { id: "ko", label: "Korean", code: "ko" },
  { id: "fr", label: "French", code: "fr" },
  { id: "de", label: "German", code: "de" },
  { id: "hi", label: "Hindi", code: "hi" },
  { id: "ar", label: "Arabic", code: "ar" },
  { id: "pt", label: "Portuguese", code: "pt" },
  { id: "th", label: "Thai", code: "th" },
] as const;

export type NarrationLanguageId = (typeof NARRATION_LANGUAGES)[number]["id"];

const BROWSER_LANG: Record<Exclude<NarrationLanguageId, "auto">, string> = {
  my: "my-MM",
  en: "en-US",
  es: "es-ES",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  fr: "fr-FR",
  de: "de-DE",
  hi: "hi-IN",
  ar: "ar",
  pt: "pt-BR",
  th: "th-TH",
};

export function isNarrationLanguageId(value: string): value is NarrationLanguageId {
  return NARRATION_LANGUAGES.some((language) => language.id === value);
}

export function detectNarrationLanguage(text: string): Exclude<NarrationLanguageId, "auto"> | null {
  if (/[\u1000-\u109F]/.test(text)) return "my";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[¿¡ñáéíóúü]/i.test(text)) return "es";
  return null;
}

export function resolveNarrationLanguage(choice: string, text: string): string | null {
  if (isNarrationLanguageId(choice) && choice !== "auto") return choice;
  return detectNarrationLanguage(text);
}

export function browserSpeechLang(text: string) {
  const detected = detectNarrationLanguage(text);
  return detected ? BROWSER_LANG[detected] : "en-US";
}
