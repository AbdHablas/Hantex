import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { XlsxError, columnName, readXlsx, writeXlsx } from './xlsx';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

describe('xlsx', () => {
  it('names columns as spreadsheets do', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('reads back what it writes, including Arabic, line breaks and formula-like text', () => {
    const rows = [
      ['address', 'name_ar', 'Current (A) [current001]'],
      ['switch-1', 'مفتاح <أبيض> & "جديد"', '16'],
      ['switch-2', '=HYPERLINK("x")\nsecond line', ''],
    ];
    const data = writeXlsx(rows, [false, false, true]);
    expect(readXlsx(data, 100)).toEqual(rows);
  });

  it('writes formula-like text as plain text, never as a formula', () => {
    const data = writeXlsx([['a'], ['=1+1']]);
    const sheet = strFromU8(unzipSync(data)['xl/worksheets/sheet1.xml'] as Uint8Array);
    expect(sheet).toContain('<t xml:space="preserve">=1+1</t>');
    expect(sheet).not.toContain('<f>');
  });

  it('reads workbooks made by spreadsheet programs: shared strings, rich text, gaps', () => {
    const file = zipSync({
      'xl/workbook.xml': strToU8(
        `<x:workbook xmlns:x="${MAIN}" xmlns:r="${REL}"><x:sheets><x:sheet name="S" sheetId="1" r:id="rId7"/></x:sheets></x:workbook>`,
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${REL}/worksheet" Target="/xl/worksheets/data.xml"/><Relationship Id="rId8" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      ),
      'xl/sharedStrings.xml': strToU8(
        `<sst xmlns="${MAIN}"><si><t>address</t></si><si><r><t>Bo</t></r><r><t>ld</t></r><rPh><t>x</t></rPh></si></sst>`,
      ),
      'xl/worksheets/data.xml': strToU8(
        `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3"><v>0.30000000000000004</v></c><c r="B3" t="b"><v>1</v></c><c r="C3" t="str"><v>x</v></c></row></sheetData></worksheet>`,
      ),
    });
    expect(readXlsx(file, 100)).toEqual([
      ['address', '', 'Bold'],
      ['', '', ''],
      ['0.30000000000000004', 'true', 'x'],
    ]);
  });

  it('refuses files that are not workbooks', () => {
    expect(() => readXlsx(strToU8('address,name'), 10)).toThrow(XlsxError);
    expect(() => readXlsx(zipSync({ 'a.txt': strToU8('x') }), 10)).toThrow(XlsxError);
  });
});
