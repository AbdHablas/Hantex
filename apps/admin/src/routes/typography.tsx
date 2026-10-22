import {
  FONT_LIBRARY,
  FONT_ROLES,
  TEXT_STYLES,
  TYPOGRAPHY_PRESETS,
  WEIGHTS,
  availableWeight,
  brandTheme,
  checkTypography,
  fontsForScript,
  type FontId,
  type TextStyle,
  type TextStyleId,
  type Theme,
  type Typography,
} from '@hantex/theme';
import { RotateCcw, Type } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Tabs,
  cn,
  confirmAction,
  later,
} from '../components/ui';
import { useBilingual, useI18n } from '../lib/i18n';
import '../fonts-preview.css';

/** Sample text for the preview only; it says nothing about real products. */
const SAMPLES: Record<TextStyleId, { ar: string; en: string }> = {
  display: { ar: 'مفاتيح ومقابس', en: 'Switches and sockets' },
  h1: { ar: 'عنوان رئيسي للصفحة', en: 'A main page heading' },
  h2: { ar: 'عنوان قسم', en: 'A section heading' },
  h3: { ar: 'عنوان فرعي', en: 'A subheading' },
  body: {
    ar: 'نصّ تجريبي يوضّح شكل الفقرات الطويلة، مع تشكيل: قُرْبٌ وَمُتَانَةٌ.',
    en: 'Sample text that shows how longer paragraphs read on the website.',
  },
  small: { ar: 'ملاحظة صغيرة أسفل النموذج.', en: 'A small note under a form.' },
  nav: { ar: 'الرئيسية · المفاتيح · المقابس', en: 'Home · Switches · Sockets' },
  button: { ar: 'أعلمني عند الإطلاق', en: 'Notify me' },
  label: { ar: 'جديد', en: 'New' },
  productTitle: { ar: 'اسم منتج — HX-200', en: 'Product name — HX-200' },
  price: { ar: '١٢٣٫٠٠', en: '123.00' },
  spec: { ar: 'قيمة مثال: 16A · 250V', en: 'Example value: 16A · 250V' },
};

const fontStack = (typography: Typography, role: TextStyle['font']) => {
  const pair = typography.fonts[role];
  return `"${FONT_LIBRARY[pair.latin].family}", "${FONT_LIBRARY[pair.arabic].family}", system-ui, sans-serif`;
};

/** The same rules the website's generated CSS applies, as inline values for the preview. */
const previewStyle = (typography: Typography, id: TextStyleId, arabic: boolean): CSSProperties => {
  const style = typography.styles[id];
  return {
    fontFamily: fontStack(typography, style.font),
    // The preview shows the large-screen size, scaled down so it fits the panel.
    fontSize: `${Math.min(style.size, 44)}px`,
    fontWeight: style.weight,
    lineHeight: arabic ? style.arabicLineHeight : style.lineHeight,
    letterSpacing: arabic ? 0 : `${style.letterSpacing}em`,
  };
};

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  invalid,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  invalid?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <Field label={label} className="min-w-0">
      {(props) => (
        <Input
          {...props}
          type="number"
          inputMode="decimal"
          dir="ltr"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value !== '' && Number.isFinite(next) && next >= min && next <= max) {
              onChange(next);
            }
          }}
        />
      )}
    </Field>
  );
}

