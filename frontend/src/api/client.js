import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:48123';

// The one axios instance the whole app talks through. TanStack Query is the
// primary data-fetching layer (caching, retries, loading/error state);
// axios is just its HTTP transport, not a separate calling convention - so
// nothing outside src/api/ should import axios directly.
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export { API_BASE };
