const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random URL-safe token (256 bits by default) for invitations and enrolment tickets. */
export const randomToken = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

/** SHA-256 for high-entropy tokens, which cannot be guessed from their hash. */
export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Keyed hash (HMAC-SHA-256) for low-entropy codes, so a database copy alone cannot reveal them. */
export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Uniformly random characters from `alphabet` (rejection sampling, no modulo bias). */
function randomFrom(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

export const randomDigits = (length: number) => randomFrom('0123456789', length);

// Crockford-style alphabet without easily confused characters (0/O, 1/I/L, U).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A recovery code such as "K7M2Q-9XRTD" (about 49 bits of entropy). */
export function recoveryCode(): string {
  const raw = randomFrom(CODE_ALPHABET, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Normalises user-typed recovery codes: case, spaces and dashes do not matter. */
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');
