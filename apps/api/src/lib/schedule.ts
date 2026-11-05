import { sha256Hex } from './crypto';

/**
 * Scheduled publishing (D-054): what was scheduled is what goes live. A snapshot records each
 * changed item and a hash of its draft; at the scheduled time the site's changes must be exactly
 * these, unchanged, or nothing is published.
 */
export type ChangeSnapshot = { kind: string; key: string; hash: string }[];

/** JSON with object keys sorted, so data read back from the database compares equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export async function snapshotOf(
  items: { kind: string; key: string; data: unknown }[],
): Promise<ChangeSnapshot> {
  const entries = await Promise.all(
    items.map(async (item) => ({
      kind: item.kind,
      key: item.key,
      hash: await sha256Hex(JSON.stringify(canonical(item.data))),
    })),
  );
  return entries.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
}

export const sameSnapshot = (a: ChangeSnapshot, b: ChangeSnapshot) =>
  a.length === b.length &&
  a.every((x, i) => x.kind === b[i]?.kind && x.key === b[i]?.key && x.hash === b[i]?.hash);

/** The earliest and latest a publish can be scheduled, from now. */
export const SCHEDULE_MIN_MINUTES = 10;
export const SCHEDULE_MAX_DAYS = 90;
