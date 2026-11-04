import { ENQUIRY_CONSENT_VERSION } from '@hantex/shared';
import { describe, expect, it } from 'vitest';
import { handleEnquiry, type EnquiryDeps, type EnquiryRow } from './enquiry';

const ORIGIN = 'https://www.example.test';

function setup(overrides: Partial<EnquiryDeps> = {}) {
  const inserted: EnquiryRow[] = [];
  const limits: string[] = [];
  const deps: EnquiryDeps = {
    siteId: 'site-1',
    live: true,
    productName: (id, locale) =>
      id === 'prdone01' ? (locale === 'ar' ? 'مفتاح' : 'One-gang switch') : null,
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
  new Request(`${ORIGIN}/api/enquiry`, {
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
  kind: 'quote',
  productId: 'prdone01',
  name: ' Sam ',
  contact: ' Sam@Example.com ',
  company: '',
  quantity: 20,
  message: 'Price for 20?',
  consent: true,
  locale: 'en',
  turnstileToken: 'token',
};
const errorOf = async (response: Response) => (await response.json<{ error?: string }>()).error;

describe('enquiry endpoint (D-051)', () => {
  it('stores an enquiry with the product name from the site, never from the request', async () => {
    const { deps, inserted, limits } = setup();
    const response = await handleEnquiry(request(valid), deps);
    expect(response.status).toBe(200);
    expect(inserted).toEqual([
      {
        siteId: 'site-1',
        kind: 'quote',
        productId: 'prdone01',
        productName: 'One-gang switch',
        name: 'Sam',
        contactType: 'email',
        contactValue: 'sam@example.com',
        company: '',
        quantity: 20,
        message: 'Price for 20?',
        locale: 'en',
        consentVersion: ENQUIRY_CONSENT_VERSION,
      },
    ]);
    // Rate limited by a hash of the address, never the address itself.
    expect(limits[0]).toMatch(/^enquiry:[0-9a-f]{64}$/);
    expect(limits[0]).not.toContain('203.0.113.9');
  });

  it('refuses unknown or hidden products, and other origins', async () => {
    const { deps, inserted } = setup();
    expect((await handleEnquiry(request({ ...valid, productId: 'prdhidden' }), deps)).status).toBe(
      400,
    );
    const foreign = await handleEnquiry(request(valid, { Origin: 'https://evil.example' }), deps);
    expect(foreign.status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it('says which field is missing or wrong', async () => {
    const { deps } = setup();
    expect(await errorOf(await handleEnquiry(request({ ...valid, consent: false }), deps))).toBe(
      'consent-required',
    );
    expect(await errorOf(await handleEnquiry(request({ ...valid, name: '' }), deps))).toBe(
      'name-required',
    );
    expect(await errorOf(await handleEnquiry(request({ ...valid, message: ' ' }), deps))).toBe(
      'message-required',
    );
    expect(await errorOf(await handleEnquiry(request({ ...valid, quantity: -1 }), deps))).toBe(
      'invalid-quantity',
    );
    expect(
      await errorOf(await handleEnquiry(request({ ...valid, contact: '0933 123 456' }), deps)),
    ).toBe('phone-needs-country-code');
  });

  it('stores nothing for bots, failed checks, rate limits or a site not yet live', async () => {
    const bot = setup();
    expect((await handleEnquiry(request({ ...valid, website: 'x' }), bot.deps)).status).toBe(200);
    expect(bot.inserted).toEqual([]);
    const captcha = setup({ verifyTurnstile: () => Promise.resolve(false) });
    expect(await errorOf(await handleEnquiry(request(valid), captcha.deps))).toBe('captcha-failed');
    const limited = setup({ allow: () => Promise.resolve(false) });
    expect((await handleEnquiry(request(valid), limited.deps)).status).toBe(429);
    const soon = setup({ live: false });
    expect((await handleEnquiry(request(valid), soon.deps)).status).toBe(503);
    for (const s of [captcha, limited, soon]) expect(s.inserted).toEqual([]);
  });

  it('refuses oversized bodies and other content types', async () => {
    const { deps } = setup();
    expect((await handleEnquiry(request('x'.repeat(9000)), deps)).status).toBe(413);
    expect(
      (await handleEnquiry(request(valid, { 'Content-Type': 'text/plain' }), deps)).status,
    ).toBe(415);
  });
});
