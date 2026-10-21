import { base64Url, hmacHex } from './crypto';

const encoder = new TextEncoder();

/**
 * Signs draft content for a preview rendered by the public site (POST /preview).
 * The public site verifies the signature and expiry with the same shared secret, so drafts are
 * never stored where the public site could read them.
 */
export async function signPreview(
  secret: string,
  payload: unknown,
  ttlSeconds = 600,
  now = Date.now(),
): Promise<{ payload: string; expires: number; signature: string }> {
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const expires = Math.floor(now / 1000) + ttlSeconds;
  const signature = await hmacHex(secret, `${encoded}.${expires}`);
  return { payload: encoded, expires, signature };
}
