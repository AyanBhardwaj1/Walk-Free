/**
 * The 25 languages Meta's Muse Voice Transcribe supports: its ISO 639-1
 * code, the name people know it by, and a BCP 47 tag for the browser's
 * own speech recognition when the Meta model isn't available.
 */
export const VOICE_LANGUAGES = [
  { code: "en", label: "English", tag: "en-US" },
  { code: "es", label: "Español", tag: "es-US" },
  { code: "zh", label: "中文", tag: "zh-CN" },
  { code: "hi", label: "हिन्दी", tag: "hi-IN" },
  { code: "ar", label: "العربية", tag: "ar-SA" },
  { code: "fr", label: "Français", tag: "fr-FR" },
  { code: "pt", label: "Português", tag: "pt-BR" },
  { code: "bn", label: "বাংলা", tag: "bn-IN" },
  { code: "ja", label: "日本語", tag: "ja-JP" },
  { code: "ko", label: "한국어", tag: "ko-KR" },
  { code: "de", label: "Deutsch", tag: "de-DE" },
  { code: "vi", label: "Tiếng Việt", tag: "vi-VN" },
  { code: "tl", label: "Tagalog", tag: "fil-PH" },
  { code: "ta", label: "தமிழ்", tag: "ta-IN" },
  { code: "te", label: "తెలుగు", tag: "te-IN" },
  { code: "mr", label: "मराठी", tag: "mr-IN" },
  { code: "kn", label: "ಕನ್ನಡ", tag: "kn-IN" },
  { code: "id", label: "Bahasa Indonesia", tag: "id-ID" },
  { code: "ms", label: "Bahasa Melayu", tag: "ms-MY" },
  { code: "it", label: "Italiano", tag: "it-IT" },
  { code: "nl", label: "Nederlands", tag: "nl-NL" },
  { code: "pl", label: "Polski", tag: "pl-PL" },
  { code: "tr", label: "Türkçe", tag: "tr-TR" },
  { code: "th", label: "ไทย", tag: "th-TH" },
  { code: "he", label: "עברית", tag: "he-IL" },
] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]["code"];
export const VOICE_LANGUAGE_CODES = VOICE_LANGUAGES.map((l) => l.code) as [
  VoiceLanguage,
  ...VoiceLanguage[],
];
