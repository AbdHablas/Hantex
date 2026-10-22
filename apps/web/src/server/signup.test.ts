import { CONSENT_TEXT_VERSION } from '@hantex/shared';
import { describe, expect, it } from 'vitest';
import { handleSignup, type SignupDeps } from './signup';

const ORIGIN = 'https://www.example.test';

function setup(overrides: Partial<SignupDeps> = {}) {
  const inserted: Parameters<SignupDeps['insert']>[0][] = [];
  const limits: string[] = [];
  const deps: SignupDeps = {
    siteId: 'site-1',
    verifyTurnstile: () => Promise.resolve(true),
    allow: (key) => {
      limits.push(key);
      return Promise.resolve(true);
    },
    insert: (row) => {
      inserted.push(row);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, inserted, limits };
}

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/signup`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const valid = {
  contact: ' Person@Example.com ',
  consent: true,
  locale: 'ar',
  turnstileToken: 'token',
};
const errorOf = async (response: Response) => (await response.json<{ error?: string }>()).error;

describe('launch sign-up endpoint', () => {
  it('stores a normalised sign-up for the site in its build data', async () => {
    const { deps, inserted } = setup();
    const response = await handleSignup(request(valid), deps);
    expect(response.status).toBe(200);
    expect(inserted).toEqual([
      {
        siteId: 'site-1',
        type: 'email',
        value: 'person@example.com',
        locale: 'ar',
        consentVersion: CONSENT_TEXT_VERSION,
      },
    ]);
  });

  it('records the news consent wording for sign-ups from a live site', async () => {
    const { deps, inserted } = setup();
    await handleSignup(request({ ...valid, purpose: 'news' }), deps);
    expect(inserted[0]?.consentVersion).toBe('news-consent-v1');
    expect((await handleSignup(request({ ...valid, purpose: 'spam' }), deps)).status).toBe(400);
  });

  it('accepts WhatsApp numbers in international form', async () => {
    const { deps, inserted } = setup();
    await handleSignup(request({ ...valid, contact: '00963 933 000 111' }), deps);
    expect(inserted[0]).toMatchObject({ type: 'whatsapp', value: '+963933000111' });
  });

  it('refuses requests from other origins or without one', async () => {
    const { deps, inserted } = setup();
    expect(
      (await handleSignup(request(valid, { Origin: 'https://evil.example' }), deps)).status,
    ).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valid),
    });
    expect((await handleSignup(noOrigin, deps)).status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it('needs consent, a valid contact and a passed Turnstile check', async () => {
    const { deps, inserted } = setup();
    expect(await errorOf(await handleSignup(request({ ...valid, consent: false }), deps))).toBe(
      'consent-required',
    );
    expect(
      await errorOf(await handleSignup(request({ ...valid, contact: 'not a contact' }), deps)),
    ).toBe('invalid-contact');
    expect(
      await errorOf(await handleSignup(request({ ...valid, contact: '0933000111' }), deps)),
    ).toBe('phone-needs-country-code');
    const failing = setup({ verifyTurnstile: () => Promise.resolve(false) });
    expect(await errorOf(await handleSignup(request(valid), failing.deps))).toBe('captcha-failed');
    expect([...inserted, ...failing.inserted]).toEqual([]);
  });

  it('silently drops bot submissions that fill the hidden field', async () => {
    const { deps, inserted } = setup();
    const response = await handleSignup(
      request({ ...valid, website: 'https://spam.example' }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(inserted).toEqual([]);
  });

  it('rate-limits by a hash of the visitor address, never the address itself', async () => {
    const { deps, limits } = setup();
    await handleSignup(request(valid), deps);
    expect(limits[0]).toMatch(/^signup:[0-9a-f]{64}$/);
    expect(limits[0]).not.toContain('203.0.113.9');
    const limited = setup({ allow: () => Promise.resolve(false) });
    const response = await handleSignup(request(valid), limited.deps);
    expect(response.status).toBe(429);
    expect(limited.inserted).toEqual([]);
  });

  it('is unavailable on a site built without a database', async () => {
    const { deps } = setup({ siteId: null });
    expect((await handleSignup(request(valid), deps)).status).toBe(503);
  });

  it('rejects oversized, malformed and unknown-field bodies', async () => {
    const { deps } = setup();
    expect((await handleSignup(request('x'.repeat(5000)), deps)).status).toBe(413);
    expect((await handleSignup(request('{not json'), deps)).status).toBe(400);
    expect((await handleSignup(request({ ...valid, extra: 1 }), deps)).status).toBe(400);
    expect(
      (await handleSignup(request(valid, { 'Content-Type': 'text/plain' }), deps)).status,
    ).toBe(415);
  });
});
