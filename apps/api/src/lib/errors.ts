import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error that is safe to show: a status and a stable code the dashboard translates. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const badRequest = (code: string, details?: Record<string, unknown>) => new HttpError(400, code, details);
export const unauthorized = () => new HttpError(401, 'unauthenticated');
export const forbidden = (code = 'forbidden', details?: Record<string, unknown>) => new HttpError(403, code, details);
export const notFound = () => new HttpError(404, 'not-found');
export const conflict = (code: string, details?: Record<string, unknown>) => new HttpError(409, code, details);
export const tooManyRequests = () => new HttpError(429, 'rate-limited');
