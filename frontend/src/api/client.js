import axios from 'axios';

// Same origin by default: in Docker nginx proxies /api/ and the login paths to
// the backend, under `npm run dev` Vite does (vite.config.js `server.proxy`).
// VITE_API_BASE (e.g. http://localhost:48123) only for calling a backend
// directly from a dev build. Served under a sub-path (TIERLIST_BASE_PATH,
// baked in as Vite's `base`), every backend path carries it: BASE_PATH is
// '' at the root, '/tierlist.fm' under one.
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');
const API_BASE = import.meta.env.VITE_API_BASE || BASE_PATH;

// The one axios instance the whole app talks through. TanStack Query is the
// primary data-fetching layer (caching, retries, loading/error state);
// axios is just its HTTP transport, not a separate calling convention - so
// nothing outside src/api/ should import axios directly.
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export { API_BASE, BASE_PATH };

// The human-readable reason from a failed API call: the backend's
// ProblemDetail `detail` (e.g. YouTube's quota is used up), else `fallback`.
export function errorMessage(error, fallback) {
  return error?.response?.data?.detail ?? fallback;
}
