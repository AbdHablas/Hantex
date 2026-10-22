import type { Layout, Menus, Page, SiteIssue } from '@hantex/sections';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, sitePath } from './api';
import { useCurrentSite } from './session';

/**
 * The website builder's data (apps/api/src/routes/builder.ts): pages, menus, the header and
 * footer, and the site's unpublished changes. Everything is saved as drafts; Publish changes
 * makes them public together (D-037).
 */

export interface PageSummary {
  id: string;
  title: { ar: string; en: string };
  slug: string;
  parentId: string | null;
  visible: boolean;
  sections: number;
  published: boolean;
  changed: boolean;
}

export interface PageList {
  home: string | null;
  pages: PageSummary[];
}

export interface PageResponse {
  id: string;
  page: Page;
  home: boolean;
  draftUpdatedAt: string | null;
  published: { version: number; publishedAt: string } | null;
}

export interface Changes {
  items: { kind: string; key: string; allowed: boolean }[];
  issues: SiteIssue[];
}

export function useBuilderKeys() {
  const { siteKey } = useCurrentSite();
  const base = ['site', siteKey, 'builder'] as const;
  return {
    siteKey,
    base,
    pages: [...base, 'pages'] as const,
    page: (id: string) => [...base, 'page', id] as const,
    menus: [...base, 'menus'] as const,
    layout: [...base, 'layout'] as const,
    changes: [...base, 'changes'] as const,
  };
}

export function usePages() {
  const { site } = useCurrentSite();
  const keys = useBuilderKeys();
  return useQuery({
    queryKey: keys.pages,
    queryFn: () => api<PageList>(sitePath(keys.siteKey, '/pages')),
    enabled: site !== null,
  });
}

export function usePage(id: string) {
  const { site } = useCurrentSite();
  const keys = useBuilderKeys();
  return useQuery({
    queryKey: keys.page(id),
    queryFn: () => api<PageResponse>(sitePath(keys.siteKey, `/pages/${id}`)),
    enabled: site !== null && id !== '',
  });
}

export function useMenus() {
  const { site } = useCurrentSite();
  const keys = useBuilderKeys();
  return useQuery({
    queryKey: keys.menus,
    queryFn: () => api<Menus>(sitePath(keys.siteKey, '/menus')),
    enabled: site !== null,
  });
}

export function useLayout() {
  const { site } = useCurrentSite();
  const keys = useBuilderKeys();
  return useQuery({
    queryKey: keys.layout,
    queryFn: () => api<Layout>(sitePath(keys.siteKey, '/layout')),
    enabled: site !== null,
  });
}

export function useChanges() {
  const { site } = useCurrentSite();
  const keys = useBuilderKeys();
  return useQuery({
    queryKey: keys.changes,
    queryFn: () => api<Changes>(sitePath(keys.siteKey, '/changes')),
    enabled: site !== null,
  });
}

/** A builder request that refreshes the builder's data (and the site's overview) afterwards. */
export function useBuilderMutation<I, O = unknown>(request: (input: I) => Promise<O>) {
  const queryClient = useQueryClient();
  const keys = useBuilderKeys();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', keys.siteKey] }),
  });
}

/** A short identifier for new sections and list items, as the registry makes them. */
export const newItemId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('');

/** An address part from a title: lowercase Latin letters, digits and hyphens. */
export function slugify(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
