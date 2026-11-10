/**
 * A product's features beside its 3D model (D-059). The page shows the model's poster, which
 * stays in view while the features pass. Once the visitor's 3D viewer is open (by itself on a
 * computer, after a tap on a phone), the poster becomes the live model, and it turns to each
 * feature's view as that feature reaches the reading line. Never with reduced motion: the
 * poster stays. The stage is decoration: it takes no input and is hidden from assistive
 * technology, since the model itself is in the page's gallery.
 */

const SIDE_BY_SIDE = '(min-width: 64rem)';

export interface FeaturesStage {
  /** The visitor's viewer is open: the stage may come alive. */
  live(): void;
  /** Another finish's model was chosen. */
  show(base: string): void;
}

export function productFeatures(file: (base: string) => string): FeaturesStage | null {
  const stage = document.querySelector<HTMLElement>('[data-features-stage]');
  const section = stage?.closest<HTMLElement>('.cx-features');
  const frame = stage?.querySelector<HTMLElement>('.cx-features-frame');
  if (!stage || !section || !frame) return null;
  const items = [...section.querySelectorAll<HTMLElement>('.cx-feature')];
  const poster = stage.querySelector<HTMLImageElement>('img');
  // "poster-front.webp" or "poster-three-quarter.webp": the still nearest the first view.
  const posterFile = poster?.getAttribute('src')?.split('/').pop() ?? '';
  let viewer: HTMLElement | null = null;
  let active = items[0];

  const turn = (item: HTMLElement) => {
    active?.removeAttribute('data-active');
    active = item;
    item.setAttribute('data-active', '');
    viewer?.setAttribute('camera-orbit', item.dataset['orbit'] ?? '');
  };

  // The reading line: the middle of the screen beside the model, lower down under it.
  let observer: IntersectionObserver | undefined;
  const layout = matchMedia(SIDE_BY_SIDE);
  const watch = () => {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        const reached = entries.filter((entry) => entry.isIntersecting).pop();
        if (reached) turn(reached.target as HTMLElement);
      },
      { rootMargin: layout.matches ? '-50% 0px -50% 0px' : '-70% 0px -30% 0px' },
    );
    for (const item of items) observer.observe(item);
  };

  return {
    live() {
      if (viewer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const base = stage.dataset['model'] ?? '';
      viewer = document.createElement('model-viewer');
      viewer.setAttribute('src', file(base));
      viewer.setAttribute('poster', `${base}/${posterFile}`);
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('shadow-intensity', '1');
      // A decoration needs no loading bar and no "exit AR" button: empty slots take their place.
      for (const slot of ['progress-bar', 'exit-webxr-ar-button']) {
        const none = document.createElement('span');
        none.slot = slot;
        none.hidden = true;
        viewer.appendChild(none);
      }
      frame.replaceChildren(viewer);
      // Room to scroll through the features one at a time.
      section.classList.add('is-live');
      if (active) turn(active);
      watch();
      layout.addEventListener('change', watch);
    },
    show(base) {
      stage.dataset['model'] = base;
      if (poster) poster.src = `${base}/${posterFile}`;
      viewer?.setAttribute('src', file(base));
      viewer?.setAttribute('poster', `${base}/${posterFile}`);
    },
  };
}
