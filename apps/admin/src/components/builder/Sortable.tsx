import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';
import { cn } from '../ui';

/**
 * A list people can reorder by dragging a handle, with a mouse, a finger or the keyboard
 * (focus the handle, Space to pick up, arrow keys to move, Space to drop) (D-036).
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  disabled = false,
  children,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  disabled?: boolean;
  children: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ul className={cn('flex flex-col gap-2', className)}>
          {items.map((item, index) => children(item, index))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** One row of a SortableList; `handle` is the drag handle to place in the row. */
export function SortableRow({
  id,
  label,
  disabled = false,
  className,
  children,
}: {
  id: string;
  /** What the handle moves, for assistive technology. */
  label: string;
  disabled?: boolean;
  className?: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { m, format } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={format(m.builder['dragHandle'] ?? '', { item: label })}
      title={m.builder['reorder']}
      className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative rounded-xl border border-border bg-surface',
        isDragging && 'z-10 shadow-lg ring-2 ring-accent/40',
        className,
      )}
    >
      {children(handle)}
    </li>
  );
}
