# Theming — light/dark modes and dashboard-controlled appearance

**Status:** light/dark and the dashboard appearance editor were confirmed by
the owner (D-021, D-022). Extending them to several websites as a reusable
design system was confirmed on 2026-10-21 (D-027, see
[below](#multiple-websites-and-a-reusable-design-system-d-027-confirmed)).

## Goals

- Every public-facing design works in **light and dark mode**: pages,
  components, icons, illustrations and logos.
- Administrators change **colours, fonts and overall appearance** for every
  public-facing website from **one place in the dashboard**. Each website has
  its own theme, and a change applies consistently across that website.
- New websites, brands, themes, fonts and palettes are added from the
  dashboard without code changes.
- No change can break accessibility, security or the brand's fixed rules.

## Design tokens

All styling comes from named tokens, in three layers:

1. **Palette** — the raw colours: the five brand colours plus derived tints
   (for example accessible text shades).
2. **Semantic tokens**, defined separately for light and dark mode —
   `background`, `surface`, `surface-raised`, `border`, `input-border`,
   `text`, `text-muted`, `accent`, `accent-contrast` (text on accent),
   `accent-text` (accent-coloured text and links), `focus-ring`, `success`,
   `warning`, `danger`, `glow` (Volt). Implemented in `packages/theme`; each
   becomes a CSS variable `--hx-color-<token>`.
3. **Components** use only semantic tokens. Hard-coded colours, fonts or
   radii in components are blocked by lint rules in CI.

Typography, corner radius, elevation (shadows) and motion are tokens too.

## What administrators can change (Appearance, in the dashboard)

| Setting | Options |
|---------|---------|
| Colours | Palette values and the light/dark semantic mapping, with colour pickers |
| Typography & fonts (D-032) | Heading and body fonts, each with a Latin and an Arabic family; twelve text styles (display, headings 1–3, body, small, navigation, buttons, labels, product titles, prices, specifications), each with size, weight, line height, Arabic line height and letter spacing; curated presets |
| Shape | Corner radius |
| Depth | Shadow intensity |
| Motion | Off, subtle or full — reduced-motion preferences are always respected |
| Mode | Default mode (follow the visitor's system, light or dark) and whether visitors get a light/dark toggle |
| Logo | Own colour tokens per mode, defaulting to the brand colours; editable behind a warning that this departs from the brand guidelines (D-022) |

Every change goes through **draft → live preview (light and dark side by
side) → publish**, with full version history and one-click rollback to any
earlier version. **Reset to brand defaults** is always available.

## How changes apply everywhere

- Publishing validates the theme on the server, saves it as a new version and
  triggers the static rebuild (D-006). The build turns the tokens into one
  shared stylesheet of CSS custom properties, plus font loading for the
  selected fonts only. Every page and component reads the same variables, so
  the change is consistent across the platform and costs nothing at runtime.
- Applies to: the public website, the Coming Soon page, future landing pages
  or microsites, transactional emails (colours inlined from the tokens) and
  generated social-sharing images.
- The dashboard keeps its own fixed, accessible interface theme (with its own
  light and dark modes) so a bad public theme can never lock administrators
  out of fixing it.

## Multiple websites and a reusable design system (D-027, confirmed)

Owner's requirement (2026-10-21): the design system serves different
public-facing websites. New websites, brands, categories, themes, fonts and
palettes are added without rebuilding the platform.

- **One theme per site.** Each site has its own theme document, with its own
  drafts, versions, rollback and publishing. Publishing a site's theme
  rebuilds only that site ([`multi-site.md`](multi-site.md)). The theme
  covers:
  - colours for light and dark mode;
  - fonts;
  - shape, depth and motion;
  - mode;
  - logo colours.
- **Presets.** A new site starts from a preset: *Hantex Ultra* (the brand
  theme in `packages/theme`), a neutral starter, or a copy of any site's
  theme. Any theme can be saved as a new preset.
- **Palettes.** Each theme keeps a named palette (for Hantex Ultra:
  Graphite, Circuit Teal, Ice, Steel, Volt). The editor offers palette
  colours first when choosing token colours, and the contrast rules apply to
  whatever is chosen.
- **Font library.** The library is platform-wide and managed in the
  dashboard (Owner by default).
  - Fonts are uploaded as WOFF2 files together with their licence. Each file
    is checked: it must be a valid font, within the size limit, with its
    licence recorded. It then becomes available to every site.
  - The six fonts installed today (Poppins, Inter, Cairo, IBM Plex Sans
    Arabic, Tajawal, Readex Pro) stay as the built-in set.
  - *Built (2026-10-27):* Administration → **Fonts**. Uploaded fonts appear in
    every website's font menus marked *uploaded*, and only for the scripts
    they write.
  - A site loads only the fonts and weights its theme uses.
- **Logos and brand SVGs.** For each site, an administrator uploads an SVG
  logo, and optionally a separate mark.
  1. The upload is sanitised (see Guardrails).
  2. The editor lists the colours found in it.
  3. The administrator maps each colour to a logo token (neutral, accent,
     indicator and so on) or keeps it fixed.

  The result is an adaptive logo that follows light/dark mode and the theme,
  exactly like the Hantex Ultra files in `brand/logo/`. *Built (2026-10-27):*
  the dashboard's **Logo** page; without a small mark the full logo is the
  browser-tab icon. *Not built yet:* PNG versions for emails and social
  images, and the phone icon, from uploaded logos.
- **Icons and illustrations** are drawn with `currentColor` and theme
  variables, so they follow each site's colours and mode. This covers
  interface icons (Lucide) and product-category icons. Uploaded icons are
  sanitised and converted to single-colour `currentColor` icons.
- **Templates and components use only semantic tokens** (enforced by lint),
  so every template works with every theme. A site picks a template, and its
  colours, fonts and logo come from its theme.
- **Done in the dashboard, with no code:** new sites, themes, palettes,
  fonts, logos, icons, categories and products. **Needs development:** new
  templates, new content block types and new kinds of features.

## Typography (D-031, D-032)

- **Fonts.** Two roles, *heading* and *body*, each with a Latin and an
  Arabic family. The font stack lists the Latin family first, so Latin words
  inside Arabic text (product names, model numbers) keep the Latin font and
  Arabic characters fall back to the Arabic family. Hantex Ultra uses Poppins
  with Cairo.
- **Text styles.** Every component uses one of twelve named styles, never a
  raw size. Each style becomes CSS variables
  (`--hx-text-h1-font`, `-size`, `-weight`, `-line-height`, `-tracking`) and
  a class (`.hx-text-h1`). Sizes above 24px shrink smoothly between a 1440px
  and a 360px wide screen, never below 68% of their size.
- **Arabic.** Arabic has its own line heights (`:lang(ar)`) and no letter
  spacing, which would break the joins between letters; Latin passages inside
  Arabic pages (`lang="en"`) restore the Latin values.
- **Readability checks** block publishing like contrast failures: minimum
  sizes per style (body 14px, small text and labels 12px), minimum line
  heights, and an Arabic line height at least the Latin one.
- **Presets.** Brand (Poppins + Cairo), Modern (Inter + IBM Plex Sans
  Arabic), Bold headings (Poppins headings, Inter body), Compact (Inter +
  Tajawal). Applying one replaces the draft's fonts and styles; publishing is
  still a separate step.
- **Older themes** (version 1: two fonts, a base size and a ratio) are
  upgraded automatically when read, keeping their fonts and sizes.
- Only the fonts, scripts and weights the styles use are shipped to the
  site; a weight a font doesn't have uses its nearest file.

## SVG and light/dark

- **On the website**, SVGs (logo, icons, illustrations) are placed inline and
  coloured through the tokens, so they follow the site's theme and the
  visitor's light/dark toggle.
- **Standalone SVG files** in `brand/logo/` — `mark.svg`, `lockup.svg`,
  `wordmark.svg` — switch automatically with the viewer's system setting
  (`prefers-color-scheme`) and accept the CSS variables `--hx-logo-neutral`,
  `--hx-logo-switch`, `--hx-logo-indicator` and `--hx-logo-accent` when
  placed inline. Fixed-colour variants remain for print and documents.
- Verified: the adaptive files render identically to the fixed light and dark
  variants in each mode, and inline overrides take effect.

## Guardrails

- Server-side validation of every token (format, range).
- **Contrast enforcement:** text/background pairs are checked against WCAG
  2.1 AA in both modes; publishing is blocked until failing pairs are fixed.
- **No custom CSS or script fields** — they would bypass security and
  consistency.
- **Fonts only from the curated, self-hosted library.** Files are validated
  and their licences recorded. Adding a font is an Owner-permission action in
  the dashboard (D-027): the file type is checked by content, the font is
  parsed before it is accepted, and it is served with the correct content
  type.
- **Uploaded SVGs** (logos, icons) are parsed and rebuilt from an allow-list
  of drawing elements and attributes.
  - Removed: scripts, event handlers, links, embedded HTML
    (`foreignObject`), external references and CSS `url()`.
  - Size and complexity are limited.
  - The original upload is kept privately and never served.
- **Logo colours** are separate tokens from the site colours; editing them
  requires confirming a brand-guidelines warning, a visibility check warns
  when the logo would be hard to see, and *Reset logo to brand colours* is
  always available.
- New permissions *Appearance: edit drafts*, *Appearance: publish* and
  *Appearance: edit logo colours* (Owner only by default), controlled through
  the roles matrix (D-019); every publish and rollback is audited.

## Limitations

- Photos and other raster images are not recoloured by the theme.
- Many email clients and social networks ignore dark mode; emails and social
  images use one tested appearance generated from the tokens.
- A standalone SVG opened outside the site follows the viewer's system
  setting, not the site's toggle.
