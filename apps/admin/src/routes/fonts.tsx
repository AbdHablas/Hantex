import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  confirmAction,
  later,
} from '../components/ui';
import { api } from '../lib/api';
import { fontsQueryKey, registerFonts, useUploadedFonts, type FontItem } from '../lib/fonts';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/session';

/** A sample in each script the font writes, for the list. */
const SAMPLE = { latin: 'Aa Bb Cc 0123', arabic: 'أبجد هوز ٠١٢٣' } as const;

/**
 * The platform's font library (D-033): fonts the Owner uploads, with their licences, which every
 * website can then choose in Appearance. Files are tried in the browser first, so a broken file
 * is caught before upload; the server reads and checks each one again.
 */
export function FontLibrary() {
  const { m, format, date } = useI18n();
  const t = m.fonts;
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const allowed = me?.permissions.includes('fonts.manage') === true;
  const list = useUploadedFonts(allowed);
  const [files, setFiles] = useState<File[]>([]);
  const [licenceName, setLicenceName] = useState('');
  const [licenceUrl, setLicenceUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (list.data) registerFonts(list.data);
  }, [list.data]);

  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.set(
        'meta',
        JSON.stringify({
          licence: { name: licenceName.trim(), url: licenceUrl.trim() || null },
          confirmed,
        }),
      );
      for (const file of files) body.append('file', file);
      return api<{ id: string }>('/fonts', { method: 'POST', body });
    },
    onSuccess: async () => {
      setNotice(format(t.uploaded, { name: files[0]?.name ?? '' }));
      setFiles([]);
      setConfirmed(false);
      setInputKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: fontsQueryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (font: FontItem) => api(`/fonts/${font.uuid}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setNotice(t.deleted);
      await queryClient.invalidateQueries({ queryKey: fontsQueryKey });
    },
  });

  if (!me) return <Loading />;
  if (!allowed) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setNotice(null);
    // The browser must be able to use every file as a font before it is sent.
    for (const file of files) {
      try {
        await new FontFace('hx-upload-check', await file.arrayBuffer()).load();
      } catch {
        setProblem(format(t.broken, { name: file.name }));
        return;
      }
    }
    upload.mutate();
  };

  const ready = files.length > 0 && licenceName.trim().length >= 2 && confirmed;

  return (
    <>
      <PageHeader title={t.title} intro={t.intro} />
      <div className="flex flex-col gap-6">
        {notice && <Alert tone="success">{notice}</Alert>}
        <Card title={t.upload}>
          <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
            <Field label={t.files} help={t.filesHelp}>
              {(props) => (
                <Input
                  {...props}
                  key={inputKey}
                  type="file"
                  multiple
                  accept=".woff2,font/woff2"
                  onChange={(e) => setFiles([...(e.target.files ?? [])])}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.licenceName} help={t.licenceNameHelp}>
                {(props) => (
                  <Input
                    {...props}
                    maxLength={120}
                    value={licenceName}
                    onChange={(e) => setLicenceName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t.licenceUrl}>
                {(props) => (
                  <Input
                    {...props}
                    type="url"
                    maxLength={500}
                    placeholder="https://"
                    value={licenceUrl}
                    onChange={(e) => setLicenceUrl(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-accent"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t.confirm}
            </label>
            {problem && <Alert tone="danger">{problem}</Alert>}
            <ErrorText error={upload.error} />
            <div>
              <Button type="submit" busy={upload.isPending} disabled={!ready}>
                <Upload aria-hidden />
                {t.submit}
              </Button>
            </div>
          </form>
        </Card>

        <ErrorText error={remove.error ?? list.error} />
        {list.isPending ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          (list.data ?? []).map((font) => (
            <Card
              key={font.id}
              title={font.name}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  busy={remove.isPending && remove.variables?.id === font.id}
                  onClick={later(async () => {
                    if (await confirmAction(format(t.deleteConfirm, { name: font.name }))) {
                      remove.mutate(font);
                    }
                  })}
                >
                  <Trash2 aria-hidden />
                  {t.delete}
                </Button>
              }
            >
              <div className="flex flex-col gap-3 text-sm">
                {font.scripts.map((script) => (
                  <p
                    key={script}
                    aria-hidden
                    dir={script === 'arabic' ? 'rtl' : 'ltr'}
                    className="truncate rounded-lg bg-surface-2 px-3 py-2 text-2xl"
                    style={{ fontFamily: `"${font.id}", system-ui` }}
                  >
                    {SAMPLE[script]}
                  </p>
                ))}
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{t.scripts}</dt>
                  <dd>{font.scripts.map((s) => t.script[s] ?? s).join(' · ')}</dd>
                  <dt className="text-muted">{t.weights}</dt>
                  <dd>{font.files.map((f) => f.weight).join(' · ')}</dd>
                  <dt className="text-muted">{t.licence}</dt>
                  <dd>
                    {font.licence.url ? (
                      <a
                        className="text-accent-text underline"
                        href={font.licence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {font.licence.name}
                      </a>
                    ) : (
                      font.licence.name
                    )}
                    <span className="block text-xs text-muted">
                      {format(t.confirmedBy, {
                        who: font.licenceConfirmedBy ?? '—',
                        date: date(font.licenceConfirmedAt),
                      })}
                    </span>
                  </dd>
                </dl>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
