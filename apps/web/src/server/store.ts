import type pg from 'pg';

/**
 * The sign-up endpoint's database work, as the insert-only public user (hantex_public_app):
 * it can add sign-ups and count attempts, but never read sign-ups back.
 */
export function signupStore(client: Pick<pg.Client, 'query'>, siteId: string) {
  return {
    async allow(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
      const result = await client.query<{ count: number }>(
        `insert into form_rate_limits (site_id, key, count, window_started_at) values ($1, $2, 1, $3)
         on conflict (site_id, key) do update set
           count = case when form_rate_limits.window_started_at <= $4 then 1 else form_rate_limits.count + 1 end,
           window_started_at = case when form_rate_limits.window_started_at <= $4 then $3 else form_rate_limits.window_started_at end
         returning count`,
        [siteId, key, now, now - windowMs],
      );
      return (result.rows[0]?.count ?? 1) <= limit;
    },
    async insert(row: {
      type: string;
      value: string;
      locale: string;
      consentVersion: string;
    }): Promise<void> {
      await client.query(
        `insert into subscribers (site_id, contact_type, contact_value, locale, consent_version)
         values ($1, $2, $3, $4, $5) on conflict do nothing`,
        [siteId, row.type, row.value, row.locale, row.consentVersion],
      );
    },
    /** Removes one sign-up of this site, through the only function the public user may call. */
    async unsubscribe(subscriberId: string): Promise<boolean> {
      const result = await client.query<{ removed: boolean }>(
        'select unsubscribe($1, $2) as removed',
        [siteId, subscriberId],
      );
      return result.rows[0]?.removed === true;
    },
  };
}
