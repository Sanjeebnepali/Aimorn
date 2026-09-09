/**
 * Every language Amora ships a translation file for. Adding support for a
 * new language is just: drop `locales/<code>.json` (same key shape as
 * `locales/en.json`) and add one entry here — no other code changes needed
 * anywhere in the app (see `index.ts`'s `resources` map, built from this
 * list).
 *
 * `nativeName` is what's shown in the language picker — always the
 * language's own name in its own script (e.g. "한국어", not "Korean"), so a
 * user who can't read the app's current language can still find their own.
 * `rtl` drives `I18nManager`'s layout direction — see `index.ts`'s doc
 * comment for what that does and doesn't cover today.
 */
export type LanguageCode =
  | 'en'
  | 'ko'
  | 'ja'
  | 'zh'
  | 'ne'
  | 'hi'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ar'
  | 'ru'
  | 'id'
  | 'vi'
  | 'th'
  | 'tr'
  | 'it'
  | 'pl'
  | 'uk'
  | 'nl'
  | 'bn'
  | 'ur'
  | 'fil'
  | 'ms'
  | 'fa'
  | 'sw'
  | 'ro'
  | 'el'
  | 'he'
  | 'cs'
  | 'sv';

export type LanguageInfo = {
  code: LanguageCode;
  /** English name — used only in code comments / fallback contexts, never shown in the picker. */
  englishName: string;
  nativeName: string;
  rtl: boolean;
};

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', englishName: 'English', nativeName: 'English', rtl: false },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', rtl: false },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', rtl: false },
  { code: 'zh', englishName: 'Chinese (Simplified)', nativeName: '中文（简体）', rtl: false },
  { code: 'ne', englishName: 'Nepali', nativeName: 'नेपाली', rtl: false },
  { code: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', rtl: false },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', rtl: false },
  { code: 'fr', englishName: 'French', nativeName: 'Français', rtl: false },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', rtl: false },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português', rtl: false },
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', rtl: false },
  { code: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false },
  { code: 'vi', englishName: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false },
  { code: 'th', englishName: 'Thai', nativeName: 'ไทย', rtl: false },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', rtl: false },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano', rtl: false },
  { code: 'pl', englishName: 'Polish', nativeName: 'Polski', rtl: false },
  { code: 'uk', englishName: 'Ukrainian', nativeName: 'Українська', rtl: false },
  { code: 'nl', englishName: 'Dutch', nativeName: 'Nederlands', rtl: false },
  { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', rtl: false },
  { code: 'ur', englishName: 'Urdu', nativeName: 'اردو', rtl: true },
  { code: 'fil', englishName: 'Filipino', nativeName: 'Filipino', rtl: false },
  { code: 'ms', englishName: 'Malay', nativeName: 'Bahasa Melayu', rtl: false },
  { code: 'fa', englishName: 'Persian', nativeName: 'فارسی', rtl: true },
  { code: 'sw', englishName: 'Swahili', nativeName: 'Kiswahili', rtl: false },
  { code: 'ro', englishName: 'Romanian', nativeName: 'Română', rtl: false },
  { code: 'el', englishName: 'Greek', nativeName: 'Ελληνικά', rtl: false },
  { code: 'he', englishName: 'Hebrew', nativeName: 'עברית', rtl: true },
  { code: 'cs', englishName: 'Czech', nativeName: 'Čeština', rtl: false },
  { code: 'sv', englishName: 'Swedish', nativeName: 'Svenska', rtl: false },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isSupportedLanguage(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}

export function getLanguageInfo(code: LanguageCode): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
