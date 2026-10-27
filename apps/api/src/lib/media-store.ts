/**
 * Media file storage (D-044): Cloudflare R2 in production and `wrangler dev`, memory in tests.
 * Two buckets: the private one, which only this API can read, holds every upload under
 * `private/<siteId>/<assetId>/<width>.webp`; the public one, which the site Workers read, holds
 * copies of published images under `sites/<siteKey>/…` and short-lived preview copies under
 * `preview/<siteKey>/…` (removed by the bucket's lifecycle rule, docs/deployment.md).
 */
export interface StoredFile {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  size: number;
}

export interface MediaStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  has(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<void>;
}

export const privateKey = (siteId: string, assetId: string, width: number) =>
  `private/${siteId}/${assetId}/${width}.webp`;
export const publicKey = (siteKey: string, assetId: string, width: number) =>
  `sites/${siteKey}/${assetId}/${width}.webp`;
export const previewKey = (siteKey: string, assetId: string, width: number) =>
  `preview/${siteKey}/${assetId}/${width}.webp`;

/** Copies one file between buckets (R2 bindings have no server-side copy). */
export async function copyFile(from: MediaStore, fromKey: string, to: MediaStore, toKey: string) {
  const file = await from.get(fromKey);
  if (!file) return false;
  const body =
    file.body instanceof ArrayBuffer ? file.body : await new Response(file.body).arrayBuffer();
  await to.put(toKey, body, file.contentType);
  return true;
}

export function r2Store(bucket: R2Bucket): MediaStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        size: object.size,
      };
    },
    async has(key) {
      return (await bucket.head(key)) !== null;
    },
    async delete(keys) {
      if (keys.length > 0) await bucket.delete(keys);
    },
  };
}

/** Keeps files in memory — tests only. */
export function memoryStore(): MediaStore & { files: Map<string, StoredFile> } {
  const files = new Map<string, StoredFile>();
  return {
    files,
    put(key, body, contentType) {
      files.set(key, { body: body.slice(0), contentType, size: body.byteLength });
      return Promise.resolve();
    },
    get(key) {
      const file = files.get(key);
      return Promise.resolve(file ? { ...file, body: (file.body as ArrayBuffer).slice(0) } : null);
    },
    has(key) {
      return Promise.resolve(files.has(key));
    },
    delete(keys) {
      for (const key of keys) files.delete(key);
      return Promise.resolve();
    },
  };
}
