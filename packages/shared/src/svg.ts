/**
 * The SVG cleaner (docs/security.md, D-027): an uploaded SVG is parsed with a small, strict
 * parser and rebuilt from an allow-list of drawing elements and attributes, with every value
 * checked. Nothing is copied through unchecked: no scripts, event handlers, links, embedded
 * HTML, styles, external references or entities survive, because the output contains only what
 * this file writes. Runs in Workers and browsers alike (no DOM needed).
 */

export interface SvgLimits {
  /** Largest input, in bytes of UTF-16 text (roughly characters). */
  maxLength: number;
  maxElements: number;
  maxDepth: number;
}

export const SVG_LIMITS: SvgLimits = { maxLength: 512 * 1024, maxElements: 5000, maxDepth: 32 };

export interface SvgOptions {
  /**
   * A class to give each element drawn with a colour, so a style sheet can recolour it (adaptive
   * logos, D-027). Returning null leaves the element as it is. Only names made of lowercase
   * letters, digits and hyphens starting with `hx-` are written.
   */
  paint?: (property: PaintProperty, colour: string) => string | null;
}

export type PaintProperty = 'fill' | 'stroke' | 'stop-color';

export type SvgResult =
  | {
      ok: true;
      /** The rebuilt file. */
      svg: string;
      /** viewBox as [x, y, width, height]. */
      viewBox: [number, number, number, number];
      /** The distinct colours it draws with (lowercase #rrggbb), for mapping to logo tokens. */
      colours: string[];
      /** What was left out, e.g. "script", "style", "onclick", for telling the person. */
      removed: string[];
    }
  | { ok: false; reason: SvgProblem };

export type SvgProblem =
  'too-large' | 'too-complex' | 'not-svg' | 'malformed' | 'doctype' | 'no-size' | 'empty';

/* ------------------------------------------ Parsing ------------------------------------------ */

interface Element {
  name: string;
  attrs: Map<string, string>;
  children: Node[];
}
type Node = Element | { text: string };

class Malformed extends Error {
  constructor(readonly reason: SvgProblem) {
    super(reason);
  }
}

const NAME = /^[A-Za-z_][\w.:-]*/;
const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** The five XML entities and numeric references; anything else (custom entities) is refused. */
function decode(text: string): string {
  return text.replace(/&([^;\s&]{1,10});/g, (whole, ref: string) => {
    if (ref in ENTITIES) return ENTITIES[ref]!;
    const code = /^#x[0-9a-f]{1,6}$/i.test(ref)
      ? parseInt(ref.slice(2), 16)
      : /^#[0-9]{1,7}$/.test(ref)
        ? parseInt(ref.slice(1), 10)
        : NaN;
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) throw new Malformed('malformed');
    return String.fromCodePoint(code);
  });
}

