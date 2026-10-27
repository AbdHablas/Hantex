import {
  SECTIONS,
  SECTION_TYPES,
  newSection,
  pageSchema,
  savedReference,
  savedSectionsSchema,
  slugSchema,
  type ContentSection,
  type Page,
  type SavedSections,
  type Section,
  type SectionType,
} from '@hantex/sections';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChartNoAxesColumn,
  ChevronDown,
  CircleHelp,
  Contact,
  Copy,
  EyeOff,
  FileText,
  Home,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  MousePointerClick,
  PanelTop,
  Pencil,
  Plus,
  SeparatorHorizontal,
  Sparkles,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BilingualField } from '../components/document';
import { DevicePreview } from '../components/builder/DevicePreview';
import { ImageField } from '../components/builder/ImageField';
import { PublishBar } from '../components/builder/PublishBar';
import { SectionForm } from '../components/builder/SectionForm';
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
  Table,
  cn,
  confirmAction,
  later,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import {
  newItemId,
  slugify,
  useBuilderKeys,
  useBuilderMutation,
  usePage,
  usePages,
  useSavedSections,
  type PageSummary,
} from '../lib/builder';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

/** The website builder's pages (D-035): the list of pages and the page editor. */

/* ----------------------------------------- Pages list ----------------------------------------- */

