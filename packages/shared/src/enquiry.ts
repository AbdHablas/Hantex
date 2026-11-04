import { z } from 'zod';
import { LOCALES } from './i18n';

/**
 * Enquiries and quotation requests (D-051), sent from a live website's product pages and
 * enquiry sections. Stored with the consent wording's version, like sign-ups.
 */
export const ENQUIRY_CONSENT_VERSION = 'enquiry-consent-v1';

/** A question about a product or the business, or a request for a quotation. */
export const ENQUIRY_KINDS = ['enquiry', 'quote'] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export const ENQUIRY_STATUSES = ['new', 'replied', 'closed'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Whether a text holds control characters (line breaks allowed only where `lines` is set). */
const hasControl = (value: string, lines: boolean) =>
  [...value].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (lines && (code === 10 || code === 13)) return false;
    return code < 32 || code === 127;
  });

/** Free text without control characters; line breaks only where `lines` is set. */
const plain = (max: number, lines = false) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !hasControl(v, lines), { message: 'Unexpected characters' });

export const enquiryRequestSchema = z.strictObject({
  kind: z.enum(ENQUIRY_KINDS),
  /** The catalogue product asked about; its name is taken from the site, not from the request. */
  productId: z
    .string()
    .regex(/^[a-z0-9]{6,24}$/)
    .nullable(),
  name: plain(100).pipe(z.string().min(1)),
  /** An email address or a WhatsApp number, as for sign-ups. */
  contact: z.string().max(320),
  company: plain(120).default(''),
  quantity: z.number().int().min(1).max(1_000_000).nullable().default(null),
  message: plain(2000, true).pipe(z.string().min(1)),
  consent: z.literal(true),
  locale: z.enum(LOCALES),
  turnstileToken: z.string().min(1).max(2048),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});
export type EnquiryRequest = z.infer<typeof enquiryRequestSchema>;
