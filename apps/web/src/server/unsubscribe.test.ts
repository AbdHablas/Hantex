import { unsubscribeMessage } from '@hantex/shared';
import { describe, expect, it } from 'vitest';
import { hmacHex } from './crypto';
import { handleUnsubscribe } from './unsubscribe';

const SECRET = 'test-unsubscribe-secret';
const SITE = '11111111-1111-4111-8111-111111111111';
const PERSON = '22222222-2222-4222-8222-222222222222';

async function link(site = SITE, person = PERSON, secret = SECRET) {
  const t = await hmacHex(secret, unsubscribeMessage(site, person));
  return `https://www.example.test/unsubscribe?s=${person}&t=${t}`;
}

function setup() {
  const removed: string[] = [];
  return {
    removed,
    deps: {
      siteId: SITE,
      secret: SECRET,
      remove: (id: string) => {
        removed.push(id);
        return Promise.resolve(true);
      },
    },
  };
}

describe('unsubscribe links', () => {
  it('asks for confirmation when opened, and removes the sign-up when confirmed', async () => {
    const { deps, removed } = setup();
    const url = await link();
    expect(await handleUnsubscribe(new Request(url), deps)).toBe('confirm');
    expect(removed).toEqual([]);
    expect(await handleUnsubscribe(new Request(url, { method: 'POST' }), deps)).toBe('done');
    expect(removed).toEqual([PERSON]);
  });

  it('refuses links signed for another site, with another secret, or tampered with', async () => {
    const { deps, removed } = setup();
    const post = (url: string) => handleUnsubscribe(new Request(url, { method: 'POST' }), deps);
    expect(await post(await link('33333333-3333-4333-8333-333333333333'))).toBe('invalid');
    expect(await post(await link(SITE, PERSON, 'another-secret'))).toBe('invalid');
    const other = (await link()).replace(PERSON, '44444444-4444-4444-8444-444444444444');
    expect(await post(other)).toBe('invalid');
    expect(await post('https://www.example.test/unsubscribe?s=x&t=y')).toBe('invalid');
    expect(removed).toEqual([]);
  });

  it('does nothing on a site built without a database', async () => {
    const { deps } = setup();
    const url = await link();
    expect(await handleUnsubscribe(new Request(url), { ...deps, siteId: null })).toBe('invalid');
  });
});
