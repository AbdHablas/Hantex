import {
  IMPORT_BATCH,
  MAX_SHEET_ROWS,
  catalogueToSheet,
  parseCsv,
  readSheet,
  toCsv,
  type Catalogue,
  type Product,
  type SheetChange,
  type SheetError,
} from '@hantex/sections';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Alert, Button, Dialog, ErrorText, toast } from '../ui';
import { ApiError, api, sitePath } from '../../lib/api';
import { newItemId } from '../../lib/builder';
import { useI18n } from '../../lib/i18n';
import { useCurrentSite } from '../../lib/session';
import { XLSX_MAX_BYTES, XlsxError, download, readXlsx, writeXlsx } from '../../lib/xlsx';

/**
 * Products and variants as a spreadsheet (D-045): exported as Excel or CSV, and imported from
 * either. The file is read here and every row checked (packages/sections, catalogue-sheet.ts), so
 * problems show with their row and column before anything is saved; the API then merges each
 * batch into the drafts and checks it again, as it does a save from the product form.
 */

interface ExportData {
  catalogue: Catalogue;
  products: Record<string, Product>;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHOWN_ERRORS = 50;

/** The file's rows: CSV as text, anything else as an Excel workbook. */
async function readTable(file: File): Promise<string[][]> {
  if (file.size > XLSX_MAX_BYTES) throw new XlsxError('file-too-large');
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  return readXlsx(new Uint8Array(await file.arrayBuffer()), MAX_SHEET_ROWS + 1);
}

interface Reading {
  name: string;
  changes: SheetChange[];
  errors: SheetError[];
}

function ImportSection() {
  const { m, format } = useI18n();
  const t = m.catalogue;
  const { siteKey } = useCurrentSite();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [reading, setReading] = useState<Reading | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const path = (suffix: string) => sitePath(siteKey, `/catalogue${suffix}`);

  const read = useMutation({
    mutationFn: async (file: File) => {
      const [table, current] = await Promise.all([
        readTable(file),
        api<ExportData>(path('/export')),
      ]);
      const products = new Map(Object.entries(current.products));
      return { name: file.name, ...readSheet(table, current.catalogue, products, newItemId) };
    },
    onMutate: () => {
      setReading(null);
      setProgress(null);
    },
    onSuccess: setReading,
  });

  const pending = reading?.changes.filter((c) => c.status !== 'unchanged') ?? [];
  const save = useMutation({
    mutationFn: async (changes: SheetChange[]) => {
      const totals = { created: 0, updated: 0 };
      setProgress({ done: 0, total: changes.length });
      for (let start = 0; start < changes.length; start += IMPORT_BATCH) {
        const batch = changes.slice(start, start + IMPORT_BATCH);
        const result = await api<{ created: number; updated: number }>(path('/import'), {
          method: 'POST',
          body: { items: batch.map((c) => c.item) },
        });
        totals.created += result.created;
        totals.updated += result.updated;
        setProgress({ done: start + batch.length, total: changes.length });
      }
      return totals;
    },
    onSuccess: (totals) => {
      setReading(null);
      toast(format(t.imported, totals));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['site', siteKey] }),
  });

  const counts = reading && {
    created: reading.changes.filter((c) => c.status === 'new').length,
    changed: reading.changes.filter((c) => c.status === 'changed').length,
    unchanged: reading.changes.filter((c) => c.status === 'unchanged').length,
  };
  // Where a refused batch stopped: the rows of the product the API named, if it did.
  const failedAt =
    save.error instanceof ApiError && progress
      ? pending[progress.done + Number(save.error.details?.['index'] ?? 0)]
      : undefined;

