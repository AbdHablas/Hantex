import {
  productAttributes,
  slugSchema,
  type Attribute,
  type AttributeValue,
  type Catalogue,
  type Product,
  type Variant,
} from '@hantex/sections';
import { useQuery } from '@tanstack/react-query';
import {
  Copy,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FolderTree,
  History,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DocumentsField } from '../components/catalogue/DocumentsField';
import { SheetDialog } from '../components/catalogue/SheetDialog';
import { BilingualField } from '../components/document';
import { ImageField } from '../components/builder/ImageField';
import { PublishBar } from '../components/builder/PublishBar';
import { SortableList, SortableRow } from '../components/builder/Sortable';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Loading,
  MenuItem,
  MenuSeparator,
  PageHeader,
  Select,
  confirmAction,
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import { newItemId, slugify, useBuilderMutation } from '../lib/builder';
import { sameData, useCatalogue, useProduct, type CatalogueStructure } from '../lib/catalogue';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';
import { categoryTree } from './catalogue';

/** The catalogue's products (D-026, D-045): the list and the product editor. */

const empty = () => ({ ar: '', en: '' });

function CategoryOptions({ structure }: { structure: CatalogueStructure }) {
  const bi = useBilingual();
  return (
    <>
      {categoryTree(structure.categories).map(({ category, depth }) => (
        <option key={category.id} value={category.id}>
          {'— '.repeat(depth - 1)}
          {bi(category.name) || category.slug}
        </option>
      ))}
    </>
  );
}

/* ------------------------------------------ Products list ------------------------------------------ */

