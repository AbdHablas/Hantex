import { z } from 'zod';
import { LOCALES } from './i18n';

/** Multi-website platform (D-024): every public website is a site. */

export const SITE_MODES = ['coming-soon', 'live', 'maintenance'] as const;
export type SiteMode = (typeof SITE_MODES)[number];

export const SITE_TEMPLATES = ['coming-soon', 'product-showcase'] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const DOMAIN_STATUSES = ['pending', 'active', 'removed'] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

/**
 * A site's short key: it names the site's Worker (`site-<key>`, D-028) and appears in dashboard
 * API addresses (`/api/sites/:siteKey/...`). Lowercase letters, digits and single hyphens.
 */
export const SITE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$/;
export const siteKeySchema = z
  .string()
  .regex(SITE_KEY_PATTERN, 'Use 2–40 lowercase letters, digits and hyphens');

/** A lowercase hostname such as www.example.com: at least two labels, no scheme, port or path. */
export const HOSTNAME_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(HOSTNAME_PATTERN, 'Use a domain name such as www.example.com');

const localeSchema = z.enum(LOCALES);

/** Starting structures for a new website's pages and menus (D-038; defined in @hantex/sections). */
export const SITE_STARTERS = ['blank', 'business', 'product-brand'] as const;
export type SiteStarter = (typeof SITE_STARTERS)[number];

/** Fields the Owner enters when creating a site. New sites always start in Coming Soon mode. */
export const newSiteSchema = z
  .strictObject({
    key: siteKeySchema,
    name: z.strictObject({
      ar: z.string().trim().min(1).max(80),
      en: z.string().trim().min(1).max(80),
    }),
    locales: z.array(localeSchema).min(1).max(LOCALES.length),
    defaultLocale: localeSchema,
    template: z.enum(SITE_TEMPLATES),
    /**
     * The new site's first theme draft (D-027): a built-in or saved preset, or a copy of another
     * site's published theme. Without it, the site starts from the brand theme.
     */
    startTheme: z
      .union([
        z.strictObject({ preset: z.string().min(1).max(64) }),
        z.strictObject({ site: siteKeySchema }),
      ])
      .optional(),
    /**
     * The new site's pages, menus and layout: a starter template, or a copy of another site's
     * current content (D-038). Without it, the site starts with a home page only.
     */
    startFrom: z
      .union([
        z.strictObject({ starter: z.enum(SITE_STARTERS) }),
        z.strictObject({ duplicate: siteKeySchema }),
      ])
      .optional(),
  })
  .refine((site) => new Set(site.locales).size === site.locales.length, {
    message: 'Each language may appear only once',
    path: ['locales'],
  })
  .refine((site) => site.locales.includes(site.defaultLocale), {
    message: 'The default language must be one of the site languages',
    path: ['defaultLocale'],
  });
export type NewSite = z.infer<typeof newSiteSchema>;
