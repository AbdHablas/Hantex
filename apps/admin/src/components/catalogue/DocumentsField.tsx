import {
  DOCUMENT_TYPES,
  isCertified,
  type Certificate,
  type DocumentRef,
  type DocumentType,
} from '@hantex/sections';
import { BadgeCheck, FileText, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BilingualField } from '../document';
import { Alert, Badge, Button, ErrorText, Field, Input, Select, confirmAction, later } from '../ui';
import { api, sitePath } from '../../lib/api';
import { newItemId, useBuilderMutation } from '../../lib/builder';
import { useCatalogueFiles, type CatalogueFile } from '../../lib/catalogue';
import { useBilingual, useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { UploadPdfButton } from './FilesCard';
import { ItemDialog, RowActions, empty, move } from './parts';

/**
 * The documents a product or series attaches (D-045): PDFs from the website's files, each with
 * a kind and a title. Certificates also carry their details, and someone with
 * `catalogue.verify` marks them verified once checked against the file; the API keeps that
 * mark only while the file and details stay as they were.
 */

const NO_CERTIFICATE: Certificate = { name: '', number: '', issuer: '', validUntil: null };
const today = () => new Date().toISOString().slice(0, 10);

function DocumentDialog({
  value,
  files,
  editable,
  onClose,
  onDone,
}: {
  value: DocumentRef | null;
  files: CatalogueFile[];
  editable: boolean;
  onClose: () => void;
  onDone: (doc: DocumentRef) => void;
}) {
  const { m } = useI18n();
  const t = m.catalogue;
  const [doc, setDoc] = useState(value);
  useEffect(() => setDoc(value), [value]);
  const valid = doc !== null && doc.fileId !== '';
  const setType = (type: DocumentType) =>
    doc &&
    setDoc({
      ...doc,
      type,
      certificate: type === 'certificate' ? (doc.certificate ?? NO_CERTIFICATE) : null,
      verified: type === 'certificate' ? doc.verified : null,
    });
  const setCertificate = (patch: Partial<Certificate>) =>
    doc?.certificate && setDoc({ ...doc, certificate: { ...doc.certificate, ...patch } });
  return (
    <ItemDialog
      title={t.document}
      item={doc}
      editable={editable}
      valid={valid}
      onClose={onClose}
      onDone={() => doc && onDone(doc)}
    >
      {doc && (
        <>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t.documentFile}>
              {(props) => (
                <Select
                  {...props}
                  value={doc.fileId}
                  required
                  onChange={(e) => setDoc({ ...doc, fileId: e.target.value })}
                >
                  <option value="">{t.chooseFile}</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                    </option>
                  ))}
                  {doc.fileId !== '' && !files.some((f) => f.id === doc.fileId) && (
                    <option value={doc.fileId}>{t.fileGone}</option>
                  )}
                </Select>
              )}
            </Field>
            {editable && (
              <UploadPdfButton size="sm" onUploaded={(fileId) => setDoc({ ...doc, fileId })} />
            )}
          </div>
          <Field label={t.documentType}>
            {(props) => (
              <Select
                {...props}
                value={doc.type}
                onChange={(e) => setType(e.target.value as DocumentType)}
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.documentTypes[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <BilingualField
            label={t.documentTitle}
            help={t.documentTitleHelp}
            value={doc.title}
            max={120}
            disabled={!editable}
            onChange={(title) => setDoc({ ...doc, title })}
          />
          {doc.certificate && (
            <fieldset className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">{t.certificateDetails}</legend>
              <p className="text-xs text-muted sm:col-span-2">{t.certificateHelp}</p>
              <Field label={t.certificateName}>
                {(props) => (
                  <Input
                    {...props}
                    maxLength={60}
                    value={doc.certificate?.name ?? ''}
                    onChange={(e) => setCertificate({ name: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t.certificateNumber}>
                {(props) => (
                  <Input
                    {...props}
                    dir="ltr"
                    maxLength={80}
                    value={doc.certificate?.number ?? ''}
                    onChange={(e) => setCertificate({ number: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t.certificateIssuer}>
                {(props) => (
                  <Input
                    {...props}
                    maxLength={120}
                    value={doc.certificate?.issuer ?? ''}
                    onChange={(e) => setCertificate({ issuer: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t.certificateValidUntil} help={t.certificateValidUntilHelp}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    dir="ltr"
                    value={doc.certificate?.validUntil ?? ''}
                    onChange={(e) => setCertificate({ validUntil: e.target.value || null })}
                  />
                )}
              </Field>
              {doc.verified && (
                <p className="text-xs text-warning sm:col-span-2">{t.verifyNeedsSaving}</p>
              )}
            </fieldset>
          )}
        </>
      )}
    </ItemDialog>
  );
}

/** Whether a certificate is shown, as text and colour together. */
function CertificateState({ doc }: { doc: DocumentRef }) {
  const { m, format, locale } = useI18n();
  const t = m.catalogue;
  if (!doc.verified) return <Badge tone="warning">{t.notVerified}</Badge>;
  if (!isCertified(doc, today())) return <Badge tone="danger">{t.expired}</Badge>;
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    dateStyle: 'medium',
  }).format(new Date(doc.verified.at));
  return (
    <Badge tone="success">
      <BadgeCheck className="size-3.5" aria-hidden />
      {format(t.verifiedOn, { date })}
    </Badge>
  );
}

export function DocumentsField({
  documents,
  target,
  editable,
  dirty,
  onChange,
}: {
  documents: DocumentRef[];
  /** What the documents belong to, for the verify action. */
  target: { type: 'product' | 'series'; id: string };
  editable: boolean;
  /** Unsaved changes: verification works on the saved draft, so it waits for a save. */
  dirty: boolean;
  onChange: (next: DocumentRef[]) => void;
}) {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const t = m.catalogue;
  const { siteKey, can, site } = useCurrentSite();
  const files = useCatalogueFiles();
  const [editing, setEditing] = useState<DocumentRef | null>(null);
  const verify = useBuilderMutation((input: { documentId: string; verified: boolean }) =>
    api(sitePath(siteKey, '/catalogue/verify'), { method: 'POST', body: { target, ...input } }),
  );
  const list = files.data?.items ?? [];
  const canVerify = can('catalogue.verify') && site?.archived !== true;
  const put = (doc: DocumentRef) => {
    const exists = documents.some((d) => d.id === doc.id);
    onChange(exists ? documents.map((d) => (d.id === doc.id ? doc : d)) : [...documents, doc]);
    setEditing(null);
  };
  return (
    <div className="grid gap-3">
      {documents.length === 0 ? (
        <p className="text-sm text-muted">{t.noDocuments}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {documents.map((doc) => {
            const file = list.find((f) => f.id === doc.fileId);
            const label = bi(doc.title) || file?.name || t.document;
            const moved = (step: -1 | 1) => {
              const next = move(documents, doc.id, step);
              return next === documents ? null : () => onChange(next);
            };
            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3">
                <FileText aria-hidden className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{label}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{t.documentTypes[doc.type]}</span>
                    {doc.certificate?.name && <span>· {doc.certificate.name}</span>}
                    {file ? (
                      <span className="truncate">· {file.name}</span>
                    ) : (
                      files.data && <span className="text-danger">· {t.fileGone}</span>
                    )}
                  </p>
                  {doc.type === 'certificate' && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <CertificateState doc={doc} />
                      {canVerify && doc.certificate?.name && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={dirty || verify.isPending}
                          aria-describedby={dirty ? `${doc.id}-save-first` : undefined}
                          onClick={later(async () => {
                            const verified = doc.verified === null;
                            if (
                              verified &&
                              !(await confirmAction(
                                format(t.verifyConfirm, { name: file?.name ?? label }),
                              ))
                            ) {
                              return;
                            }
                            verify.mutate({ documentId: doc.id, verified });
                          })}
                        >
                          {doc.verified ? t.unverify : t.verify}
                        </Button>
                      )}
                      {canVerify && dirty && (
                        <span id={`${doc.id}-save-first`} className="text-xs text-muted">
                          {t.saveBeforeVerify}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <RowActions
                  label={label}
                  editable={editable}
                  onUp={moved(-1)}
                  onDown={moved(1)}
                  onEdit={() => setEditing(doc)}
                  onDelete={() => onChange(documents.filter((d) => d.id !== doc.id))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <ErrorText error={verify.error} />
      {files.error ? (
        <Alert tone="danger">
          <ErrorText error={files.error} />
        </Alert>
      ) : null}
      {editable && documents.length < 20 && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setEditing({
                id: newItemId(),
                fileId: '',
                type: 'datasheet',
                title: empty(),
                certificate: null,
                verified: null,
              })
            }
          >
            <Plus aria-hidden />
            {t.addDocument}
          </Button>
        </div>
      )}
      <DocumentDialog
        value={editing}
        files={list}
        editable={editable}
        onClose={() => setEditing(null)}
        onDone={put}
      />
    </div>
  );
}
