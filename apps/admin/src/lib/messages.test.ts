import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';

/** Every key path in a nested message object, e.g. ["auth", "signIn"]. Keys may contain dots. */
function paths(value: unknown, prefix: string[] = []): string[][] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => paths(child, [...prefix, key]));
}

const get = (root: unknown, path: string[]) =>
  path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], root);
const name = (path: string[]) => path.join(' › ');

describe('dashboard messages', () => {
  it('has every text in both Arabic and English', () => {
    expect(paths(MESSAGES.ar).map(name).sort()).toEqual(paths(MESSAGES.en).map(name).sort());
  });

  it('has no empty texts', () => {
    for (const locale of ['ar', 'en'] as const) {
      const empty = paths(MESSAGES[locale]).filter((path) => {
        const value = get(MESSAGES[locale], path);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empty.map(name), locale).toEqual([]);
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (text: unknown) =>
      typeof text === 'string' ? (text.match(/\{\w+\}/g) ?? []).sort() : [];
    for (const path of paths(MESSAGES.en)) {
      expect(placeholders(get(MESSAGES.ar, path)), name(path)).toEqual(
        placeholders(get(MESSAGES.en, path)),
      );
    }
  });
});
