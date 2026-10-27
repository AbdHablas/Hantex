import { z } from 'zod';
import { sanitizeSvg, type PaintProperty } from './svg';

/**
 * Uploaded logos (D-027, docs/theming.md). A site's logo document holds its cleaned SVG files
 * and, for each colour they draw with, whether it follows one of the theme's logo colour tokens
 * or stays fixed. The build turns each file into an adaptive SVG that follows light and dark
 * mode, like the Hantex Ultra files in brand/logo.
 */

export const LOGO_TOKENS = ['neutral', 'switch', 'indicator', 'accent'] as const;
export type LogoToken = (typeof LOGO_TOKENS)[number];
export type LogoColourUse = LogoToken | 'fixed';

/** Largest cleaned logo file kept, in characters; logos are small drawings. */
export const LOGO_MAX_LENGTH = 200_000;

const colourHex = z.string().regex(/^#[0-9a-f]{6}$/);

export const logoFileSchema = z
  .strictObject({
    /** The cleaned SVG, as the SVG cleaner wrote it. */
    svg: z.string().min(1).max(LOGO_MAX_LENGTH),
    colours: z
      .array(z.strictObject({ colour: colourHex, use: z.enum([...LOGO_TOKENS, 'fixed']) }))
      .max(64),
  })
  .superRefine((file, ctx) => {
    // Stored files must be exactly what the cleaner writes (it gives the same file when run
    // again), so nothing unchecked reaches a website, whoever sent the draft.
    const result = sanitizeSvg(file.svg);
    if (!result.ok || result.svg !== file.svg) {
      ctx.addIssue({ code: 'custom', path: ['svg'], message: 'not-clean' });
      return;
    }
    const listed = file.colours.map((c) => c.colour);
    if (
      listed.length !== result.colours.length ||
      result.colours.some((colour) => !listed.includes(colour))
    ) {
      ctx.addIssue({ code: 'custom', path: ['colours'], message: 'colours-mismatch' });
    }
  });

export type LogoFile = z.infer<typeof logoFileSchema>;

export const logoSchema = z.strictObject({
  /** The full logo shown in headers and footers. */
  lockup: logoFileSchema.nullable(),
  /** A small square version for browser tabs; the lockup is used when there is none. */
  mark: logoFileSchema.nullable(),
});

export type Logo = z.infer<typeof logoSchema>;

export const DEFAULT_LOGO: Logo = { lockup: null, mark: null };

/** Light and dark values of the logo colour tokens: the theme's `logo` colours. */
export type LogoPalette = Record<'light' | 'dark', Record<LogoToken, string>>;

const PROPERTY_LETTER: Record<PaintProperty, string> = {
  fill: 'f',
  stroke: 's',
  'stop-color': 'p',
};
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * The file as an adaptive SVG: colours mapped to a token are drawn with that token's value for
 * the viewer's light or dark setting, and accept `--hx-logo-<token>` from a page when placed
 * inline. Fixed colours stay as they are. The file is cleaned again on the way.
 */
export function adaptiveLogo(file: LogoFile, palette: LogoPalette): string {
  const uses = new Map(file.colours.map((c) => [c.colour, c.use]));
  const used = new Map<string, [PaintProperty, LogoToken]>();
  const result = sanitizeSvg(file.svg, undefined, {
    paint: (property, colour) => {
      const use = uses.get(colour);
      if (!use || use === 'fixed') return null;
      const cls = `hx-${PROPERTY_LETTER[property]}-${use}`;
      used.set(cls, [property, use]);
      return cls;
    },
  });
  if (!result.ok) throw new Error(`logo file rejected: ${result.reason}`);
  if (used.size === 0) return result.svg;

  for (const mode of ['light', 'dark'] as const) {
    for (const token of LOGO_TOKENS) {
      if (!HEX6.test(palette[mode][token])) throw new Error(`bad logo colour: ${mode} ${token}`);
    }
  }
  const tokens = [...new Set([...used.values()].map(([, token]) => token))];
  const vars = (mode: 'light' | 'dark') =>
    tokens.map((token) => `--_hx-${token}:${palette[mode][token]}`).join(';');
  const rules = [...used]
    .map(
      ([cls, [property, token]]) =>
        `.${cls}{${property}:var(--hx-logo-${token},var(--_hx-${token}))}`,
    )
    .join('');
  const style = `<style>svg{${vars('light')}}@media (prefers-color-scheme:dark){svg{${vars('dark')}}}${rules}</style>`;
  // The cleaner writes the opening tag first, escapes `>` in attribute values and never writes
  // an empty <svg/> (a file with nothing drawn is refused).
  const end = result.svg.indexOf('>') + 1;
  return `${result.svg.slice(0, end)}${style}${result.svg.slice(end)}`;
}

/** The colours of a newly cleaned file, all fixed until the administrator maps them. */
export function newLogoFile(svg: string, colours: string[]): LogoFile {
  return { svg, colours: colours.map((colour) => ({ colour, use: 'fixed' as const })) };
}
