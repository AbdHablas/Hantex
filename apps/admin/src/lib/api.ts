/**
 * Calls the dashboard API on the same origin. Session cookies are HttpOnly and SameSite=Strict,
 * so nothing about the session is visible to this code. Errors carry the API's stable code,
 * which the interface translates (lib/i18n.tsx).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
    signal: init.signal ?? null,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      details?: Record<string, unknown>;
    } | null;
    throw new ApiError(response.status, body?.error ?? 'request-error', body?.details);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('Content-Type') ?? '';
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

/** `/sites/<key>/...` for the site-scoped API (D-024). */
export const sitePath = (siteKey: string, path = '') =>
  `/sites/${encodeURIComponent(siteKey)}${path}`;
