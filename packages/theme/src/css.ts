import { FONT_LIBRARY } from './fonts';
import { TEXT_STYLES, type TextStyle, type Typography } from './typography';
import { COLOR_TOKENS, type Mode, type Theme } from './schema';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const rem = (px: number) => `${Number((px / 16).toFixed(4))}rem`;

const SHADOWS: Record<Theme['depth']['shadow'], Record<Mode, [string, string]>> = {
  none: { light: ['none', 'none'], dark: ['none', 'none'] },
  soft: {
    light: [
      '0 1px 2px rgb(27 30 36 / 0.06), 0 2px 8px rgb(27 30 36 / 0.06)',
      '0 12px 32px rgb(27 30 36 / 0.12)',
    ],
    dark: ['0 1px 2px rgb(0 0 0 / 0.4)', '0 12px 32px rgb(0 0 0 / 0.45)'],
  },
  strong: {
    light: ['0 2px 6px rgb(27 30 36 / 0.12)', '0 20px 48px rgb(27 30 36 / 0.2)'],
    dark: ['0 2px 6px rgb(0 0 0 / 0.55)', '0 20px 48px rgb(0 0 0 / 0.6)'],
  },
};

const DURATIONS: Record<Theme['motion'], [number, number, number]> = {
  off: [0, 0, 0],
  subtle: [100, 180, 320],
  full: [150, 260, 520],
};

function modeDeclarations(theme: Theme, mode: Mode): string[] {
  const colors = theme.colors[mode];
  const logo = theme.logo[mode];
  const [shadow1, shadow2] = SHADOWS[theme.depth.shadow][mode];
  return [
    `color-scheme: ${mode};`,
    ...COLOR_TOKENS.map((token) => `--hx-color-${kebab(token)}: ${colors[token]};`),
    `--hx-logo-neutral: ${logo.neutral};`,
    `--hx-logo-switch: ${logo.switch};`,
    `--hx-logo-indicator: ${logo.indicator};`,
    `--hx-logo-accent: ${logo.accent};`,
    `--hx-shadow-1: ${shadow1};`,
    `--hx-shadow-2: ${shadow2};`,
  ];
}

const family = (pair: Typography['fonts']['body']) =>
  // Latin first: Latin text uses the Latin font, Arabic characters fall back to the Arabic font.
  `"${FONT_LIBRARY[pair.latin].family}", "${FONT_LIBRARY[pair.arabic].family}", system-ui, sans-serif`;

/** Sizes above 24px shrink smoothly between a 1440px and a 360px wide screen. */
function fluid(px: number): string {
  if (px <= 24) return rem(px);
  const min = Math.max(20, Math.round(px * 0.68));
  const slope = (px - min) / (1440 - 360);
  const intercept = min - slope * 360;
  return `clamp(${rem(min)}, ${rem(intercept)} + ${Number((slope * 100).toFixed(4))}vw, ${rem(px)})`;
}

const styleVar = (id: string, prop: string) => `--hx-text-${kebab(id)}-${prop}`;

function styleDeclarations(id: string, style: TextStyle): string[] {
  return [
    `${styleVar(id, 'font')}: var(--hx-font-${style.font});`,
    `${styleVar(id, 'size')}: ${fluid(style.size)};`,
    `${styleVar(id, 'weight')}: ${style.weight};`,
    `${styleVar(id, 'line-height')}: ${style.lineHeight};`,
    `${styleVar(id, 'tracking')}: ${style.letterSpacing}em;`,
  ];
}

