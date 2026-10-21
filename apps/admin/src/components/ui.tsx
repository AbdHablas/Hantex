import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X, XCircle } from 'lucide-react';
import { DropdownMenu as Menu, Tabs as TabsPrimitive, Toast, Tooltip as Tip } from 'radix-ui';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { twMerge } from 'tailwind-merge';
import { useI18n } from '../lib/i18n';

/**
 * The dashboard's interface components, in the shadcn/ui style: Radix primitives for menus,
 * tooltips, tabs and notifications, native <dialog> for modals, coloured only through design
 * tokens. Nothing here injects <style> elements, so the strict CSP (style-src 'self') holds.
 */

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/* ---------------------------------------- Buttons ---------------------------------------- */

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-contrast shadow-sm hover:brightness-95',
        secondary: 'border border-border bg-surface text-text shadow-sm hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        soft: 'bg-accent-soft text-accent-text hover:brightness-95',
        danger: 'border border-danger/60 text-danger hover:bg-danger hover:text-surface',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & {
      busy?: boolean;
    }
>(function Button({ variant, busy, size, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      disabled={disabled === true || busy === true}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {busy && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/** An icon-only button: the label is announced and shown as a tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
    label: string;
    variant?: VariantProps<typeof buttonVariants>['variant'];
  }
>(function IconButton({ label, variant = 'ghost', className, ...props }, ref) {
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        {...props}
        className={cn(buttonVariants({ variant, size: 'icon' }), className)}
      />
    </Tooltip>
  );
});

/* ------------------------------------- Form controls ------------------------------------- */

const control =
  'w-full rounded-lg border border-input bg-surface px-3 text-sm text-text shadow-sm transition-[border-color,box-shadow] placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cn(control, 'h-10', className)} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(control, 'field-sizing-content min-h-20 py-2', className)}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} {...props} className={cn(control, 'h-10 pe-8', className)} />;
  },
);

/** A labelled form field; the help text and error are announced with the control. */
export function Field({
  label,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {help && (
        <p id={helpId} className="text-xs text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------- Surfaces ---------------------------------------- */

export function Card({
  title,
  description,
  icon,
  actions,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-surface shadow-sm transition-shadow',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text [&>svg]:size-4.5"
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className="flex-1 p-5">{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3">
          {footer}
        </div>
      )}
    </section>
  );
}

/** A headline figure with an icon and an optional note, e.g. sign-up totals. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'accent',
}: {
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
}) {
  const toneClass = {
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    neutral: 'bg-surface-2 text-muted',
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span
          aria-hidden
          className={cn('grid size-9 place-items-center rounded-xl [&>svg]:size-4.5', toneClass)}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  intro,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-1 text-xs font-medium text-accent-text">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-1.5 text-sm text-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const tones = {
  neutral: 'border-border bg-surface-2 text-muted',
  accent: 'border-accent/40 bg-accent-soft text-accent-text',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
};

export function Badge({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: keyof typeof tones;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const alertIcons = {
  neutral: Info,
  accent: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Alert({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in', tones[tone])}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-text">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-shimmer rounded-lg bg-surface-2', className)} />;
}

export function Loading() {
  const { m } = useI18n();
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{m.loading}</span>
      <Skeleton className="h-8 w-1/3" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const { errorText } = useI18n();
  if (!error) return null;
  return <Alert tone="danger">{errorText(error)}</Alert>;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span
        aria-hidden
        className="mb-1 grid size-11 place-items-center rounded-full bg-surface-2 text-muted [&>svg]:size-5"
      >
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1.5 font-sans text-[0.7rem] text-muted">
      {children}
    </kbd>
  );
}

/** Initials in a coloured circle (no remote images). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-contrast',
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* --------------------------------- Dialogs and confirmation -------------------------------- */

/** A modal dialog built on the native <dialog> element (focus trap and Escape included). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  role,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  role?: 'alertdialog';
  className?: string;
}) {
  const { m } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text shadow-lg',
        className,
      )}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            {role !== 'alertdialog' && (
              <button
                type="button"
                onClick={onClose}
                aria-label={m.close}
                className="-me-2 -mt-1 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmRequest {
  message: string;
  resolve: (ok: boolean) => void;
}
let confirmQueue: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();
const setConfirm = (next: ConfirmRequest | null) => {
  confirmQueue = next;
  confirmListeners.forEach((listener) => listener());
};

/** Asks before a destructive or public action (docs/roles-and-permissions.md). */
export function confirmAction(message: string): Promise<boolean> {
  confirmQueue?.resolve(false);
  return new Promise((resolve) => setConfirm({ message, resolve }));
}

/** Wraps an async event handler for JSX, which expects handlers that return nothing. */
export const later = (handler: () => Promise<void>) => (): void => {
  void handler();
};

/** Renders the confirmation requested by confirmAction; mounted once at the app root. */
export function ConfirmHost() {
  const { m } = useI18n();
  const request = useSyncExternalStore(
    (listener) => {
      confirmListeners.add(listener);
      return () => confirmListeners.delete(listener);
    },
    () => confirmQueue,
  );
  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setConfirm(null);
  };
  return (
    <Dialog
      open={request !== null}
      onClose={() => answer(false)}
      title={m.confirmTitle}
      role="alertdialog"
    >
      <p className="text-sm text-text">{request?.message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => answer(false)}>
          {m.cancel}
        </Button>
        <Button autoFocus onClick={() => answer(true)}>
          {m.confirm}
        </Button>
      </div>
    </Dialog>
  );
}

/* ------------------------------------ Notifications ------------------------------------ */

interface ToastItem {
  id: number;
  title: string;
  tone: 'success' | 'danger' | 'neutral';
}
let toasts: ToastItem[] = [];
let nextToast = 1;
const toastListeners = new Set<() => void>();
const setToasts = (next: ToastItem[]) => {
  toasts = next;
  toastListeners.forEach((listener) => listener());
};

/** Shows a short notification at the corner of the screen. */
export function toast(title: string, tone: ToastItem['tone'] = 'success') {
  setToasts([...toasts, { id: nextToast++, title, tone }]);
}

export function Toaster() {
  const { m } = useI18n();
  const items = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toasts,
  );
  return (
    <Toast.Provider swipeDirection="right" duration={4000} label={m.notifications}>
      {items.map((item) => {
        const Icon = alertIcons[item.tone];
        return (
          <Toast.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) setToasts(toasts.filter((t) => t.id !== item.id));
            }}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg animate-pop-in data-[state=closed]:opacity-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
          >
            <Icon
              aria-hidden
              className={cn(
                'size-4 shrink-0',
                item.tone === 'success' && 'text-success',
                item.tone === 'danger' && 'text-danger',
              )}
            />
            <Toast.Title className="flex-1">{item.title}</Toast.Title>
            <Toast.Close aria-label={m.close} className="rounded p-1 text-muted hover:text-text">
              <X className="size-3.5" aria-hidden />
            </Toast.Close>
          </Toast.Root>
        );
      })}
      <Toast.Viewport className="fixed end-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}

/* ------------------------------- Tooltips, menus and tabs ------------------------------- */

export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tip.Root>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Tip.Portal>
        <Tip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-md animate-fade-in"
        >
          {content}
        </Tip.Content>
      </Tip.Portal>
    </Tip.Root>
  );
}

