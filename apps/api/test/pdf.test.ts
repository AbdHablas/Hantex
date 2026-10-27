import { describe, expect, it } from 'vitest';
import { PDF_MAX_BYTES, readPdf } from '../src/lib/pdf';
import { fakePdf } from './fixtures';

const reason = (data: ArrayBuffer) => {
  const result = readPdf(data);
  return result.ok ? 'ok' : result.reason;
};

describe('PDF check', () => {
  it('accepts plain PDFs, including names that spell a space as #20', () => {
    expect(reason(fakePdf())).toBe('ok');
    expect(reason(fakePdf('1 0 obj\n<< /BaseFont /Times#20New#20Roman >>\nendobj', '2.0'))).toBe(
      'ok',
    );
  });

  it('ignores stream contents, where any bytes may appear', () => {
    const body = '1 0 obj\n<< /Length 9 >>\nstream\n/JS (x) /Launch\nendstream\nendobj';
    expect(reason(fakePdf(body))).toBe('ok');
  });

  it('refuses files that are not PDFs or are cut short', () => {
    const html = Uint8Array.from('<html><script>alert(1)</script></html>'.repeat(4), (c) =>
      c.charCodeAt(0),
    ).buffer;
    expect(reason(html)).toBe('not-pdf');
    const cut = fakePdf().slice(0, 60);
    expect(reason(cut)).toBe('not-pdf');
  });

  it('refuses scripts, launch actions, embedded files and encryption', () => {
    expect(reason(fakePdf('1 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj'))).toBe(
      'active-content',
    );
    expect(reason(fakePdf('1 0 obj\n<< /S /Launch /F (calc.exe) >>\nendobj'))).toBe(
      'active-content',
    );
    expect(reason(fakePdf('1 0 obj\n<< /Names << /EmbeddedFiles 2 0 R >> >>\nendobj'))).toBe(
      'active-content',
    );
    // The same name spelled with #xx escapes.
    expect(reason(fakePdf('1 0 obj\n<< /S /J#61vaScript >>\nendobj'))).toBe('active-content');
    expect(reason(fakePdf('1 0 obj\n<< /Encrypt 3 0 R >>\nendobj'))).toBe('encrypted');
  });

  it('refuses files over the size limit', () => {
    expect(reason(new ArrayBuffer(PDF_MAX_BYTES + 1))).toBe('too-large');
  });
});
