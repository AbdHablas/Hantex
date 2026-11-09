/**
 * A product's 3D model (D-029, D-057). The page shows its poster; `<model-viewer>` (about 290 KB
 * compressed, with three.js) loads only when a visitor asks for it, or on a computer when the
 * model comes near the screen. Phones always wait for a tap, and so does anyone saving data.
 * "View on your wall" (AR through Scene Viewer on Android and Quick Look on iOS) is offered
 * only for models checked true to scale.
 */

const PHONE = '(max-width: 48rem)';

async function open(figure: HTMLElement, focus: boolean) {
  if (figure.dataset['opened']) return;
  figure.dataset['opened'] = '1';
  await import('@google/model-viewer');
  const base = figure.dataset['model'] ?? '';
  const viewer = document.createElement('model-viewer');
  viewer.setAttribute('src', `${base}/${matchMedia(PHONE).matches ? 'mobile' : 'desktop'}.glb`);
  viewer.setAttribute('poster', `${base}/poster-front.webp`);
  viewer.setAttribute('alt', figure.dataset['alt'] ?? '');
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('touch-action', 'pan-y');
  viewer.setAttribute('shadow-intensity', '1');
  const ar = figure.dataset['ar'];
  if (ar) {
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
  // In-page WebXR isn't used, so its "exit AR" button is never needed: an empty slot removes it.
  const exit = document.createElement('span');
  exit.slot = 'exit-webxr-ar-button';
  exit.hidden = true;
  viewer.appendChild(exit);
  figure.querySelector('.cx-model-stage')?.replaceChildren(viewer);
  // The tapped button is gone, so keyboard focus moves into the viewer: onto its loading poster,
  // which the viewer hands on to the model (arrow keys turn it) once it shows. Both are the
  // viewer's own parts; the browser test notices if an upgrade renames them.
  if (focus) viewer.shadowRoot?.querySelector<HTMLElement>('#default-poster')?.focus();
}

for (const figure of document.querySelectorAll<HTMLElement>('[data-model]')) {
  const button = figure.querySelector<HTMLButtonElement>('[data-model-open]');
  if (button) {
    // Without this script the button would do nothing, so the page starts it hidden.
    button.hidden = false;
    button.addEventListener('click', () => void open(figure, true), { once: true });
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
