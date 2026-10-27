import { fontCatalogue, type FontCatalogue, type Script, type UploadedFontId } from '@hantex/theme';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api } from './api';

/** An uploaded font as GET /api/fonts lists it (D-033). */
export interface FontItem {
  id: UploadedFontId;
  uuid: string;
  name: string;
  scripts: Script[];
  files: { weight: number; bytes: number; url: string }[];
  licence: { name: string; url: string | null };
  licenceConfirmedAt: string;
  licenceConfirmedBy: string | null;
  createdAt: string;
}

export const fontsQueryKey = ['fonts'] as const;

export const useUploadedFonts = (enabled = true) =>
  useQuery({ queryKey: fontsQueryKey, queryFn: () => api<FontItem[]>('/fonts'), enabled });

const registered = new Set<string>();

/**
 * Makes uploaded fonts available to the page's previews, loaded from this API (same origin, so
 * the dashboard's font-src 'self' allows them). Each file is added once.
 */
export function registerFonts(fonts: readonly FontItem[]) {
  if (typeof FontFace === 'undefined') return;
  for (const font of fonts) {
    for (const file of font.files) {
      const key = `${font.id}:${file.weight}`;
      if (registered.has(key)) continue;
      registered.add(key);
      document.fonts.add(
        new FontFace(font.id, `url(${file.url})`, { weight: String(file.weight), display: 'swap' }),
      );
    }
  }
}

/** The font library for pickers and previews: built-in fonts plus uploaded ones. */
export function useFontCatalogue(): FontCatalogue {
  const fonts = useUploadedFonts();
  const items = fonts.data;
  useEffect(() => {
    if (items) registerFonts(items);
  }, [items]);
  return useMemo(
    () =>
      fontCatalogue(
        (items ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          scripts: f.scripts,
          weights: f.files.map((x) => x.weight),
        })),
      ),
    [items],
  );
}
