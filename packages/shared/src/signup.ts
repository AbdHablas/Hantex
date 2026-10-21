import { z } from 'zod';
import { LOCALES } from './i18n';

/** Stored with every sign-up so the exact consent wording can be shown later. */
export const CONSENT_TEXT_VERSION = 'signup-consent-v1';

export { normalizeContact, type ContactResult } from './contact';

export const signupRequestSchema = z.strictObject({
  contact: z.string().max(320),
  consent: z.literal(true),
  locale: z.enum(LOCALES),
  turnstileToken: z.string().min(1).max(2048),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
