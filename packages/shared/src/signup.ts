import { z } from 'zod';
import { LOCALES } from './i18n';

/** Stored with every sign-up so the exact consent wording can be shown later. */
export const CONSENT_TEXT_VERSION = 'signup-consent-v1';

/**
 * What a visitor signs up for: news of the launch (Coming Soon page) or news and updates (the
 * sign-up section of a live site). Each has its own consent wording and version.
 */
export const SIGNUP_PURPOSES = ['launch', 'news'] as const;
export type SignupPurpose = (typeof SIGNUP_PURPOSES)[number];
export const CONSENT_VERSIONS: Record<SignupPurpose, string> = {
  launch: CONSENT_TEXT_VERSION,
  news: 'news-consent-v1',
};

export { normalizeContact, type ContactResult } from './contact';

export const signupRequestSchema = z.strictObject({
  contact: z.string().max(320),
  consent: z.literal(true),
  locale: z.enum(LOCALES),
  turnstileToken: z.string().min(1).max(2048),
  purpose: z.enum(SIGNUP_PURPOSES).default('launch'),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
