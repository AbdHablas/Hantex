/**
 * Checks an uploaded PDF (D-045) before it is stored. It must start like a PDF and end like one,
 * be at most 10 MB, and not be password-protected. Files that plainly carry active content
 * (scripts, launch actions, embedded files or media) are refused too. That last check reads the
 * file's uncompressed text only, so it is a safeguard, not a guarantee; that is why the files are
 * always offered as downloads with their type fixed, never shown inside the dashboard or a site.
 */

export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export type PdfReason = 'not-pdf' | 'too-large' | 'encrypted' | 'active-content';

const HEADER = /^%PDF-(?:1\.[0-7]|2\.0)/;
/** Names whose objects run or open something; matched whole (`/JS` but not `/JSON`). */
const ACTIVE = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA)(?![A-Za-z0-9#])/;

export function readPdf(data: ArrayBuffer): { ok: true } | { ok: false; reason: PdfReason } {
  if (data.byteLength > PDF_MAX_BYTES) return { ok: false, reason: 'too-large' };
  if (data.byteLength < 64) return { ok: false, reason: 'not-pdf' };
  // Latin-1 keeps one character per byte, so offsets and names read as written.
  const text = new TextDecoder('latin1').decode(data);
  if (!HEADER.test(text.slice(0, 16))) return { ok: false, reason: 'not-pdf' };
  if (!text.slice(-1024).includes('%%EOF')) return { ok: false, reason: 'not-pdf' };
  // Stream contents are binary or compressed and could contain these bytes by chance; the
  // dictionaries that describe objects are outside them.
  const outside = text.replace(/(?<!end)stream\r?\n[\s\S]*?endstream/g, '');
  if (/\/Encrypt(?![A-Za-z0-9#])/.test(outside)) return { ok: false, reason: 'encrypted' };
  if (ACTIVE.test(outside)) return { ok: false, reason: 'active-content' };
  // Names may spell characters as #xx (often a space in a font name); those are read decoded.
  for (const [name] of outside.matchAll(/\/[A-Za-z0-9]*#[0-9A-Fa-f]{2}[A-Za-z0-9#]*/g)) {
    const decoded = name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (ACTIVE.test(`${decoded} `)) return { ok: false, reason: 'active-content' };
  }
  return { ok: true };
}
