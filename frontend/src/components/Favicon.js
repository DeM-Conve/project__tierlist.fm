import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListOrdered } from 'lucide-react';

// The browser-tab icon is the sidebar's brand mark (lucide ListOrdered on a
// filled accent square), redrawn whenever the accent changes - so it follows
// Settings -> Appearance like everything else. `fill`/`ink` are the resolved
// --accent-fill / --accent-on values (a data: URL can't read CSS variables).
export function applyFavicon(fill, ink) {
  const icon = renderToStaticMarkup(createElement(ListOrdered, { color: ink, size: 22, strokeWidth: 2.5 }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><g transform="translate(5 5)">${icon}</g></svg>`;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
