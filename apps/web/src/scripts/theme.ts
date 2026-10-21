// Light/dark toggle (D-021): follows the device until the visitor chooses; the choice is kept
// in this browser only.
const KEY = 'hx-theme';
const root = document.documentElement;

try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') root.dataset['theme'] = saved;
} catch {
  // Storage unavailable: follow the device.
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest('[data-theme-toggle]');
  if (!button) return;
  const current =
    root.dataset['theme'] ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset['theme'] = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not remembered; applies to this page.
  }
});
