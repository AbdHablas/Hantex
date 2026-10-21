export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export interface Bilingual {
  ar: string;
  en: string;
}
