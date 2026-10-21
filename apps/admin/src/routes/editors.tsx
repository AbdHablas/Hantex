import { siteSettingsSchema, type SiteSettings } from '@hantex/shared';
import {
  COLOR_TOKENS,
  FONT_LIBRARY,
  brandTheme,
  fontsForScript,
  themeSchema,
  validateTheme,
  type Mode,
  type Theme,
} from '@hantex/theme';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import {
  BilingualField,
  DocumentActions,
  DocumentStatus,
  VersionHistory,
  useDocumentEditor,
} from '../components/document';
import {
  Alert,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  confirmAction,
  later,
} from '../components/ui';
import { api } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { presetsQueryKey, useThemeChoices } from '../lib/presets';
import { useMe } from '../lib/session';

/* ------------------------------------ Site settings ------------------------------------ */

export function SiteSettingsEditor() {
  const { m } = useI18n();
  const t = m.settings;
  const editor = useDocumentEditor<SiteSettings>({
    kind: 'site-settings',
    schema: siteSettingsSchema,
    edit: ['settings.edit'],
    publish: ['settings.edit', 'site.publish'],
  });
  const { draft, editable } = editor;
  if (!editor.site) return <Navigate to="/" replace />;
  if (editor.query.isPending || !draft) return <Loading />;

  const set = <K extends keyof SiteSettings>(section: K, patch: Partial<SiteSettings[K]>) =>
    editor.update({ ...draft, [section]: { ...draft[section], ...patch } });

  const text = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { help?: string; type?: string; max?: number } = {},
  ) => (
    <Field label={label} help={options.help}>
      {(props) => (
        <Input
          {...props}
          dir="ltr"
          type={options.type ?? 'text'}
          maxLength={options.max ?? 500}
          disabled={!editable}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <>
      <PageHeader title={t.title} intro={t.intro} actions={<DocumentActions editor={editor} />} />
      <div className="flex flex-col gap-4">
        <DocumentStatus editor={editor} />
        <Card title={t.seo}>
          <div className="flex flex-col gap-5">
            <BilingualField
              label={t.seoTitle}
              max={70}
              disabled={!editable}
              value={draft.seo.title}
              onChange={(title) => set('seo', { title })}
            />
            <BilingualField
              label={t.seoDescription}
              max={160}
              multiline
              disabled={!editable}
              value={draft.seo.description}
              onChange={(description) => set('seo', { description })}
            />
          </div>
        </Card>
        <Card title={t.contact}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text(t.phone, draft.contact.phone, (phone) => set('contact', { phone }), {
              help: t.phoneHelp,
              type: 'tel',
              max: 16,
            })}
            {text(t.whatsapp, draft.contact.whatsapp, (whatsapp) => set('contact', { whatsapp }), {
              help: t.phoneHelp,
              type: 'tel',
              max: 16,
            })}
            {text(t.email, draft.contact.email, (email) => set('contact', { email }), {
              type: 'email',
              max: 254,
            })}
            {text(t.mapUrl, draft.contact.mapUrl, (mapUrl) => set('contact', { mapUrl }), {
              help: t.linkHelp,
              type: 'url',
            })}
          </div>
          <div className="mt-5 flex flex-col gap-5">
            <BilingualField
              label={t.address}
              max={200}
              multiline
              disabled={!editable}
              value={draft.contact.address}
              onChange={(address) => set('contact', { address })}
            />
            <BilingualField
              label={t.hours}
              max={100}
              disabled={!editable}
              value={draft.contact.hours}
              onChange={(hours) => set('contact', { hours })}
            />
          </div>
        </Card>
        <Card title={t.social}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(draft.social) as (keyof SiteSettings['social'])[]).map((network) => (
              <div key={network}>
                {text(
                  network === 'x' ? 'X' : network.charAt(0).toUpperCase() + network.slice(1),
                  draft.social[network],
                  (url) => set('social', { [network]: url }),
                  { help: t.linkHelp, type: 'url' },
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card title={t.privacy}>
          <p className="mb-4 text-sm text-muted">{t.privacyHelp}</p>
          <div className="flex flex-col gap-5">
            <BilingualField
              label={t.privacyNote}
              max={600}
              multiline
              disabled={!editable}
              value={draft.privacy.note}
              onChange={(note) => set('privacy', { note })}
            />
            {text(t.privacyUrl, draft.privacy.url, (url) => set('privacy', { url }), {
              help: t.linkHelp,
              type: 'url',
            })}
          </div>
        </Card>
        <VersionHistory editor={editor} />
      </div>
    </>
  );
}

/* -------------------------------------- Appearance -------------------------------------- */

const sameLogo = (a: Theme, b: Theme) => JSON.stringify(a.logo) === JSON.stringify(b.logo);

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field label={label}>
      {(props) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-hidden
            tabIndex={-1}
            className="h-10 w-12 shrink-0 cursor-pointer rounded border border-input bg-surface"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
          <Input
            {...props}
            dir="ltr"
            className="font-mono"
            maxLength={7}
            pattern="#[0-9A-Fa-f]{6}"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </Field>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  render,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  disabled: boolean;
  render?: (value: T) => ReactNode;
}) {
  // A value set elsewhere (for example the brand theme) is always listed, never silently replaced.
  const choices = options.includes(value)
    ? options
    : [...options, value].sort((x, y) => (x < y ? -1 : 1));
  return (
    <Field label={label}>
      {(props) => (
        <Select
          {...props}
          disabled={disabled}
          value={String(value)}
          onChange={(e) => {
            const next = choices.find((o) => String(o) === e.target.value);
            if (next !== undefined) onChange(next);
          }}
        >
          {choices.map((o) => (
            <option key={String(o)} value={String(o)}>
              {render ? render(o) : String(o)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function AppearanceEditor() {
  const { m, format } = useI18n();
  const t = m.appearance;
  const editor = useDocumentEditor<Theme>({
    kind: 'theme',
    schema: themeSchema,
    edit: ['appearance.edit'],
    publish: ['appearance.publish'],
  });
  const { draft, editable } = editor;
  const canEditLogo = editor.site?.permissions.includes('appearance.editLogo') === true;
  if (!editor.site) return <Navigate to="/" replace />;
  if (editor.query.isPending || !draft) return <Loading />;

  const checks = editor.valid ? validateTheme(draft) : { errors: [], warnings: [] };
  const update = (next: Theme) => editor.update(next);
  const setColor = (mode: Mode, token: string, value: string) =>
    update({
      ...draft,
      colors: { ...draft.colors, [mode]: { ...draft.colors[mode], [token]: value } },
    });
  const setLogo = (mode: Mode, token: string, value: string) =>
    update({ ...draft, logo: { ...draft.logo, [mode]: { ...draft.logo[mode], [token]: value } } });
  const setTypography = (patch: Partial<Theme['typography']>) =>
    update({ ...draft, typography: { ...draft.typography, ...patch } });

  // Off-brand logo colours need an explicit confirmation to publish (D-022).
  const confirmLogo = async (theme: Theme) => {
    if (sameLogo(theme, brandTheme)) return {};
    return (await confirmAction(t.logoConfirm)) ? { confirmLogoChange: true } : null;
  };
  const tokenName = (token: string) => t.token[token] ?? token;

  return (
    <>
      <PageHeader
        title={t.title}
        intro={t.intro}
        actions={
          <>
            {editable && (
              <Button
                variant="ghost"
                onClick={later(async () => {
                  if (await confirmAction(t.resetConfirm)) {
                    update(canEditLogo ? brandTheme : { ...brandTheme, logo: draft.logo });
                  }
                })}
              >
                <RotateCcw className="size-4" aria-hidden />
                {t.resetBrand}
              </Button>
            )}
            <DocumentActions editor={editor} publishBody={() => confirmLogo(draft)} />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <DocumentStatus editor={editor} />
        {editor.valid &&
          (checks.errors.length === 0 ? (
            <Alert tone="success">{t.checksOk}</Alert>
          ) : (
            <Alert tone="danger">
              <ul className="list-inside list-disc">
                {checks.errors.map((issue, i) => (
                  <li key={i}>
                    {format(t.contrast, {
                      foreground: tokenName(issue.foreground),
                      background: tokenName(issue.background),
                      mode: issue.mode === 'light' ? t.light : t.dark,
                      ratio: issue.ratio,
                      minimum: issue.minimum,
                    })}
                  </li>
                ))}
              </ul>
            </Alert>
          ))}

        <ThemeLibrary
          draft={draft}
          editable={editable}
          canSave={
            editor.valid &&
            checks.errors.length === 0 &&
            editor.site.permissions.includes('appearance.publish')
          }
          // Without the logo permission, a preset never changes the logo colours.
          apply={(theme) => update(canEditLogo ? theme : { ...theme, logo: draft.logo })}
        />

        <Card title={t.colors}>
          <div className="grid gap-6 lg:grid-cols-2">
            {(['light', 'dark'] as const).map((mode) => (
              <fieldset key={mode} className="flex flex-col gap-3">
                <legend className="mb-2 font-medium">{mode === 'light' ? t.light : t.dark}</legend>
                {COLOR_TOKENS.map((token) => (
                  <ColorField
                    key={token}
                    label={tokenName(token)}
                    disabled={!editable}
                    value={draft.colors[mode][token]}
                    onChange={(v) => setColor(mode, token, v)}
                  />
                ))}
              </fieldset>
            ))}
          </div>
        </Card>

        <Card title={t.logo}>
          <p className="mb-4 text-sm text-muted">{t.logoHelp}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            {(['light', 'dark'] as const).map((mode) => (
              <fieldset key={mode} className="flex flex-col gap-3">
                <legend className="mb-2 font-medium">{mode === 'light' ? t.light : t.dark}</legend>
                {(['neutral', 'switch', 'indicator', 'accent'] as const).map((token) => (
                  <ColorField
                    key={token}
                    label={tokenName(token)}
                    disabled={!editable || !canEditLogo}
                    value={draft.logo[mode][token]}
                    onChange={(v) => setLogo(mode, token, v)}
                  />
                ))}
              </fieldset>
            ))}
          </div>
        </Card>

        <Card title={t.typography}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label={t.latinFont}
              disabled={!editable}
              value={draft.typography.latin}
              options={fontsForScript('latin')}
              render={(id) => FONT_LIBRARY[id].family}
              onChange={(latin) => setTypography({ latin: latin })}
            />
            <Choice
              label={t.arabicFont}
              disabled={!editable}
              value={draft.typography.arabic}
              options={fontsForScript('arabic')}
              render={(id) => FONT_LIBRARY[id].family}
              onChange={(arabic) => setTypography({ arabic: arabic })}
            />
            <Choice
              label={t.baseSize}
              disabled={!editable}
              value={draft.typography.baseSize}
              options={[14, 15, 16, 17, 18, 19, 20]}
              onChange={(baseSize) => setTypography({ baseSize })}
            />
            <Choice
              label={t.scale}
              disabled={!editable}
              value={draft.typography.scale}
              options={[1.125, 1.2, 1.25, 1.333, 1.414, 1.5]}
              onChange={(scale) => setTypography({ scale })}
            />
            <Choice
              label={t.bodyWeight}
              disabled={!editable}
              value={draft.typography.bodyWeight}
              options={[300, 400, 500] as const}
              onChange={(bodyWeight) => setTypography({ bodyWeight })}
            />
            <Choice
              label={t.headingWeight}
              disabled={!editable}
              value={draft.typography.headingWeight}
              options={[500, 600, 700] as const}
              onChange={(headingWeight) => setTypography({ headingWeight })}
            />
          </div>
        </Card>

        <Card title={t.style}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Choice
              label={t.radius}
              disabled={!editable}
              value={draft.shape.radius}
              options={[0, 4, 8, 12, 16, 20, 24, 32]}
              onChange={(radius) => update({ ...draft, shape: { radius } })}
            />
            <Choice
              label={t.shadow}
              disabled={!editable}
              value={draft.depth.shadow}
              options={['none', 'soft', 'strong'] as const}
              render={(o) => t.option[o]}
              onChange={(shadow) => update({ ...draft, depth: { shadow } })}
            />
            <Choice
              label={t.motion}
              disabled={!editable}
              value={draft.motion}
              options={['off', 'subtle', 'full'] as const}
              render={(o) => t.option[o]}
              onChange={(motion) => update({ ...draft, motion })}
            />
          </div>
        </Card>

        <Card title={t.modeTitle}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label={t.defaultMode}
              disabled={!editable}
              value={draft.mode.default}
              options={['system', 'light', 'dark'] as const}
              render={(o) => t.option[o]}
              onChange={(value) => update({ ...draft, mode: { ...draft.mode, default: value } })}
            />
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                disabled={!editable}
                checked={draft.mode.allowToggle}
                onChange={(e) =>
                  update({ ...draft, mode: { ...draft.mode, allowToggle: e.target.checked } })
                }
              />
              {t.allowToggle}
            </label>
          </div>
        </Card>

        {/* Restoring a version is itself confirmed; only the Owner may restore off-brand logo colours. */}
        <VersionHistory
          editor={editor}
          rollbackBody={() => (canEditLogo ? { confirmLogoChange: true } : {})}
        />
      </div>
    </>
  );
}

/** Copy a theme from a preset or another site into the draft, or save the draft as a preset. */
function ThemeLibrary({
  draft,
  editable,
  canSave,
  apply,
}: {
  draft: Theme;
  editable: boolean;
  canSave: boolean;
  apply: (theme: Theme) => void;
}) {
  const { m } = useI18n();
  const t = m.appearance;
  const bi = useBilingual();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const choices = useThemeChoices();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState({ ar: '', en: '' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: presetsQueryKey });
  const save = useMutation({
    mutationFn: () => api('/theme-presets', { method: 'POST', body: { name, theme: draft } }),
    onSuccess: async () => {
      setName({ ar: '', en: '' });
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/theme-presets/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setSelected('');
      await refresh();
    },
  });
  if (!choices.data) return null;
  const choice = choices.data.find((c) => c.value === selected);
  const groups = [
    { id: 'builtIn', label: t.presetsBuiltIn },
    { id: 'saved', label: t.presetsSaved },
    { id: 'sites', label: t.presetsSites },
  ] as const;
  const canDelete = me?.permissions.includes('sites.manage') === true;

  return (
    <Card title={t.library}>
      <p className="mb-4 text-sm text-muted">{t.libraryHelp}</p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t.presetPick}>
            {(props) => (
              <Select {...props} value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">{t.presetPick}</option>
                {groups.map((g) => {
                  const items = choices.data.filter((c) => c.group === g.id);
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={g.id} label={g.label}>
                      {items.map((c) => (
                        <option key={c.value} value={c.value}>
                          {bi(c.name)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            )}
          </Field>
          <Button
            variant="secondary"
            disabled={!editable || !choice}
            onClick={later(async () => {
              if (choice && (await confirmAction(t.presetApplyConfirm))) apply(choice.theme);
            })}
          >
            {t.presetApply}
          </Button>
          {choice?.savedId && canDelete && (
            <Button
              variant="ghost"
              busy={remove.isPending}
              onClick={later(async () => {
                if (choice.savedId && (await confirmAction(t.presetDeleteConfirm))) {
                  remove.mutate(choice.savedId);
                }
              })}
            >
              <Trash2 className="size-4" aria-hidden />
              {m.delete}
            </Button>
          )}
        </div>
        <ErrorText error={remove.error} />
        {canSave && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label={t.presetNameAr}>
              {(props) => (
                <Input
                  {...props}
                  required
                  lang="ar"
                  dir="rtl"
                  maxLength={60}
                  value={name.ar}
                  onChange={(e) => setName({ ...name, ar: e.target.value })}
                />
              )}
            </Field>
            <Field label={t.presetNameEn}>
              {(props) => (
                <Input
                  {...props}
                  required
                  lang="en"
                  dir="ltr"
                  maxLength={60}
                  value={name.en}
                  onChange={(e) => setName({ ...name, en: e.target.value })}
                />
              )}
            </Field>
            <Button type="submit" variant="secondary" busy={save.isPending}>
              {t.presetSave}
            </Button>
          </form>
        )}
        <ErrorText error={save.error} />
        {save.isSuccess && <Alert tone="success">{t.presetSaved}</Alert>}
      </div>
    </Card>
  );
}
