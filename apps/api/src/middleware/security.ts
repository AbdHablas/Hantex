import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../context';
import { forbidden } from '../lib/errors';

/** Headers for every API response: never cached, never framed, never sniffed (docs/security.md). */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (c.env.ENVIRONMENT !== 'development') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request protection for every state-changing request, in addition to SameSite=Strict
 * cookies: the Origin must be the dashboard's own origin.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('Origin');
    const sameSite = c.req.header('Sec-Fetch-Site');
    const allowed = origin ? origin === c.env.APP_ORIGIN : sameSite === 'same-origin';
    if (!allowed) throw forbidden('cross-origin-request');
  }
  await next();
};

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('requestId', c.req.header('cf-ray') ?? crypto.randomUUID());
  await next();
};
