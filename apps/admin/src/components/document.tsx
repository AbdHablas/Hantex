import type { Permission } from '@hantex/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ZodType } from 'zod';
import { api, sitePath } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';
import { Alert, Button, Card, ErrorText, Field, Input, Table, Textarea, confirmAction } from './ui';

/**
 * Shared editing for one site's versioned documents (Coming Soon content, site settings, theme):
 * a draft that is saved, published (rebuilding the site) and rolled back (D-016, D-022).
 */

export type DocumentKind = 'coming-soon' | 'site-settings' | 'theme';

export type Bi = { ar: string; en: string };

interface DocumentResponse<T> {
  draft: T;
  draftUpdatedAt: string | null;
  published: { version: number; publishedAt: string } | null;
}

export interface PublishResult {
  version: number;
  job: { dispatched: boolean; detail: string } | null;
}

export interface VersionRow {
  version: number;
  publishedAt: string;
  restoredFrom: number | null;
  publishedBy: string | null;
}

export function useDocumentEditor<T>(options: {
  kind: DocumentKind;
  schema: ZodType<T>;
  edit: Permission[];
  publish: Permission[];
}) {
  const { kind, schema } = options;
  const { site, siteKey, can } = useCurrentSite();
  const { m, format } = useI18n();
  const queryClient = useQueryClient();
  const key = ['site', siteKey, 'doc', kind];
  const path = (suffix = '') => sitePath(siteKey, `/documents/${kind}${suffix}`);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api<DocumentResponse<T> & Record<string, unknown>>(path()),
    enabled: site !== null,
  });
  const versions = useQuery({
    queryKey: [...key, 'versions'],
    queryFn: () => api<VersionRow[]>(path('/versions')),
    enabled: site !== null,
  });

  const [draft, setDraft] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data.draft);
  }, [query.data, dirty]);

  const archived = site?.archived === true;
  const editable = can(...options.edit) && !archived;
  const canPublish = can(...options.publish) && !archived;
  const parsed = draft === null ? null : schema.safeParse(draft);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['site', siteKey] });
  const describe = (result: PublishResult) =>
    result.job?.dispatched === false
      ? format(m.comingSoon.publishedNoBuild, {
          version: result.version,
          detail: result.job.detail,
        })
      : format(m.comingSoon.published, { version: result.version });

  const saveDraft = (data: T) => api(path('/draft'), { method: 'PUT', body: data });
  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: async () => {
      setDirty(false);
      setNotice(m.saved);
      await refresh();
    },
  });
  const publish = useMutation({
    mutationFn: async (input: { data: T | null; body?: Record<string, unknown> }) => {
      if (input.data !== null) await saveDraft(input.data);
      return api<PublishResult>(path('/publish'), { method: 'POST', body: input.body ?? {} });
    },
    onSuccess: async (result) => {
      setDirty(false);
      setNotice(describe(result));
      await refresh();
    },
  });
  const rollback = useMutation({
    mutationFn: (input: { version: number; body?: Record<string, unknown> }) =>
      api<PublishResult>(path('/rollback'), {
        method: 'POST',
        body: { version: input.version, ...input.body },
      }),
    onSuccess: async (result) => {
      setDirty(false);
      setNotice(describe(result));
      await refresh();
    },
  });

  const update = (next: T) => {
    setDraft(next);
    setDirty(true);
    setNotice(null);
  };

  return {
    kind,
    site,
    siteKey,
    query,
    versions,
    draft,
    update,
    dirty,
    notice,
    editable,
    canPublish,
    valid: parsed?.success === true,
    save,
    publish,
    rollback,
    error: save.error ?? publish.error ?? rollback.error,
  };
}

export type DocumentEditor<T> = ReturnType<typeof useDocumentEditor<T>>;

/** Save, preview and publish buttons, and the state of the draft. */
export function DocumentActions<T>({
  editor,
  publishBody,
}: {
  editor: DocumentEditor<T>;
  /** Extra fields for publishing, e.g. a confirmed logo change. */
  publishBody?: () => Record<string, unknown> | null;
}) {
  const { m } = useI18n();
  return (
    <>
      {editor.editable && (
        <Button
          variant="secondary"
          busy={editor.save.isPending}
          disabled={!editor.dirty || !editor.valid}
          onClick={() => editor.draft !== null && editor.save.mutate(editor.draft)}
        >
          {m.comingSoon.saveDraft}
        </Button>
      )}
      <PreviewButton
        kind={editor.kind}
        beforeOpen={
          editor.dirty && editor.editable && editor.valid
            ? () => editor.draft !== null && editor.save.mutateAsync(editor.draft)
            : undefined
        }
      />
      {editor.canPublish && (
        <Button
          busy={editor.publish.isPending}
          disabled={!editor.valid}
          onClick={() => {
            const body = publishBody ? publishBody() : {};
            if (body === null) return;
            if (confirmAction(m.comingSoon.publishConfirm)) {
              editor.publish.mutate({
                data: editor.dirty && editor.editable ? editor.draft : null,
                body,
              });
            }
          }}
        >
          {m.comingSoon.publish}
        </Button>
      )}
    </>
  );
}

