// The icon's own path data: lucide-react exports it next to each icon. Read
// directly so the favicon needs no react-dom/server - rendering it with
// renderToStaticMarkup pulled ~190 kB of server renderer into the first-paint
// bundle for six <path>s. Favicon.test.js checks this markup still equals what
// renderToStaticMarkup(<ListOrdered>) gives, so a lucide upgrade can't drift.
import { __iconData as listOrdered } from 'lucide-react/dist/esm/icons/list-ordered.mjs';

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// lucide's <svg> for one icon, the same markup its React component draws.
export function iconSvg({ name, node }, { color, size, strokeWidth }) {
  const children = node
    .map(([tag, { key: _key, ...attrs }]) => {
      const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
      return `<${tag}${a}></${tag}>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escapeAttr(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}" aria-hidden="true">${children}</svg>`;
}

export const FAVICON_ICON = listOrdered;

// The browser-tab icon is the sidebar's brand mark (lucide ListOrdered on a
// filled accent square), redrawn whenever the accent changes - so it follows
// Settings -> Appearance like everything else. `fill`/`ink` are the resolved
// --accent-fill / --accent-on values (a data: URL can't read CSS variables).
export function applyFavicon(fill, ink) {
  const icon = iconSvg(listOrdered, { color: ink, size: 22, strokeWidth: 2.5 });
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
