import type { Bilingual, CatalogueKind } from '@hantex/sections';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useMemo } from 'react';
import { useCatalogue } from '../../lib/catalogue';
import { useBilingual, useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { Field, IconButton, Select } from '../ui';

/**
 * Pickers for the website's own catalogue (D-048): products, categories and series, from the
 * catalogue drafts. Only the id is stored; the website shows the published names, photos and
 * values, so a section can never state a fact the catalogue doesn't.
 */

export interface CatalogueOption {
  id: string;
  name: Bilingual;
  /** Hidden products are listed, marked, because a draft may be made visible before publishing. */
  hidden: boolean;
  /** Sub-category depth, for indenting. */
  depth: number;
}

export function useCatalogueOptions() {
  const { can } = useCurrentSite();
  const allowed = can('catalogue.view');
  const query = useCatalogue();
  const options = useMemo(() => {
    const data = query.data;
    const result: Record<CatalogueKind, CatalogueOption[]> = {
      product: [],
      category: [],
      series: [],
    };
    if (!data) return result;
    const categories = data.structure.categories;
    const parent = new Map(categories.map((c) => [c.id, c.parentId]));
    const depth = (id: string) => {
      let d = 0;
      let p = parent.get(id) ?? null;
      while (p && d < 3) {
        d++;
        p = parent.get(p) ?? null;
      }
      return d;
    };
    result.category = categories.map((c) => ({
      id: c.id,
      name: c.name,
      hidden: false,
      depth: depth(c.id),
    }));
    result.series = data.structure.series.map((x) => ({
      id: x.id,
      name: x.name,
      hidden: false,
      depth: 0,
    }));
    result.product = data.products.map((p) => ({
      id: p.id,
      name: p.name,
      hidden: !p.visible,
      depth: 0,
    }));
    return result;
  }, [query.data]);
  return { allowed, loading: allowed && query.isPending, options };
}

function useOptionLabel() {
  const { m } = useI18n();
  const bi = useBilingual();
  return (option: CatalogueOption) =>
    `${'— '.repeat(option.depth)}${bi(option.name) || option.id}${
      option.hidden ? ` (${m.builder['catalogueHidden']})` : ''
    }`;
}

/** One product, category or series; empty until chosen. */
export function CatalogueSelect({
  of,
  label,
  value,
  onChange,
  disabled,
  required = false,
}: {
  of: CatalogueKind;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
  /** Links always lead somewhere, so they offer no empty choice. */
  required?: boolean;
}) {
  const { m } = useI18n();
  const b = m.builder;
  const { allowed, options } = useCatalogueOptions();
  const optionLabel = useOptionLabel();
  const list = options[of];
  const known = value === null || list.some((o) => o.id === value);
  return (
    <Field
      label={label}
      help={!allowed ? b['catalogueNoAccess'] : list.length === 0 ? b['catalogueEmpty'] : undefined}
    >
      {(props) => (
        <Select
          {...props}
          disabled={disabled || !allowed}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          {(!required || value === null) && <option value="">{b['catalogueChoose']}</option>}
          {/* A choice that is no longer in the catalogue stays visible until changed. */}
          {!known && value && <option value={value}>{value}</option>}
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {optionLabel(o)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Several products or series, in the order chosen. */
export function CatalogueList({
  of,
  label,
  value,
  max,
  onChange,
  disabled,
}: {
  of: 'product' | 'series';
  label: string;
  value: string[];
  max: number;
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const { m, format } = useI18n();
  const b = m.builder;
  const { allowed, options } = useCatalogueOptions();
  const optionLabel = useOptionLabel();
  const list = options[of];
  const byId = new Map(list.map((o) => [o.id, o]));
  const available = list.filter((o) => !value.includes(o.id));
  const move = (index: number, by: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{b['catalogueNone']}</p>
      ) : (
        <ol className="grid gap-1.5">
          {value.map((id, index) => {
            const option = byId.get(id);
            const name = option ? optionLabel(option) : id;
            return (
              <li
                key={id}
                className="flex items-center gap-1 rounded-lg border border-border py-1 ps-3 pe-1 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {!disabled && (
                  <>
                    <IconButton
                      label={format(b['catalogueMoveUp'] ?? '', { name })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={format(b['catalogueMoveDown'] ?? '', { name })}
                      disabled={index === value.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={format(b['catalogueRemove'] ?? '', { name })}
                      onClick={() => onChange(value.filter((v) => v !== id))}
                    >
                      <X className="size-4" aria-hidden />
                    </IconButton>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!disabled && value.length < max && (
        <Field
          label={b['catalogueAdd']}
          help={
            !allowed ? b['catalogueNoAccess'] : list.length === 0 ? b['catalogueEmpty'] : undefined
          }
        >
          {(props) => (
            <Select
              {...props}
              disabled={!allowed || available.length === 0}
              value=""
              onChange={(e) => {
                if (e.target.value) onChange([...value, e.target.value]);
              }}
            >
              <option value="">{b['catalogueChoose']}</option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </fieldset>
  );
}
