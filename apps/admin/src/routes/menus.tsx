import {
  layoutSchema,
  menusSchema,
  type Layout,
  type MenuItem as MenuEntry,
  type Menus,
} from '@hantex/sections';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BilingualField } from '../components/document';
import { LinkField } from '../components/builder/LinkField';
import { PublishBar } from '../components/builder/PublishBar';
import { SortableList, SortableRow } from '../components/builder/Sortable';
import {
  Alert,
  Button,
  Card,
  ErrorText,
  IconButton,
  Loading,
  PageHeader,
  Tabs,
  cn,
} from '../components/ui';
import { api, sitePath } from '../lib/api';
import {
  newItemId,
  useBuilderMutation,
  useLayout,
  useMenus,
  usePages,
  type PageSummary,
} from '../lib/builder';
import { useBilingual, useI18n } from '../lib/i18n';
import { useCurrentSite } from '../lib/session';

/** The website's menus and its header and footer (D-035), shown on every page of that website. */

type Leaf = Omit<MenuEntry, 'children'>;

function newEntry(pages: PageSummary[]): MenuEntry {
  return {
    id: newItemId(),
    label: { ar: '', en: '' },
    link: pages[0] ? { type: 'page', pageId: pages[0].id } : { type: 'none' },
    visible: true,
    children: [],
  };
}

function EntryFields({
  entry,
  onChange,
  pages,
  disabled,
}: {
  entry: Leaf;
  onChange: (entry: Leaf) => void;
  pages: PageSummary[];
  disabled: boolean;
}) {
  const { m } = useI18n();
  const b = m.builder;
  return (
    <div className="grid gap-4">
      <BilingualField
        label={b['menuItem'] ?? ''}
        value={entry.label}
        max={40}
        disabled={disabled}
        onChange={(label) => onChange({ ...entry, label })}
      />
      <LinkField
        value={entry.link}
        onChange={(link) => onChange({ ...entry, link })}
        pages={pages}
        disabled={disabled}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          disabled={disabled}
          checked={entry.visible}
          onChange={(e) => onChange({ ...entry, visible: e.target.checked })}
        />
        {b['itemVisible']}
      </label>
    </div>
  );
}