function FontPicker({
  label,
  script,
  value,
  onChange,
  disabled,
}: {
  label: string;
  script: 'latin' | 'arabic';
  value: FontId;
  onChange: (font: FontId) => void;
  disabled: boolean;
}) {
  const sample = script === 'arabic' ? 'أبجد هوز ١٢٣' : 'Aa Bb Cc 123';
  return (
    <div className="flex flex-col gap-2">
      <Field label={label}>
        {(props) => (
          <Select
            {...props}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value as FontId)}
          >
            {fontsForScript(script).map((id) => (
              <option key={id} value={id}>
                {FONT_LIBRARY[id].family}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p
        aria-hidden
        dir={script === 'arabic' ? 'rtl' : 'ltr'}
        className="truncate rounded-lg bg-surface-2 px-3 py-2 text-xl"
        style={{ fontFamily: `"${FONT_LIBRARY[value].family}"` }}
      >
        {sample}
      </p>
    </div>
  );
}

/** The Typography & Fonts section of the Appearance editor (D-032). */
export function TypographyEditor({
  draft,
  editable,
  update,
}: {
  draft: Theme;
  editable: boolean;
  update: (next: Theme) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.appearance;
  const typography = draft.typography;
  const [preset, setPreset] = useState('');
  const issues = checkTypography(typography);
  const issueFor = (id: TextStyleId) => issues.filter((issue) => issue.style === id);

  const setTypography = (next: Typography) => update({ ...draft, typography: next });
  const setFont = (role: (typeof FONT_ROLES)[number], script: 'latin' | 'arabic', font: FontId) =>
    setTypography({
      ...typography,
      fonts: { ...typography.fonts, [role]: { ...typography.fonts[role], [script]: font } },
    });
  const setStyle = (id: TextStyleId, patch: Partial<TextStyle>) =>
    setTypography({
      ...typography,
      styles: { ...typography.styles, [id]: { ...typography.styles[id], ...patch } },
    });

  const styleName = (id: TextStyleId) => t.styleName[id] ?? id;

  const styleRow = (id: TextStyleId) => {
    const style = typography.styles[id];
    const rowIssues = issueFor(id);
    const latin = typography.fonts[style.font].latin;
    return (
      <div
        key={id}
        role="group"
        aria-label={styleName(id)}
        className={cn(
          'grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0',
          'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 lg:items-end',
        )}
      >
        <div className="col-span-full flex flex-wrap items-baseline gap-x-3">
          <p className="font-medium">{styleName(id)}</p>
          <code dir="ltr" className="text-xs text-muted">
            .hx-text-{id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}
          </code>
        </div>
        <Field label={t.font}>
          {(props) => (
            <Select
              {...props}
              disabled={!editable}
              value={style.font}
              onChange={(event) => setStyle(id, { font: event.target.value as TextStyle['font'] })}
            >
              {FONT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t.role[role]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <NumberField
          label={t.size}
          value={style.size}
          min={11}
          max={96}
          step={1}
          disabled={!editable}
          invalid={rowIssues.some((i) => i.code === 'too-small')}
          onChange={(size) => setStyle(id, { size: Math.round(size) })}
        />
        <Field label={t.weight}>
          {(props) => (
            <Select
              {...props}
              disabled={!editable}
              value={String(style.weight)}
              onChange={(event) =>
                setStyle(id, { weight: Number(event.target.value) as TextStyle['weight'] })
              }
            >
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w} · {t.weightName[String(w)]}
                  {availableWeight(latin, w) !== w ? ` (→ ${availableWeight(latin, w)})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <NumberField
          label={t.lineHeight}
          value={style.lineHeight}
          min={0.9}
          max={2.4}
          step={0.05}
          disabled={!editable}
          invalid={rowIssues.some((i) => i.code === 'line-height-too-tight')}
          onChange={(lineHeight) => setStyle(id, { lineHeight })}
        />
        <NumberField
          label={t.arabicLineHeight}
          value={style.arabicLineHeight}
          min={1}
          max={2.6}
          step={0.05}
          disabled={!editable}
          invalid={rowIssues.some((i) => i.code === 'arabic-line-height-too-tight')}
          onChange={(arabicLineHeight) => setStyle(id, { arabicLineHeight })}
        />
        <NumberField
          label={t.letterSpacing}
          value={style.letterSpacing}
          min={-0.05}
          max={0.3}
          step={0.005}
          disabled={!editable}
          onChange={(letterSpacing) => setStyle(id, { letterSpacing })}
        />
        {rowIssues.length > 0 && (
          <div className="col-span-full flex flex-col gap-1">
            {rowIssues.map((issue) => (
              <p key={issue.code} className="text-xs text-danger">
                {format(t.issue[issue.code] ?? issue.code, {
                  style: styleName(id),
                  minimum: issue.minimum,
                })}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  const groups: { value: string; label: string; ids: TextStyleId[] }[] = [
    { value: 'headings', label: t.headingFonts, ids: ['display', 'h1', 'h2', 'h3'] },
    { value: 'text', label: t.bodyFonts, ids: ['body', 'small', 'nav', 'button', 'label'] },
    { value: 'products', label: t.productText, ids: ['productTitle', 'price', 'spec'] },
  ];

  return (
    <Card
      title={t.typography}
      description={t.typographyIntro}
      icon={<Type />}
      actions={
        editable && (
          <Button
            variant="ghost"
            onClick={later(async () => {
              if (await confirmAction(t.applyTypographyConfirm)) {
                setTypography(brandTheme.typography);
              }
            })}
          >
            <RotateCcw aria-hidden />
            {t.resetTypography}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {editable && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t.typographyPreset} className="min-w-64 flex-1">
              {(props) => (
                <Select {...props} value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="">{t.typographyPreset}</option>
                  {TYPOGRAPHY_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {bi(p.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              variant="secondary"
              disabled={!preset}
              onClick={later(async () => {
                const chosen = TYPOGRAPHY_PRESETS.find((p) => p.id === preset);
                if (chosen && (await confirmAction(t.applyTypographyConfirm))) {
                  setTypography(structuredClone(chosen.typography));
                }
              })}
            >
              {t.applyTypography}
            </Button>
          </div>
        )}

        <section aria-labelledby="fonts-heading" className="flex flex-col gap-3">
          <div>
            <h3 id="fonts-heading" className="font-semibold">
              {t.fonts}
            </h3>
            <p className="text-sm text-muted">{t.fontsHelp}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {FONT_ROLES.map((role) => (
              <div key={role} className="rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-medium">
                  {role === 'heading' ? t.headingFonts : t.bodyFonts}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FontPicker
                    label={t.latin}
                    script="latin"
                    value={typography.fonts[role].latin}
                    disabled={!editable}
                    onChange={(font) => setFont(role, 'latin', font)}
                  />
                  <FontPicker
                    label={t.arabic}
                    script="arabic"
                    value={typography.fonts[role].arabic}
                    disabled={!editable}
                    onChange={(font) => setFont(role, 'arabic', font)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section aria-labelledby="styles-heading" className="flex min-w-0 flex-col gap-3">
            <div>
              <h3 id="styles-heading" className="font-semibold">
                {t.textStyles}
              </h3>
              <p className="text-sm text-muted">{t.textStylesHelp}</p>
            </div>
            {issues.length === 0 ? (
              <Alert tone="success">{t.typographyOk}</Alert>
            ) : (
              <Alert tone="danger">{m.errors['theme-typography']}</Alert>
            )}
            <Tabs
              label={t.textStyles}
              tabs={groups.map((group) => ({
                value: group.value,
                label: group.label,
                content: <div>{group.ids.map(styleRow)}</div>,
              }))}
            />
          </section>

          <section
            aria-labelledby="preview-heading"
            className="flex min-w-0 flex-col gap-3 2xl:sticky 2xl:top-20 2xl:self-start"
          >
            <div>
              <h3 id="preview-heading" className="font-semibold">
                {t.livePreview}
              </h3>
              <p className="text-sm text-muted">{t.livePreviewHelp}</p>
            </div>
            <div
              role="region"
              aria-label={t.livePreview}
              tabIndex={0}
              className="max-h-[36rem] overflow-y-auto rounded-xl border border-border bg-bg p-4"
            >
              <dl className="flex flex-col gap-4">
                {TEXT_STYLES.map((id) => (
                  <div key={id} className="flex flex-col gap-1">
                    <dt className="text-[0.7rem] font-medium tracking-wider text-muted uppercase">
                      {styleName(id)} · {typography.styles[id].size}px
                    </dt>
                    <dd className="m-0 flex flex-col gap-1">
                      <span lang="ar" dir="rtl" style={previewStyle(typography, id, true)}>
                        {SAMPLES[id].ar}
                      </span>
                      <span lang="en" dir="ltr" style={previewStyle(typography, id, false)}>
                        {SAMPLES[id].en}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}
