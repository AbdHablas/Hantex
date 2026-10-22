/**
 * Media file storage (D-044): Cloudflare R2 in production and `wrangler dev`, memory in tests.
 * Keys are `private/<siteId>/<assetId>/<width>.webp`; published copies live under `public/`.
 */
export interface StoredFile {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  size: number;
}

export interface MediaStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(keys: string[]): Promise<void>;
}

export const mediaKey = (
  space: 'private' | 'public',
  siteId: string,
  assetId: string,
  width: number,
) => `${space}/${siteId}/${assetId}/${width}.webp`;

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
    delete(keys) {
      for (const key of keys) files.delete(key);
      return Promise.resolve();
    },
  };
}
