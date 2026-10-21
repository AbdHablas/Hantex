import { describe, expect, it } from 'vitest';
import { normalizeContact, signupRequestSchema } from './signup';

describe('normalizeContact', () => {
  it('normalises emails to lower case', () => {
    expect(normalizeContact('  Name@Example.COM ')).toEqual({
      ok: true,
      type: 'email',
      value: 'name@example.com',
    });
  });

  it('normalises WhatsApp numbers to E.164', () => {
    expect(normalizeContact('+963 933-123 456')).toEqual({
      ok: true,
      type: 'whatsapp',
      value: '+963933123456',
    });
    expect(normalizeContact('00963 (933) 123456')).toEqual({
      ok: true,
      type: 'whatsapp',
      value: '+963933123456',
    });
  });

  it('asks for the country code when a number has none', () => {
    expect(normalizeContact('0933 123 456')).toEqual({
      ok: false,
      error: 'phone-needs-country-code',
    });
  });

  it('rejects malformed input', () => {
    expect(normalizeContact('not an email')).toEqual({ ok: false, error: 'invalid-contact' });
    expect(normalizeContact('a@b')).toEqual({ ok: false, error: 'invalid-contact' });
    expect(normalizeContact('+12')).toEqual({ ok: false, error: 'invalid-contact' });
    expect(normalizeContact('x'.repeat(300) + '@example.com')).toEqual({
      ok: false,
      error: 'invalid-contact',
    });
  });
});

describe('signupRequestSchema', () => {
  const valid = { contact: 'a@example.com', consent: true, locale: 'ar', turnstileToken: 'token' };

  it('requires explicit consent', () => {
    expect(signupRequestSchema.safeParse(valid).success).toBe(true);
    expect(signupRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it('accepts only the supported languages', () => {
    expect(signupRequestSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false);
  });

  it('allows the honeypot field to be present (empty for people, filled by bots)', () => {
    expect(signupRequestSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
  });
});
