import { slugSchema, type Series } from '@hantex/sections';
import { Layers, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ImageField } from '../builder/ImageField';
import { BilingualField } from '../document';
import { Button, Card, EmptyState, Field, Input, confirmAction, later } from '../ui';
import { newItemId, slugify } from '../../lib/builder';
import { sameData, type CatalogueStructure } from '../../lib/catalogue';
import { useBilingual, useI18n } from '../../lib/i18n';
import { DocumentsField } from './DocumentsField';
import { Checkbox, ItemDialog, RowActions, empty, move } from './parts';

/**
 * Series (D-045): design lines whose products share one design and one set of finishes. Each
 * has its own page on the website, its finishes in order, and documents of its own.
 */

function SeriesDialog({
  value,
  structure,
  editable,
  structureDirty,
  onClose,
  onDone,
}: {
  value: Series | null;
  structure: CatalogueStructure;
  editable: boolean;
  structureDirty: boolean;
  onClose: () => void;
  onDone: (series: Series) => void;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [item, setItem] = useState(value);
  // Only a real change to the saved series (a verification, say) replaces what is being edited;
  // a background refresh with the same data leaves it alone.
  const last = useRef(value);
  useEffect(() => {
    if (last.current?.id !== value?.id || !sameData(last.current, value)) setItem(value);
    last.current = value;
  }, [value]);
  const saved = structure.series.some((x) => x.id === value?.id);
  const valid =
    item !== null &&
    (item.name.ar.trim() !== '' || item.name.en.trim() !== '') &&
    slugSchema.safeParse(item.slug).success &&
    !structure.series.some((x) => x.id !== item.id && x.slug === item.slug);
  return (
    <ItemDialog
      title={t.seriesItem}
      item={item}
      editable={editable}
      valid={valid}
      onClose={onClose}
      onDone={() => item && onDone(item)}
    >
      {item && (
        <>
          <BilingualField
            label={t.name}
            value={item.name}
            max={80}
            disabled={!editable}
            onChange={(name) =>
              setItem({
                ...item,
                name,
                slug:
                  item.slug === '' || item.slug === slugify(item.name.en)
                    ? slugify(name.en)
                    : item.slug,
              })
            }
          />
          <Field label={t.address} help={t.seriesAddressHelp}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                maxLength={60}
                value={item.slug}
                onChange={(e) => setItem({ ...item, slug: e.target.value.toLowerCase() })}
              />
            )}
          </Field>
          <BilingualField
            label={t.description}
            value={item.description}
            max={1000}
            multiline
            disabled={!editable}
            onChange={(description) => setItem({ ...item, description })}
          />
          <ImageField
            label={t.image}
            value={item.image}
            disabled={!editable}
            onChange={(image) => setItem({ ...item, image })}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t.seriesFinishes}</legend>
            <p className="text-xs text-muted">{t.seriesFinishesHelp}</p>
            {structure.finishes.length === 0 ? (
              <p className="text-sm text-muted">{t.noFinishesYet}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {structure.finishes.map((finish) => (
                  <Checkbox
                    key={finish.id}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-4 shrink-0 rounded-full border border-border"
                          style={{ background: finish.swatch }}
                        />
                        {bi(finish.name)}
                      </span>
                    }
                    checked={item.finishIds.includes(finish.id)}
                    disabled={!editable}
                    onChange={(on) =>
                      setItem({
                        ...item,
                        finishIds: on
                          ? [...item.finishIds, finish.id]
                          : item.finishIds.filter((id) => id !== finish.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t.documents}</legend>
            <p className="text-xs text-muted">{t.documentsHelp}</p>
            <DocumentsField
              documents={item.documents}
              target={{ type: 'series', id: item.id }}
              editable={editable}
              // Verification acts on the saved draft, so it waits until this is saved.
              dirty={structureDirty || !saved || (value !== null && !sameData(item, value))}
              onChange={(documents) => setItem({ ...item, documents })}
            />
          </fieldset>
        </>
      )}
    </ItemDialog>
  );
}

export function SeriesCard({
  structure,
  editable,
  dirty,
  onChange,
}: {
  structure: CatalogueStructure;
  editable: boolean;
  dirty: boolean;
  onChange: (next: CatalogueStructure) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [editing, setEditing] = useState<Series | null>(null);
  // The saved series while it is open, so a verification made in the dialog shows at once.
  const value = editing ? (structure.series.find((x) => x.id === editing.id) ?? editing) : null;
  const put = (series: Series) => {
    const exists = structure.series.some((x) => x.id === series.id);
    onChange({
      ...structure,
      series: exists
        ? structure.series.map((x) => (x.id === series.id ? series : x))
        : [...structure.series, series],
    });
    setEditing(null);
  };
  return (
    <Card
      title={t.series}
      icon={<Layers />}
      description={t.seriesHelp}
      actions={
        editable && (
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                id: newItemId(),
                name: empty(),
                slug: '',
                description: empty(),
                image: null,
                finishIds: [],
                documents: [],
              })
            }
          >
            <Plus aria-hidden />
            {t.addSeries}
          </Button>
        )
      }
    >
      <div className="px-5 pb-5">
        {structure.series.length === 0 ? (
          <EmptyState icon={<Layers />} title={t.noSeries}>
            {t.noSeriesHelp}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {structure.series.map((series) => {
              const label = bi(series.name) || series.slug;
              const moved = (step: -1 | 1) => {
                const next = move(structure.series, series.id, step);
                return next === structure.series
                  ? null
                  : () => onChange({ ...structure, series: next });
              };
              const swatches = series.finishIds
                .map((id) => structure.finishes.find((f) => f.id === id))
                .filter((f) => f !== undefined);
              return (
                <li key={series.id} className="flex items-center gap-3 p-2 ps-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{label}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span dir="ltr">/{series.slug}</span>
                      <span>· {format(t.finishCount, { count: series.finishIds.length })}</span>
                      <span>· {format(t.documentCount, { count: series.documents.length })}</span>
                      <span aria-hidden className="flex -space-x-1 rtl:space-x-reverse">
                        {swatches.slice(0, 8).map((f) => (
                          <span
                            key={f.id}
                            className="size-3.5 rounded-full border border-surface"
                            style={{ background: f.swatch }}
                          />
                        ))}
                      </span>
                    </p>
                  </div>
                  <RowActions
                    label={label}
                    editable={editable}
                    onUp={moved(-1)}
                    onDown={moved(1)}
                    onEdit={() => setEditing(series)}
                    onDelete={later(async () => {
                      if (await confirmAction(format(t.deleteConfirm, { name: label }))) {
                        onChange({
                          ...structure,
                          series: structure.series.filter((x) => x.id !== series.id),
                        });
                      }
                    })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <SeriesDialog
        value={value}
        structure={structure}
        editable={editable}
        structureDirty={dirty}
        onClose={() => setEditing(null)}
        onDone={put}
      />
    </Card>
  );
}