function parse(input: string, limits: SvgLimits): Element {
  let i = 0;
  let count = 0;
  const root: Element = { name: '#root', attrs: new Map(), children: [] };
  const stack: Element[] = [root];
  const skip = (pattern: RegExp) => {
    const m = pattern.exec(input.slice(i));
    if (m) i += m[0].length;
    return m;
  };
  // An optional byte-order mark and XML declaration.
  if (input.charCodeAt(0) === 0xfeff) i = 1;
  skip(/^\s*<\?xml\s[^?]*\?>/);
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    const text = input.slice(i, lt === -1 ? input.length : lt);
    if (text) stack.at(-1)!.children.push({ text: decode(text) });
    if (lt === -1) break;
    i = lt;
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      if (end === -1) throw new Malformed('malformed');
      i = end + 3;
    } else if (/^<!doctype|^<!entity|^<!\[cdata\[/i.test(input.slice(i, i + 9))) {
      // Document types and entities could expand or fetch content; CDATA has no place in a logo.
      throw new Malformed('doctype');
    } else if (input.startsWith('<?', i) || input.startsWith('<!', i)) {
      throw new Malformed('malformed');
    } else if (input.startsWith('</', i)) {
      i += 2;
      const name = skip(NAME)?.[0];
      if (!skip(/^\s*>/) || !name) throw new Malformed('malformed');
      const open = stack.pop();
      if (!open || open === root || open.name !== name) throw new Malformed('malformed');
    } else {
      i += 1;
      const name = skip(NAME)?.[0];
      if (!name) throw new Malformed('malformed');
      const element: Element = { name, attrs: new Map(), children: [] };
      stack.at(-1)!.children.push(element);
      for (;;) {
        skip(/^\s+/);
        if (skip(/^\/>/)) break;
        if (skip(/^>/)) {
          stack.push(element);
          break;
        }
        const attr = skip(/^([A-Za-z_][\w.:-]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/);
        if (!attr) throw new Malformed('malformed');
        if (element.attrs.has(attr[1]!)) throw new Malformed('malformed');
        element.attrs.set(attr[1]!, decode(attr[3] ?? attr[4] ?? ''));
      }
      if (++count > limits.maxElements) throw new Malformed('too-complex');
      if (stack.length > limits.maxDepth + 1) throw new Malformed('too-complex');
    }
  }
  if (stack.length !== 1) throw new Malformed('malformed');
  return root;
}

/* ---------------------------------------- Allow-lists ---------------------------------------- */

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
const LENGTH = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px|%)?$/i;
const NUMBERS = /^[-+0-9.eE,\s]*$/;
const ID = /^[A-Za-z][\w.-]{0,63}$/;
const LOCAL_URL = /^url\(\s*#([A-Za-z][\w.-]{0,63})\s*\)$/;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB =
  /^rgba?\(\s*[0-9.]+%?\s*[,\s]\s*[0-9.]+%?\s*[,\s]\s*[0-9.]+%?\s*(?:[,/]\s*[0-9.]+%?\s*)?\)$/i;
/** The CSS colour keywords that hold no colour of their own. */
const KEYWORDS = new Set(['none', 'transparent', 'currentcolor']);
/**
 * CSS named colours are letters only, so harmless, and any is accepted; the common ones are known
 * by value for the colour list.
 */
const NAMED_COLOUR = /^[a-z]{3,25}$/i;
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  navy: '#000080',
  silver: '#c0c0c0',
};

/** A colour as #rrggbb, or null when it isn't a plain colour (none, currentColor, a gradient). */
function hexOf(value: string): string | null {
  const v = value.toLowerCase();
  if (HEX.test(v)) {
    const digits = v.slice(1);
    const full =
      digits.length <= 4 ? [...digits.slice(0, 3)].map((d) => d + d).join('') : digits.slice(0, 6);
    return `#${full}`;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3);
    const channel = (p: string) =>
      Math.round(
        Math.min(255, Math.max(0, p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p))),
      );
    return `#${parts.map((p) => channel(p).toString(16).padStart(2, '0')).join('')}`;
  }
  return NAMED[v] ?? null;
}

const colour = (v: string) =>
  v.length <= 64 &&
  (HEX.test(v) || RGB.test(v) || KEYWORDS.has(v.toLowerCase()) || NAMED_COLOUR.test(v))
    ? v
    : null;
/** A colour, or a gradient or pattern defined in the same file (`url(#id)`). */
const paint = (v: string) => colour(v) ?? (LOCAL_URL.test(v) ? v : null);
const oneOf =
  (...values: string[]) =>
  (v: string) =>
    values.includes(v) ? v : null;
const pattern =
  (re: RegExp, max = 200) =>
  (v: string) =>
    v.length <= max && re.test(v) ? v : null;
const opacity = pattern(/^(?:0|1|0?\.\d+|1\.0+|\d{1,3}%)$/);

const TRANSFORM =
  /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9.eE,\s]*\)\s*,?)*\s*$/;

type Check = (value: string) => string | null;

const length = pattern(LENGTH, 30);
const transform = pattern(TRANSFORM, 2000);
const identifier = pattern(ID, 64);

/** Presentation properties: allowed as attributes and read from `style` and class rules. */
const PRESENTATION: Record<string, Check> = {
  fill: paint,
  stroke: paint,
  'stroke-width': length,
  'stroke-linecap': oneOf('butt', 'round', 'square'),
  'stroke-linejoin': oneOf('miter', 'round', 'bevel', 'arcs', 'miter-clip'),
  'stroke-miterlimit': pattern(NUMBER, 30),
  'stroke-dasharray': pattern(/^(?:none|[-+0-9.eE,\s%px]+)$/, 200),
  'stroke-dashoffset': length,
  'fill-rule': oneOf('nonzero', 'evenodd'),
  'clip-rule': oneOf('nonzero', 'evenodd'),
  opacity,
  'fill-opacity': opacity,
  'stroke-opacity': opacity,
  'stop-color': colour,
  'stop-opacity': opacity,
  'clip-path': pattern(LOCAL_URL, 80),
};

