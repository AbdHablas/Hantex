import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const bilingual = (max: number) => z.strictObject({ ar: text(max), en: text(max) });

/** A real calendar date in YYYY-MM-DD form. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Not a real date');

const isHttpsUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password
    );
  } catch {
    return false;
  }
};

export const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isHttpsUrl(v), 'Use a full https:// link');

export const optionalE164 = z
  .string()
  .trim()
  .regex(/^(\+[1-9]\d{7,14})?$/, 'Use the international format, for example +963…');

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === '' || EMAIL.test(v), 'Not a valid email address');

/**
 * Coming Soon page content, set from the dashboard (D-016). Every text is bilingual; empty text
 * hides that element in that language. Nothing factual is pre-filled.
 */
export const comingSoonSchema = z.strictObject({
  launchAt: z.iso.datetime({ offset: true }).nullable(),
  showCountdown: z.boolean(),
  headline: bilingual(120),
  tagline: bilingual(200),
  intro: bilingual(600),
  milestones: z
    .array(z.strictObject({ date: isoDate, title: bilingual(80), done: z.boolean() }))
    .max(12),
  readiness: z
    .array(z.strictObject({ label: bilingual(60), percent: z.number().int().min(0).max(100) }))
    .max(8),
  highlights: z.array(z.strictObject({ title: bilingual(60), text: bilingual(200) })).max(6),
  signup: z.strictObject({ enabled: z.boolean() }),
});

export type ComingSoonContent = z.infer<typeof comingSoonSchema>;

export const DEFAULT_COMING_SOON: ComingSoonContent = {
  launchAt: null,
  showCountdown: false,
  headline: { ar: 'قريباً', en: 'Coming soon' },
  tagline: { ar: '', en: '' },
  intro: { ar: '', en: '' },
  milestones: [],
  readiness: [],
  highlights: [],
  signup: { enabled: true },
};

/** Site-wide settings (contact details, social links, SEO defaults). */
export const siteSettingsSchema = z.strictObject({
  seo: z.strictObject({ title: bilingual(70), description: bilingual(160) }),
  contact: z.strictObject({
    phone: optionalE164,
    whatsapp: optionalE164,
    email: optionalEmail,
    address: bilingual(200),
    mapUrl: optionalHttpsUrl,
    hours: bilingual(100),
  }),
  social: z.strictObject({
    instagram: optionalHttpsUrl,
    facebook: optionalHttpsUrl,
    linkedin: optionalHttpsUrl,
    x: optionalHttpsUrl,
    youtube: optionalHttpsUrl,
    tiktok: optionalHttpsUrl,
  }),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  seo: { title: { ar: 'Hantex Ultra', en: 'Hantex Ultra' }, description: { ar: '', en: '' } },
  contact: {
    phone: '',
    whatsapp: '',
    email: '',
    address: { ar: '', en: '' },
    mapUrl: '',
    hours: { ar: '', en: '' },
  },
  social: { instagram: '', facebook: '', linkedin: '', x: '', youtube: '', tiktok: '' },
};
