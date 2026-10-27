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