function NewPageDialog({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: PageSummary[];
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const { siteKey } = useCurrentSite();
  const navigate = useNavigate();
  const [title, setTitle] = useState({ ar: '', en: '' });
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [parentId, setParentId] = useState('');
  // An empty page, or the privacy policy draft for the owner's review (D-041).
  const [template, setTemplate] = useState<'' | 'privacy-draft'>('');
  const create = useBuilderMutation(() =>
    api<{ id: string }>(sitePath(siteKey, '/pages'), {
      method: 'POST',
      body: { title, slug, parentId: parentId || null, ...(template ? { template } : {}) },
    }),
  );
  const valid =
    (title.ar.trim() !== '' || title.en.trim() !== '') && slugSchema.safeParse(slug).success;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    create.mutate(undefined, {
      onSuccess: ({ id }) => {
        onClose();
        void navigate(`/s/${siteKey}/pages/${id}`);
      },
    });
  };
  return (
    <Dialog open={open} onClose={onClose} title={b['newPage']}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{b['pageStart']}</legend>
          {(['', 'privacy-draft'] as const).map((option) => (
            <label
              key={option || 'empty'}
              className="flex items-start gap-3 rounded-xl border border-border p-3 has-checked:border-accent has-checked:bg-accent-soft/40"
            >
              <input
                type="radio"
                name="page-template"
                className="mt-1 size-4 accent-accent"
                checked={template === option}
                onChange={() => {
                  setTemplate(option);
                  if (option === 'privacy-draft') {
                    setTitle({ ar: 'سياسة الخصوصية', en: 'Privacy policy' });
                    if (!slugEdited) setSlug('privacy');
                  }
                }}
              />
              <span>
                <span className="block text-sm font-medium">
                  {option ? b['privacyDraft'] : b['emptyPage']}
                </span>
                {option && (
                  <span className="block text-xs text-muted">{b['privacyDraftHelp']}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <BilingualField
          label={b['pageTitle'] ?? ''}
          value={title}
          max={120}
          disabled={false}
          onChange={(next) => {
            setTitle(next);
            if (!slugEdited) setSlug(slugify(next.en) || slugify(next.ar));
          }}
        />
        <Field label={b['address']} help={b['addressHelp']}>
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
        <Field label={b['parent']}>
          {(props) => (
            <Select {...props} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{b['parentNone']}</option>
              {pages
                .filter((p) => p.parentId === null)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {bi(p.title)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
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

const pathOf = (page: PageSummary, pages: PageSummary[], home: string | null) => {
  if (page.id === home) return '/';
  const parent = pages.find((p) => p.id === page.parentId);
  return parent ? `/${parent.slug}/${page.slug}` : `/${page.slug}`;
};

export function PagesList() {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const { site, siteKey, can } = useCurrentSite();
  const pages = usePages();
  const [creating, setCreating] = useState(false);
  // The order shown while a reorder is being saved, so the row doesn't jump back.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [pages.data]);
  const editable = can('pages.edit') && site?.archived !== true;
  const path = (suffix: string) => sitePath(siteKey, suffix);

  const reorder = useBuilderMutation((input: { order: string[]; home: string }) =>
    api(path('/pages-index'), { method: 'PUT', body: input }),
  );
  const duplicate = useBuilderMutation((id: string) =>
    api(path(`/pages/${id}/duplicate`), { method: 'POST' }),
  );
  const remove = useBuilderMutation((id: string) =>
    api(path(`/pages/${id}`), { method: 'DELETE' }),
  );
  const setVisible = useBuilderMutation(async (input: { id: string; visible: boolean }) => {
    const { page } = await api<{ page: Page }>(path(`/pages/${input.id}`));
    return api(path(`/pages/${input.id}`), {
      method: 'PUT',
      body: { ...page, visible: input.visible },
    });
  });

  if (!pages.data) return <Loading />;
  const list = pages.data.pages;
  const home = pages.data.home;
  const optimistic = order
    ? order.map((id) => list.find((p) => p.id === id)).filter((p) => p !== undefined)
    : list;
  const error = reorder.error ?? duplicate.error ?? remove.error ?? setVisible.error;

  return (
    <>
      <PageHeader
        title={b['pagesTitle']}
        intro={b['pagesIntro']}
        actions={
          editable && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {b['newPage']}
            </Button>
          )
        }
      />
      <div className="grid gap-5">
        <PublishBar />
        <ErrorText error={error} />
        <Card>
          {optimistic.length === 0 ? (
            <EmptyState icon={<FileText />} title={b['noPages']}>
              {b['noPagesHelp']}
            </EmptyState>
          ) : (
            <SortableList
              items={optimistic}
              disabled={!editable}
              onReorder={(next) => {
                if (!home) return;
                setOrder(next.map((p) => p.id));
                reorder.mutate(
                  { order: next.map((p) => p.id), home },
                  { onError: () => setOrder(null) },
                );
              }}
            >
              {(page) => {
                const title = bi(page.title) || page.slug;
                return (
                  <SortableRow key={page.id} id={page.id} label={title} disabled={!editable}>
                    {(handle) => (
                      <div className="flex items-center gap-2 p-2 pe-3">
                        {handle}
                        <div className={cn('min-w-0 flex-1', page.parentId && 'ps-5')}>
                          <Link
                            to={`/s/${siteKey}/pages/${page.id}`}
                            className="font-medium hover:text-accent-text hover:underline"
                          >
                            {title}
                          </Link>
                          <p className="truncate text-xs text-muted" dir="ltr">
                            {pathOf(page, list, home)}
                          </p>
                        </div>
                        <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                          {page.id === home && (
                            <Badge tone="accent">
                              <Home className="size-3" aria-hidden />
                              {b['home']}
                            </Badge>
                          )}
                          {!page.visible && <Badge>{b['hidden']}</Badge>}
                          {!page.published ? (
                            <Badge tone="warning">{b['notPublished']}</Badge>
                          ) : (
                            page.changed && <Badge tone="warning">{b['changed']}</Badge>
                          )}
                        </div>
                        <DropdownMenu
                          label={format(b['pageActions'] ?? '', { title })}
                          trigger={
                            <IconButton label={format(b['pageActions'] ?? '', { title })}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </IconButton>
                          }
                        >
                          <MenuItem asChild>
                            <Link to={`/s/${siteKey}/pages/${page.id}`}>
                              <Pencil aria-hidden />
                              {b['editPage']}
                            </Link>
                          </MenuItem>
                          {editable && (
                            <>
                              <MenuItem onSelect={() => duplicate.mutate(page.id)}>
                                <Copy aria-hidden />
                                {b['duplicate']}
                              </MenuItem>
                              {page.id !== home && page.visible && (
                                <MenuItem
                                  onSelect={() =>
                                    reorder.mutate({ order: list.map((p) => p.id), home: page.id })
                                  }
                                >
                                  <Home aria-hidden />
                                  {b['setHome']}
                                </MenuItem>
                              )}
                              {page.id !== home && (
                                <MenuItem
                                  onSelect={() =>
                                    setVisible.mutate({ id: page.id, visible: !page.visible })
                                  }
                                >
                                  <EyeOff aria-hidden />
                                  {page.visible ? b['hide'] : b['show']}
                                </MenuItem>
                              )}
                              {page.id !== home && (
                                <>
                                  <MenuSeparator />
                                  <MenuItem
                                    className="text-danger"
                                    onSelect={later(async () => {
                                      if (
                                        await confirmAction(
                                          format(b['deleteConfirm'] ?? '', { title }),
                                        )
                                      ) {
                                        remove.mutate(page.id);
                                      }
                                    })}
                                  >
                                    <Trash2 aria-hidden />
                                    {b['deletePage']}
                                  </MenuItem>
                                </>
                              )}
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
        </Card>
      </div>
      <NewPageDialog open={creating} onClose={() => setCreating(false)} pages={list} />
    </>
  );
}

/* ----------------------------------------- Page editor ----------------------------------------- */

/** The registry names each section's icon; only these are bundled. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  PanelTop,
  AlignLeft,
  Sparkles,
  LayoutGrid,
  MousePointerClick,
  CircleHelp,
  ChartNoAxesColumn,
  Contact,
  Mail,
  SeparatorHorizontal,
};

const sectionIcon = (type: SectionType) => {
  const Icon = SECTION_ICONS[SECTIONS[type].icon] ?? FileText;
  return <Icon className="size-4" aria-hidden />;
};

/** A short description of a section's content, to tell sections apart in the list. */
function summary(section: ContentSection, pick: (v: { ar: string; en: string }) => string) {
  const s = section.settings as Record<string, unknown>;
  for (const key of ['heading', 'title']) {
    const value = s[key] as { ar: string; en: string } | undefined;
    if (value && pick(value)) return pick(value);
  }
  return '';
}

function AddSectionDialog({
  open,
  onClose,
  onAdd,
  saved,
  onAddSaved,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (type: SectionType) => void;
  saved: SavedSections['items'];
  onAddSaved: (savedId: string) => void;
}) {
  const { m } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const categories = ['intro', 'content', 'engage', 'layout'] as const;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={b['chooseSection']}
      className="w-[min(44rem,calc(100vw-2rem))]"
    >
      <div className="grid gap-5">
        {categories.map((category) => (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <h3
              id={`cat-${category}`}
              className="mb-2 text-xs font-medium tracking-wide text-muted uppercase"
            >
              {b[`category.${category}`]}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECTION_TYPES.filter((t) => SECTIONS[t].category === category).map((type) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => onAdd(type)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-start hover:border-accent hover:bg-accent-soft/40"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                      {sectionIcon(type)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{bi(SECTIONS[type].name)}</span>
                      <span className="block text-xs text-muted">
                        {bi(SECTIONS[type].description)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {saved.length > 0 && (
          <section aria-labelledby="cat-saved">
            <h3
              id="cat-saved"
              className="mb-2 text-xs font-medium tracking-wide text-muted uppercase"
            >
              {b['savedSections']}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {saved.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onAddSaved(item.id)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-start hover:border-accent hover:bg-accent-soft/40"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                      <Bookmark className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{bi(item.name)}</span>
                      <span className="block text-xs text-muted">
                        {bi(SECTIONS[item.section.type].name)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}

/** Published versions of one page; restoring puts a version back into the draft (D-037). */
function PageHistory({
  pageId,
  editable,
  onRestored,
}: {
  pageId: string;
  editable: boolean;
  onRestored: (version: number) => void;
}) {
  const { m, format, date } = useI18n();
  const b = m.builder;
  const keys = useBuilderKeys();
  const versions = useQuery({
    queryKey: [...keys.page(pageId), 'versions'],
    queryFn: () =>
      api<{ version: number; publishedAt: string; publishedBy: string | null }[]>(
        sitePath(keys.siteKey, `/pages/${pageId}/versions`),
      ),
  });
  const restore = useBuilderMutation((version: number) =>
    api(sitePath(keys.siteKey, `/pages/${pageId}/restore`), {
      method: 'POST',
      body: { version },
    }),
  );
  const rows = versions.data ?? [];
  return (
    <Card title={b['pageHistory']}>
      <ErrorText error={restore.error ?? versions.error} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{b['noVersions']}</p>
      ) : (
        <Table>
          <tbody>
            {rows.map((v) => (
              <tr key={v.version}>
                <td className="font-medium">#{v.version}</td>
                <td>{date(v.publishedAt, true)}</td>
                <td>{v.publishedBy ?? ''}</td>
                <td className="text-end">
                  {editable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={restore.isPending && restore.variables === v.version}
                      onClick={later(async () => {
                        if (
                          await confirmAction(
                            format(b['restoreDraftConfirm'] ?? '', { version: v.version }),
                          )
                        ) {
                          restore.mutate(v.version, { onSuccess: () => onRestored(v.version) });
                        }
                      })}
                    >
                      {b['restoreToDraft']}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export function PageEditor() {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const { pageId = '' } = useParams();
  const { site, siteKey, can } = useCurrentSite();
  const query = usePage(pageId);
  const pages = usePages();
  const [draft, setDraft] = useState<Page | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = can('pages.edit') && site?.archived !== true;
  // The website's saved sections (D-038), edited here and saved with the page.
  const savedQuery = useSavedSections();
  const [saved, setSaved] = useState<SavedSections | null>(null);
  const [savedDirty, setSavedDirty] = useState(false);

  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data.page);
  }, [query.data, dirty]);
  useEffect(() => {
    if (savedQuery.data && !savedDirty) setSaved(savedQuery.data);
  }, [savedQuery.data, savedDirty]);

  const save = useBuilderMutation(async (input: { page: Page; saved: SavedSections | null }) => {
    if (input.saved) {
      await api(sitePath(siteKey, '/saved-sections'), { method: 'PUT', body: input.saved });
    }
    await api(sitePath(siteKey, `/pages/${pageId}`), { method: 'PUT', body: input.page });
  });

  if (query.error) return <ErrorText error={query.error} />;
  if (!draft || !query.data || !saved) return <Loading />;

  const valid = pageSchema.safeParse(draft).success && savedSectionsSchema.safeParse(saved).success;
  const savedItems = saved.items;
  const savedItem = (s: Section) =>
    s.type === 'saved' ? savedItems.find((i) => i.id === s.settings.savedId) : undefined;
  /** What a row shows: the section itself, or the saved section it refers to. */
  const contentOf = (s: Section): ContentSection | null =>
    s.type === 'saved' ? (savedItem(s)?.section ?? null) : s;
  const updateSaved = (next: SavedSections) => {
    setSaved(next);
    setSavedDirty(true);
    setNotice(null);
  };
  const update = (next: Page) => {
    setDraft(next);
    setDirty(true);
    setNotice(null);
  };
  const setSections = (sections: Section[]) => update({ ...draft, sections });
  const sections = draft.sections;
  const move = (index: number, by: number) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index + by, 0, item);
    setSections(next);
  };
  const allPages = pages.data?.pages ?? [];
  const title = bi(draft.title) || draft.slug;
  const isHome = query.data.home;
  const devices = (s: ContentSection | null) =>
    s
      ? (['mobile', 'tablet', 'desktop'] as const).filter((d) => !s.visibility[d]).map((d) => b[d])
      : [];
  const anyDirty = dirty || savedDirty;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={`/s/${siteKey}/pages`} className="hover:underline">
            {b['backToPages']}
          </Link>
        }
        title={title}
        actions={
          editable && (
            <Button
              busy={save.isPending}
              disabled={!anyDirty || !valid}
              onClick={() =>
                save.mutate(
                  { page: draft, saved: savedDirty ? saved : null },
                  {
                    onSuccess: () => {
                      setDirty(false);
                      setSavedDirty(false);
                      setNotice(m.saved);
                    },
                  },
                )
              }
            >
              {b['saveDraft']}
            </Button>
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5">
          {!editable && <Alert>{b['readOnly']}</Alert>}
          {anyDirty && <Alert tone="warning">{b['unsaved']}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {!valid && <Alert tone="danger">{m.errors['invalid-input']}</Alert>}
          <ErrorText error={save.error} />

          <Card title={b['sectionsTitle']}>
            {sections.length === 0 ? (
              <p className="text-sm text-muted">{b['noSections']}</p>
            ) : (
              <SortableList items={sections} onReorder={setSections} disabled={!editable}>
                {(section, index) => {
                  const content = contentOf(section);
                  const item = savedItem(section);
                  const name =
                    section.type === 'saved'
                      ? item
                        ? bi(item.name)
                        : (b['savedMissing'] ?? '')
                      : bi(SECTIONS[section.type].name);
                  const about = content ? summary(content, bi) : '';
                  const hiddenOn = devices(content);
                  const expanded = open === section.id;
                  return (
                    <SortableRow key={section.id} id={section.id} label={name} disabled={!editable}>
                      {(handle) => (
                        <div>
                          <div className="flex items-center gap-2 p-2 pe-3">
                            {handle}
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                              {section.type === 'saved' ? (
                                <Bookmark className="size-4" aria-hidden />
                              ) : (
                                sectionIcon(section.type)
                              )}
                            </span>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`section-${section.id}`}
                              onClick={() => setOpen(expanded ? null : section.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-start"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{name}</span>
                                {about && (
                                  <span className="block truncate text-xs text-muted">{about}</span>
                                )}
                              </span>
                              {section.type === 'saved' && (
                                <Badge tone="accent">{b['savedBadge']}</Badge>
                              )}
                              {hiddenOn.length > 0 && (
                                <Badge>
                                  {format(b['hiddenOn'] ?? '', { devices: hiddenOn.join('، ') })}
                                </Badge>
                              )}
                              <ChevronDown
                                className={cn(
                                  'size-4 shrink-0 text-muted transition-transform',
                                  expanded && 'rotate-180',
                                )}
                                aria-hidden
                              />
                            </button>
                            {editable && (
                              <DropdownMenu
                                label={format(b['sectionActions'] ?? '', { name })}
                                trigger={
                                  <IconButton label={format(b['sectionActions'] ?? '', { name })}>
                                    <MoreHorizontal className="size-4" aria-hidden />
                                  </IconButton>
                                }
                              >
                                <MenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                                  <ArrowUp aria-hidden />
                                  {b['moveUp']}
                                </MenuItem>
                                <MenuItem
                                  disabled={index === sections.length - 1}
                                  onSelect={() => move(index, 1)}
                                >
                                  <ArrowDown aria-hidden />
                                  {b['moveDown']}
                                </MenuItem>
                                <MenuItem
                                  disabled={sections.length >= 40}
                                  onSelect={() => {
                                    const copy = {
                                      ...structuredClone(section),
                                      id: newItemId(),
                                      anchor: '',
                                    };
                                    const next = [...sections];
                                    next.splice(index + 1, 0, copy);
                                    setSections(next);
                                  }}
                                >
                                  <Copy aria-hidden />
                                  {b['duplicateSection']}
                                </MenuItem>
                                {section.type !== 'saved' && savedItems.length < 50 && (
                                  <MenuItem
                                    onSelect={() => {
                                      // The section moves into the website's saved sections; the
                                      // page keeps a reference to it.
                                      const savedId = newItemId();
                                      const sectionName = bi(SECTIONS[section.type].name);
                                      updateSaved({
                                        items: [
                                          ...savedItems,
                                          {
                                            id: savedId,
                                            name: {
                                              ar: summary(section, (v) => v.ar) || sectionName,
                                              en: summary(section, (v) => v.en) || sectionName,
                                            },
                                            section: { ...section, anchor: '' },
                                          },
                                        ],
                                      });
                                      setSections(
                                        sections.map((s) =>
                                          s.id === section.id
                                            ? {
                                                ...savedReference(savedId, section.id),
                                                anchor: section.anchor,
                                              }
                                            : s,
                                        ),
                                      );
                                    }}
                                  >
                                    <Bookmark aria-hidden />
                                    {b['saveAsReusable']}
                                  </MenuItem>
                                )}
                                {section.type === 'saved' && content && (
                                  <MenuItem
                                    onSelect={() =>
                                      setSections(
                                        sections.map((s) =>
                                          s.id === section.id
                                            ? { ...structuredClone(content), id: newItemId() }
                                            : s,
                                        ),
                                      )
                                    }
                                  >
                                    <Unlink aria-hidden />
                                    {b['detach']}
                                  </MenuItem>
                                )}
                                <MenuSeparator />
                                <MenuItem
                                  className="text-danger"
                                  onSelect={later(async () => {
                                    if (
                                      await confirmAction(
                                        format(b['removeSectionConfirm'] ?? '', { name }),
                                      )
                                    ) {
                                      setSections(sections.filter((s) => s.id !== section.id));
                                    }
                                  })}
                                >
                                  <Trash2 aria-hidden />
                                  {b['removeSection']}
                                </MenuItem>
                              </DropdownMenu>
                            )}
                          </div>
                          {expanded && (
                            <div
                              id={`section-${section.id}`}
                              className="border-t border-border p-4"
                            >
                              {section.type === 'saved' ? (
                                item ? (
                                  <div className="grid gap-4">
                                    <Alert>{b['savedEditNote']}</Alert>
                                    <BilingualField
                                      label={b['savedName'] ?? ''}
                                      value={item.name}
                                      max={60}
                                      disabled={!editable}
                                      onChange={(nameValue) =>
                                        updateSaved({
                                          items: savedItems.map((i) =>
                                            i.id === item.id ? { ...i, name: nameValue } : i,
                                          ),
                                        })
                                      }
                                    />
                                    <SectionForm
                                      section={item.section}
                                      pages={allPages}
                                      disabled={!editable}
                                      onChange={(next) =>
                                        updateSaved({
                                          items: savedItems.map((i) =>
                                            i.id === item.id ? { ...i, section: next } : i,
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                ) : (
                                  <Alert tone="warning">{b['savedMissing']}</Alert>
                                )
                              ) : (
                                <SectionForm
                                  section={section}
                                  pages={allPages}
                                  disabled={!editable}
                                  onChange={(next) =>
                                    setSections(
                                      sections.map((s) => (s.id === section.id ? next : s)),
                                    )
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </SortableRow>
                  );
                }}
              </SortableList>
            )}
            {editable && sections.length < 40 && (
              <Button variant="secondary" className="mt-4" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                {b['addSection']}
              </Button>
            )}
          </Card>

          <Card title={b['pageSettings']}>
            <div className="grid gap-4">
              <BilingualField
                label={b['pageTitle'] ?? ''}
                value={draft.title}
                max={120}
                disabled={!editable}
                onChange={(next) => update({ ...draft, title: next })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={b['address']} help={b['addressHelp']}>
                  {(props) => (
                    <Input
                      {...props}
                      dir="ltr"
                      maxLength={60}
                      disabled={!editable || isHome}
                      value={draft.slug}
                      onChange={(e) => update({ ...draft, slug: e.target.value.toLowerCase() })}
                    />
                  )}
                </Field>
                <Field label={b['parent']}>
                  {(props) => (
                    <Select
                      {...props}
                      disabled={!editable || isHome}
                      value={draft.parentId ?? ''}
                      onChange={(e) => update({ ...draft, parentId: e.target.value || null })}
                    >
                      <option value="">{b['parentNone']}</option>
                      {allPages
                        .filter((p) => p.parentId === null && p.id !== pageId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {bi(p.title)}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
              </div>
              {!isHome && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    disabled={!editable}
                    checked={draft.visible}
                    onChange={(e) => update({ ...draft, visible: e.target.checked })}
                  />
                  {b['visible']}
                </label>
              )}
              <fieldset className="grid gap-4 border-t border-border pt-4">
                <legend className="mb-1.5 text-sm font-medium">{b['seo']}</legend>
                <BilingualField
                  label={b['seoTitle'] ?? ''}
                  value={draft.seo.title}
                  max={70}
                  disabled={!editable}
                  onChange={(next) => update({ ...draft, seo: { ...draft.seo, title: next } })}
                />
                <BilingualField
                  label={b['seoDescription'] ?? ''}
                  value={draft.seo.description}
                  max={200}
                  multiline
                  disabled={!editable}
                  onChange={(next) =>
                    update({ ...draft, seo: { ...draft.seo, description: next } })
                  }
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    disabled={!editable}
                    checked={draft.seo.noindex}
                    onChange={(e) =>
                      update({ ...draft, seo: { ...draft.seo, noindex: e.target.checked } })
                    }
                  />
                  {b['noindex']}
                </label>
                <ImageField
                  label={b['shareImage'] ?? ''}
                  value={draft.seo.image ?? null}
                  disabled={!editable}
                  onChange={(image) =>
                    update({ ...draft, seo: { ...draft.seo, image: image ?? undefined } })
                  }
                />
                <p className="-mt-2 text-xs text-muted">{b['shareImageHelp']}</p>
              </fieldset>
            </div>
          </Card>
          <PageHistory
            pageId={pageId}
            editable={editable}
            onRestored={(version) => {
              setDirty(false);
              setDraft(null);
              setNotice(format(b['restoredDraft'] ?? '', { version }));
            }}
          />
          <PublishBar />
        </div>

        <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <Card
            title={b['preview']}
            description={anyDirty ? b['saveForPreview'] : b['previewIntro']}
          >
            <DevicePreview pageId={pageId} title={title} revision={query.data.draftUpdatedAt} />
          </Card>
        </div>
      </div>
      <AddSectionDialog
        open={adding}
        onClose={() => setAdding(false)}
        saved={savedItems}
        onAddSaved={(savedId) => {
          setSections([...sections, savedReference(savedId, newItemId())]);
          setAdding(false);
        }}
        onAdd={(type) => {
          const section = newSection(type, newItemId());
          setSections([...sections, section]);
          setOpen(section.id);
          setAdding(false);
        }}
      />
    </>
  );
}
