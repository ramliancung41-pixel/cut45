/** Shared subtitle / voice language catalog for Cut45 Video Recap. */

export type SubtitleLanguageCode =
  | "english"
  | "burmese"
  | "hakha_lai"
  | "malay"
  | "chinese_simplified"
  | "chinese_traditional"
  | "korean"
  | "japanese"
  | "thai"
  | "hindi"
  | "spanish"
  | "french"
  | "arabic"
  | "german"
  | "portuguese"
  | "vietnamese"
  | "indonesian"
  | "russian"
  | "italian"
  | "dutch"
  | "turkish"
  | "polish"
  | "swedish"
  | "dual"
  | "dual_lai_en"
  | "none";

export type SubtitleLanguageOption = {
  code: SubtitleLanguageCode;
  label: string;
  /** BCP-47 / Whisper-friendly code when applicable */
  whisper?: string;
  dual?: boolean;
  off?: boolean;
};

export const SUBTITLE_LANGUAGE_OPTIONS: SubtitleLanguageOption[] = [
  { code: "english", label: "English", whisper: "en" },
  { code: "burmese", label: "Burmese (Myanmar)", whisper: "my" },
  { code: "hakha_lai", label: "Hakha Chin / Laiholh" },
  { code: "malay", label: "Malay", whisper: "ms" },
  { code: "chinese_simplified", label: "Chinese (Simplified)", whisper: "zh" },
  { code: "chinese_traditional", label: "Chinese (Traditional)", whisper: "zh" },
  { code: "korean", label: "Korean", whisper: "ko" },
  { code: "japanese", label: "Japanese", whisper: "ja" },
  { code: "thai", label: "Thai", whisper: "th" },
  { code: "hindi", label: "Hindi", whisper: "hi" },
  { code: "spanish", label: "Spanish", whisper: "es" },
  { code: "french", label: "French", whisper: "fr" },
  { code: "arabic", label: "Arabic", whisper: "ar" },
  { code: "german", label: "German", whisper: "de" },
  { code: "portuguese", label: "Portuguese", whisper: "pt" },
  { code: "vietnamese", label: "Vietnamese", whisper: "vi" },
  { code: "indonesian", label: "Indonesian", whisper: "id" },
  { code: "russian", label: "Russian", whisper: "ru" },
  { code: "italian", label: "Italian", whisper: "it" },
  { code: "dutch", label: "Dutch", whisper: "nl" },
  { code: "turkish", label: "Turkish", whisper: "tr" },
  { code: "polish", label: "Polish", whisper: "pl" },
  { code: "swedish", label: "Swedish", whisper: "sv" },
  { code: "dual", label: "Dual (Burmese + English)", dual: true },
  { code: "dual_lai_en", label: "Dual (Hakha Lai + English)", dual: true },
  { code: "none", label: "None (Off)", off: true },
];

const WHISPER_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  "zh-cn": "Chinese",
  "zh-tw": "Chinese",
  my: "Burmese",
  burmese: "Burmese",
  ms: "Malay",
  id: "Indonesian",
  ko: "Korean",
  ja: "Japanese",
  th: "Thai",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  de: "German",
  pt: "Portuguese",
  vi: "Vietnamese",
  ru: "Russian",
  it: "Italian",
  nl: "Dutch",
  tr: "Turkish",
  pl: "Polish",
  sv: "Swedish",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ur: "Urdu",
  fil: "Filipino",
  tl: "Tagalog",
};

export function labelForWhisperLanguage(code: string | undefined | null): string {
  if (!code) return "Unknown";
  const key = code.trim().toLowerCase();
  if (WHISPER_LABELS[key]) return WHISPER_LABELS[key];
  const base = key.split("-")[0] || key;
  if (WHISPER_LABELS[base]) return WHISPER_LABELS[base];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function isSubtitleLanguageCode(value: unknown): value is SubtitleLanguageCode {
  return typeof value === "string" && SUBTITLE_LANGUAGE_OPTIONS.some((option) => option.code === value);
}

export function subtitleLanguageLabel(code: SubtitleLanguageCode): string {
  return SUBTITLE_LANGUAGE_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

/** Natural-language name used inside translation prompts. */
export function subtitlePromptName(code: SubtitleLanguageCode): string {
  switch (code) {
    case "english":
      return "natural, idiomatic English";
    case "burmese":
      return "natural spoken Burmese (စကားပြောဟန်), not stiff literary Burmese";
    case "hakha_lai":
      return "authentic conversational Hakha Lai (Laiholh) with real Hakha vocabulary and the underdot letter ṭ (e.g. a si, zei tin, nan dam maw). Do not mix in Mizo, Falam, or Burmese";
    case "malay":
      return "natural Bahasa Melayu";
    case "chinese_simplified":
      return "natural Simplified Chinese (简体中文)";
    case "chinese_traditional":
      return "natural Traditional Chinese (繁體中文)";
    case "korean":
      return "natural Korean (한국어)";
    case "japanese":
      return "natural Japanese (日本語)";
    case "thai":
      return "natural Thai (ภาษาไทย)";
    case "hindi":
      return "natural Hindi (हिन्दी)";
    case "spanish":
      return "natural Spanish";
    case "french":
      return "natural French";
    case "arabic":
      return "natural Modern Standard Arabic";
    case "german":
      return "natural German";
    case "portuguese":
      return "natural Portuguese";
    case "vietnamese":
      return "natural Vietnamese";
    case "indonesian":
      return "natural Bahasa Indonesia";
    case "russian":
      return "natural Russian";
    case "italian":
      return "natural Italian";
    case "dutch":
      return "natural Dutch";
    case "turkish":
      return "natural Turkish";
    case "polish":
      return "natural Polish";
    case "swedish":
      return "natural Swedish";
    case "dual":
      return "Burmese on the first line and English on the second line";
    case "dual_lai_en":
      return "Hakha Lai on the first line and English on the second line";
    case "none":
      return "";
  }
}
