import type {
  ComingSoonContent,
  Locale,
  SiteMode,
  SiteSettings,
  SiteTemplate,
} from '@hantex/shared';
import type { Theme } from '@hantex/theme';
import data from './data/site.json';

/** One site's build data, written by scripts/site-data.ts from its published content. */
export interface SiteData {
  /** 'defaults' when built without a database (development, CI): no facts, no sign-ups. */
  source: 'database' | 'defaults';
  site: {
    /** Set only when built from the database; sign-ups are stored against it. */
    id: string | null;
    key: string;
    name: { ar: string; en: string };
    locales: Locale[];
    defaultLocale: Locale;
    mode: SiteMode;
    template: SiteTemplate;
    primaryDomain: string | null;
  };
  /** Cloudflare Turnstile's public site key for the sign-up form. */
  turnstileSiteKey: string;
  /** Adaptive logo files, or null to show the site's name as text. */
  logo: {
    mark: string;
    lockup: string;
    /** 1200×630 picture shown when a link to the site is shared (Open Graph). */
    share: string;
    /** 180×180 icon for phone home screens. */
    touchIcon: string;
  } | null;
  versions: { comingSoon: number | null; settings: number | null; theme: number | null };
  comingSoon: ComingSoonContent;
  settings: SiteSettings;
  theme: Theme;
}

export const SITE = data as SiteData;

/** The address of a page in one language: the default language at "/", others at "/en/". */
export const pathFor = (locale: Locale) =>
  locale === SITE.site.defaultLocale ? '/' : `/${locale}/`;
