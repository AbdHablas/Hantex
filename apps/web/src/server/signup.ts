import { CONSENT_VERSIONS, normalizeContact, signupRequestSchema } from '@hantex/shared';
import { sha256Hex } from './crypto';

/** What the sign-up endpoint needs from the outside world, so it can be tested without it. */
export interface SignupDeps {
  /** From the site's own build data, never from the request (docs/security.md). */
  siteId: string | null;
  verifyTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  /** Fixed-window limit; true when the request is allowed. */
  allow: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  /** Inserts the sign-up, ignoring duplicates. */
  insert: (row: {
    siteId: string;
    type: 'email' | 'whatsapp';
    value: string;
    locale: string;
    consentVersion: string;
  }) => Promise<void>;
}

const MAX_BODY_BYTES = 4096;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** POST /api/signup — launch-notification (D-018) or news sign-up. */
export async function handleSignup(request: Request, deps: SignupDeps): Promise<Response> {
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
  const parsed = signupRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === 'consent');
    return json(400, { error: consentMissing ? 'consent-required' : 'request-error' });
  }
  const body = parsed.data;
  // Honeypot filled in: answer as if it worked, store nothing.
  if (body.website) return json(200, { ok: true });
  if (!deps.siteId) return json(503, { error: 'unavailable' });

  const contact = normalizeContact(body.contact);
  if (!contact.ok) return json(400, { error: contact.error });

  // Rate limit by a hash of the visitor's address; the address itself is never stored.
  const ip = request.headers.get('CF-Connecting-IP');
  const visitor = await sha256Hex(`${deps.siteId}:${ip ?? 'unknown'}`);
  if (!(await deps.allow(`signup:${visitor}`, 5, 10 * 60 * 1000)))
    return json(429, { error: 'rate-limited' });

  if (!(await deps.verifyTurnstile(body.turnstileToken, ip)))
    return json(400, { error: 'captcha-failed' });

  await deps.insert({
    siteId: deps.siteId,
    type: contact.type,
    value: contact.value,
    locale: body.locale,
    consentVersion: CONSENT_VERSIONS[body.purpose],
  });
  // The same answer for new and existing sign-ups, so nobody can test who has signed up.
  return json(200, { ok: true });
}

/** Cloudflare Turnstile server-side check. */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
): Promise<boolean> {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  // Fails closed: if Cloudflare can't be reached, the check fails.
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!response.ok) return false;
    const result: { success?: boolean } = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}
