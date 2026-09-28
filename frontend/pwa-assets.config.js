import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the installable app's PNG icons from the favicon:
// `npx pwa-assets-generator`.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
