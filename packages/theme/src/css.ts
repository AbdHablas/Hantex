import { FONT_LIBRARY } from './fonts';
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

function sharedDeclarations(theme: Theme): string[] {
  const { typography, shape, motion } = theme;
  const latin = FONT_LIBRARY[typography.latin].family;
  const arabic = FONT_LIBRARY[typography.arabic].family;
  const sizes = Array.from({ length: 7 }, (_, step) => {
    const px = typography.baseSize * typography.scale ** step;
    return `--hx-font-size-${step}: ${rem(px)};`;
  });
  const [fast, base, slow] = DURATIONS[motion];
  return [
    // Latin first: Latin text uses the Latin font, Arabic characters fall back to the Arabic font.
    `--hx-font-family: "${latin}", "${arabic}", system-ui, sans-serif;`,
    `--hx-font-size-small: ${rem(typography.baseSize / typography.scale)};`,
    ...sizes,
    `--hx-font-weight-body: ${typography.bodyWeight};`,
    `--hx-font-weight-medium: 500;`,
    `--hx-font-weight-heading: ${typography.headingWeight};`,
    `--hx-radius: ${shape.radius}px;`,
    `--hx-radius-small: ${Math.round(shape.radius / 2)}px;`,
    `--hx-radius-large: ${Math.round(shape.radius * 1.5)}px;`,
    `--hx-duration-fast: ${fast}ms;`,
    `--hx-duration-base: ${base}ms;`,
    `--hx-duration-slow: ${slow}ms;`,
    `--hx-motion-enabled: ${motion === 'off' ? 0 : 1};`,
  ];
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
