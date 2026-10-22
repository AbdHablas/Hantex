import { announcementSchema, type Announcement } from '@hantex/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { api, sitePath } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';
import { BilingualField } from './document';
import { Alert, Badge, Button, Card, ErrorText, Table, confirmAction, later } from './ui';

/**
 * Announcements to this website's email sign-ups (D-040). Written in both languages, then sent
 * in chunks while this page is open, within the daily sending limit; each email carries a
 * one-click unsubscribe link. WhatsApp numbers are exported from the page header instead.
 */

interface Row {
  id: string;
  content: Announcement;
  status: 'sending' | 'finished' | 'cancelled';
  createdAt: string;
  sent: number;
  failed: number;
}

interface Overview {
  announcements: Row[];
  recipients: number;
  dailyLimit: number;
  sentToday: number;
  hasDomain: boolean;
}

interface SendResult {
  sent: number;
  failed: number;
  remaining: number;
  limitReached: boolean;
  finished: boolean;
}

const empty: Announcement = { subject: { ar: '', en: '' }, body: { ar: '', en: '' } };

export function Announcements() {
  const { m, format, date, locale } = useI18n();
  const t = m.announce;
  const { siteKey } = useCurrentSite();
  const queryClient = useQueryClient();
  const key = ['site', siteKey, 'announcements'];
  const overview = useQuery({
    queryKey: key,
    queryFn: () => api<Overview>(sitePath(siteKey, '/announcements')),
  });
  const [draft, setDraft] = useState<Announcement>(empty);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(sitePath(siteKey, '/announcements'), { method: 'POST', body: draft }),
    onSuccess: async () => {
      setDraft(empty);
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(sitePath(siteKey, `/announcements/${id}/cancel`), { method: 'POST' }),
    onSuccess: refresh,
  });

  /** Sends chunk after chunk until everyone is reached or today's limit is used up. */
  const sendAll = async (id: string) => {
    setSending(true);
    setNotice(null);
    setError(null);
    try {
      for (;;) {
        const result = await api<SendResult>(sitePath(siteKey, `/announcements/${id}/send`), {
          method: 'POST',
        });
        await refresh();
        if (result.finished) {
          setNotice(t.finished);
          break;
        }
        if (result.limitReached) {
          setNotice(format(t.limitReached, { remaining: result.remaining }));
          break;
        }
        if (result.sent === 0 && result.failed === 0) break;
      }
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

  const data = overview.data;
  if (!data) return <ErrorText error={overview.error} />;
  const current = data.announcements.find((a) => a.status === 'sending');
  const past = data.announcements.filter((a) => a.status !== 'sending');
  const valid = announcementSchema.safeParse(draft).success;
  const subjectOf = (a: Announcement) =>
    a.subject[locale] || a.subject[locale === 'ar' ? 'en' : 'ar'];

  return (
    <Card
      title={t.title}
      icon={<Megaphone />}
      description={format(t.intro, {
        recipients: data.recipients,
        limit: data.dailyLimit,
        today: data.sentToday,
      })}
    >
      <div className="grid gap-5">
        {notice && <Alert tone="success">{notice}</Alert>}
        <ErrorText error={error ?? create.error ?? cancel.error} />
        {!data.hasDomain ? (
          <Alert>{t.needsDomain}</Alert>
        ) : current ? (
          <div className="grid gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{subjectOf(current.content)}</p>
              <Badge tone="warning">{t.inProgress}</Badge>
            </div>
            <p className="text-sm text-muted" role="status">
              {format(t.progress, {
                sent: current.sent,
                total: data.recipients,
                failed: current.failed,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                busy={sending}
                onClick={later(async () => {
                  const first = current.sent === 0 && current.failed === 0;
                  if (
                    first &&
                    !(await confirmAction(format(t.sendConfirm, { recipients: data.recipients })))
                  ) {
                    return;
                  }
                  await sendAll(current.id);
                })}
              >
                {current.sent === 0 && current.failed === 0 ? t.send : t.continue}
              </Button>
              <Button
                variant="danger"
                disabled={sending}
                onClick={later(async () => {
                  if (await confirmAction(t.cancelConfirm)) cancel.mutate(current.id);
                })}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) create.mutate();
            }}
          >
            <BilingualField
              label={t.subject}
              value={draft.subject}
              max={150}
              disabled={false}
              onChange={(subject) => setDraft({ ...draft, subject })}
            />
            <BilingualField
              label={t.body}
              value={draft.body}
              max={5000}
              multiline
              disabled={false}
              help={t.bodyHelp}
              onChange={(body) => setDraft({ ...draft, body })}
            />
            <div>
              <Button type="submit" disabled={!valid} busy={create.isPending}>
                {t.create}
              </Button>
            </div>
          </form>
        )}
        {past.length > 0 && (
          <Table>
            <tbody>
              {past.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{subjectOf(a.content)}</td>
                  <td>{date(a.createdAt)}</td>
                  <td>{format(t.sentCount, { sent: a.sent, failed: a.failed })}</td>
                  <td>
                    <Badge tone={a.status === 'finished' ? 'success' : 'neutral'}>
                      {a.status === 'finished' ? t.statusFinished : t.statusCancelled}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
