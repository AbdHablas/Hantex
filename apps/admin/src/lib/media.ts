/**
 * Image processing in the browser (D-044). A photo is decoded here, drawn at a few widths and
 * encoded as WebP; only those copies are uploaded. Re-encoding the pixels drops everything else
 * the original file carried (camera model, location, editing history), and the original never
 * leaves the device. The server checks every file again.
 */

export interface MediaItem {
  id: string;
  name: string;
  alt: { ar: string; en: string };
  width: number;
  height: number;
  bytes: number;
  variants: { width: number; height: number; bytes: number }[];
  createdAt: string;
  published: boolean;
  urls: Record<string, string>;
}

export interface ProcessedImage {
  name: string;
  width: number;
  height: number;
  files: { width: number; height: number; blob: Blob }[];
}

/** Widths stored for each image: phones, tablets and laptops, large screens. */
export const MEDIA_WIDTHS = [480, 960, 1600, 2400];
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_INPUT_SIDE = 12_000;
/** The API's limits: no stored side above 4096 px, and widths of at least two digits. */
const MAX_STORED_SIDE = 4096;
const MIN_SIDE = 16;
const QUALITY = 0.82;

export class ImageError extends Error {
  constructor(readonly code: 'too-large' | 'too-small' | 'unreadable' | 'no-webp') {
    super(code);
  }
}

/** The widths to store for an image of this width: never larger than the original. */
export function widthsFor(width: number): number[] {
  const largest = Math.min(width, MEDIA_WIDTHS.at(-1)!);
  return [...MEDIA_WIDTHS.filter((w) => w < largest), largest];
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('too-large');
  let bitmap: ImageBitmap;
  try {
    // Photos from phones are often stored sideways with a rotation note; apply it.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('unreadable');
  }
  try {
    if (bitmap.width > MAX_INPUT_SIDE || bitmap.height > MAX_INPUT_SIDE) {
      throw new ImageError('too-large');
    }
    if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) throw new ImageError('too-small');
    // Very tall images are stored narrower, so that no copy is taller than the API allows.
    const widest = Math.min(
      bitmap.width,
      Math.floor((MAX_STORED_SIDE * bitmap.width) / bitmap.height),
    );
    const files: ProcessedImage['files'] = [];
    for (const width of widthsFor(widest)) {
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new ImageError('unreadable');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', QUALITY),
      );
      // Browsers that can't encode WebP silently return PNG instead.
      if (!blob || blob.type !== 'image/webp') throw new ImageError('no-webp');
      files.push({ width, height, blob });
    }
    return {
      name: file.name.slice(0, 120) || 'image',
      width: bitmap.width,
      height: bitmap.height,
      files,
    };
  } finally {
    bitmap.close();
  }
}

/** The form the media API expects: `meta` plus one file per width. */
export function uploadForm(image: ProcessedImage, alt = { ar: '', en: '' }): FormData {
  const form = new FormData();
  form.set('meta', JSON.stringify({ name: image.name, alt }));
  for (const file of image.files) form.set(`w${file.width}`, file.blob, `${file.width}.webp`);
  return form;
}

export const formatBytes = (bytes: number, locale: string) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    style: 'unit',
    unit: bytes >= 1024 * 1024 ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));
