import type { Link } from '@hantex/sections';
import { useBilingual, useI18n } from '../../lib/i18n';
import type { PageSummary } from '../../lib/builder';
import { Field, Input, Select } from '../ui';

/** Where a button or menu item leads: nowhere, a page of this website, another site or a section. */
export function LinkField({
  value,
  onChange,
  pages,
  disabled,
  label,
}: {
  value: Link;
  onChange: (link: Link) => void;
  pages: PageSummary[];
  disabled: boolean;
  label?: string;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const types = ['none', 'page', 'url', 'section'] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={label ?? b['linkType']}>
        {(props) => (
          <Select
            {...props}
            disabled={disabled}
            value={value.type}
            onChange={(e) => {
              const type = e.target.value as Link['type'];
              if (type === 'none') onChange({ type });
              if (type === 'page') onChange({ type, pageId: pages[0]?.id ?? '' });
              if (type === 'url') onChange({ type, url: 'https://' });
              if (type === 'section') onChange({ type, anchor: '' });
            }}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {b[`link.${t}`]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {value.type === 'page' && (
        <Field label={b['linkPage']}>
          {(props) => (
            <Select
              {...props}
              disabled={disabled}
              value={value.pageId}
              onChange={(e) => onChange({ type: 'page', pageId: e.target.value })}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {bi(p.title)}
                  {p.visible ? '' : ` (${b['hidden']})`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {value.type === 'url' && (
        <Field label={b['linkUrl']}>
          {(props) => (
            <Input
              {...props}
              type="url"
              dir="ltr"
              disabled={disabled}
              maxLength={500}
              value={value.url}
              onChange={(e) => onChange({ type: 'url', url: e.target.value.trim() })}
            />
          )}
        </Field>
      )}
      {value.type === 'section' && (
        <Field label={b['linkAnchor']}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              disabled={disabled}
              maxLength={60}
              value={value.anchor}
              onChange={(e) =>
                onChange({ type: 'section', anchor: e.target.value.toLowerCase().trim() })
              }
            />
          )}
        </Field>
      )}
    </div>
  );
}
