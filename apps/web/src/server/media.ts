import { verifyPreviewMedia } from './preview';

/**
 * Serves media library images (D-044) from the public bucket:
 *   /media/<id>/<width>.webp                published images, cached for a year (never change);
 *   /media/preview/<id>/<width>.webp?…      preview copies, only with a valid signed link.
 * Only this site's own files are reachable; everything else is "not found".
 */
export interface MediaBucket {
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer; size: number } | null>;
}

const PATH =
  /^\/media\/(preview\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9]{2,4})\.webp$/;

const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export async function serveMedia(
  request: Request,
  options: { bucket: MediaBucket; siteKey: string; previewSecret: string; now?: number },
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const match = PATH.exec(url.pathname);
  if (!match) return notFound();
  const [, preview, id, width] = match as unknown as [string, string | undefined, string, string];
  if (preview) {
    const valid = await verifyPreviewMedia(
      options.previewSecret,
      options.siteKey,
      id,
      url.searchParams.get('expires'),
      url.searchParams.get('signature'),
      options.now,
    );
    if (!valid) return notFound();
  }
  const key = `${preview ? 'preview' : 'sites'}/${options.siteKey}/${id}/${width}.webp`;
  const file = await options.bucket.get(key);
  if (!file) return notFound();
  return new Response(request.method === 'HEAD' ? null : file.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': preview ? 'private, no-store' : 'public, max-age=31536000, immutable',
      ...(preview ? { 'X-Robots-Tag': 'noindex' } : {}),
    },
  });
}

const FONT_PATH =
  /^\/fonts\/library\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([1-9]00)\.woff2$/;

/**
 * Serves fonts uploaded by the Owner (D-033) from the public bucket, at
 * /fonts/library/<id>/<weight>.woff2. They are shared by every website and never change.
 */
export async function serveFont(request: Request, bucket: MediaBucket): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const match = FONT_PATH.exec(new URL(request.url).pathname);
  if (!match) return notFound();
  const file = await bucket.get(`fonts/${match[1]}/${match[2]}.woff2`);
  if (!file) return notFound();
  return new Response(request.method === 'HEAD' ? null : file.body, {
    headers: {
      'Content-Type': 'font/woff2',
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

const FILE_PATH = /^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/;

/**
 * Serves this site's published files (D-045), PDFs that products and series attach, at
 * /files/<id>.pdf. They are offered as downloads with their type fixed, never drawn as a page.
 */
export async function serveFile(
  request: Request,
  options: { bucket: MediaBucket; siteKey: string },
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const match = FILE_PATH.exec(new URL(request.url).pathname);
  if (!match) return notFound();
  const file = await options.bucket.get(`sites/${options.siteKey}/files/${match[1]}.pdf`);
  if (!file) return notFound();
  return new Response(request.method === 'HEAD' ? null : file.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'Content-Disposition': `attachment; filename="${match[1]}.pdf"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // A file's id never changes content, but it may be removed, so it is cached for a day.
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
