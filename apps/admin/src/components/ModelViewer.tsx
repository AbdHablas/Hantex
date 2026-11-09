import '@google/model-viewer';
import { createElement } from 'react';

/**
 * A processed model in `<model-viewer>`, the viewer the website uses, so a reviewer sees it as
 * visitors will: turn it, zoom in, check every side. Loaded on its own (about 1 MB with
 * three.js) only where a model is shown. If the device can't draw 3D, the poster stays.
 */
export default function ModelViewer({
  src,
  poster,
  alt,
}: {
  src: string;
  poster: string | undefined;
  alt: string;
}) {
  return createElement(
    'model-viewer',
    {
      src,
      poster,
      alt,
      'camera-controls': '',
      'touch-action': 'pan-y',
      'shadow-intensity': '1',
      exposure: '1',
      class: 'block h-80 w-full rounded-lg bg-bg',
    },
    // AR is off here, but the viewer's built-in "exit AR" button stays focusable while hidden
    // from screen readers; filling its slot with nothing removes it.
    createElement('span', { slot: 'exit-webxr-ar-button', hidden: true }),
  );
}
