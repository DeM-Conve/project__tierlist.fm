// Sub-path hosting. Vite's `base` (BASE_PATH at build time, see
// vite.config.js) is '/' at the site root, '/tierlist.fm/' under one. Every
// URL the app builds for itself goes through here.

/** The prefix the app is served under, no trailing slash: '' at the root. */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');

/** React Router's basename: routes live below the prefix. */
export const ROUTER_BASENAME = BASE_PATH || '/';

/** A path of this app as the browser sees it: appPath('/api') -> '/tierlist.fm/api'. */
export const appPath = (path) => BASE_PATH + path;

/** The full URL of a path of this app, for links people share. */
export const appUrl = (path = '') => window.location.origin + appPath(path);
