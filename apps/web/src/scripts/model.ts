/**
 * A product's 3D models (D-029, D-057, D-058). The page shows a poster; `<model-viewer>` (about
 * 290 KB compressed, with three.js) loads only when a visitor asks for it, or on a computer when
 * the model comes near the screen. Phones always wait for a tap, and so does anyone saving data.
 * Each finish is its own model: choosing a finish shows that model, with its own poster, caption
 * and offer. "View on your wall" (AR through Scene Viewer on Android and Quick Look on iOS) is
 * offered only for models checked true to scale.
 */

const PHONE = '(max-width: 48rem)';

/** Points the viewer at the figure's current model: its files, description and AR offer. */
function show(figure: HTMLElement, viewer: HTMLElement) {
  const base = figure.dataset['model'] ?? '';
  viewer.setAttribute('src', `${base}/${matchMedia(PHONE).matches ? 'mobile' : 'desktop'}.glb`);
  viewer.setAttribute('poster', `${base}/poster-front.webp`);
  viewer.setAttribute('alt', figure.dataset['alt'] ?? '');
  viewer.querySelector('[slot="ar-button"]')?.remove();
  const ar = figure.dataset['ar'];
  if (!ar) {
    viewer.removeAttribute('ar');
    return;
  }
  viewer.setAttribute('ar', '');
  viewer.setAttribute('ar-modes', 'scene-viewer quick-look');
  viewer.setAttribute('ar-placement', 'wall');
  viewer.setAttribute('ar-scale', 'fixed');
  const button = document.createElement('button');
  button.type = 'button';
  button.slot = 'ar-button';
  button.className = 'btn btn-secondary cx-model-ar';
  button.textContent = ar;
  viewer.appendChild(button);
}

async function open(figure: HTMLElement, focus: boolean) {
  if (figure.dataset['opened']) return;
  figure.dataset['opened'] = '1';
  await import('@google/model-viewer');
  const viewer = document.createElement('model-viewer');
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('touch-action', 'pan-y');
  viewer.setAttribute('shadow-intensity', '1');
  // In-page WebXR isn't used, so its "exit AR" button is never needed: an empty slot removes it.
  const exit = document.createElement('span');
  exit.slot = 'exit-webxr-ar-button';
  exit.hidden = true;
  viewer.appendChild(exit);
  // Read now, not before the download: a finish chosen meanwhile is the one shown.
  show(figure, viewer);
  figure.querySelector('.cx-model-stage')?.replaceChildren(viewer);
  // The tapped button is gone, so keyboard focus moves into the viewer: onto its loading poster,
  // which the viewer hands on to the model (arrow keys turn it) once it shows. Both are the
  // viewer's own parts; the browser test notices if an upgrade renames them.
  if (focus) viewer.shadowRoot?.querySelector<HTMLElement>('#default-poster')?.focus();
}

/** Shows another finish's model: its poster, caption and offer, and in the viewer if open. */
function choose(figure: HTMLElement, choice: HTMLInputElement) {
  const { modelBase, alt, posterAlt, ar, caption } = choice.dataset;
  figure.dataset['model'] = modelBase ?? '';
  figure.dataset['alt'] = alt ?? '';
  if (ar) figure.dataset['ar'] = ar;
  else delete figure.dataset['ar'];
  const poster = figure.querySelector<HTMLImageElement>('.cx-model-poster');
  if (poster) {
    poster.src = `${modelBase ?? ''}/poster-front.webp`;
    poster.alt = posterAlt ?? '';
  }
  const text = figure.querySelector('figcaption');
  if (text) text.textContent = caption ?? '';
  const viewer = figure.querySelector<HTMLElement>('model-viewer');
  if (viewer) show(figure, viewer);
}

for (const figure of document.querySelectorAll<HTMLElement>('figure[data-model]')) {
  const button = figure.querySelector<HTMLButtonElement>('[data-model-open]');
  if (button) {
    // Without this script the button would do nothing, so the page starts it hidden.
    button.hidden = false;
    button.addEventListener('click', () => void open(figure, true), { once: true });
  }
  // The finish switcher, likewise hidden until it can work.
  const finishes = document.querySelector<HTMLFieldSetElement>(
    `[data-model-finishes="${figure.id}"]`,
  );
  if (finishes) {
    finishes.hidden = false;
    finishes.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement) choose(figure, event.target);
    });
  }
  const saving = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (matchMedia('(pointer: fine)').matches && !matchMedia(PHONE).matches && !saving) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void open(figure, false);
      },
      { rootMargin: '200px' },
    );
    observer.observe(figure);
  }
}
