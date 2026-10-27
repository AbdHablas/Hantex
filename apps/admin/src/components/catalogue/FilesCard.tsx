import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Loading,
  buttonVariants,
  cn,
  confirmAction,
  later,
} from '../ui';
import { api, sitePath } from '../../lib/api';
import {
  fileForm,
  useCatalogueFiles,
  useCatalogueKeys,
  type CatalogueFile,
} from '../../lib/catalogue';
import { useBilingual, useI18n } from '../../lib/i18n';
import { formatBytes } from '../../lib/media';
import { useCurrentSite } from '../../lib/session';

/**
 * The website's files (D-045): PDFs that products and series attach as documents. Uploading,
 * renaming and deleting take effect at once; a file goes public only when published content
 * attaches it, and the API keeps attached files from being deleted.
 */

/** Uploads one PDF; resolves to the new file's id. */
export function useFileUpload() {
  const keys = useCatalogueKeys();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api<{ id: string }>(sitePath(keys.siteKey, '/catalogue/files'), {
        method: 'POST',
        body: fileForm(file),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.files }),
  });
}

/** A visually hidden PDF picker and the button that opens it. */
export function UploadPdfButton({
  onUploaded,
  size,
}: {
  onUploaded?: (id: string, name: string) => void;
  size?: 'sm';
}) {
  const { m, format } = useI18n();
  const t = m.catalogue;
  const upload = useFileUpload();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [notice, setNotice] = useState('');
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size={size}
        variant={size ? 'secondary' : 'primary'}
        busy={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden />
        {t.uploadPdf}
      </Button>
      <input
        id={id}
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.uploadPdf}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setNotice('');
          upload.mutate(file, {
            onSuccess: ({ id: fileId }) => {
              setNotice(format(t.uploadedFile, { name: file.name }));
              onUploaded?.(fileId, file.name);
            },
          });
        }}
      />
      <div role="status" aria-live="polite" className="text-end text-xs">
        {notice && <span className="text-success">{notice}</span>}
      </div>
      <ErrorText error={upload.error} />
    </div>
  );
}

function RenameDialog({ file, onClose }: { file: CatalogueFile | null; onClose: () => void }) {
  const { m } = useI18n();
  const t = m.catalogue;
  const keys = useCatalogueKeys();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  useEffect(() => setName(file?.name ?? ''), [file]);
  const save = useMutation({
    mutationFn: () =>
      api(sitePath(keys.siteKey, `/catalogue/files/${file?.id ?? ''}`), {
        method: 'PATCH',
        body: { name: name.trim() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.files });
      onClose();
    },
  });
  return (
    <Dialog open={file !== null} onClose={onClose} title={t.fileName}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() !== '') save.mutate();
        }}
      >
        <Field label={t.fileName} help={t.fileNameHelp}>
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <ErrorText error={save.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button type="submit" busy={save.isPending} disabled={name.trim() === ''}>
            {m.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FileRow({ file, onRename }: { file: CatalogueFile; onRename: () => void }) {
  const { m, format, locale } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const { can, site } = useCurrentSite();
  const keys = useCatalogueKeys();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      api(sitePath(keys.siteKey, `/catalogue/files/${file.id}`), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.files }),
  });
  const active = site?.archived !== true;
  const uses = file.uses.map((u) => bi(u.name) || u.id).join('، ');
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    dateStyle: 'medium',
  }).format(new Date(file.createdAt));
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <FileText aria-hidden className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{file.name}</span>
          {file.published && <Badge tone="success">{t.publishedBadge}</Badge>}
        </p>
        <p className="text-xs text-muted">
          {formatBytes(file.bytes, locale)} · {date} ·{' '}
          {file.uses.length > 0 ? format(t.fileUses, { list: uses }) : t.fileUnused}
        </p>
        <ErrorText error={remove.error} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <a
          href={file.url}
          download
          aria-label={format(t.download, { name: file.name })}
          title={format(t.download, { name: file.name })}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <Download className="size-4" aria-hidden />
        </a>
        {can('catalogue.edit') && active && (
          <IconButton label={format(t.renameFile, { name: file.name })} onClick={onRename}>
            <Pencil className="size-4" aria-hidden />
          </IconButton>
        )}
        {can('catalogue.delete') && active && (
          <IconButton
            label={format(t.deleteFile, { name: file.name })}
            // Attached files can't be deleted; the API refuses it too.
            disabled={file.uses.length > 0 || remove.isPending}
            onClick={later(async () => {
              if (await confirmAction(format(t.deleteFileConfirm, { name: file.name }))) {
                remove.mutate();
              }
            })}
          >
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        )}
      </div>
    </li>
  );
}

export function FilesCard() {
  const { m, format, locale } = useI18n();
  const t = m.catalogue;
  const { can, site } = useCurrentSite();
  const files = useCatalogueFiles();
  const [renaming, setRenaming] = useState<CatalogueFile | null>(null);
  const editable = can('catalogue.edit') && site?.archived !== true;
  return (
    <Card
      title={t.files}
      icon={<FileText />}
      description={t.filesHelp}
      actions={editable && <UploadPdfButton />}
    >
      <div className="grid gap-3 px-5 pb-5">
        {files.data && (
          <p className="text-xs text-muted">
            {format(t.fileLimit, { size: formatBytes(files.data.maxBytes, locale) })}{' '}
            {format(t.storage, {
              used: formatBytes(files.data.usedBytes, locale),
              quota: formatBytes(files.data.quotaBytes, locale),
            })}
          </p>
        )}
        {!files.data ? (
          files.error ? (
            <Alert tone="danger">
              <ErrorText error={files.error} />
            </Alert>
          ) : (
            <Loading />
          )
        ) : files.data.items.length === 0 ? (
          <EmptyState icon={<FileText />} title={t.noFiles}>
            {t.noFilesHelp}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {files.data.items.map((file) => (
              <FileRow key={file.id} file={file} onRename={() => setRenaming(file)} />
            ))}
          </ul>
        )}
      </div>
      <RenameDialog file={renaming} onClose={() => setRenaming(null)} />
    </Card>
  );
}