export const TooltipProvider = Tip.Provider;

/** A dropdown menu. Non-modal, so no scroll-lock <style> element is injected (strict CSP). */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Names the menu for assistive technology. */
  label?: string;
  align?: 'start' | 'end';
}) {
  const { dir } = useI18n();
  return (
    <Menu.Root modal={false} dir={dir}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
          className="z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 text-sm text-text shadow-lg animate-pop-in"
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const menuItem =
  'flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none select-none data-highlighted:bg-surface-2 data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-muted';

export function MenuItem({ className, ...props }: ComponentPropsWithoutRef<typeof Menu.Item>) {
  return <Menu.Item {...props} className={cn(menuItem, className)} />;
}

export function MenuRadioGroup(props: ComponentPropsWithoutRef<typeof Menu.RadioGroup>) {
  return <Menu.RadioGroup {...props} />;
}

export function MenuRadioItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem {...props} className={cn(menuItem, 'ps-8 relative', className)}>
      <Menu.ItemIndicator className="absolute start-2.5">
        <span className="block size-2 rounded-full bg-accent" />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">{children}</Menu.Label>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  label,
}: {
  tabs: { value: string; label: ReactNode; content: ReactNode }[];
  value?: string;
  onValueChange?: (value: string) => void;
  label: string;
}) {
  const { dir } = useI18n();
  const [own, setOwn] = useState(tabs[0]?.value ?? '');
  const current = value ?? own;
  return (
    <TabsPrimitive.Root
      dir={dir}
      value={current}
      onValueChange={(next) => {
        setOwn(next);
        onValueChange?.(next);
      }}
    >
      <TabsPrimitive.List
        aria-label={label}
        className="mb-4 inline-flex rounded-xl border border-border bg-surface-2 p-1"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content key={tab.value} value={tab.value} className="animate-fade-in">
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

/* ----------------------------------------- Tables ----------------------------------------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-start text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-2/60 [&_td]:border-t [&_td]:border-border [&_td]:px-5 [&_td]:py-3 [&_th]:bg-surface-2/50 [&_th]:px-5 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted [&_th]:uppercase">
        {children}
      </table>
    </div>
  );
}
