import { DEFAULT_COMING_SOON, DEFAULT_SITE_SETTINGS } from '@hantex/shared';
import { brandTheme } from '@hantex/theme';
import { describe, expect, it } from 'vitest';
import { hmacHex } from './crypto';
import { verifyPreview } from './preview';

/** base64url, as the dashboard encodes preview payloads. */
const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const SECRET = 'test-preview-secret-0123456789abcdef';
const data = {
  'coming-soon': DEFAULT_COMING_SOON,
  'site-settings': DEFAULT_SITE_SETTINGS,
  theme: brandTheme,
};

/** Signs exactly as the dashboard does (apps/api/src/lib/preview.ts). */
async function sign(payload: unknown, expires: number, secret = SECRET) {
  const encoded = base64Url(JSON.stringify(payload));
  return {
    payload: encoded,
    expires: String(expires),
    signature: await hmacHex(secret, `${encoded}.${expires}`),
  };
}

const later = () => Math.floor(Date.now() / 1000) + 600;

describe('draft preview signatures', () => {
  it('accepts a valid preview for this site', async () => {
    const fields = await sign({ site: 'hantex-ultra', data }, later());
    expect(await verifyPreview(SECRET, fields, 'hantex-ultra')).toMatchObject({
      theme: { version: 1 },
    });
  });

  it('rejects a preview signed for another site', async () => {
    const fields = await sign({ site: 'other-site', data }, later());
    expect(await verifyPreview(SECRET, fields, 'hantex-ultra')).toBeNull();
  });

  it('rejects expired, tampered and wrongly signed previews', async () => {
    const expired = await sign({ site: 'hantex-ultra', data }, Math.floor(Date.now() / 1000) - 1);
    expect(await verifyPreview(SECRET, expired, 'hantex-ultra')).toBeNull();
    const good = await sign({ site: 'hantex-ultra', data }, later());
    const tampered = { ...good, expires: String(Number(good.expires) + 3600) };
    expect(await verifyPreview(SECRET, tampered, 'hantex-ultra')).toBeNull();
    const otherKey = await sign({ site: 'hantex-ultra', data }, later(), 'another-secret');
    expect(await verifyPreview(SECRET, otherKey, 'hantex-ultra')).toBeNull();
    expect(await verifyPreview('', good, 'hantex-ultra')).toBeNull();
  });

  it('rejects signed data that fails the content schemas', async () => {
    const bad = await sign(
      { site: 'hantex-ultra', data: { ...data, theme: { version: 99 } } },
      later(),
    );
    expect(await verifyPreview(SECRET, bad, 'hantex-ultra')).toBeNull();
  });
});
