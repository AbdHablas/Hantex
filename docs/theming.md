# Theming — light/dark modes and dashboard-controlled appearance

**Status:** confirmed by the owner (D-021, D-022).

## Goals

- Every public-facing design — pages, components, icons, illustrations,
  logo — works in **light and dark mode**.
- Administrators change **colours, fonts and overall appearance** for all
  public-facing websites from **one place in the dashboard**, and the change
  applies consistently everywhere.
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
| Fonts | Latin and Arabic families from the installed font library, weights, base size and type scale |
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
- **Fonts only from the curated, self-hosted library** (licence-checked,
  validated files). Adding a font to the library is a reviewed change.
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