const GEOMETRY: Record<string, Check> = {
  x: length,
  y: length,
  width: length,
  height: length,
  rx: length,
  ry: length,
  cx: length,
  cy: length,
  r: length,
  x1: length,
  y1: length,
  x2: length,
  y2: length,
  fx: length,
  fy: length,
  offset: length,
};

const COMMON: Record<string, Check> = {
  ...PRESENTATION,
  id: identifier,
  transform,
};

/** Which attributes each kept element may carry. Elements not listed are left out entirely. */
const ELEMENTS: Record<string, Record<string, Check>> = {
  svg: {
    ...COMMON,
    viewBox: pattern(NUMBERS, 100),
    width: length,
    height: length,
    preserveAspectRatio: pattern(/^[A-Za-z\s]{1,40}$/, 40),
  },
  g: COMMON,
  defs: {},
  title: {},
  desc: {},
  path: { ...COMMON, d: pattern(/^[MmZzLlHhVvCcSsQqTtAa0-9eE.,\s+-]*$/, 200_000) },
  rect: { ...COMMON, ...GEOMETRY },
  circle: { ...COMMON, ...GEOMETRY },
  ellipse: { ...COMMON, ...GEOMETRY },
  line: { ...COMMON, ...GEOMETRY },
  polyline: { ...COMMON, points: pattern(NUMBERS, 100_000) },
  polygon: { ...COMMON, points: pattern(NUMBERS, 100_000) },
  clipPath: {
    id: identifier,
    transform,
    clipPathUnits: oneOf('userSpaceOnUse', 'objectBoundingBox'),
  },
  linearGradient: {
    ...GEOMETRY,
    id: identifier,
    gradientUnits: oneOf('userSpaceOnUse', 'objectBoundingBox'),
    gradientTransform: transform,
    spreadMethod: oneOf('pad', 'reflect', 'repeat'),
  },
  radialGradient: {
    ...GEOMETRY,
    id: identifier,
    gradientUnits: oneOf('userSpaceOnUse', 'objectBoundingBox'),
    gradientTransform: transform,
    spreadMethod: oneOf('pad', 'reflect', 'repeat'),
  },
  stop: { offset: length, 'stop-color': colour, 'stop-opacity': opacity },
};

/** Elements whose text is kept (as text, escaped); every other element's text is dropped. */
const TEXT_ELEMENTS = new Set(['title', 'desc']);

/* --------------------------------------- Class styles --------------------------------------- */

/** `prop: value; …` declarations, kept only for presentation properties with valid values. */
function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of css.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    const check = PRESENTATION[prop];
    const ok = check?.(value);
    if (ok) out.set(prop, ok);
  }
  return out;
}

/**
 * Design tools write colours as class rules (`.cls-1{fill:#1b1e24}`). Only plain `.class`
 * selectors are read, and only presentation properties; everything else in a style sheet
 * (@import, @font-face, url(), other selectors) is ignored.
 */
