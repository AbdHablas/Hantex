import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './svg';

const wrap = (inner: string, attrs = 'viewBox="0 0 10 10"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;
const clean = (input: string) => {
  const result = sanitizeSvg(input);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
};
const brand = (file: string) =>
  readFileSync(new URL(`../../../brand/logo/${file}`, import.meta.url), 'utf8');

describe('SVG cleaner', () => {
  it('keeps a real logo’s shapes and lists its colours', () => {
    const result = clean(brand('mark.svg'));
    expect(result.viewBox).toEqual([0, 0, 120, 120]);
    expect(result.colours).toEqual(expect.arrayContaining(['#1b1e24', '#1fb6c9', '#f4f6f8']));
    expect(result.svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 120 120">/,
    );
    expect(result.svg).toContain('<path');
    expect(result.svg).toContain('<title>Hantex Ultra</title>');
    // Its style sheet isn't copied; the colours it gave are drawn by attributes instead.
    expect(result.svg).not.toContain('<style');
    expect(result.removed).toContain('style');
  });

  it('gives the same file when cleaned twice', () => {
    for (const file of ['mark.svg', 'lockup.svg', 'wordmark.svg']) {
      const once = clean(brand(file)).svg;
      expect(clean(once).svg, file).toBe(once);
    }
  });

  it('turns design-tool class rules and style attributes into plain attributes', () => {
    const result = clean(
      `<?xml version="1.0" encoding="UTF-8"?>
      <!-- Generator: a design tool -->
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="200px" height="200px">
        <defs><style>.cls-1{fill:#1B1E24;} .cls-2, .cls-3 { stroke: rgb(31, 182, 201); stroke-width: 2 } svg .x{fill:red}</style></defs>
        <rect class="cls-1" width="10" height="10"/>
        <circle class="cls-2" cx="5" cy="5" r="2" style="fill:none;opacity:.5"/>
      </svg>`,
    );
    expect(result.svg).toContain('<rect fill="#1B1E24" width="10" height="10"/>');
    expect(result.svg).toContain(
      '<circle stroke="rgb(31, 182, 201)" stroke-width="2" cx="5" cy="5" r="2" fill="none" opacity=".5"/>',
    );
    expect(result.colours).toEqual(['#1b1e24', '#1fb6c9']);
    // Sizes come from the viewBox; the page decides how large it is drawn.
    expect(result.svg).not.toMatch(/width="200px"/);
  });

  it('takes its size from width and height when there is no viewBox', () => {
    expect(
      clean(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"><rect width="1" height="1"/></svg>',
      ).viewBox,
    ).toEqual([0, 0, 48, 24]);
    expect(
      sanitizeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="5cm"><rect width="1" height="1"/></svg>',
      ),
    ).toEqual({ ok: false, reason: 'no-size' });
  });

  it('removes scripts, event handlers, links, embedded HTML and external files', () => {
    const result = clean(
      wrap(`
        <script>alert(1)</script>
        <script href="https://evil.example/x.js"/>
        <rect width="10" height="10" onload="alert(1)" onclick="alert(2)" fill="#000"/>
        <a href="javascript:alert(1)"><rect width="5" height="5"/></a>
        <a xlink:href="https://evil.example"><path d="M0 0L1 1"/></a>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>
        <image href="https://evil.example/track.png" width="10" height="10"/>
        <use href="#a"/><use xlink:href="https://evil.example/sprite.svg#a"/>
        <iframe src="https://evil.example"/>
        <animate attributeName="href" to="javascript:alert(1)"/>
        <set attributeName="onmouseover" to="alert(1)"/>
        <style>@import url(https://evil.example/x.css); .a{fill:url(https://evil.example/p)}</style>
        <circle r="1" fill="url(https://evil.example/p)" style="fill:url(javascript:alert(1));stroke:expression(alert(1))" data-x="1"/>
      `),
    );
    const svg = result.svg.toLowerCase();
    for (const banned of [
      'script',
      'onload',
      'onclick',
      'javascript',
      'href',
      'foreignobject',
      '<img',
      '<image',
      '<use',
      'iframe',
      'animate',
      '<set',
      'evil',
      '@import',
      'expression',
      'data-x',
      '<a',
    ]) {
      expect(svg, banned).not.toContain(banned);
    }
    expect(result.removed).toEqual(
      expect.arrayContaining([
        'script',
        'event handlers',
        'a',
        'foreignObject',
        'image',
        'use',
        'style',
      ]),
    );
    expect(result.svg).toContain('<rect width="10" height="10" fill="#000"/>');
  });

  it('keeps gradients and clip paths that point inside the file only', () => {
    const result = clean(
      wrap(`
        <defs>
          <linearGradient id="g1" x1="0" x2="1" href="https://evil.example/g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#00f"/></linearGradient>
          <clipPath id="c1"><rect width="5" height="5"/></clipPath>
        </defs>
        <rect width="10" height="10" fill="url(#g1)" clip-path="url(#c1)"/>
      `),
    );
    expect(result.svg).toContain('fill="url(#g1)"');
    expect(result.svg).toContain('clip-path="url(#c1)"');
    expect(result.svg).not.toContain('evil');
    expect(result.colours).toEqual(['#0000ff', '#ff0000']);
  });

  it('refuses document types and entities, which could expand or fetch content', () => {
    for (const input of [
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${wrap('<title>&x;</title><rect width="1" height="1"/>')}`,
      `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>${wrap('<title>&b;</title>')}`,
      wrap('<title><![CDATA[<script>alert(1)</script>]]></title><rect width="1" height="1"/>'),
    ]) {
      expect(sanitizeSvg(input).ok, input.slice(0, 40)).toBe(false);
    }
    expect(sanitizeSvg(wrap('<title>&unknown;</title><rect width="1" height="1"/>'))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('keeps titles as text, escaped', () => {
    const result = clean(
      wrap('<title>A &amp; B &lt;script&gt; &#x41;</title><rect width="1" height="1"/>'),
    );
    expect(result.svg).toContain('<title>A &amp; B &lt;script&gt; A</title>');
  });

  it('refuses what isn’t a well-formed SVG', () => {
    for (const [input, reason] of [
      ['<html><body/></html>', 'not-svg'],
      [
        '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
        'not-svg',
      ],
      [`${wrap('<rect width="1" height="1"/>')}${wrap('<rect width="1" height="1"/>')}`, 'not-svg'],
      [wrap('<g><rect width="1" height="1"/>'), 'malformed'],
      [wrap('<g></rect>'), 'malformed'],
      [wrap('<rect width="1" width="2"/>'), 'malformed'],
      [wrap('<rect width=1/>'), 'malformed'],
      [wrap('<?php echo 1; ?><rect width="1" height="1"/>'), 'malformed'],
      [wrap('<title>only a title</title>'), 'empty'],
      ['', 'not-svg'],
    ] as const) {
      expect(sanitizeSvg(input), input.slice(0, 60)).toEqual({ ok: false, reason });
    }
  });

  it('checks every value, not only the attribute names', () => {
    const result = clean(
      wrap(
        '<path d="M0 0 L 10 10 Z" transform="translate(1,2) rotate(45)"/>' +
          '<path d="M0 0&quot; onload=&quot;alert(1)" transform="url(#x)"/>' +
          '<rect width="10px" height="50%" x="-1e2" rx="calc(1px)" opacity="2"/>',
      ),
    );
    expect(result.svg).toContain(
      '<path d="M0 0 L 10 10 Z" transform="translate(1,2) rotate(45)"/>',
    );
    expect(result.svg).toContain('<path/>');
    expect(result.svg).toContain('<rect width="10px" height="50%" x="-1e2"/>');
    expect(result.svg).not.toContain('onload');
  });

  it('limits size and complexity', () => {
    expect(sanitizeSvg(wrap(' '.repeat(600_000)))).toEqual({ ok: false, reason: 'too-large' });
    expect(sanitizeSvg(wrap('<rect width="1" height="1"/>'.repeat(6000)))).toEqual({
      ok: false,
      reason: 'too-complex',
    });
    expect(
      sanitizeSvg(wrap(`${'<g>'.repeat(40)}<rect width="1" height="1"/>${'</g>'.repeat(40)}`)),
    ).toEqual({
      ok: false,
      reason: 'too-complex',
    });
  });

  it('stays fast on values made to make pattern checks crawl', () => {
    for (const [name, inner] of Object.entries({
      transform: `<g transform="${'translate(1) '.repeat(150)}translate(${' '.repeat(100)}x"/>`,
      rgb: `<rect fill="rgb(1${' '.repeat(20_000)},"/>`,
      dash: `<rect stroke-dasharray="${'1 '.repeat(20_000)}x"/>`,
      style: `<rect style="${'fill:#000;'.repeat(20_000)}"/>`,
      css: `<style>${'.a,'.repeat(50_000)}{fill:red}</style>`,
      entities: `<title>${'&amp;'.repeat(50_000)}</title>`,
    })) {
      const started = performance.now();
      sanitizeSvg(wrap(`${inner}<rect width="1" height="1"/>`));
      expect(performance.now() - started, name).toBeLessThan(500);
    }
  });
});
