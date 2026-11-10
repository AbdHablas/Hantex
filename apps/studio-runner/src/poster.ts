import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { MODEL_VIEWS } from '@hantex/studio';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';

/**
 * Poster images (D-029 §6): real headless renders of the optimised model in `<model-viewer>`,
 * the viewer the website uses, saved as WebP like every other website image (D-044).
 *
 * The page is built with `setContent`, with the model inlined as a `data:` URI and the viewer's
 * script inlined too: a `file://` page can't fetch a sibling file. It has no network at all,
 * since a poster never needs one and the model was uploaded by a person. Chromium keeps its
 * sandbox on, except as root, where it refuses to start with one. `--enable-unsafe-swiftshader`
 * lets a machine without a GPU fall back to software WebGL.
 */

export const POSTER_SIZE = 1024;
const LOAD_TIMEOUT_MS = 30_000;

const require = createRequire(import.meta.url);
let viewerScript: Promise<string> | undefined;
const modelViewerScript = () =>
  (viewerScript ??= readFile(
    require.resolve('@google/model-viewer/dist/model-viewer-umd.min.js'),
    'utf8',
  ));

function posterHtml(glbBase64: string, script: string, cameraOrbit: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:transparent}model-viewer{width:${POSTER_SIZE}px;height:${POSTER_SIZE}px}</style>
<script>${script}</script>
</head><body>
<model-viewer src="data:model/gltf-binary;base64,${glbBase64}" camera-orbit="${cameraOrbit}"
  disable-zoom exposure="1" shadow-intensity="0"></model-viewer>
<script>
  document.querySelector('model-viewer').addEventListener('error', (event) => {
    window.posterError = String(event.detail?.type ?? 'load failed');
  });
</script>
</body></html>`;
}

async function renderOne(
  browser: Browser,
  glbBase64: string,
  script: string,
  cameraOrbit: string,
): Promise<Uint8Array> {
  const page = await browser.newPage({ viewport: { width: POSTER_SIZE, height: POSTER_SIZE } });
  try {
    await page.route('**/*', (route) => route.abort());
    await page.setContent(posterHtml(glbBase64, script, cameraOrbit), { waitUntil: 'load' });
    const outcome = await page
      .waitForFunction(
        () => {
          const error = (window as { posterError?: string }).posterError;
          if (error) return `error: ${error}`;
          const viewer = document.querySelector<HTMLElement & { loaded?: boolean }>('model-viewer');
          return viewer?.loaded === true ? 'loaded' : false;
        },
        null,
        { timeout: LOAD_TIMEOUT_MS },
      )
      .then((handle) => handle.jsonValue())
      .catch((error: unknown) =>
        error instanceof Error && error.name === 'TimeoutError'
          ? `the viewer didn't load the model within ${LOAD_TIMEOUT_MS / 1000} s`
          : String(error),
      );
    if (outcome !== 'loaded') throw new Error(`The poster couldn't be rendered: ${outcome}`);
    const png = await page.screenshot({ omitBackground: true });
    return new Uint8Array(await sharp(png).webp({ quality: 85 }).toBuffer());
  } finally {
    await page.close();
  }
}

/** A front and a three-quarter poster of the same optimised GLB, as WebP. */
export async function renderPosters(
  glbBytes: Uint8Array,
): Promise<{ front: Uint8Array; threeQuarter: Uint8Array }> {
  const script = await modelViewerScript();
  const glbBase64 = Buffer.from(glbBytes).toString('base64');
  const browser = await chromium.launch({
    executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined,
    chromiumSandbox: process.getuid?.() !== 0,
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    return {
      front: await renderOne(browser, glbBase64, script, MODEL_VIEWS.front),
      threeQuarter: await renderOne(browser, glbBase64, script, MODEL_VIEWS.angle),
    };
  } finally {
    await browser.close();
  }
}
