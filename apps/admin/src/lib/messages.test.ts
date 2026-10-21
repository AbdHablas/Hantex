import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';

/** Every key path in a nested message object, e.g. "auth.signIn". */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('dashboard messages', () => {
  it('has every text in both Arabic and English', () => {
    expect(keys(MESSAGES.ar).sort()).toEqual(keys(MESSAGES.en).sort());
  });

  it('has no empty texts', () => {
    for (const locale of ['ar', 'en'] as const) {
      const empty = keys(MESSAGES[locale]).filter((path) => {
        const value = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], MESSAGES[locale]);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empty, locale).toEqual([]);
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (text: unknown) =>
      typeof text === 'string' ? (text.match(/\{\w+\}/g) ?? []).sort() : [];
    for (const path of keys(MESSAGES.en)) {
      const get = (root: unknown) =>
        path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], root);
      expect(placeholders(get(MESSAGES.ar)), path).toEqual(placeholders(get(MESSAGES.en)));
    }
  });
});
