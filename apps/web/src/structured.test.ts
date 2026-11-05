import { describe, expect, it } from 'vitest';
import { breadcrumbLd, itemListLd, jsonLdText } from './structured';

describe('structured data (D-053)', () => {
  it('can never end its script element early', () => {
    const text = jsonLdText({ name: '</script><script>alert(1)</script>', note: 'a b' });
    expect(text).not.toContain('<');
    expect(text).not.toContain(' ');
    expect(JSON.parse(text)).toEqual({
      name: '</script><script>alert(1)</script>',
      note: 'a b',
    });
  });

  it('builds breadcrumbs only with at least two named steps', () => {
    expect(breadcrumbLd([{ name: 'Home', url: 'https://x.test/' }])).toBeNull();
    expect(
      breadcrumbLd([
        { name: 'Home', url: 'https://x.test/' },
        { name: '', url: 'https://x.test/a/' },
        { name: 'Switch', url: 'https://x.test/product/s/' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.test/' },
        { '@type': 'ListItem', position: 2, name: 'Switch', item: 'https://x.test/product/s/' },
      ],
    });
    expect(itemListLd([])).toBeNull();
  });
});
