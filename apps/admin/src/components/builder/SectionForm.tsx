import {
  ICONS,
  SECTIONS,
  type Bilingual,
  type Field as RegistryField,
  type ImageRef,
  type Link,
  type RichDoc,
  type ContentSection,
  type SectionStyle,
  type Visibility,
} from '@hantex/sections';
import { Plus, Trash2 } from 'lucide-react';
import { useBilingual, useI18n } from '../../lib/i18n';
import type { PageSummary } from '../../lib/builder';
import { BilingualField } from '../document';
import { Button, Field, IconButton, Input, Select } from '../ui';
import { ImageField } from './ImageField';
import { LinkField } from './LinkField';
import { RichTextField } from './RichTextField';

/**
 * A section's settings form, made from the section registry (D-035): every field kind the
 * registry declares has one control here, so a new section type needs no new form code.
 */

type Values = Record<string, unknown>;

interface FormProps {
  pages: PageSummary[];
  disabled: boolean;
}

function FieldControl({
  field,
  value,
  onChange,
  pages,
  disabled,
}: FormProps & { field: RegistryField; value: unknown; onChange: (value: unknown) => void }) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const label = bi(field.label);
  switch (field.kind) {
    case 'text':
      return (
        <BilingualField
          label={label}
          value={value as Bilingual}
          onChange={onChange}
          max={field.max}
          multiline={field.multiline === true}
          disabled={disabled}
        />
      );
    case 'plain':
      return (
        <Field label={label}>
          {(props) => (
            <Input
              {...props}
              dir="auto"
              maxLength={field.max}
              disabled={disabled}
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </Field>
      );
    case 'rich':
      return (
        <RichTextField
          label={label}
          value={value as { ar: RichDoc; en: RichDoc }}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'button': {
      const button = value as { label: Bilingual; link: Link };
      return (
        <fieldset className="grid gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-medium">{label}</legend>
          <BilingualField
            label={b['buttonLabel'] ?? ''}
            value={button.label}
            onChange={(next) => onChange({ ...button, label: next })}
            max={40}
            disabled={disabled}
          />
          <LinkField
            value={button.link}
            onChange={(link) => onChange({ ...button, link })}
            pages={pages}
            disabled={disabled}
          />
        </fieldset>
      );
    }
    case 'image':
      return (
        <ImageField
          label={label}
          value={value as ImageRef}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'link':
      return (
        <LinkField
          label={label}
          value={value as Link}
          onChange={onChange}
          pages={pages}
          disabled={disabled}
        />
      );
    case 'icon':
      return (
        <Field label={label}>
          {(props) => (
            <Select
              {...props}
              disabled={disabled}
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
            >
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {b[`icon.${icon}`] ?? icon}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    case 'toggle':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            disabled={disabled}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
      );
    case 'select':
      return (
        <Field label={label}>
          {(props) => (
            <Select
              {...props}
              disabled={disabled}
              value={String(value)}
              onChange={(e) => {
                const option = field.options.find((o) => String(o.value) === e.target.value);
                if (option) onChange(option.value);
              }}
            >
              {field.options.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {bi(o.label)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    case 'list': {
      const items = value as (Values & { id: string })[];
      const itemName = bi(field.itemLabel);
      return (
        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-sm font-medium">{label}</legend>
          {items.map((item, index) => {
            const name = format(b['itemNumber'] ?? '', { item: itemName, n: index + 1 });
            return (
              <div key={item.id} className="grid gap-3 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{name}</p>
                  {!disabled && items.length > field.min && (
                    <IconButton
                      label={format(b['removeItem'] ?? '', { item: name })}
                      onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  )}
                </div>
                <Fields
                  fields={field.fields}
                  values={item}
                  onChange={(next) =>
                    onChange(items.map((i) => (i.id === item.id ? { ...next, id: item.id } : i)))
                  }
                  pages={pages}
                  disabled={disabled}
                />
              </div>
            );
          })}
          {!disabled && items.length < field.max && (
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() => onChange([...items, field.newItem()])}
            >
              <Plus aria-hidden />
              {format(b['addItem'] ?? '', { item: itemName })}
            </Button>
          )}
        </fieldset>
      );
    }
  }
}

function Fields({
  fields,
  values,
  onChange,
  ...rest
}: FormProps & { fields: RegistryField[]; values: Values; onChange: (values: Values) => void }) {
  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(value) => onChange({ ...values, [field.key]: value })}
          {...rest}
        />
      ))}
    </div>
  );
}

const STYLE_OPTIONS: { key: keyof SectionStyle; values: string[] }[] = [
  { key: 'background', values: ['none', 'surface', 'muted', 'accent', 'inverse'] },
  { key: 'spacing', values: ['compact', 'normal', 'spacious'] },
  { key: 'width', values: ['narrow', 'normal', 'wide'] },
  { key: 'align', values: ['start', 'center'] },
];

/** The settings, appearance and screen sizes of one section. */
export function SectionForm({
  section,
  onChange,
  pages,
  disabled,
}: FormProps & { section: ContentSection; onChange: (section: ContentSection) => void }) {
  const { m } = useI18n();
  const b = m.builder;
  const definition = SECTIONS[section.type];
  return (
    <div className="grid gap-6">
      <Fields
        fields={definition.fields}
        values={section.settings}
        onChange={(settings) => onChange({ ...section, settings } as ContentSection)}
        pages={pages}
        disabled={disabled}
      />
      <fieldset className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
        <legend className="mb-1.5 text-sm font-medium">{b['style']}</legend>
        {STYLE_OPTIONS.map(({ key, values }) => (
          <Field key={key} label={b[key]}>
            {(props) => (
              <Select
                {...props}
                disabled={disabled}
                value={section.style[key]}
                onChange={(e) =>
                  onChange({ ...section, style: { ...section.style, [key]: e.target.value } })
                }
              >
                {values.map((v) => (
                  <option key={v} value={v}>
                    {b[`${key}.${v}`]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1.5 text-sm font-medium">{b['showOn']}</legend>
        {(['mobile', 'tablet', 'desktop'] as (keyof Visibility)[]).map((device) => (
          <label key={device} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              disabled={disabled}
              checked={section.visibility[device]}
              onChange={(e) =>
                onChange({
                  ...section,
                  visibility: { ...section.visibility, [device]: e.target.checked },
                })
              }
            />
            {b[device]}
          </label>
        ))}
      </fieldset>
      <Field label={b['anchor']} help={b['anchorHelp']}>
        {(props) => (
          <Input
            {...props}
            dir="ltr"
            maxLength={60}
            disabled={disabled}
            value={section.anchor}
            onChange={(e) =>
              onChange({
                ...section,
                anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
              })
            }
          />
        )}
      </Field>
    </div>
  );
}
