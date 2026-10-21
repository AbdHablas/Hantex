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
    expect(css).toContain(`--hx-font-family: "Poppins", "Cairo", system-ui, sans-serif;`);
  });

  it('derives a type scale, radii and motion timing from the settings', () => {
    const theme = clone();
    theme.typography.baseSize = 16;
    theme.typography.scale = 1.25;
    theme.shape.radius = 12;
    theme.motion = 'off';
    const css = themeToCss(theme);
    expect(css).toContain('--hx-font-size-0: 1rem;');
    expect(css).toContain('--hx-font-size-1: 1.25rem;');
    expect(css).toContain('--hx-radius: 12px;');
    expect(css).toContain('--hx-duration-base: 0ms;');
  });

  it('always honours reduced-motion preferences', () => {
    expect(themeToCss(brandTheme)).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
