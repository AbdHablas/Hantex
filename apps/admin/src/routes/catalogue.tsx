import {
  ATTRIBUTE_TEMPLATES,
  ATTRIBUTE_TYPES,
  DEFAULT_SWATCH,
  FINISH_MATERIALS,
  applyAttributeTemplate,
  slugSchema,
  type Attribute,
  type AttributeGroup,
  type Category,
  type Finish,
} from '@hantex/sections';
import { FolderTree, ListChecks, Palette, Plus, Star, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BilingualField } from '../components/document';
import { ImageField } from '../components/builder/ImageField';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Loading,
  PageHeader,
  Select,
  Tabs,
  cn,
  confirmAction,
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { newItemId, slugify, useBuilderMutation } from '../lib/builder';
import { sameData, useCatalogue, type CatalogueStructure } from '../lib/catalogue';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

/**
 * The catalogue's structure (D-026, D-045): categories (a tree up to three levels), attribute
 * groups and attributes, finishes and series, plus the website's PDF files. Everything is the website's own data; changes are kept
 * here until saved as a draft, and go live with Publish changes.
 */

import { FilesCard } from '../components/catalogue/FilesCard';
import { Checkbox, ItemDialog, RowActions, empty, move } from '../components/catalogue/parts';
import { SeriesCard } from '../components/catalogue/SeriesCard';

