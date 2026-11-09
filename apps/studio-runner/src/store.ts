import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * File storage for the processing runner (D-029, D-030): the same private R2 bucket the
 * dashboard Worker uses, reached from outside Cloudflare through R2's S3-compatible API with
 * its own, narrower credentials (an R2 API token scoped to this one bucket; never the Worker's
 * bindings). `memoryStore` is the test double, with the same shape.
 */
export interface StudioStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** R2's S3-compatible endpoint (docs.deployment.md: the runner's own, bucket-scoped token). */
export function r2Store(config: R2Config): StudioStore {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const body = await result.Body?.transformToByteArray();
        return body ?? null;
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async delete(keys) {
      await Promise.all(
        keys.map((key) =>
          client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })),
        ),
      );
    },
  };
}

/** In-memory store for tests: the same shape, nothing persisted, nothing network-reachable. */
export function memoryStore(): StudioStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    get(key) {
      return Promise.resolve(files.get(key) ?? null);
    },
    put(key, bytes) {
      files.set(key, bytes);
      return Promise.resolve();
    },
    delete(keys) {
      for (const key of keys) files.delete(key);
      return Promise.resolve();
    },
  };
}