function MenuEditor({
  items,
  onChange,
  pages,
  disabled,
}: {
  items: MenuEntry[];
  onChange: (items: MenuEntry[]) => void;
  pages: PageSummary[];
  disabled: boolean;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const b = m.builder;
  const [open, setOpen] = useState<string | null>(null);
  const replace = (id: string, next: MenuEntry) =>
    onChange(items.map((i) => (i.id === id ? next : i)));
  return (
    <div className="grid gap-3">
      {items.length === 0 && <p className="text-sm text-muted">{b['emptyMenu']}</p>}
      <SortableList items={items} onReorder={onChange} disabled={disabled}>
        {(item) => {
          const name = bi(item.label) || b['menuItem'] || '';
          const expanded = open === item.id;
          return (
            <SortableRow key={item.id} id={item.id} label={name} disabled={disabled}>
              {(handle) => (
                <div>
                  <div className="flex items-center gap-2 p-2 pe-3">
                    {handle}
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`menu-${item.id}`}
                      onClick={() => setOpen(expanded ? null : item.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm font-medium',
                          !item.visible && 'text-muted line-through',
                        )}
                      >
                        {name}
                        {item.children.length > 0 && (
                          <span className="ms-2 text-xs font-normal text-muted">
                            +{item.children.length}
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted transition-transform',
                          expanded && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    </button>
                    {!disabled && (
                      <IconButton
                        label={format(b['removeItem'] ?? '', { item: name })}
                        onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    )}
                  </div>
                  {expanded && (
                    <div id={`menu-${item.id}`} className="grid gap-4 border-t border-border p-4">
                      <EntryFields
                        entry={item}
                        pages={pages}
                        disabled={disabled}
                        onChange={(next) => replace(item.id, { ...next, children: item.children })}
                      />
                      <fieldset className="grid gap-3 border-t border-border pt-4">
                        <legend className="mb-1.5 text-sm font-medium">{b['subItems']}</legend>
                        {item.children.map((child) => (
                          <div
                            key={child.id}
                            className="grid gap-3 rounded-xl border border-border p-4"
                          >
                            <div className="flex justify-end">
                              {!disabled && (
                                <IconButton
                                  label={format(b['removeItem'] ?? '', {
                                    item: bi(child.label) || (b['menuItem'] ?? ''),
                                  })}
                                  onClick={() =>
                                    replace(item.id, {
                                      ...item,
                                      children: item.children.filter((c) => c.id !== child.id),
                                    })
                                  }
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </IconButton>
                              )}
                            </div>
                            <EntryFields
                              entry={child}
                              pages={pages}
                              disabled={disabled}
                              onChange={(next) =>
                                replace(item.id, {
                                  ...item,
                                  children: item.children.map((c) =>
                                    c.id === child.id ? next : c,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                        {!disabled && item.children.length < 12 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="justify-self-start"
                            onClick={() => {
                              const { children: _children, ...leaf } = newEntry(pages);
                              replace(item.id, { ...item, children: [...item.children, leaf] });
                            }}
                          >
                            <Plus aria-hidden />
                            {b['addSubItem']}
                          </Button>
                        )}
                      </fieldset>
                    </div>
                  )}
                </div>
              )}
            </SortableRow>
          );
        }}
      </SortableList>
      {!disabled && items.length < 12 && (
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={() => {
            const entry = newEntry(pages);
            onChange([...items, entry]);
            setOpen(entry.id);
          }}
        >
          <Plus aria-hidden />
          {format(b['addItem'] ?? '', { item: b['menuItem'] ?? '' })}
        </Button>
      )}
    </div>
  );
}

function LayoutEditor({
  layout,
  onChange,
  pages,
  disabled,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
  pages: PageSummary[];
  disabled: boolean;
}) {
  const { m } = useI18n();
  const b = m.builder;
  const header = layout.header;
  const footer = layout.footer;
  const toggle = (label: string, checked: boolean, set: (value: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-accent"
        disabled={disabled}
        checked={checked}
        onChange={(e) => set(e.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-4">
        <legend className="mb-1.5 text-base font-semibold">{b['header']}</legend>
        {toggle(b['sticky'] ?? '', header.sticky, (sticky) =>
          onChange({ ...layout, header: { ...header, sticky } }),
        )}
        {toggle(b['showLanguage'] ?? '', header.showLanguage, (showLanguage) =>
          onChange({ ...layout, header: { ...header, showLanguage } }),
        )}
        {toggle(b['showThemeToggle'] ?? '', header.showThemeToggle, (showThemeToggle) =>
          onChange({ ...layout, header: { ...header, showThemeToggle } }),
        )}
        <fieldset className="grid gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-medium">{b['headerButton']}</legend>
          <BilingualField
            label={b['buttonLabel'] ?? ''}
            value={header.button.label}
            max={40}
            disabled={disabled}
            onChange={(label) =>
              onChange({ ...layout, header: { ...header, button: { ...header.button, label } } })
            }
          />
          <LinkField
            value={header.button.link}
            pages={pages}
            disabled={disabled}
            onChange={(link) =>
              onChange({ ...layout, header: { ...header, button: { ...header.button, link } } })
            }
          />
        </fieldset>
      </fieldset>
      <fieldset className="grid gap-4 border-t border-border pt-5">
        <legend className="mb-1.5 text-base font-semibold">{b['footer']}</legend>
        <BilingualField
          label={b['footerText'] ?? ''}
          value={footer.text}
          max={300}
          multiline
          disabled={disabled}
          onChange={(text) => onChange({ ...layout, footer: { ...footer, text } })}
        />
        {toggle(b['showContact'] ?? '', footer.showContact, (showContact) =>
          onChange({ ...layout, footer: { ...footer, showContact } }),
        )}
        {toggle(b['showSocial'] ?? '', footer.showSocial, (showSocial) =>
          onChange({ ...layout, footer: { ...footer, showSocial } }),
        )}
        <BilingualField
          label={b['copyright'] ?? ''}
          help={b['copyrightHelp']}
          value={footer.copyright}
          max={120}
          disabled={disabled}
          onChange={(copyright) => onChange({ ...layout, footer: { ...footer, copyright } })}
        />
      </fieldset>
    </div>
  );
}

/** A builder document edited as a whole (menus, layout) and saved as its draft. */
function useDraft<T>(data: T | undefined) {
  const [draft, setDraft] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data !== undefined && !dirty) setDraft(data);
  }, [data, dirty]);
  return {
    draft,
    dirty,
    update: (next: T) => {
      setDraft(next);
      setDirty(true);
    },
    saved: () => setDirty(false),
  };
}

export function MenusEditor() {
  const { m } = useI18n();
  const b = m.builder;
  const { site, siteKey, can } = useCurrentSite();
  const menusQuery = useMenus();
  const layoutQuery = useLayout();
  const pages = usePages();
  const menus = useDraft<Menus>(menusQuery.data);
  const layout = useDraft<Layout>(layoutQuery.data);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = can('pages.edit') && site?.archived !== true;
  const save = useBuilderMutation(async () => {
    if (menus.dirty && menus.draft) {
      await api(sitePath(siteKey, '/menus'), { method: 'PUT', body: menus.draft });
    }
    if (layout.dirty && layout.draft) {
      await api(sitePath(siteKey, '/layout'), { method: 'PUT', body: layout.draft });
    }
  });

  if (!menus.draft || !layout.draft || !pages.data) return <Loading />;
  const valid =
    menusSchema.safeParse(menus.draft).success && layoutSchema.safeParse(layout.draft).success;
  const dirty = menus.dirty || layout.dirty;
  const list = pages.data.pages;
  const menusDraft = menus.draft;

  return (
    <>
      <PageHeader
        title={b['menusTitle']}
        intro={b['menusIntro']}
        actions={
          editable && (
            <Button
              disabled={!dirty || !valid}
              busy={save.isPending}
              onClick={() =>
                save.mutate(undefined, {
                  onSuccess: () => {
                    menus.saved();
                    layout.saved();
                    setNotice(m.saved);
                  },
                })
              }
            >
              {b['saveDraft']}
            </Button>
          )
        }
      />
      <div className="grid gap-5">
        {!editable && <Alert>{b['readOnly']}</Alert>}
        {dirty && <Alert tone="warning">{b['unsaved']}</Alert>}
        {notice && !dirty && <Alert tone="success">{notice}</Alert>}
        {!valid && <Alert tone="danger">{m.errors['invalid-input']}</Alert>}
        <ErrorText error={save.error} />
        <Card>
          <Tabs
            label={b['menusTitle'] ?? ''}
            tabs={[
              {
                value: 'header',
                label: b['headerMenu'],
                content: (
                  <MenuEditor
                    items={menusDraft.header}
                    pages={list}
                    disabled={!editable}
                    onChange={(header) => menus.update({ ...menusDraft, header })}
                  />
                ),
              },
              {
                value: 'footer',
                label: b['footerMenu'],
                content: (
                  <MenuEditor
                    items={menusDraft.footer}
                    pages={list}
                    disabled={!editable}
                    onChange={(footer) => menus.update({ ...menusDraft, footer })}
                  />
                ),
              },
              {
                value: 'layout',
                label: b['layoutTab'],
                content: (
                  <LayoutEditor
                    layout={layout.draft}
                    pages={list}
                    disabled={!editable}
                    onChange={layout.update}
                  />
                ),
              },
            ]}
          />
        </Card>
        <PublishBar />
      </div>
    </>
  );
}
