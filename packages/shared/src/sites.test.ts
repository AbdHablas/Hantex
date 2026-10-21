import { describe, expect, it } from 'vitest';
import { hostnameSchema, newSiteSchema, siteKeySchema } from './sites';

describe('siteKeySchema', () => {
  it('accepts short lowercase keys', () => {
    for (const key of ['hantex-ultra', 'ab', 'brand2', 'a-b-c']) {
      expect(siteKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it('rejects anything that could not name a Worker or an address safely', () => {
    for (const key of ['a', 'Hantex', '-x', 'x-', 'a--b', 'a_b', 'a b', 'a/b', 'x'.repeat(41)]) {
      expect(siteKeySchema.safeParse(key).success).toBe(false);
    }
  });
});

describe('hostnameSchema', () => {
  it('normalises and accepts domain names', () => {
    expect(hostnameSchema.parse(' WWW.HantexUltra.com ')).toBe('www.hantexultra.com');
    expect(hostnameSchema.safeParse('media.example.co').success).toBe(true);
  });

  it('rejects URLs, ports, paths and single labels', () => {
    for (const host of [
      'https://example.com',
      'example.com:443',
      'example.com/path',
      'localhost',
      '-bad.example.com',
      'a..b.com',
    ]) {
      expect(hostnameSchema.safeParse(host).success).toBe(false);
    }
  });
});

describe('newSiteSchema', () => {
  const site = {
    key: 'hantex-ultra',
    name: { ar: 'Hantex Ultra', en: 'Hantex Ultra' },
    locales: ['ar', 'en'],
    defaultLocale: 'ar',
    template: 'coming-soon',
  };

  it('accepts a valid site', () => {
    expect(newSiteSchema.safeParse(site).success).toBe(true);
  });

  it('requires the default language to be a site language', () => {
    expect(newSiteSchema.safeParse({ ...site, locales: ['en'], defaultLocale: 'ar' }).success).toBe(
      false,
    );
  });

  it('rejects repeated languages, unknown fields and a preset mode', () => {
    expect(newSiteSchema.safeParse({ ...site, locales: ['ar', 'ar'] }).success).toBe(false);
    expect(newSiteSchema.safeParse({ ...site, mode: 'live' }).success).toBe(false);
  });
});
