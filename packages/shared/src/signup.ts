import { z } from 'zod';
import { LOCALES } from './i18n';

/** Stored with every sign-up so the exact consent wording can be shown later. */
export const CONSENT_TEXT_VERSION = 'signup-consent-v1';

export type ContactResult =
  | { ok: true; type: 'email' | 'whatsapp'; value: string }
  | { ok: false; error: 'invalid-contact' | 'phone-needs-country-code' };

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** Normalises a launch sign-up: lower-case email, or a WhatsApp number in E.164 form. */
export function normalizeContact(raw: string): ContactResult {
  const value = raw.trim();
  if (value.length === 0 || value.length > 254) return { ok: false, error: 'invalid-contact' };

  if (value.includes('@')) {
    const email = value.toLowerCase();
    return EMAIL.test(email)
      ? { ok: true, type: 'email', value: email }
      : { ok: false, error: 'invalid-contact' };
  }

  let phone = value.replace(/[\s\-().]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: true, type: 'whatsapp', value: phone };
  if (/^\d{7,15}$/.test(phone)) return { ok: false, error: 'phone-needs-country-code' };
  return { ok: false, error: 'invalid-contact' };
}

export const signupRequestSchema = z.strictObject({
  contact: z.string().max(320),
  consent: z.literal(true),
  locale: z.enum(LOCALES),
  turnstileToken: z.string().min(1).max(2048),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