function classRules(root: Element): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  const visit = (node: Node) => {
    if ('text' in node) return;
    if (node.name === 'style') {
      const css = node.children
        .map((c) => ('text' in c ? c.text : ''))
        .join('')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const decls = declarations(match[2]!);
        for (const selector of match[1]!.split(',')) {
          const cls = /^\s*\.([A-Za-z_][\w-]*)\s*$/.exec(selector)?.[1];
          if (!cls) continue;
          const existing = rules.get(cls) ?? new Map<string, string>();
          for (const [k, v] of decls) existing.set(k, v);
          rules.set(cls, existing);
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return rules;
}

/* ---------------------------------------- Rebuilding ---------------------------------------- */

const escapeAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseViewBox(value: string | undefined): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  return w > 0 && h > 0 ? [x, y, w, h] : null;
}

const CLASS_NAME = /^hx-[a-z0-9-]{1,40}$/;

export function sanitizeSvg(
  input: string,
  limits: SvgLimits = SVG_LIMITS,
  options: SvgOptions = {},
): SvgResult {
  if (input.length > limits.maxLength) return { ok: false, reason: 'too-large' };
  let root: Element;
  try {
    root = parse(input, limits);
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, reason: error.reason };
    throw error;
  }
  const svg = root.children.filter((c): c is Element => !('text' in c));
  if (svg.length !== 1 || svg[0]!.name !== 'svg') return { ok: false, reason: 'not-svg' };
  const top = svg[0]!;
  const xmlns = top.attrs.get('xmlns');
  if (xmlns !== undefined && xmlns !== 'http://www.w3.org/2000/svg') {
    return { ok: false, reason: 'not-svg' };
  }

  const viewBox =
    parseViewBox(top.attrs.get('viewBox')) ??
    (() => {
      const w = parseFloat(top.attrs.get('width') ?? '');
      const h = parseFloat(top.attrs.get('height') ?? '');
      const unitless = (v: string | undefined) =>
        v !== undefined && /^[0-9.]+(px)?$/.test(v.trim());
      return unitless(top.attrs.get('width')) && unitless(top.attrs.get('height')) && w > 0 && h > 0
        ? ([0, 0, w, h] as [number, number, number, number])
        : null;
    })();
  if (!viewBox) return { ok: false, reason: 'no-size' };

  const rules = classRules(root);
  const removed = new Set<string>();
  const colours = new Set<string>();
  let drawn = 0;

  const build = (element: Element, depth: number): string => {
    const allowed = ELEMENTS[element.name];
    if (!allowed) {
      removed.add(element.name);
      return '';
    }
    // Class rules first, then the element's own attributes, then its style attribute: the
    // order in which a browser would let them win.
    const props = new Map<string, string>();
    for (const cls of (element.attrs.get('class') ?? '').split(/\s+/)) {
      for (const [k, v] of rules.get(cls) ?? []) props.set(k, v);
    }
    for (const [name, value] of element.attrs) {
      if (name === 'class' || name === 'style' || name === 'xmlns' || name === 'version') continue;
      if (element.name === 'svg' && (name === 'x' || name === 'y')) continue;
      if (name === 'xml:space' || name.startsWith('xmlns:') || name.startsWith('data-')) continue;
      const check = allowed[name];
      const ok = check?.(value.trim());
      if (ok) props.set(name, ok);
      else removed.add(/^on/i.test(name) ? 'event handlers' : name);
    }
    for (const [k, v] of declarations(element.attrs.get('style') ?? '')) {
      if (allowed[k]) props.set(k, v);
    }
    if (element.name === 'svg') {
      props.set('viewBox', viewBox.join(' '));
      props.delete('width');
      props.delete('height');
    }
    const classes: string[] = [];
    for (const key of ['fill', 'stroke', 'stop-color'] as const) {
      const hex = props.has(key) ? hexOf(props.get(key)!) : null;
      if (!hex) continue;
      colours.add(hex);
      const cls = options.paint?.(key, hex);
      if (cls && CLASS_NAME.test(cls) && !classes.includes(cls)) classes.push(cls);
    }
    if (
      element.name !== 'svg' &&
      depth > 0 &&
      !['defs', 'title', 'desc', 'g'].includes(element.name)
    ) {
      drawn++;
    }

    if (classes.length > 0) props.set('class', classes.join(' '));
    const attrs = [...props].map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    const inner = element.children
      .map((child) =>
        'text' in child
          ? TEXT_ELEMENTS.has(element.name)
            ? escapeText(child.text)
            : ''
          : build(child, depth + 1),
      )
      .join('');
    const open =
      element.name === 'svg'
        ? `svg xmlns="http://www.w3.org/2000/svg"${attrs}`
        : `${element.name}${attrs}`;
    return inner ? `<${open}>${inner}</${element.name}>` : `<${open}/>`;
  };

  const out = build(top, 0);
  if (drawn === 0) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    svg: out,
    viewBox,
    colours: [...colours].sort(),
    removed: [...removed].sort(),
  };
}