function NewProductDialog({
  open,
  onClose,
  structure,
}: {
  open: boolean;
  onClose: () => void;
  structure: CatalogueStructure;
}) {
  const { m } = useI18n();
  const t = m.catalogue;
  const { siteKey } = useCurrentSite();
  const navigate = useNavigate();
  const [name, setName] = useState(empty());
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [categoryId, setCategoryId] = useState(structure.categories[0]?.id ?? '');
  const create = useBuilderMutation(() =>
    api<{ id: string }>(sitePath(siteKey, '/catalogue/products'), {
      method: 'POST',
      body: { name, slug, categoryId },
    }),
  );
  const valid =
    (name.ar.trim() !== '' || name.en.trim() !== '') &&
    slugSchema.safeParse(slug).success &&
    categoryId !== '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    create.mutate(undefined, {
      onSuccess: ({ id }) => {
        onClose();
        void navigate(`/s/${siteKey}/products/${id}`);
      },
    });
  };
  return (
    <Dialog open={open} onClose={onClose} title={t.newProduct}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <BilingualField
          label={t.name}
          value={name}
          max={120}
          disabled={false}
          onChange={(next) => {
            setName(next);
            if (!slugEdited) setSlug(slugify(next.en) || slugify(next.ar));
          }}
        />
        <Field label={t.address} help={t.productAddressHelp}>
          {(props) => (
            <Input
              {...props}
              required
              dir="ltr"
              maxLength={60}
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          )}
        </Field>
        <Field label={t.category}>
          {(props) => (
            <Select {...props} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <CategoryOptions structure={structure} />
            </Select>
          )}
        </Field>
        <p className="text-sm text-muted">{t.newProductHelp}</p>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button type="submit" disabled={!valid} busy={create.isPending}>
            {m.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProductsList() {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const { site, siteKey, can } = useCurrentSite();
  const listing = useCatalogue();
  const [creating, setCreating] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  // The order shown while a reorder is being saved, so the row doesn't jump back.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [listing.data]);
  const editable = can('catalogue.edit') && site?.archived !== true;
  const path = (suffix: string) => sitePath(siteKey, `/catalogue${suffix}`);

  const reorder = useBuilderMutation((products: string[]) =>
    api(path('/order'), { method: 'PUT', body: { products } }),
  );
  const duplicate = useBuilderMutation((id: string) =>
    api(path(`/products/${id}/duplicate`), { method: 'POST' }),
  );
  const remove = useBuilderMutation((id: string) =>
    api(path(`/products/${id}`), { method: 'DELETE' }),
  );
  const setVisible = useBuilderMutation(async (input: { id: string; visible: boolean }) => {
    const { product } = await api<{ product: Product }>(path(`/products/${input.id}`));
    return api(path(`/products/${input.id}`), {
      method: 'PUT',
      body: { ...product, visible: input.visible },
    });
  });

  if (!listing.data) return listing.error ? <ErrorText error={listing.error} /> : <Loading />;
  const { structure, products } = listing.data;
  const categoryName = (id: string) => {
    const category = structure.categories.find((c) => c.id === id);
    return category ? bi(category.name) || category.slug : t.missingCategory;
  };
  const ordered = order
    ? order.map((id) => products.find((p) => p.id === id)).filter((p) => p !== undefined)
    : products;
  const query = search.trim().toLowerCase();
  const shown = ordered.filter(
    (p) =>
      (filter === '' || p.categoryId === filter) &&
      (query === '' ||
        p.name.ar.toLowerCase().includes(query) ||
        p.name.en.toLowerCase().includes(query) ||
        p.slug.includes(query)),
  );
  const filtered = filter !== '' || query !== '';
  const error = reorder.error ?? duplicate.error ?? remove.error ?? setVisible.error;

  return (
    <>
      <PageHeader
        title={t.productsTitle}
        intro={t.productsIntro}
        actions={
          structure.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setSheet(true)}>
                <FileSpreadsheet aria-hidden />
                {t.sheetButton}
              </Button>
              {editable && (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  {t.newProduct}
                </Button>
              )}
            </div>
          )
        }
      />
      <SheetDialog open={sheet} onClose={() => setSheet(false)} />
      <div className="grid gap-5">
        <PublishBar />
        <ErrorText error={error} />
        {structure.categories.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderTree />}
              title={t.noCategories}
              action={
                <Link
                  to={`/s/${siteKey}/catalogue`}
                  className="text-sm font-medium text-accent-text underline-offset-4 hover:underline"
                >
                  {t.goToStructure}
                </Link>
              }
            >
              {t.categoriesFirst}
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap gap-3 px-5 pt-5">
              <Field label={t.category} className="min-w-48 flex-1">
                {(props) => (
                  <Select {...props} value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="">{t.allCategories}</option>
                    <CategoryOptions structure={structure} />
                  </Select>
                )}
              </Field>
              <Field label={m.search} className="min-w-48 flex-1">
                {(props) => (
                  <Input
                    {...props}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="p-5">
              {filtered && <p className="mb-3 text-xs text-muted">{t.reorderUnfiltered}</p>}
              {shown.length === 0 ? (
                <EmptyState icon={<Package />} title={filtered ? t.noMatches : t.noProducts}>
                  {filtered ? null : t.noProductsHelp}
                </EmptyState>
              ) : (
                <SortableList
                  items={shown}
                  disabled={!editable || filtered}
                  onReorder={(next) => {
                    const ids = next.map((p) => p.id);
                    setOrder(ids);
                    reorder.mutate(ids, { onError: () => setOrder(null) });
                  }}
                >
                  {(product) => {
                    const name = bi(product.name) || product.slug;
                    const actions = format(t.productActions, { name });
                    return (
                      <SortableRow
                        key={product.id}
                        id={product.id}
                        label={name}
                        disabled={!editable || filtered}
                      >
                        {(handle) => (
                          <div className="flex items-center gap-2 p-2 pe-3">
                            {handle}
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/s/${siteKey}/products/${product.id}`}
                                className="font-medium hover:text-accent-text hover:underline"
                              >
                                {name}
                              </Link>
                              <p className="truncate text-xs text-muted">
                                {categoryName(product.categoryId)}
                                {product.variants > 0 &&
                                  ` · ${format(t.variantCount, { count: product.variants })}`}
                              </p>
                            </div>
                            <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                              {!product.visible && <Badge>{t.hidden}</Badge>}
                              {!product.published ? (
                                <Badge tone="warning">{t.notPublished}</Badge>
                              ) : (
                                product.changed && <Badge tone="warning">{t.changed}</Badge>
                              )}
                            </div>
                            <DropdownMenu
                              label={actions}
                              trigger={
                                <IconButton label={actions}>
                                  <MoreHorizontal className="size-4" aria-hidden />
                                </IconButton>
                              }
                            >
                              <MenuItem asChild>
                                <Link to={`/s/${siteKey}/products/${product.id}`}>
                                  <Pencil aria-hidden />
                                  {t.editProduct}
                                </Link>
                              </MenuItem>
                              {editable && (
                                <>
                                  <MenuItem onSelect={() => duplicate.mutate(product.id)}>
                                    <Copy aria-hidden />
                                    {t.duplicate}
                                  </MenuItem>
                                  <MenuItem
                                    onSelect={() =>
                                      setVisible.mutate({
                                        id: product.id,
                                        visible: !product.visible,
                                      })
                                    }
                                  >
                                    <EyeOff aria-hidden />
                                    {product.visible ? t.hide : t.show}
                                  </MenuItem>
                                </>
                              )}
                              {can('catalogue.delete') && site?.archived !== true && (
                                <>
                                  <MenuSeparator />
                                  <MenuItem
                                    className="text-danger"
                                    onSelect={later(async () => {
                                      if (
                                        await confirmAction(
                                          format(t.deleteProductConfirm, { name }),
                                        )
                                      ) {
                                        remove.mutate(product.id);
                                      }
                                    })}
                                  >
                                    <Trash2 aria-hidden />
                                    {t.deleteProduct}
                                  </MenuItem>
                                </>
                              )}
                            </DropdownMenu>
                          </div>
                        )}
                      </SortableRow>
                    );
                  }}
                </SortableList>
              )}
            </div>
          </Card>
        )}
      </div>
      {creating && (
        <NewProductDialog open onClose={() => setCreating(false)} structure={structure} />
      )}
    </>
  );
}

/* ------------------------------------------ Product editor ------------------------------------------ */

function ImagesField({
  label,
  images,
  max,
  editable,
  onChange,
}: {
  label: string;
  images: { mediaId: string }[];
  max: number;
  editable: boolean;
  onChange: (images: { mediaId: string }[]) => void;
}) {
  const { m, format } = useI18n();
  const t = m.catalogue;
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {images.map((image, index) => (
        <ImageField
          key={`${image.mediaId}-${index}`}
          label={format(t.imageN, { n: index + 1 })}
          value={image}
          disabled={!editable}
          onChange={(next) =>
            onChange(
              next
                ? images.map((x, i) => (i === index ? next : x))
                : images.filter((_, i) => i !== index),
            )
          }
        />
      ))}
      {editable && images.length < max && (
        <ImageField
          key={`new-${images.length}`}
          label={t.addImage}
          value={null}
          disabled={false}
          onChange={(next) => next && onChange([...images, next])}
        />
      )}
    </fieldset>
  );
}

function ValueField({
  attribute,
  value,
  editable,
  onChange,
}: {
  attribute: Attribute;
  value: AttributeValue | undefined;
  editable: boolean;
  onChange: (value: AttributeValue | undefined) => void;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const label = attribute.unit ? `${bi(attribute.name)} (${attribute.unit})` : bi(attribute.name);
  switch (attribute.type) {
    case 'text':
      return (
        <BilingualField
          label={label}
          value={value && 'text' in value ? value.text : empty()}
          max={200}
          disabled={!editable}
          onChange={(text) =>
            onChange(text.ar.trim() === '' && text.en.trim() === '' ? undefined : { text })
          }
        />
      );
    case 'number':
      return (
        <Field label={label}>
          {(props) => (
            <Input
              {...props}
              type="number"
              dir="ltr"
              step="any"
              disabled={!editable}
              value={value && 'number' in value ? String(value.number) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                const number = Number(raw);
                onChange(raw === '' || !Number.isFinite(number) ? undefined : { number });
              }}
            />
          )}
        </Field>
      );
    case 'choice':
      return (
        <Field label={label}>
          {(props) => (
            <Select
              {...props}
              disabled={!editable}
              value={value && 'choice' in value ? value.choice : ''}
              onChange={(e) => onChange(e.target.value ? { choice: e.target.value } : undefined)}
            >
              <option value="">{t.notSet}</option>
              {attribute.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {bi(choice.label)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    case 'yes-no':
      return (
        <Field label={label}>
          {(props) => (
            <Select
              {...props}
              disabled={!editable}
              value={value && 'yes' in value ? String(value.yes) : ''}
              onChange={(e) =>
                onChange(e.target.value === '' ? undefined : { yes: e.target.value === 'true' })
              }
            >
              <option value="">{t.notSet}</option>
              <option value="true">{m.yes}</option>
              <option value="false">{m.no}</option>
            </Select>
          )}
        </Field>
      );
  }
}

function VariantCard({
  variant,
  index,
  structure,
  editable,
  onChange,
  onRemove,
}: {
  variant: Variant;
  index: number;
  structure: CatalogueStructure;
  editable: boolean;
  onChange: (variant: Variant) => void;
  onRemove: () => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const finish = structure.finishes.find((f) => f.id === variant.finishId);
  const title =
    bi(variant.name) || (finish ? bi(finish.name) : format(t.variantN, { n: index + 1 }));
  return (
    <div className="grid gap-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium">
          {finish && (
            <span
              aria-hidden
              className="size-5 rounded-full border border-border"
              style={{ background: finish.swatch }}
            />
          )}
          {title}
        </h3>
        {editable && (
          <IconButton label={format(t.removeVariant, { name: title })} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.sku} help={t.skuHelp}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              maxLength={40}
              disabled={!editable}
              value={variant.sku}
              onChange={(e) => onChange({ ...variant, sku: e.target.value })}
            />
          )}
        </Field>
        <Field label={t.finish}>
          {(props) => (
            <Select
              {...props}
              disabled={!editable}
              value={variant.finishId ?? ''}
              onChange={(e) => onChange({ ...variant, finishId: e.target.value || null })}
            >
              <option value="">{t.noFinish}</option>
              {structure.finishes.map((f) => (
                <option key={f.id} value={f.id}>
                  {bi(f.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <BilingualField
        label={t.variantName}
        help={t.variantNameHelp}
        value={variant.name}
        max={80}
        disabled={!editable}
        onChange={(name) => onChange({ ...variant, name })}
      />
      <ImagesField
        label={t.variantImages}
        images={variant.images}
        max={12}
        editable={editable}
        onChange={(images) => onChange({ ...variant, images })}
      />
    </div>
  );
}

function ProductHistory({ id, editable }: { id: string; editable: boolean }) {
  const { m, format, date } = useI18n();
  const t = m.catalogue;
  const { siteKey } = useCurrentSite();
  const versions = useQuery({
    queryKey: ['site', siteKey, 'builder', 'catalogue', 'product', id, 'versions'],
    queryFn: () =>
      api<{ version: number; publishedAt: string; publishedBy: string | null }[]>(
        sitePath(siteKey, `/catalogue/products/${id}/versions`),
      ),
  });
  const restore = useBuilderMutation((version: number) =>
    api(sitePath(siteKey, `/catalogue/products/${id}/restore`), {
      method: 'POST',
      body: { version },
    }),
  );
  return (
    <Card title={t.history} icon={<History />} description={t.historyHelp}>
      <div className="grid gap-2 px-5 pb-5">
        <ErrorText error={restore.error ?? versions.error} />
        {(versions.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t.noVersions}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {(versions.data ?? []).map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-2 p-2 ps-3">
                <span>
                  {format(t.versionLine, {
                    version: v.version,
                    date: date(v.publishedAt),
                    who: v.publishedBy ?? '—',
                  })}
                </span>
                {editable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={restore.isPending && restore.variables === v.version}
                    onClick={later(async () => {
                      if (await confirmAction(format(t.restoreConfirm, { version: v.version }))) {
                        restore.mutate(v.version);
                      }
                    })}
                  >
                    {t.restore}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function ProductEditor() {
  const { productId = '' } = useParams();
  return <ProductForm key={productId} productId={productId} />;
}

function ProductForm({ productId }: { productId: string }) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const { site, siteKey, can } = useCurrentSite();
  const listing = useCatalogue();
  const loaded = useProduct(productId);
  const [product, setProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);
  // Fresh data from the server replaces the form only while it holds no unsaved changes.
  const previous = useRef<Product | null>(null);
  useEffect(() => {
    if (!loaded.data) return;
    const next = loaded.data.product;
    // Read before replacing: the updater below runs later, during the next render.
    const before = previous.current;
    previous.current = next;
    setProduct((current) => (current === null || sameData(current, before) ? next : current));
  }, [loaded.data]);
  const save = useBuilderMutation((next: Product) =>
    api(sitePath(siteKey, `/catalogue/products/${productId}`), { method: 'PUT', body: next }),
  );
  if (loaded.error) return <ErrorText error={loaded.error} />;
  if (!listing.data || !loaded.data || !product) return <Loading />;
  const { structure } = listing.data;
  const editable = can('catalogue.edit') && site?.archived !== true;
  const dirty = !sameData(product, loaded.data.product);
  const update = (next: Product) => {
    setSaved(false);
    save.reset();
    setProduct(next);
  };
  const catalogue = { ...structure, version: 1, products: [] } as Catalogue;
  const attributes = productAttributes(catalogue, product);
  const groups = [
    ...structure.groups.map((g) => ({ id: g.id, name: bi(g.name) })),
    { id: '', name: t.noGroup },
  ];
  const issues = listing.data.issues.filter((i) => i.target === `product:${productId}`);
  const name = bi(product.name) || product.slug;
  const valid =
    slugSchema.safeParse(product.slug).success &&
    (product.name.ar !== '' || product.name.en !== '');

  return (
    <>
      <PageHeader
        title={name}
        intro={
          <Link to={`/s/${siteKey}/products`} className="text-accent-text hover:underline">
            {t.backToProducts}
          </Link>
        }
        actions={
          editable && (
            <div className="flex gap-2">
              {dirty && (
                <Button variant="secondary" onClick={() => setProduct(loaded.data.product)}>
                  {t.discard}
                </Button>
              )}
              <Button
                disabled={!dirty || !valid}
                busy={save.isPending}
                onClick={() => save.mutate(product, { onSuccess: () => setSaved(true) })}
              >
                {t.saveDraft}
              </Button>
            </div>
          )
        }
      />
      <div className="grid gap-5">
        <ErrorText error={save.error} />
        {saved && !dirty && <Alert tone="success">{t.productSaved}</Alert>}
        {dirty && <Alert tone="warning">{t.unsaved}</Alert>}
        {issues.length > 0 && (
          <Alert tone="warning">
            <p className="font-medium">{t.productIssues}</p>
            <ul className="mt-1 list-disc ps-5">
              {issues.map((issue, i) => (
                <li key={i}>{t.issue[issue.code] ?? issue.code}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card title={t.details}>
          <div className="grid gap-4 px-5 pb-5">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-accent"
                checked={product.visible}
                disabled={!editable}
                onChange={(e) => update({ ...product, visible: e.target.checked })}
              />
              <span>
                {t.visible}
                <span className="block text-xs text-muted">{t.visibleHelp}</span>
              </span>
            </label>
            <BilingualField
              label={t.name}
              value={product.name}
              max={120}
              disabled={!editable}
              onChange={(next) => update({ ...product, name: next })}
            />
            <Field label={t.address} help={t.productAddressHelp}>
              {(props) => (
                <Input
                  {...props}
                  dir="ltr"
                  maxLength={60}
                  disabled={!editable}
                  value={product.slug}
                  onChange={(e) => update({ ...product, slug: e.target.value.toLowerCase() })}
                />
              )}
            </Field>
            <Field label={t.category} help={t.categoryHelp}>
              {(props) => (
                <Select
                  {...props}
                  disabled={!editable}
                  value={product.categoryId}
                  onChange={(e) =>
                    update({
                      ...product,
                      categoryId: e.target.value,
                      extraCategoryIds: product.extraCategoryIds.filter(
                        (x) => x !== e.target.value,
                      ),
                    })
                  }
                >
                  <CategoryOptions structure={structure} />
                </Select>
              )}
            </Field>
            {structure.series.length > 0 && (
              <Field label={t.productSeries} help={t.productSeriesHelp}>
                {(props) => (
                  <Select
                    {...props}
                    disabled={!editable}
                    value={product.seriesId ?? ''}
                    onChange={(e) => update({ ...product, seriesId: e.target.value || null })}
                  >
                    <option value="">{t.noSeriesChoice}</option>
                    {structure.series.map((series) => (
                      <option key={series.id} value={series.id}>
                        {bi(series.name) || series.slug}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t.extraCategories}</legend>
              <p className="text-xs text-muted">{t.extraCategoriesHelp}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {categoryTree(structure.categories)
                  .filter(({ category }) => category.id !== product.categoryId)
                  .map(({ category }) => {
                    const checked = product.extraCategoryIds.includes(category.id);
                    return (
                      <label key={category.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-accent"
                          checked={checked}
                          disabled={!editable || (!checked && product.extraCategoryIds.length >= 5)}
                          onChange={(e) =>
                            update({
                              ...product,
                              extraCategoryIds: e.target.checked
                                ? [...product.extraCategoryIds, category.id]
                                : product.extraCategoryIds.filter((x) => x !== category.id),
                            })
                          }
                        />
                        {bi(category.name) || category.slug}
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            <BilingualField
              label={t.summary}
              value={product.summary}
              max={300}
              multiline
              disabled={!editable}
              onChange={(summary) => update({ ...product, summary })}
            />
            <BilingualField
              label={t.productDescription}
              help={t.productDescriptionHelp}
              value={product.description}
              max={5000}
              multiline
              disabled={!editable}
              onChange={(description) => update({ ...product, description })}
            />
          </div>
        </Card>

        <Card title={t.photos} description={t.photosHelp}>
          <div className="px-5 pb-5">
            <ImagesField
              label={t.photos}
              images={product.images}
              max={20}
              editable={editable}
              onChange={(images) => update({ ...product, images })}
            />
          </div>
        </Card>

        <Card title={t.specifications} description={t.specificationsHelp}>
          <div className="grid gap-5 px-5 pb-5">
            {attributes.length === 0 ? (
              <p className="text-sm text-muted">{t.noProductAttributes}</p>
            ) : (
              groups.map((group) => {
                const items = attributes.filter((a) => (a.groupId ?? '') === group.id);
                if (items.length === 0) return null;
                return (
                  <section key={group.id || 'none'} className="grid gap-3">
                    <h3 className="text-sm font-semibold">{group.name}</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {items.map((attribute) => (
                        <div
                          key={attribute.id}
                          className={attribute.type === 'text' ? 'sm:col-span-2' : undefined}
                        >
                          <ValueField
                            attribute={attribute}
                            value={product.values[attribute.id]}
                            editable={editable}
                            onChange={(value) => {
                              const values = { ...product.values };
                              if (value === undefined) delete values[attribute.id];
                              else values[attribute.id] = value;
                              update({ ...product, values });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </Card>

        <Card
          title={t.variants}
          description={t.variantsHelp}
          actions={
            editable &&
            product.variants.length < 60 && (
              <Button
                size="sm"
                onClick={() =>
                  update({
                    ...product,
                    variants: [
                      ...product.variants,
                      { id: newItemId(), sku: '', finishId: null, name: empty(), images: [] },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                {t.addVariant}
              </Button>
            )
          }
        >
          <div className="grid gap-4 px-5 pb-5">
            {product.variants.length === 0 ? (
              <p className="text-sm text-muted">{t.noVariants}</p>
            ) : (
              product.variants.map((variant, index) => (
                <VariantCard
                  key={variant.id}
                  variant={variant}
                  index={index}
                  structure={structure}
                  editable={editable}
                  onChange={(next) =>
                    update({
                      ...product,
                      variants: product.variants.map((x) => (x.id === variant.id ? next : x)),
                    })
                  }
                  onRemove={() =>
                    update({
                      ...product,
                      variants: product.variants.filter((x) => x.id !== variant.id),
                    })
                  }
                />
              ))
            )}
          </div>
        </Card>

        <Card title={t.documents} icon={<FileText />} description={t.documentsHelp}>
          <div className="px-5 pb-5">
            <DocumentsField
              documents={product.documents}
              target={{ type: 'product', id: productId }}
              editable={editable}
              dirty={dirty}
              onChange={(documents) => update({ ...product, documents })}
            />
          </div>
        </Card>

        <ProductHistory id={productId} editable={editable} />
        <p className="text-xs text-muted">
          {loaded.data.published
            ? format(t.publishedVersion, {
                version: loaded.data.published.version,
              })
            : t.neverPublished}
        </p>
      </div>
    </>
  );
}
