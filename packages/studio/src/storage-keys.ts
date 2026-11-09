/**
 * Where the 3D Studio keeps its files: its own private R2 bucket, `hantex-studio` (D-056), one
 * prefix per website. The dashboard Worker reaches it through its `STUDIO` binding; the
 * processing runner through an R2 API token limited to this one bucket, so the runner can
 * never read or change the media library, published files or backups.
 */
export const studioCaptureFileKey = (siteId: string, captureId: string, fileId: string) =>
  `${siteId}/captures/${captureId}/${fileId}`;

export const studioModelKey = (siteId: string, modelId: string, file: string) =>
  `${siteId}/models/${modelId}/${file}`;
