/**
 * Site search (D-052) with Pagefind (MIT): the index files are made at build time and searched
 * here, in the page's language. Results are built with DOM methods only: titles and excerpts are
 * set as text, and Pagefind's highlight marks are rebuilt as <mark> elements, never as HTML.
 */
interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: { title?: string } }>;
}
interface Pagefind {
  init?: () => Promise<void>;
  search: (term: string) => Promise<{ results: PagefindResult[] }>;
}

const form = document.querySelector<HTMLFormElement>('form[data-search]');
const status = document.querySelector<HTMLElement>('[data-search-status]');
const list = document.querySelector<HTMLOListElement>('[data-search-results]');

/** Written by scripts/search-index.ts next to the site's pages; loaded only on this page. */
const PAGEFIND: string = '/pagefind/pagefind.js';
let pagefind: Promise<Pagefind> | null = null;
const load = () =>
  (pagefind ??= (import(/* @vite-ignore */ PAGEFIND) as Promise<Pagefind>).then(async (module) => {
    await module.init?.();
    return module;
  }));

/** Pagefind's excerpt as text, with its <mark> highlights kept and nothing else. */
function excerpt(html: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const node of parsed.body.childNodes) {
    if (node.nodeName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent;
      fragment.appendChild(mark);
    } else {
      fragment.appendChild(document.createTextNode(node.textContent ?? ''));
    }
  }
  return fragment;
}

/** Only addresses on this site, so a result can never lead elsewhere. */
const sameSite = (url: string) => {
  try {
    return new URL(url, location.origin).origin === location.origin;
  } catch {
    return false;
  }
};

if (form && status && list) {
  const messages = JSON.parse(form.dataset['messages'] ?? '{}') as Record<string, string>;
  const input = form.querySelector<HTMLInputElement>('input[name="q"]');
  let run = 0;
  const searchFor = async (term: string) => {
    const mine = ++run;
    list.replaceChildren();
    if (!term) {
      status.textContent = '';
      return;
    }
    status.textContent = messages['searching'] ?? '';
    try {
      const { results } = await (await load()).search(term);
      const items = await Promise.all(results.slice(0, 30).map((r) => r.data()));
      if (mine !== run) return;
      for (const item of items) {
        if (!sameSite(item.url)) continue;
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.meta.title ?? item.url;
        const heading = document.createElement('h2');
        heading.appendChild(link);
        const text = document.createElement('p');
        text.appendChild(excerpt(item.excerpt));
        li.appendChild(heading);
        li.appendChild(text);
        list.appendChild(li);
      }
      status.textContent =
        list.children.length > 0
          ? (messages['results'] ?? '').replace('{n}', String(list.children.length))
          : (messages['none'] ?? '').replace('{q}', term);
    } catch {
      if (mine === run) status.textContent = messages['failed'] ?? '';
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = (input?.value ?? '').trim().slice(0, 200);
    const url = new URL(location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
    void searchFor(term);
  });
  // A shared search address (?q=…) searches straight away.
  const initial = (new URL(location.href).searchParams.get('q') ?? '').trim().slice(0, 200);
  if (input && initial) {
    input.value = initial;
    void searchFor(initial);
  }
}