export function DocumentStatus<T>({ editor }: { editor: DocumentEditor<T> }) {
  const { m } = useI18n();
  return (
    <>
      {!editor.editable && <Alert>{m.comingSoon.readOnly}</Alert>}
      {editor.dirty && <Alert tone="warning">{m.comingSoon.unsaved}</Alert>}
      {editor.notice && <Alert tone="success">{editor.notice}</Alert>}
      {editor.draft !== null && !editor.valid && (
        <Alert tone="danger">{m.errors['invalid-input']}</Alert>
      )}
      <ErrorText error={editor.error} />
    </>
  );
}

/** Published versions, with "restore" for those who may publish. */
export function VersionHistory<T>({
  editor,
  rollbackBody,
}: {
  editor: DocumentEditor<T>;
  rollbackBody?: () => Record<string, unknown> | null;
}) {
  const { m, format, date } = useI18n();
  const current = editor.query.data?.published?.version;
  const rows = editor.versions.data ?? [];
  return (
    <Card title={m.comingSoon.history}>
      {rows.length > 0 ? (
        <Table>
          <tbody>
            {rows.map((v) => (
              <tr key={v.version}>
                <td className="font-medium">#{v.version}</td>
                <td>{date(v.publishedAt, true)}</td>
                <td>{v.publishedBy ?? ''}</td>
                <td className="text-end">
                  {editor.canPublish && v.version !== current && (
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={editor.rollback.isPending}
                      onClick={() => {
                        const body = rollbackBody ? rollbackBody() : {};
                        if (body === null) return;
                        if (
                          confirmAction(format(m.comingSoon.restoreConfirm, { version: v.version }))
                        ) {
                          editor.rollback.mutate({ version: v.version, body });
                        }
                      }}
                    >
                      {m.comingSoon.restore}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-muted">{m.overview.notPublished}</p>
      )}
    </Card>
  );
}

/**
 * Opens a draft preview on the site's own address: the dashboard signs the page data and posts
 * it to the site Worker in a new tab (apps/web/src/pages/preview.astro).
 */
export function PreviewButton({
  kind,
  beforeOpen,
}: {
  kind: DocumentKind;
  beforeOpen?: (() => Promise<unknown> | false) | undefined;
}) {
  const { m, locale } = useI18n();
  const { site, siteKey } = useCurrentSite();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!site) return null;
  const open = async () => {
    setBusy(true);
    setError(null);
    // Opened before any await, so browsers treat it as the user's own action.
    const tab = window.open('about:blank', '_blank');
    try {
      if (beforeOpen) await beforeOpen();
      const { action, fields } = await api<{
        action: string;
        fields: Record<string, string | number>;
      }>(sitePath(siteKey, '/preview'), {
        method: 'POST',
        body: {
          drafts: {
            'coming-soon': kind === 'coming-soon',
            'site-settings': kind === 'site-settings',
            theme: kind === 'theme',
          },
        },
      });
      if (!tab) return;
      const form = tab.document.createElement('form');
      form.method = 'POST';
      form.action = `${action}?lang=${locale}`;
      for (const [name, value] of Object.entries(fields)) {
        const input = tab.document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.append(input);
      }
      tab.document.body.append(form);
      form.submit();
    } catch (e) {
      tab?.close();
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" busy={busy} onClick={() => void open()}>
        <Eye className="size-4" aria-hidden />
        {m.comingSoon.preview}
      </Button>
      {error !== null && (
        <span className="basis-full">
          <ErrorText error={error} />
        </span>
      )}
    </>
  );
}

export function BilingualField({
  label,
  value,
  onChange,
  max,
  multiline,
  disabled,
  help,
}: {
  label: string;
  value: Bi;
  onChange: (value: Bi) => void;
  max: number;
  multiline?: boolean;
  disabled: boolean;
  help?: ReactNode;
}) {
  const { m } = useI18n();
  const Control = multiline ? Textarea : Input;
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {(['ar', 'en'] as const).map((lang) => (
        <Field
          key={lang}
          label={
            <span className="text-muted">{lang === 'ar' ? m.comingSoon.ar : m.comingSoon.en}</span>
          }
        >
          {(props) => (
            <Control
              {...props}
              lang={lang}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              maxLength={max}
              disabled={disabled}
              value={value[lang]}
              onChange={(e: { target: { value: string } }) =>
                onChange({ ...value, [lang]: e.target.value })
              }
            />
          )}
        </Field>
      ))}
      {help && <p className="text-sm text-muted sm:col-span-2">{help}</p>}
    </fieldset>
  );
}
