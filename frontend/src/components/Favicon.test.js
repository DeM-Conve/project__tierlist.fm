import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListOrdered } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { applyFavicon, FAVICON_ICON, iconSvg } from './Favicon';

describe('favicon', () => {
  it('draws the same svg as the lucide component, without react-dom/server in the app', () => {
    const props = { color: '#0f0', size: 22, strokeWidth: 2.5 };
    expect(iconSvg(FAVICON_ICON, props)).toBe(renderToStaticMarkup(createElement(ListOrdered, props)));
  });

  it('sets the tab icon to the accent square', () => {
    applyFavicon('#123456', '#ffffff');
    const href = document.querySelector('link[rel="icon"]').href;
    const svg = decodeURIComponent(href.replace('data:image/svg+xml,', ''));
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('lucide-list-ordered');
  });
});
