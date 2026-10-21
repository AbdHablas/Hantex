import type { Permission } from '@hantex/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ApiError, api } from './api';

export interface Bilingual {
  ar: string;
  en: string;
}

export interface MySite {
  key: string;
  name: Bilingual;
  mode: string;
  archived: boolean;
  role: { id: string; name: Bilingual } | null;
  permissions: Permission[];
}

export interface Me {
  id: string;
  name: string;
  email: string;
  locale: 'ar' | 'en';
  allSites: boolean;
  /** Dashboard-wide permissions (all-sites roles only). */
  permissions: Permission[];
  sites: MySite[];
  passkeys: number;
  recoveryCodesLeft: number;
}

export const meQueryKey = ['me'] as const;

/** The signed-in staff member, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api<Me>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}

/**
 * The website selected in the address (/s/:siteKey/...) and the person's permissions on it.
 * The interface only hides what the person can't do; the server checks every request.
 */
export function useCurrentSite() {
  const { siteKey } = useParams();
  const { data: me } = useMe();
  const site = me?.sites.find((s) => s.key === siteKey) ?? null;
  const can = (...permissions: Permission[]) =>
    site !== null && permissions.every((p) => site.permissions.includes(p));
  return { site, siteKey: siteKey ?? '', can };
}

/** Dashboard-wide permissions, from an all-sites role. */
export function usePlatform() {
  const { data: me } = useMe();
  const can = (...permissions: Permission[]) =>
    me !== null && me !== undefined && permissions.every((p) => me.permissions.includes(p));
  return { me, can };
}
