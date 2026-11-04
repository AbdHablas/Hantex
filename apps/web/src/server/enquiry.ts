import { ENQUIRY_CONSENT_VERSION, enquiryRequestSchema, normalizeContact } from '@hantex/shared';
import { sha256Hex } from './crypto';

/** One enquiry as stored; status always starts as 'new' (set by the database). */
export interface EnquiryRow {
  siteId: string;
  kind: 'enquiry' | 'quote';
  productId: string | null;
  productName: string;
  name: string;
  contactType: 'email' | 'whatsapp';
  contactValue: string;
  company: string;
  quantity: number | null;
  message: string;
  locale: string;
  consentVersion: string;
}

/** What the enquiry endpoint needs from the outside world, so it can be tested without it. */
export interface EnquiryDeps {
  /** From the site's own build data, never from the request (docs/security.md). */
  siteId: string | null;
  /** Enquiries are taken only on a live site. */
  live: boolean;
  /** The name a visible product has on the site in a language, or null for no such product. */
  productName: (productId: string, locale: 'ar' | 'en') => string | null;
  verifyTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  /** Fixed-window limit; true when the request is allowed. */
  allow: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  insert: (row: EnquiryRow) => Promise<void>;
}

const MAX_BODY_BYTES = 8192;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** POST /api/enquiry — an enquiry or quotation request (D-051). */
export async function handleEnquiry(request: Request, deps: EnquiryDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  // Only the site's own pages may post here.
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json(403, { error: 'forbidden' });
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) {
    return json(415, { error: 'request-error' });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: 'request-error' });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: 'request-error' });
  }
  const parsed = enquiryRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const error =
      field === 'consent'
        ? 'consent-required'
        : field === 'name'
          ? 'name-required'
          : field === 'message'
            ? 'message-required'
            : field === 'quantity'
              ? 'invalid-quantity'
              : 'request-error';
    return json(400, { error });
  }
  const body = parsed.data;
  // Honeypot filled in: answer as if it worked, store nothing.
  if (body.website) return json(200, { ok: true });
  if (!deps.siteId || !deps.live) return json(503, { error: 'unavailable' });

  // The product's name is the site's own, as the visitor saw it; never taken from the request.
  let productName = '';
  if (body.productId !== null) {
    const found = deps.productName(body.productId, body.locale);
    if (found === null) return json(400, { error: 'request-error' });
    productName = found.slice(0, 120);
  }

  const contact = normalizeContact(body.contact);
  if (!contact.ok) return json(400, { error: contact.error });

  // Rate limit by a hash of the visitor's address; the address itself is never stored.
  const ip = request.headers.get('CF-Connecting-IP');
  const visitor = await sha256Hex(`${deps.siteId}:${ip ?? 'unknown'}`);
  if (!(await deps.allow(`enquiry:${visitor}`, 5, 60 * 60 * 1000))) {
    return json(429, { error: 'rate-limited' });
  }
  if (!(await deps.verifyTurnstile(body.turnstileToken, ip))) {
    return json(400, { error: 'captcha-failed' });
  }

  await deps.insert({
    siteId: deps.siteId,
    kind: body.kind,
    productId: body.productId,
    productName,
    name: body.name,
    contactType: contact.type,
    contactValue: contact.value,
    company: body.company,
    quantity: body.quantity,
    message: body.message,
    locale: body.locale,
    consentVersion: ENQUIRY_CONSENT_VERSION,
  });
  return json(200, { ok: true });
}
