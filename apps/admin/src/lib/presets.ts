import type { Theme } from '@hantex/theme';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Bilingual } from './session';

export interface ThemeChoice {
  /** "preset:<id>" or "site:<key>", as used by the pickers. */
  value: string;
  name: Bilingual;
  group: 'builtIn' | 'saved' | 'sites';
  theme: Theme;
  /** The body the API takes as a new site's starting theme. */
  start: { preset: string } | { site: string };
  /** Saved presets can be deleted by an Owner. */
  savedId?: string;
}

interface PresetsResponse {
  builtIn: { id: string; name: Bilingual; theme: Theme }[];
  saved: { id: string; name: Bilingual; theme: Theme }[];
  sites: { key: string; name: Bilingual; theme: Theme }[];
}

export const presetsQueryKey = ['theme-presets'] as const;

/** Built-in and saved theme presets, plus the published themes of sites the person may style. */
export function useThemeChoices(enabled = true) {
  return useQuery({
    queryKey: presetsQueryKey,
    enabled,
    queryFn: async (): Promise<ThemeChoice[]> => {
      const data = await api<PresetsResponse>('/theme-presets');
      return [
        ...data.builtIn.map((p) => ({
          value: `preset:${p.id}`,
          name: p.name,
          group: 'builtIn' as const,
          theme: p.theme,
          start: { preset: p.id },
        })),
        ...data.saved.map((p) => ({
          value: `preset:${p.id}`,
          name: p.name,
          group: 'saved' as const,
          theme: p.theme,
          start: { preset: p.id },
          savedId: p.id,
        })),
        ...data.sites.map((s) => ({
          value: `site:${s.key}`,
          name: s.name,
          group: 'sites' as const,
          theme: s.theme,
          start: { site: s.key },
        })),
      ];
    },
  });
}
