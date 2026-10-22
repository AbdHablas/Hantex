import { describe, expect, it } from 'vitest';
import { announcementLocale, announcementSchema } from './announcements';
import {
  DEFAULT_COMING_SOON,
  DEFAULT_SITE_SETTINGS,
  comingSoonSchema,
  siteSettingsSchema,
} from './content';

describe('Coming Soon content', () => {
  it('defaults to a neutral message with no dates, claims or countdown (D-016)', () => {
    const content = comingSoonSchema.parse(DEFAULT_COMING_SOON);
    expect(content.launchAt).toBeNull();
    expect(content.milestones).toEqual([]);
    expect(content.highlights).toEqual([]);
    expect(content.headline.en).toBe('Coming soon');
    expect(content.headline.ar).toBe('قريباً');
  });

  it('accepts a launch time with an explicit offset only', () => {
    const ok = { ...DEFAULT_COMING_SOON, launchAt: '2026-12-20T19:00:00+03:00' };
    expect(comingSoonSchema.safeParse(ok).success).toBe(true);
    const noOffset = { ...DEFAULT_COMING_SOON, launchAt: '2026-12-20T19:00:00' };
    expect(comingSoonSchema.safeParse(noOffset).success).toBe(false);
  });

  it('limits text lengths and list sizes', () => {
    const long = { ...DEFAULT_COMING_SOON, tagline: { ar: '', en: 'x'.repeat(201) } };
    expect(comingSoonSchema.safeParse(long).success).toBe(false);
    const many = {
      ...DEFAULT_COMING_SOON,
      milestones: Array.from({ length: 13 }, () => ({
        date: '2026-01-01',
        title: { ar: 'م', en: 'm' },
        done: false,
      })),
    };
    expect(comingSoonSchema.safeParse(many).success).toBe(false);
  });

  it('lists only the stated product categories, titles only, and no FAQ answers', () => {
    const content = comingSoonSchema.parse(DEFAULT_COMING_SOON);
    expect(content.categories.map((c) => c.title.en)).toEqual([
      'Switches',
      'Sockets',
      'Lighting',
      'Lamps',
      'Accessories',
    ]);
    expect(content.categories.every((c) => c.text.ar === '' && c.text.en === '')).toBe(true);
    expect(content.faq).toEqual([]);
  });

  it('reads content saved before categories and FAQ existed as having none', () => {
    const { categories: _categories, faq: _faq, ...older } = DEFAULT_COMING_SOON;
    const content = comingSoonSchema.parse(older);
    expect(content.categories).toEqual([]);
    expect(content.faq).toEqual([]);
  });

  it('only accepts the category icons the site can draw', () => {
    const icon = (value: string) => ({
      ...DEFAULT_COMING_SOON,
      categories: [{ icon: value, title: { ar: 'م', en: 'm' }, text: { ar: '', en: '' } }],
    });
    expect(comingSoonSchema.safeParse(icon('socket')).success).toBe(true);
    expect(comingSoonSchema.safeParse(icon('<svg onload>')).success).toBe(false);
  });

  it('rejects impossible milestone dates and unknown fields', () => {
    const bad = {
      ...DEFAULT_COMING_SOON,
      milestones: [{ date: '2026-02-30', title: { ar: 'م', en: 'm' }, done: false }],
    };
    expect(comingSoonSchema.safeParse(bad).success).toBe(false);
    expect(comingSoonSchema.safeParse({ ...DEFAULT_COMING_SOON, html: '<script>' }).success).toBe(
      false,
    );
  });
});

describe('site settings', () => {
  it('starts empty', () => {
    expect(siteSettingsSchema.parse(DEFAULT_SITE_SETTINGS).contact.email).toBe('');
  });

  it('only accepts https links, so no javascript: or http: URLs reach the page', () => {
    const settings = (instagram: string) => ({
      ...DEFAULT_SITE_SETTINGS,
      social: { ...DEFAULT_SITE_SETTINGS.social, instagram },
    });
    expect(
      siteSettingsSchema.safeParse(settings('https://instagram.com/hantexultra')).success,
    ).toBe(true);
    expect(siteSettingsSchema.safeParse(settings('javascript:alert(1)')).success).toBe(false);
    expect(siteSettingsSchema.safeParse(settings('http://instagram.com/x')).success).toBe(false);
  });

  it('reads settings saved before the privacy note existed as having none', () => {
    const { privacy: _privacy, ...older } = DEFAULT_SITE_SETTINGS;
    expect(siteSettingsSchema.parse(older).privacy).toEqual({ note: { ar: '', en: '' }, url: '' });
    const link = (url: string) => ({
      ...DEFAULT_SITE_SETTINGS,
      privacy: { note: { ar: '', en: '' }, url },
    });
    expect(siteSettingsSchema.safeParse(link('javascript:alert(1)')).success).toBe(false);
  });

  it('accepts only a Cloudflare Web Analytics token, and none by default', () => {
    const { analytics: _analytics, ...older } = DEFAULT_SITE_SETTINGS;
    expect(siteSettingsSchema.parse(older).analytics.cloudflareToken).toBe('');
    const token = (cloudflareToken: string) => ({
      ...DEFAULT_SITE_SETTINGS,
      analytics: { cloudflareToken },
    });
    expect(siteSettingsSchema.safeParse(token('0123456789abcdef0123456789abcdef')).success).toBe(
      true,
    );
    expect(siteSettingsSchema.safeParse(token('"><script>')).success).toBe(false);
    expect(siteSettingsSchema.safeParse(token('0123456789ABCDEF')).success).toBe(false);
  });

  it('requires international phone numbers in E.164 form', () => {
    const contact = (phone: string) => ({
      ...DEFAULT_SITE_SETTINGS,
      contact: { ...DEFAULT_SITE_SETTINGS.contact, phone },
    });
    expect(siteSettingsSchema.safeParse(contact('+963933123456')).success).toBe(true);
    expect(siteSettingsSchema.safeParse(contact('0933123456')).success).toBe(false);
  });
});

describe('announcements (D-040)', () => {
  const a = (subject: { ar: string; en: string }, body: { ar: string; en: string }) => ({
    subject,
    body,
  });

  it('needs at least one complete language, and no half-written one', () => {
    expect(
      announcementSchema.safeParse(a({ ar: 'خبر', en: '' }, { ar: 'نص', en: '' })).success,
    ).toBe(true);
    expect(announcementSchema.safeParse(a({ ar: '', en: '' }, { ar: '', en: '' })).success).toBe(
      false,
    );
    expect(
      announcementSchema.safeParse(a({ ar: 'خبر', en: 'News' }, { ar: 'نص', en: '' })).success,
    ).toBe(false);
  });

  it('sends each subscriber their language, or the other one when theirs is empty', () => {
    const both = a({ ar: 'خبر', en: 'News' }, { ar: 'نص', en: 'Text' });
    const arabicOnly = a({ ar: 'خبر', en: '' }, { ar: 'نص', en: '' });
    expect(announcementLocale(both, 'en')).toBe('en');
    expect(announcementLocale(arabicOnly, 'en')).toBe('ar');
    expect(announcementLocale(both, 'ar')).toBe('ar');
  });
});
