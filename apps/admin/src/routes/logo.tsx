import {
  LOGO_MAX_LENGTH,
  LOGO_TOKENS,
  adaptiveLogo,
  logoSchema,
  newLogoFile,
  type Logo,
  type LogoColourUse,
  type LogoFile,
} from '@hantex/shared/logo';
import { SVG_LIMITS, sanitizeSvg } from '@hantex/shared/svg';
import { brandTheme, themeSchema, type Mode, type Theme } from '@hantex/theme';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import {
  DocumentActions,
  DocumentStatus,
  VersionHistory,
  useDocumentEditor,
} from '../components/document';
import {
  Alert,
  Button,
  Card,
  Field,
  Loading,
  PageHeader,
  Select,
  confirmAction,
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { useI18n } from '../lib/i18n';

type Slot = 'lockup' | 'mark';

/**
 * The website's uploaded logo (D-027). The SVG is cleaned here, in the browser, so the person
 * sees what was left out; the server checks it again before saving, and the build cleans it once
 * more. Each colour then follows a logo colour token or stays fixed.
 */
export function LogoEditor() {
  const { m } = useI18n();
  const t = m.logo;
  const editor = useDocumentEditor<Logo>({
    kind: 'logo',
    schema: logoSchema,
    edit: ['appearance.edit', 'appearance.editLogo'],
    publish: ['appearance.publish', 'appearance.editLogo'],
  });
  // The previews use the logo colours of the Appearance draft.
  const theme = useQuery({
    queryKey: ['site', editor.siteKey, 'doc', 'theme'],
    queryFn: () => api<{ draft: unknown }>(sitePath(editor.siteKey, '/documents/theme')),
    enabled: editor.site !== null,
  });
  if (!editor.site) return <Navigate to="/" replace />;
  if (editor.query.isPending || !editor.draft) return <Loading />;
  const draft = editor.draft;
  const parsedTheme = theme.data ? themeSchema.safeParse(theme.data.draft) : null;
  const palette = parsedTheme?.success ? parsedTheme.data : brandTheme;

  return (
    <>
      <PageHeader
        title={t.title}
        intro={t.intro}
        actions={<DocumentActions editor={editor} preview={false} />}
      />
      <div className="flex flex-col gap-6">
        <DocumentStatus editor={editor} />
        {(['lockup', 'mark'] as const).map((slot) => (
          <LogoSlot
            key={slot}
            slot={slot}
            file={draft[slot]}
            theme={palette}
            editable={editor.editable}
            onChange={(file) => editor.update({ ...draft, [slot]: file })}
          />
        ))}
        <p className="text-sm text-muted">{t.shareNote}</p>
        <VersionHistory editor={editor} />
      </div>
    </>
  );
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function LogoSlot({
  slot,
  file,
  theme,
  editable,
  onChange,
}: {
  slot: Slot;
  file: LogoFile | null;
  theme: Theme;
  editable: boolean;
  onChange: (file: LogoFile | null) => void;
}) {
  const { m, format } = useI18n();
  const t = m.logo;
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setProblem(null);
    setRemoved([]);
    if (chosen.size > SVG_LIMITS.maxLength) return setProblem(t.error['too-large'] ?? '');
    const result = sanitizeSvg(await chosen.text());
    if (!result.ok) return setProblem(t.error[result.reason] ?? result.reason);
    if (result.svg.length > LOGO_MAX_LENGTH) return setProblem(t.error['too-large'] ?? '');
    setRemoved(result.removed);
    // Colours keep their earlier choice when a file is replaced by a new version of itself.
    const next = newLogoFile(result.svg, result.colours);
    const before = new Map(file?.colours.map((c) => [c.colour, c.use]));
    next.colours = next.colours.map((c) => ({ ...c, use: before.get(c.colour) ?? c.use }));
    onChange(next);
  };

  const setUse = (colour: string, use: LogoColourUse) =>
    file &&
    onChange({
      ...file,
      colours: file.colours.map((c) => (c.colour === colour ? { ...c, use } : c)),
    });

  // One mode's colours for both settings, so each box shows that mode whatever the device uses.
  const preview = (mode: Mode) =>
    file ? svgUrl(adaptiveLogo(file, { light: theme.logo[mode], dark: theme.logo[mode] })) : '';

  return (
    <Card
      title={t[slot]}
      description={t[`${slot}Help`]}
      actions={
        editable && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              id={inputId}
              type="file"
              accept=".svg,image/svg+xml"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                e.target.value = '';
                void choose(chosen);
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              <Upload aria-hidden />
              {file ? t.replace : t.upload}
            </Button>
            {file && (
              <Button
                variant="secondary"
                size="sm"
                onClick={later(async () => {
                  if (await confirmAction(t.removeConfirm)) {
                    setRemoved([]);
                    onChange(null);
                  }
                })}
              >
                <Trash2 aria-hidden />
                {t.remove}
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {problem && <Alert tone="danger">{problem}</Alert>}
        {removed.length > 0 && (
          <Alert tone="warning">{format(t.removed, { items: removed.join(', ') })}</Alert>
        )}
        {file ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['light', 'dark'] as const).map((mode) => (
                <figure key={mode} className="flex flex-col gap-1.5">
                  <div
                    className="flex h-28 items-center justify-center rounded-xl border border-border p-4"
                    style={{ background: theme.colors[mode].background }}
                  >
                    <img
                      src={preview(mode)}
                      alt={mode === 'light' ? t.previewLight : t.previewDark}
                      className="max-h-full max-w-full"
                    />
                  </div>
                  <figcaption className="text-xs text-muted">
                    {mode === 'light' ? t.previewLight : t.previewDark}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="text-xs text-muted">{t.previewNote}</p>
            {file.colours.length > 0 && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-medium">{t.colours}</legend>
                <p className="text-sm text-muted">{t.coloursHelp}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {file.colours.map(({ colour, use }) => (
                    <Field
                      key={colour}
                      label={
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block size-4 rounded border border-border"
                            style={{ background: colour }}
                          />
                          {format(t.colour, { colour })}
                        </span>
                      }
                    >
                      {(props) => (
                        <Select
                          {...props}
                          disabled={!editable}
                          value={use}
                          onChange={(e) => setUse(colour, e.target.value as LogoColourUse)}
                        >
                          <option value="fixed">{t.fixed}</option>
                          {LOGO_TOKENS.map((token) => (
                            <option key={token} value={token}>
                              {m.appearance.token[token] ?? token}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">{slot === 'lockup' ? t.none : t.noneMark}</p>
        )}
      </div>
    </Card>
  );
}
