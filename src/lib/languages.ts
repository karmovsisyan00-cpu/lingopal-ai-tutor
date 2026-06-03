export const LANGUAGES = [
  { code: "English", flag: "🇬🇧", bcp47: "en-US" },
  { code: "Russian", flag: "🇷🇺", bcp47: "ru-RU" },
  { code: "Armenian", flag: "🇦🇲", bcp47: "hy-AM" },
  { code: "Spanish", flag: "🇪🇸", bcp47: "es-ES" },
  { code: "French", flag: "🇫🇷", bcp47: "fr-FR" },
  { code: "German", flag: "🇩🇪", bcp47: "de-DE" },
  { code: "Italian", flag: "🇮🇹", bcp47: "it-IT" },
  { code: "Portuguese", flag: "🇵🇹", bcp47: "pt-PT" },
  { code: "Japanese", flag: "🇯🇵", bcp47: "ja-JP" },
  { code: "Mandarin", flag: "🇨🇳", bcp47: "zh-CN" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Level = (typeof LEVELS)[number];

export function bcp47For(language: string): string {
  return LANGUAGES.find((l) => l.code === language)?.bcp47 ?? "en-US";
}

export function flagFor(language: string): string {
  return LANGUAGES.find((l) => l.code === language)?.flag ?? "🌐";
}
