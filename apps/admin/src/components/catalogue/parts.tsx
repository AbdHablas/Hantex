import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Dialog, IconButton } from '../ui';
import { useI18n } from '../../lib/i18n';

/** Pieces the catalogue's editors share: list row actions, checkboxes and item dialogs. */

export const empty = () => ({ ar: '', en: '' });

/** Moves an item among the items that share its parent (or among all, without parents). */
export function move<T extends { id: string }>(
  items: T[],
  id: string,
  step: -1 | 1,
  sibling: (a: T, b: T) => boolean = () => true,
) {
  const index = items.findIndex((i) => i.id === id);
  const item = items[index];
  if (!item) return items;
  const siblings = items
    .map((other, i) => ({ other, i }))
    .filter(({ other }) => sibling(item, other));
  const at = siblings.findIndex(({ i }) => i === index);
  const target = siblings[at + step];
  if (!target) return items;
  const next = [...items];
  next[index] = target.other;
  next[target.i] = item;
  return next;
}

export function RowActions({
  label,
  editable,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  label: string;
  editable: boolean;
  onUp?: (() => void) | null;
  onDown?: (() => void) | null;
  onEdit: () => void;
  /** Null when the item can't be deleted yet (a category with sub-categories). */
  onDelete: (() => void) | null;
}) {
  const { m, format } = useI18n();
  const t = m.catalogue;
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {editable && (
        <>
          <IconButton
            label={format(t.moveUp, { name: label })}
            disabled={!onUp}
            onClick={onUp ?? undefined}
          >
            <ArrowUp className="size-4" aria-hidden />
          </IconButton>
          <IconButton
            label={format(t.moveDown, { name: label })}
            disabled={!onDown}
            onClick={onDown ?? undefined}
          >
            <ArrowDown className="size-4" aria-hidden />
          </IconButton>
        </>
      )}
      <IconButton
        label={format(editable ? t.editItem : t.viewItem, { name: label })}
        onClick={onEdit}
      >
        <Pencil className="size-4" aria-hidden />
      </IconButton>
      {editable && (
        <IconButton
          label={format(t.deleteItem, { name: label })}
          disabled={!onDelete}
          onClick={onDelete ?? undefined}
        >
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  help?: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {help && <span className="block text-xs text-muted">{help}</span>}
      </span>
    </label>
  );
}

/** A dialog editing a copy of one item; Done puts it back into the unsaved structure. */
export function ItemDialog<T>({
  title,
  item,
  editable,
  valid,
  onClose,
  onDone,
  children,
}: {
  title: string;
  item: T | null;
  editable: boolean;
  valid: boolean;
  onClose: () => void;
  onDone: () => void;
  children: ReactNode;
}) {
  const { m } = useI18n();
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={title}
      className="w-[min(44rem,calc(100vw-2rem))]"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Dialogs open from inside other dialogs (a series' documents); React passes events up
          // through portals, so this form's submit must not reach the one around it.
          e.stopPropagation();
          if (editable && valid) onDone();
        }}
      >
        <fieldset disabled={!editable} className="contents">
          {children}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {editable ? m.cancel : m.close}
          </Button>
          {editable && (
            <Button type="submit" disabled={!valid}>
              {m.catalogue.done}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