  return (
    <section aria-labelledby={`${id}-import`} className="grid gap-3">
      <h3 id={`${id}-import`} className="font-semibold">
        {t.importTitle}
      </h3>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
        {t.importRules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          busy={read.isPending}
          disabled={save.isPending}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden />
          {t.chooseSheet}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-label={t.chooseSheet}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) read.mutate(file);
          }}
        />
      </div>
      <div role="status" aria-live="polite" className="grid gap-3">
        {read.isPending && <p className="text-sm text-muted">{t.readingSheet}</p>}
        {reading && counts && (
          <>
            <p className="text-sm">
              <span className="font-medium" dir="auto">
                {reading.name}
              </span>
              {' · '}
              {format(t.sheetSummary, counts)}
            </p>
            {reading.errors.length === 0 && pending.length === 0 && (
              <Alert tone="success">{t.nothingToImport}</Alert>
            )}
          </>
        )}
        {progress && save.isPending && (
          <p className="text-sm text-muted">{format(t.importing, progress)}</p>
        )}
      </div>
      {reading && reading.errors.length > 0 && (
        <Alert tone="danger">
          <p className="font-medium">{t.sheetErrorsTitle}</p>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {reading.errors.slice(0, SHOWN_ERRORS).map((error, i) => (
              <li key={i}>
                <span className="font-medium">{format(t.sheetRow, { row: error.row })}</span>
                {error.column && (
                  <>
                    {' · '}
                    <span dir="auto">{error.column}</span>
                  </>
                )}
                {': '}
                {format(t.sheetErrors[error.code] ?? t.sheetErrors['invalid'] ?? '', {
                  detail: error.detail ?? '',
                })}
              </li>
            ))}
          </ul>
          {reading.errors.length > SHOWN_ERRORS && (
            <p className="mt-2">
              {format(t.sheetMoreErrors, { count: reading.errors.length - SHOWN_ERRORS })}
            </p>
          )}
        </Alert>
      )}
      {read.error ? (
        <ErrorText
          error={read.error instanceof XlsxError ? new ApiError(400, read.error.code) : read.error}
        />
      ) : null}
      {save.error ? (
        <Alert tone="danger">
          <ErrorText error={save.error} />
          {failedAt && <p>{format(t.sheetRow, { row: failedAt.rows[0] ?? 0 })}</p>}
          {progress && <p className="mt-1">{format(t.importStopped, progress)}</p>}
        </Alert>
      ) : null}
      {reading && reading.errors.length === 0 && pending.length > 0 && (
        <div>
          <Button busy={save.isPending} onClick={() => save.mutate(pending)}>
            {t.importButton}
          </Button>
        </div>
      )}
    </section>
  );
}

export function SheetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { m } = useI18n();
  const t = m.catalogue;
  const { siteKey, can, site } = useCurrentSite();
  const id = useId();
  const editable = can('catalogue.edit') && site?.archived !== true;
  const exporting = useMutation({
    mutationFn: async (kind: 'xlsx' | 'csv') => {
      const data = await api<ExportData>(sitePath(siteKey, '/catalogue/export'));
      const sheet = catalogueToSheet(data.catalogue, new Map(Object.entries(data.products)));
      const name = `${siteKey}-products-${new Date().toISOString().slice(0, 10)}.${kind}`;
      if (kind === 'csv') download(name, toCsv(sheet.rows), 'text/csv;charset=utf-8');
      else download(name, new Uint8Array(writeXlsx(sheet.rows, sheet.numeric)), XLSX_TYPE);
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.sheetTitle}
      description={t.sheetIntro}
      className="w-[min(44rem,calc(100vw-2rem))]"
    >
      <div className="grid gap-6">
        <section aria-labelledby={`${id}-export`} className="grid gap-3">
          <h3 id={`${id}-export`} className="font-semibold">
            {t.exportTitle}
          </h3>
          <p className="text-sm text-muted">{t.exportHelp}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              busy={exporting.isPending && exporting.variables === 'xlsx'}
              disabled={exporting.isPending}
              onClick={() => exporting.mutate('xlsx')}
            >
              <FileSpreadsheet aria-hidden />
              {t.exportExcel}
            </Button>
            <Button
              variant="secondary"
              busy={exporting.isPending && exporting.variables === 'csv'}
              disabled={exporting.isPending}
              onClick={() => exporting.mutate('csv')}
            >
              <Download aria-hidden />
              {t.exportCsv}
            </Button>
          </div>
          <ErrorText error={exporting.error} />
        </section>
        {editable && <ImportSection />}
      </div>
    </Dialog>
  );
}
