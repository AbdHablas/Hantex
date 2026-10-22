import { unsubscribeMessage } from '@hantex/shared';
import { hmacHex, timingSafeEqual } from './crypto';

/**
 * One-click unsubscribe from announcement emails (D-040). The link names the subscriber and
 * carries a signature made by the dashboard with the secret both Workers share; only a valid
 * link for this site's own sign-up can remove it. Opening the link shows a confirmation (so mail
 * scanners that follow links remove nothing); the button, or a mail app's one-click request
 * (RFC 8058), removes the sign-up.
 */
export interface UnsubscribeDeps {
  /** From the site's own build data, never from the request. */
  siteId: string | null;
  secret: string;
  /** Removes the sign-up; false when it was already gone. */
  remove: (subscriberId: string) => Promise<boolean>;
}

export type UnsubscribeState = 'confirm' | 'done' | 'invalid';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export async function handleUnsubscribe(
  request: Request,
  deps: UnsubscribeDeps,
): Promise<UnsubscribeState> {
  const url = new URL(request.url);
  const subscriberId = url.searchParams.get('s') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!deps.siteId || !deps.secret || !UUID.test(subscriberId) || !HEX64.test(token)) {
    return 'invalid';
  }
  const expected = await hmacHex(deps.secret, unsubscribeMessage(deps.siteId, subscriberId));
  if (!timingSafeEqual(token, expected)) return 'invalid';
  if (request.method !== 'POST') return 'confirm';
  // Already removed counts as done: the visitor's wish is fulfilled either way.
  await deps.remove(subscriberId);
  return 'done';
}
