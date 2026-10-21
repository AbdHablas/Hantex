import { describe, expect, it } from 'vitest';
import { themeToCss } from './css';
import { brandTheme } from './defaults';

const clone = () => structuredClone(brandTheme);

const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing block ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start) + 1);
};

describe('themeToCss', () => {
  it('emits light values by default and dark values when the system prefers dark', () => {
    const css = themeToCss(brandTheme);
    expect(block(css, ':root')).toContain('--hx-color-background: #F4F6F8;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(block(css, ':root:not([data-theme="light"])')).toContain(
      '--hx-color-background: #1B1E24;',
    );
  });

  it('lets the visitor force either mode with data-theme', () => {
    const css = themeToCss(brandTheme);
    expect(block(css, ':root[data-theme="dark"]')).toContain('--hx-color-text: #F4F6F8;');
    expect(block(css, ':root[data-theme="light"]')).toContain('--hx-color-text: #1B1E24;');
    expect(block(css, ':root[data-theme="dark"]')).toContain('color-scheme: dark;');
  });

  it('starts in dark mode without a media query when dark is the default', () => {
    const theme = clone();
    theme.mode.default = 'dark';
    const css = themeToCss(theme);
    expect(css).not.toContain('prefers-color-scheme');
    expect(block(css, ':root')).toContain('--hx-color-background: #1B1E24;');
  });

  it('exposes the logo colours used by the adaptive SVG logo', () => {
    const css = themeToCss(brandTheme);
    expect(block(css, ':root')).toContain('--hx-logo-neutral: #1B1E24;');
    expect(block(css, ':root[data-theme="dark"]')).toContain('--hx-logo-neutral: #F4F6F8;');
    expect(css).toContain('--hx-logo-switch: #1FB6C9;');
  });

  it('puts the Latin font first so Arabic falls back to the Arabic font per character', () => {
    const css = themeToCss(brandTheme);
    expect(css).toContain(`--hx-font-body: "Poppins", "Cairo", system-ui, sans-serif;`);
    expect(css).toContain('--hx-font-family: var(--hx-font-body);');
  });

  it('turns every text style into variables and a class, with radii and motion timing', () => {
    const theme = clone();
    theme.typography.styles.body.size = 16;
    theme.typography.styles.h1.size = 40;
    theme.typography.styles.h1.letterSpacing = -0.01;
    theme.shape.radius = 12;
    theme.motion = 'off';
    const css = themeToCss(theme);
    expect(css).toContain('--hx-text-body-size: 1rem;');
    expect(css).toContain('--hx-text-h1-font: var(--hx-font-heading);');
    expect(css).toContain('--hx-text-product-title-weight:');
    expect(css).toContain('--hx-font-size-0: 1rem;');
    expect(css).toContain('.hx-text-h1 {');
    expect(css).toContain('--hx-radius: 12px;');
    expect(css).toContain('--hx-duration-base: 0ms;');
  });

  it('shrinks large text smoothly on small screens, never below a readable size', () => {
    const theme = clone();
    theme.typography.styles.display.size = 64;
    const css = themeToCss(theme);
    expect(css).toContain('--hx-text-display-size: clamp(2.75rem, 2.3333rem + 1.8519vw, 4rem);');
  });

  it('gives Arabic its own line heights and no letter spacing, restored for Latin passages', () => {
    const theme = clone();
    theme.typography.styles.h1.lineHeight = 1.15;
    theme.typography.styles.h1.arabicLineHeight = 1.45;
    theme.typography.styles.h1.letterSpacing = -0.01;
    const css = themeToCss(theme);
    expect(block(css, ':lang(ar)')).toContain('--hx-text-h1-line-height: 1.45;');
    expect(block(css, ':lang(ar)')).toContain('--hx-text-h1-tracking: 0em;');
    expect(block(css, ':lang(en)')).toContain('--hx-text-h1-tracking: -0.01em;');
  });

  it('can use different fonts for headings and body text', () => {
    const theme = clone();
    theme.typography.fonts.body = { latin: 'inter', arabic: 'ibm-plex-sans-arabic' };
    const css = themeToCss(theme);
    expect(css).toContain('--hx-font-heading: "Poppins", "Cairo", system-ui, sans-serif;');
    expect(css).toContain(
      '--hx-font-body: "Inter", "IBM Plex Sans Arabic", system-ui, sans-serif;',
    );
  });

  it('always honours reduced-motion preferences', () => {
    expect(themeToCss(brandTheme)).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