function sharedDeclarations(theme: Theme): string[] {
  const { typography, shape, motion } = theme;
  const { styles } = typography;
  // Older component styles use a numbered size scale; it follows the text styles (0 = body,
  // 4 = heading 1).
  const ratio = (styles.h1.size / styles.body.size) ** (1 / 4);
  const sizes = Array.from(
    { length: 7 },
    (_, step) => `--hx-font-size-${step}: ${fluid(styles.body.size * ratio ** step)};`,
  );
  const [fast, base, slow] = DURATIONS[motion];
  return [
    `--hx-font-heading: ${family(typography.fonts.heading)};`,
    `--hx-font-body: ${family(typography.fonts.body)};`,
    `--hx-font-family: var(--hx-font-body);`,
    ...TEXT_STYLES.flatMap((id) => styleDeclarations(id, styles[id])),
    `--hx-font-size-small: ${rem(styles.small.size)};`,
    ...sizes,
    `--hx-font-weight-body: ${styles.body.weight};`,
    `--hx-font-weight-medium: 500;`,
    `--hx-font-weight-heading: ${styles.h1.weight};`,
    `--hx-radius: ${shape.radius}px;`,
    `--hx-radius-small: ${Math.round(shape.radius / 2)}px;`,
    `--hx-radius-large: ${Math.round(shape.radius * 1.5)}px;`,
    `--hx-duration-fast: ${fast}ms;`,
    `--hx-duration-base: ${base}ms;`,
    `--hx-duration-slow: ${slow}ms;`,
    `--hx-motion-enabled: ${motion === 'off' ? 0 : 1};`,
  ];
}

/** Arabic: its own line heights and no letter spacing; Latin passages inside restore theirs. */
function scriptDeclarations(typography: Typography, script: 'latin' | 'arabic'): string[] {
  return TEXT_STYLES.flatMap((id) => {
    const style = typography.styles[id];
    return script === 'arabic'
      ? [
          `${styleVar(id, 'line-height')}: ${style.arabicLineHeight};`,
          `${styleVar(id, 'tracking')}: 0em;`,
        ]
      : [
          `${styleVar(id, 'line-height')}: ${style.lineHeight};`,
          `${styleVar(id, 'tracking')}: ${style.letterSpacing}em;`,
        ];
  });
}

/** `.hx-text-h1` and so on: one class per text style for components to use. */
function styleClasses(): string[] {
  return TEXT_STYLES.map((id) =>
    rule(`.hx-text-${kebab(id)}`, [
      `font-family: var(${styleVar(id, 'font')});`,
      `font-size: var(${styleVar(id, 'size')});`,
      `font-weight: var(${styleVar(id, 'weight')});`,
      `line-height: var(${styleVar(id, 'line-height')});`,
      `letter-spacing: var(${styleVar(id, 'tracking')});`,
    ]),
  );
}

const rule = (selector: string, declarations: string[]) =>
  `${selector} {\n${declarations.map((d) => `  ${d}`).join('\n')}\n}`;

/**
 * Turns a theme into the single stylesheet every public page uses (docs/theming.md).
 * Visitors can force a mode with `data-theme="light" | "dark"` on the root element.
 */
export function themeToCss(theme: Theme): string {
  const light = modeDeclarations(theme, 'light');
  const dark = modeDeclarations(theme, 'dark');
  const defaultMode = theme.mode.default === 'dark' ? dark : light;

  const blocks = [
    rule(':root', [...sharedDeclarations(theme), ...defaultMode]),
    rule(':root[data-theme="light"]', light),
    rule(':root[data-theme="dark"]', dark),
    rule(':lang(ar)', scriptDeclarations(theme.typography, 'arabic')),
    rule(':lang(en)', scriptDeclarations(theme.typography, 'latin')),
    ...styleClasses(),
  ];
  if (theme.mode.default === 'system') {
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n${rule(':root:not([data-theme="light"])', dark)}\n}`,
    );
  }
  blocks.push(
    `@media (prefers-reduced-motion: reduce) {\n${rule(':root', [
      '--hx-duration-fast: 0ms;',
      '--hx-duration-base: 0ms;',
      '--hx-duration-slow: 0ms;',
      '--hx-motion-enabled: 0;',
    ])}\n}`,
  );
  return `${blocks.join('\n\n')}\n`;
}
