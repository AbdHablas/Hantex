import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Just enough of the Excel file format (.xlsx, Office Open XML) for the catalogue spreadsheet
 * (D-045): one sheet of text and numbers written, and the first sheet of any workbook read as
 * text. Cells are written as inline text, never formulas, so nothing in the file runs.
 */

export class XlsxError extends Error {
  constructor(readonly code: 'invalid-spreadsheet' | 'file-too-large') {
    super(code);
  }
}

/** Largest file read, and the most its parts may unpack to. */
export const XLSX_MAX_BYTES = 10 * 1024 * 1024;
const MAX_UNPACKED = 80 * 1024 * 1024;
const MAX_COLUMNS = 1000;

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** XML text: escaped, without the control characters XML can't hold. */
const escape = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function columnIndex(name: string): number {
  let index = 0;
  for (const ch of name) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/** A workbook with one sheet; the first row is bold and stays in view when scrolling. */
export function writeXlsx(
  rows: readonly (readonly string[])[],
  numeric: readonly boolean[] = [],
  sheetName = 'Products',
): Uint8Array {
  const sheetRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      if (value === '') return '';
      const ref = `${columnName(c)}${r + 1}`;
      if (r > 0 && numeric[c] && /^-?\d+(?:\.\d+)?$/.test(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      const style = r === 0 ? ' s="1"' : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join('')}</row>`;
  });
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${escape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${sheetRows.join('')}</sheetData></worksheet>`,
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
    { level: 6 },
  );
}

function parseXml(files: Record<string, Uint8Array>, name: string): Document | null {
  const data = files[name];
  if (!data) return null;
  const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new XlsxError('invalid-spreadsheet');
  return doc;
}

const all = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS('*', name));

/** A part's address from a relationship target, relative to `xl/`. */
const partPath = (target: string) =>
  target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;

/** The visible text of a string item, without phonetic guides. */
const textOf = (node: Element) =>
  all(node, 't')
    .filter((t) => (t.parentNode as Element | null)?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');

/** The first sheet of a workbook, every cell as text. */
export function readXlsx(data: Uint8Array, maxRows: number): string[][] {
  if (data.byteLength > XLSX_MAX_BYTES) throw new XlsxError('file-too-large');
  let files: Record<string, Uint8Array>;
  let unpacked = 0;
  try {
    files = unzipSync(data, {
      filter: (file) => {
        if (!/^(?:xl\/.*\.xml|xl\/_rels\/workbook\.xml\.rels)$/.test(file.name)) return false;
        unpacked += file.originalSize;
        return file.originalSize <= MAX_UNPACKED && unpacked <= MAX_UNPACKED;
      },
    });
  } catch {
    throw new XlsxError('invalid-spreadsheet');
  }
  if (unpacked > MAX_UNPACKED) throw new XlsxError('file-too-large');

  const workbook = parseXml(files, 'xl/workbook.xml');
  const rels = parseXml(files, 'xl/_rels/workbook.xml.rels');
  const sheet = workbook && all(workbook, 'sheet')[0];
  if (!sheet || !rels) throw new XlsxError('invalid-spreadsheet');
  const relId = sheet.getAttributeNS(REL, 'id') ?? sheet.getAttribute('r:id');
  const relations = all(rels, 'Relationship');
  const target = relations.find((r) => r.getAttribute('Id') === relId)?.getAttribute('Target');
  const sharedTarget = relations
    .find((r) => r.getAttribute('Type')?.endsWith('/sharedStrings'))
    ?.getAttribute('Target');
  const worksheet = target ? parseXml(files, partPath(target)) : null;
  if (!worksheet) throw new XlsxError('invalid-spreadsheet');
  const sharedDoc = sharedTarget ? parseXml(files, partPath(sharedTarget)) : null;
  const shared = sharedDoc ? all(sharedDoc, 'si').map(textOf) : [];

  const rows: string[][] = [];
  let nextRow = 0;
  for (const row of all(worksheet, 'row')) {
    const r = Number(row.getAttribute('r') ?? nextRow + 1) - 1;
    if (!Number.isInteger(r) || r < 0 || r < nextRow - 1)
      throw new XlsxError('invalid-spreadsheet');
    nextRow = r + 1;
    if (r > maxRows) break;
    const cells: string[] = [];
    let nextColumn = 0;
    for (const cell of Array.from(row.children).filter((c) => c.localName === 'c')) {
      const ref = /^([A-Z]{1,3})\d+$/.exec(cell.getAttribute('r') ?? '');
      const c = ref ? columnIndex(ref[1] as string) : nextColumn;
      nextColumn = c + 1;
      if (c >= MAX_COLUMNS) throw new XlsxError('invalid-spreadsheet');
      const type = cell.getAttribute('t');
      const v = all(cell, 'v')[0]?.textContent ?? '';
      let value: string;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr')
        value = all(cell, 'is')[0] ? textOf(all(cell, 'is')[0] as Element) : '';
      else if (type === 'b') value = v === '1' ? 'true' : 'false';
      else if (type === 'e') value = '';
      else if (type === 'str') value = v;
      else value = v !== '' && Number.isFinite(Number(v)) ? String(Number(v)) : v;
      while (cells.length < c) cells.push('');
      cells[c] = value;
    }
    while (rows.length < r) rows.push([]);
    rows[r] = cells;
  }
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]);
}

/** Saves data as a file on the person's device. */
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
