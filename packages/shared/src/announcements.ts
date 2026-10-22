import { z } from 'zod';

/**
 * An announcement to a website's email sign-ups (D-040). Plain text only: each paragraph is a
 * line, links are written out in full. Each subscriber receives their own language, or the other
 * one when theirs is empty; at least one language must be complete.
 */
const text = (max: number) => z.string().trim().max(max);

export const announcementSchema = z
  .strictObject({
    subject: z.strictObject({ ar: text(150), en: text(150) }),
    body: z.strictObject({ ar: text(5000), en: text(5000) }),
  })
  .refine(
    (a) => (a.subject.ar !== '' && a.body.ar !== '') || (a.subject.en !== '' && a.body.en !== ''),
    { message: 'Write the subject and the text in at least one language' },
  )
  .refine((a) => (a.subject.ar === '') === (a.body.ar === ''), {
    message: 'Arabic needs both a subject and a text, or neither',
  })
  .refine((a) => (a.subject.en === '') === (a.body.en === ''), {
    message: 'English needs both a subject and a text, or neither',
  });

export type Announcement = z.infer<typeof announcementSchema>;

/** The language a subscriber receives: their own when written, otherwise the other one. */
export function announcementLocale(announcement: Announcement, locale: string): 'ar' | 'en' {
  const own = locale === 'en' ? 'en' : 'ar';
  const other = own === 'ar' ? 'en' : 'ar';
  return announcement.subject[own] !== '' ? own : other;
}

/**
 * What the dashboard signs and the site Worker checks for an unsubscribe link: the site and the
 * subscriber, under a secret both share (UNSUBSCRIBE_SECRET).
 */
export const unsubscribeMessage = (siteId: string, subscriberId: string) =>
  `unsubscribe:${siteId}:${subscriberId}`;
