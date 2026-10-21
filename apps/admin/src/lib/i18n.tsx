import { DEFAULT_LOCALE, LOCALES, type Locale } from '@hantex/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from './api';
import { MESSAGES, type Messages } from './messages';

const STORAGE_KEY = 'hx-locale';

interface I18n {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  m: Messages;
  setLocale: (locale: Locale) => void;
  /** Replaces {name} placeholders. */
  format: (template: string, values?: Record<string, string | number>) => string;
  /** A translated message for any error, using the API's stable error code. */
  errorText: (error: unknown) => string;
  date: (value: string | Date | null | undefined, withTime?: boolean) => string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.title = MESSAGES[locale].appName;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered; the choice still applies to this visit.
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const m = MESSAGES[locale];
    const format = (template: string, values: Record<string, string | number> = {}) =>
      template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match,
      );
    const dateFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      dateStyle: 'medium',
    });
    const dateTimeFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return {
      locale,
      dir,
      m,
      setLocale,
      format,
      errorText: (error) => {
        const code = error instanceof ApiError ? error.code : 'request-error';
        return m.errors[code] ?? m.errors['request-error'] ?? code;
      },
      date: (value, withTime = false) => {
        if (!value) return '';
        const date = typeof value === 'string' ? new Date(value) : value;
        return (withTime ? dateTimeFormat : dateFormat).format(date);
      },
    };
  }, [locale, dir, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

/** Picks the text for the current dashboard language from a bilingual value. */
export function useBilingual() {
  const { locale } = useI18n();
  return (value: { ar: string; en: string } | null | undefined) =>
    value ? value[locale] || value.ar || value.en : '';
}