/** Categories in tree order: each followed by its sub-categories, with their depth. */
export function categoryTree(categories: Category[]) {
  const out: { category: Category; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const category of categories.filter((c) => c.parentId === parentId)) {
      if (out.some((o) => o.category.id === category.id) || depth > 3) continue;
      out.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

/* ------------------------------------------- Categories ------------------------------------------- */

function CategoryDialog({
  value,
  structure,
  editable,
  onClose,
  onDone,
}: {
  value: Category | null;
  structure: CatalogueStructure;
  editable: boolean;
  onClose: () => void;
  onDone: (category: Category) => void;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [item, setItem] = useState<Category | null>(value);
  useEffect(() => setItem(value), [value]);
  const tree = categoryTree(structure.categories);
  // A category can sit under one that is at most second level, and never under itself or below.
  const below = new Set<string>();
  if (item) {
    const collect = (id: string) => {
      below.add(id);
      for (const c of structure.categories.filter((x) => x.parentId === id)) collect(c.id);
    };
    collect(item.id);
  }
  const ownDepth = (id: string): number => {
    const children = structure.categories.filter((c) => c.parentId === id);
    return 1 + Math.max(0, ...children.map((c) => ownDepth(c.id)));
  };
  const parents = tree.filter(
    ({ category, depth }) => !below.has(category.id) && depth + (item ? ownDepth(item.id) : 1) <= 3,
  );
  const valid =
    item !== null &&
    (item.name.ar.trim() !== '' || item.name.en.trim() !== '') &&
    slugSchema.safeParse(item.slug).success &&
    !structure.categories.some((c) => c.id !== item.id && c.slug === item.slug);
  return (
    <ItemDialog
      title={t.category}
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
          <Field label={t.address} help={t.addressHelp}>
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
          <Field label={t.parent}>
            {(props) => (
              <Select
                {...props}
                value={item.parentId ?? ''}
                onChange={(e) => setItem({ ...item, parentId: e.target.value || null })}
              >
                <option value="">{t.topLevel}</option>
                {parents.map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {'— '.repeat(depth - 1)}
                    {bi(category.name) || category.slug}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Checkbox
            label={t.main}
            help={t.mainHelp}
            checked={item.main}
            disabled={!editable}
            onChange={(main) => setItem({ ...item, main })}
          />
          <BilingualField
            label={t.description}
            value={item.description}
            max={500}
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
            <legend className="mb-1 text-sm font-medium">{t.categoryAttributes}</legend>
            <p className="text-xs text-muted">{t.categoryAttributesHelp}</p>
            {structure.attributes.length === 0 ? (
              <p className="text-sm text-muted">{t.noAttributes}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {structure.attributes.map((attribute) => (
                  <Checkbox
                    key={attribute.id}
                    label={bi(attribute.name)}
                    checked={item.attributeIds.includes(attribute.id)}
                    disabled={!editable}
                    onChange={(on) =>
                      setItem({
                        ...item,
                        attributeIds: on
                          ? [...item.attributeIds, attribute.id]
                          : item.attributeIds.filter((id) => id !== attribute.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}
    </ItemDialog>
  );
}

function CategoriesCard({
  structure,
  editable,
  onChange,
}: {
  structure: CatalogueStructure;
  editable: boolean;
  onChange: (next: CatalogueStructure) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [editing, setEditing] = useState<Category | null>(null);
  const tree = categoryTree(structure.categories);
  const sibling = (a: Category, b: Category) => a.parentId === b.parentId;
  const put = (category: Category) => {
    const exists = structure.categories.some((c) => c.id === category.id);
    onChange({
      ...structure,
      categories: exists
        ? structure.categories.map((c) => (c.id === category.id ? category : c))
        : [...structure.categories, category],
    });
    setEditing(null);
  };
  return (
    <Card
      title={t.categories}
      icon={<FolderTree />}
      description={t.categoriesHelp}
      actions={
        editable && (
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                id: newItemId(),
                name: empty(),
                slug: '',
                parentId: null,
                main: false,
                description: empty(),
                image: null,
                attributeIds: [],
              })
            }
          >
            <Plus aria-hidden />
            {t.addCategory}
          </Button>
        )
      }
    >
      <div className="px-5 pb-5">
        {tree.length === 0 ? (
          <EmptyState icon={<FolderTree />} title={t.noCategories}>
            {t.noCategoriesHelp}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {tree.map(({ category, depth }) => {
              const label = bi(category.name) || category.slug;
              const children = structure.categories.some((c) => c.parentId === category.id);
              const moved = (step: -1 | 1) => {
                const next = move(structure.categories, category.id, step, sibling);
                return next === structure.categories
                  ? null
                  : () => onChange({ ...structure, categories: next });
              };
              return (
                <li key={category.id} className="flex items-center gap-2 p-2 ps-3">
                  <div
                    className="min-w-0 flex-1"
                    style={{ paddingInlineStart: `${(depth - 1) * 1.25}rem` }}
                  >
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{label}</span>
                      {category.main && (
                        <Badge tone="accent">
                          <Star className="size-3" aria-hidden />
                          {t.mainBadge}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted" dir="ltr">
                      /{category.slug}
                      {category.attributeIds.length > 0 &&
                        ` · ${format(t.attributeCount, { count: category.attributeIds.length })}`}
                    </p>
                  </div>
                  <RowActions
                    label={label}
                    editable={editable}
                    onUp={moved(-1)}
                    onDown={moved(1)}
                    onEdit={() => setEditing(category)}
                    onDelete={
                      children
                        ? null
                        : later(async () => {
                            if (await confirmAction(format(t.deleteConfirm, { name: label }))) {
                              onChange({
                                ...structure,
                                categories: structure.categories.filter(
                                  (c) => c.id !== category.id,
                                ),
                              });
                            }
                          })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <CategoryDialog
        value={editing}
        structure={structure}
        editable={editable}
        onClose={() => setEditing(null)}
        onDone={put}
      />
    </Card>
  );
}

/* ------------------------------------------- Attributes ------------------------------------------- */

function AttributeDialog({
  value,
  structure,
  editable,
  onClose,
  onDone,
}: {
  value: Attribute | null;
  structure: CatalogueStructure;
  editable: boolean;
  onClose: () => void;
  onDone: (attribute: Attribute) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [item, setItem] = useState<Attribute | null>(value);
  useEffect(() => setItem(value), [value]);
  const valid =
    item !== null &&
    (item.name.ar.trim() !== '' || item.name.en.trim() !== '') &&
    (item.type !== 'choice' ||
      (item.choices.length > 0 &&
        item.choices.every((c) => c.label.ar.trim() !== '' || c.label.en.trim() !== '')));
  return (
    <ItemDialog
      title={t.attribute}
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
            onChange={(name) => setItem({ ...item, name })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.type} help={t.typeHelp}>
              {(props) => (
                <Select
                  {...props}
                  value={item.type}
                  onChange={(e) => {
                    const type = e.target.value as Attribute['type'];
                    setItem({
                      ...item,
                      type,
                      unit: type === 'number' ? item.unit : '',
                      choices: type === 'choice' ? item.choices : [],
                    });
                  }}
                >
                  {ATTRIBUTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t.types[type]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.group}>
              {(props) => (
                <Select
                  {...props}
                  value={item.groupId ?? ''}
                  onChange={(e) => setItem({ ...item, groupId: e.target.value || null })}
                >
                  <option value="">{t.noGroup}</option>
                  {structure.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {bi(group.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {item.type === 'number' && (
            <Field label={t.unit} help={t.unitHelp}>
              {(props) => (
                <Input
                  {...props}
                  dir="ltr"
                  maxLength={12}
                  value={item.unit}
                  onChange={(e) => setItem({ ...item, unit: e.target.value })}
                />
              )}
            </Field>
          )}
          {item.type === 'choice' && (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">{t.choices}</legend>
              {item.choices.map((choice, index) => (
                <div key={choice.id} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <BilingualField
                      label={format(t.choiceN, { n: index + 1 })}
                      value={choice.label}
                      max={60}
                      disabled={!editable}
                      onChange={(label) =>
                        setItem({
                          ...item,
                          choices: item.choices.map((c) =>
                            c.id === choice.id ? { ...c, label } : c,
                          ),
                        })
                      }
                    />
                  </div>
                  {editable && (
                    <IconButton
                      label={format(t.removeChoice, { n: index + 1 })}
                      onClick={() =>
                        setItem({
                          ...item,
                          choices: item.choices.filter((c) => c.id !== choice.id),
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  )}
                </div>
              ))}
              {editable && item.choices.length < 60 && (
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setItem({
                        ...item,
                        choices: [...item.choices, { id: newItemId(), label: empty() }],
                      })
                    }
                  >
                    <Plus aria-hidden />
                    {t.addChoice}
                  </Button>
                </div>
              )}
            </fieldset>
          )}
          <Checkbox
            label={t.filterable}
            help={t.filterableHelp}
            checked={item.filterable}
            disabled={!editable}
            onChange={(filterable) => setItem({ ...item, filterable })}
          />
        </>
      )}
    </ItemDialog>
  );
}

function GroupDialog({
  value,
  editable,
  onClose,
  onDone,
}: {
  value: AttributeGroup | null;
  editable: boolean;
  onClose: () => void;
  onDone: (group: AttributeGroup) => void;
}) {
  const { m } = useI18n();
  const [item, setItem] = useState(value);
  useEffect(() => setItem(value), [value]);
  const valid = item !== null && (item.name.ar.trim() !== '' || item.name.en.trim() !== '');
  return (
    <ItemDialog
      title={m.catalogue.group}
      item={item}
      editable={editable}
      valid={valid}
      onClose={onClose}
      onDone={() => item && onDone(item)}
    >
      {item && (
        <BilingualField
          label={m.catalogue.name}
          value={item.name}
          max={60}
          disabled={!editable}
          onChange={(name) => setItem({ ...item, name })}
        />
      )}
    </ItemDialog>
  );
}

function AttributesCard({
  structure,
  editable,
  onChange,
}: {
  structure: CatalogueStructure;
  editable: boolean;
  onChange: (next: CatalogueStructure) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [editing, setEditing] = useState<Attribute | null>(null);
  const [group, setGroup] = useState<AttributeGroup | null>(null);
  const [template, setTemplate] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const putAttribute = (attribute: Attribute) => {
    const exists = structure.attributes.some((a) => a.id === attribute.id);
    onChange({
      ...structure,
      attributes: exists
        ? structure.attributes.map((a) => (a.id === attribute.id ? attribute : a))
        : [...structure.attributes, attribute],
    });
    setEditing(null);
  };
  const putGroup = (next: AttributeGroup) => {
    const exists = structure.groups.some((g) => g.id === next.id);
    onChange({
      ...structure,
      groups: exists
        ? structure.groups.map((g) => (g.id === next.id ? next : g))
        : [...structure.groups, next],
    });
    setGroup(null);
  };
  const sections = [
    ...structure.groups.map((g) => ({ group: g, id: g.id })),
    { group: null, id: '' },
  ];
  return (
    <Card
      title={t.attributes}
      icon={<ListChecks />}
      description={t.attributesHelp}
      actions={
        editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setGroup({ id: newItemId(), name: empty() })}
            >
              <Plus aria-hidden />
              {t.addGroup}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setEditing({
                  id: newItemId(),
                  name: empty(),
                  groupId: null,
                  type: 'text',
                  unit: '',
                  choices: [],
                  filterable: false,
                })
              }
            >
              <Plus aria-hidden />
              {t.addAttribute}
            </Button>
          </div>
        )
      }
    >
      <div className="grid gap-4 px-5 pb-5">
        {editable && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
            <Field label={t.template} help={t.templateHelp} className="min-w-56 flex-1">
              {(props) => (
                <Select {...props} value={template} onChange={(e) => setTemplate(e.target.value)}>
                  <option value="">{t.templateChoose}</option>
                  {ATTRIBUTE_TEMPLATES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {bi(x.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              variant="secondary"
              disabled={template === ''}
              onClick={() => {
                const chosen = ATTRIBUTE_TEMPLATES.find((x) => x.id === template);
                if (!chosen) return;
                const { added, ...next } = applyAttributeTemplate(structure, chosen, newItemId);
                onChange(next);
                setNotice(format(t.templateAdded, { count: added.length }));
                setTemplate('');
              }}
            >
              <Wand2 aria-hidden />
              {t.templateAdd}
            </Button>
          </div>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}
        {structure.attributes.length === 0 && structure.groups.length === 0 ? (
          <EmptyState icon={<ListChecks />} title={t.noAttributes}>
            {t.noAttributesHelp}
          </EmptyState>
        ) : (
          sections.map(({ group: g, id }) => {
            const items = structure.attributes.filter((a) => (a.groupId ?? '') === id);
            if (!g && items.length === 0) return null;
            const groupLabel = g ? bi(g.name) : t.noGroup;
            return (
              <section key={id || 'none'} className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{groupLabel}</h3>
                  {g && (
                    <RowActions
                      label={groupLabel}
                      editable={editable}
                      onUp={(() => {
                        const next = move(structure.groups, g.id, -1);
                        return next === structure.groups
                          ? null
                          : () => onChange({ ...structure, groups: next });
                      })()}
                      onDown={(() => {
                        const next = move(structure.groups, g.id, 1);
                        return next === structure.groups
                          ? null
                          : () => onChange({ ...structure, groups: next });
                      })()}
                      onEdit={() => setGroup(g)}
                      onDelete={later(async () => {
                        if (
                          await confirmAction(format(t.deleteGroupConfirm, { name: groupLabel }))
                        ) {
                          onChange({
                            ...structure,
                            groups: structure.groups.filter((x) => x.id !== g.id),
                            attributes: structure.attributes.map((a) =>
                              a.groupId === g.id ? { ...a, groupId: null } : a,
                            ),
                          });
                        }
                      })}
                    />
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-muted">{t.emptyGroup}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {items.map((attribute) => {
                      const label = bi(attribute.name);
                      const sibling = (a: Attribute, b: Attribute) => a.groupId === b.groupId;
                      const moved = (step: -1 | 1) => {
                        const next = move(structure.attributes, attribute.id, step, sibling);
                        return next === structure.attributes
                          ? null
                          : () => onChange({ ...structure, attributes: next });
                      };
                      return (
                        <li key={attribute.id} className="flex items-center gap-2 p-2 ps-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{label}</p>
                            <p className="truncate text-xs text-muted">
                              {t.types[attribute.type]}
                              {attribute.unit && ` · ${attribute.unit}`}
                              {attribute.type === 'choice' &&
                                ` · ${format(t.choiceCount, { count: attribute.choices.length })}`}
                              {attribute.filterable && ` · ${t.filterBadge}`}
                            </p>
                          </div>
                          <RowActions
                            label={label}
                            editable={editable}
                            onUp={moved(-1)}
                            onDown={moved(1)}
                            onEdit={() => setEditing(attribute)}
                            onDelete={later(async () => {
                              if (
                                await confirmAction(
                                  format(t.deleteAttributeConfirm, { name: label }),
                                )
                              ) {
                                onChange({
                                  ...structure,
                                  attributes: structure.attributes.filter(
                                    (a) => a.id !== attribute.id,
                                  ),
                                  categories: structure.categories.map((c) => ({
                                    ...c,
                                    attributeIds: c.attributeIds.filter((x) => x !== attribute.id),
                                  })),
                                });
                              }
                            })}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
      <AttributeDialog
        value={editing}
        structure={structure}
        editable={editable}
        onClose={() => setEditing(null)}
        onDone={putAttribute}
      />
      <GroupDialog
        value={group}
        editable={editable}
        onClose={() => setGroup(null)}
        onDone={putGroup}
      />
    </Card>
  );
}

/* --------------------------------------------- Finishes --------------------------------------------- */

function FinishDialog({
  value,
  editable,
  onClose,
  onDone,
}: {
  value: Finish | null;
  editable: boolean;
  onClose: () => void;
  onDone: (finish: Finish) => void;
}) {
  const { m } = useI18n();
  const t = m.catalogue;
  const [item, setItem] = useState(value);
  useEffect(() => setItem(value), [value]);
  const valid =
    item !== null &&
    (item.name.ar.trim() !== '' || item.name.en.trim() !== '') &&
    /^#[0-9a-f]{6}$/.test(item.swatch);
  return (
    <ItemDialog
      title={t.finish}
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
            max={60}
            disabled={!editable}
            onChange={(name) => setItem({ ...item, name })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.swatch} help={t.swatchHelp}>
              {(props) => (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t.swatch}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-surface p-1"
                    value={item.swatch}
                    onChange={(e) => setItem({ ...item, swatch: e.target.value.toLowerCase() })}
                  />
                  <Input
                    {...props}
                    dir="ltr"
                    maxLength={7}
                    value={item.swatch}
                    onChange={(e) => setItem({ ...item, swatch: e.target.value.toLowerCase() })}
                  />
                </div>
              )}
            </Field>
            <Field label={t.material}>
              {(props) => (
                <Select
                  {...props}
                  value={item.material}
                  onChange={(e) =>
                    setItem({ ...item, material: e.target.value as Finish['material'] })
                  }
                >
                  {FINISH_MATERIALS.map((material) => (
                    <option key={material} value={material}>
                      {t.materials[material]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <ImageField
            label={t.finishImage}
            value={item.image}
            disabled={!editable}
            onChange={(image) => setItem({ ...item, image })}
          />
        </>
      )}
    </ItemDialog>
  );
}

function FinishesCard({
  structure,
  editable,
  onChange,
}: {
  structure: CatalogueStructure;
  editable: boolean;
  onChange: (next: CatalogueStructure) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const [editing, setEditing] = useState<Finish | null>(null);
  const put = (finish: Finish) => {
    const exists = structure.finishes.some((f) => f.id === finish.id);
    onChange({
      ...structure,
      finishes: exists
        ? structure.finishes.map((f) => (f.id === finish.id ? finish : f))
        : [...structure.finishes, finish],
    });
    setEditing(null);
  };
  return (
    <Card
      title={t.finishes}
      icon={<Palette />}
      description={t.finishesHelp}
      actions={
        editable && (
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                id: newItemId(),
                name: empty(),
                swatch: DEFAULT_SWATCH,
                material: 'plastic',
                image: null,
              })
            }
          >
            <Plus aria-hidden />
            {t.addFinish}
          </Button>
        )
      }
    >
      <div className="px-5 pb-5">
        {structure.finishes.length === 0 ? (
          <EmptyState icon={<Palette />} title={t.noFinishes}>
            {t.noFinishesHelp}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {structure.finishes.map((finish) => {
              const label = bi(finish.name);
              const moved = (step: -1 | 1) => {
                const next = move(structure.finishes, finish.id, step);
                return next === structure.finishes
                  ? null
                  : () => onChange({ ...structure, finishes: next });
              };
              return (
                <li key={finish.id} className="flex items-center gap-3 p-2 ps-3">
                  <span
                    aria-hidden
                    className="size-8 shrink-0 rounded-full border border-border shadow-inner"
                    style={{ background: finish.swatch }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{label}</p>
                    <p className="truncate text-xs text-muted">
                      {t.materials[finish.material]} · <span dir="ltr">{finish.swatch}</span>
                    </p>
                  </div>
                  <RowActions
                    label={label}
                    editable={editable}
                    onUp={moved(-1)}
                    onDown={moved(1)}
                    onEdit={() => setEditing(finish)}
                    onDelete={later(async () => {
                      if (await confirmAction(format(t.deleteConfirm, { name: label }))) {
                        onChange({
                          ...structure,
                          finishes: structure.finishes.filter((f) => f.id !== finish.id),
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
      <FinishDialog
        value={editing}
        editable={editable}
        onClose={() => setEditing(null)}
        onDone={put}
      />
    </Card>
  );
}

/* ---------------------------------------------- Page ---------------------------------------------- */

export function CatalogueStructureEditor() {
  const { m } = useI18n();
  const t = m.catalogue;
  const { site, siteKey, can } = useCurrentSite();
  const listing = useCatalogue();
  const [draft, setDraft] = useState<CatalogueStructure | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useBuilderMutation((structure: CatalogueStructure) =>
    api(sitePath(siteKey, '/catalogue/structure'), { method: 'PUT', body: structure }),
  );
  if (!listing.data) return listing.error ? <ErrorText error={listing.error} /> : <Loading />;
  const structure = draft ?? listing.data.structure;
  const dirty = draft !== null && !sameData(draft, listing.data.structure);
  const editable = can('catalogue.edit') && site?.archived !== true;
  const change = (next: CatalogueStructure) => {
    setSaved(false);
    save.reset();
    setDraft(next);
  };
  return (
    <>
      <PageHeader
        title={t.structureTitle}
        intro={t.structureIntro}
        actions={
          editable && (
            <div className="flex gap-2">
              {dirty && (
                <Button variant="secondary" onClick={() => setDraft(null)}>
                  {t.discard}
                </Button>
              )}
              <Button
                disabled={!dirty}
                busy={save.isPending}
                onClick={() =>
                  save.mutate(structure, {
                    onSuccess: () => {
                      setDraft(null);
                      setSaved(true);
                    },
                  })
                }
              >
                {t.saveDraft}
              </Button>
            </div>
          )
        }
      />
      <div className="grid gap-5">
        <ErrorText error={save.error} />
        {saved && <Alert tone="success">{t.structureSaved}</Alert>}
        {dirty && <Alert tone="warning">{t.unsaved}</Alert>}
        <div className={cn(save.isPending && 'pointer-events-none opacity-70')}>
          <Tabs
            label={t.structureTitle}
            tabs={[
              {
                value: 'categories',
                label: t.categories,
                content: (
                  <CategoriesCard structure={structure} editable={editable} onChange={change} />
                ),
              },
              {
                value: 'attributes',
                label: t.attributes,
                content: (
                  <AttributesCard structure={structure} editable={editable} onChange={change} />
                ),
              },
              {
                value: 'finishes',
                label: t.finishes,
                content: (
                  <FinishesCard structure={structure} editable={editable} onChange={change} />
                ),
              },
              {
                value: 'series',
                label: t.series,
                content: (
                  <SeriesCard
                    structure={structure}
                    editable={editable}
                    dirty={dirty}
                    onChange={change}
                  />
                ),
              },
              // Files are saved as soon as they are uploaded, not with the structure's draft.
              { value: 'files', label: t.files, content: <FilesCard /> },
            ]}
          />
        </div>
      </div>
    </>
  );
}
