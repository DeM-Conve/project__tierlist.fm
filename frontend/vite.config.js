import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { DEFAULT_APPEARANCE, THEMES } from './src/themes.js'

// The window chrome before the app paints = the default theme's colors.
const defaultTheme = THEMES[DEFAULT_APPEARANCE.theme]

// Where `npm run dev` forwards the API and Google login (same paths nginx
// proxies in Docker). docker-compose.dev.yml sets it to the backend service.
const backend = process.env.BACKEND_ORIGIN || 'http://localhost:48123'
const toBackend = { target: backend }

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': toBackend,
      '/oauth2': toBackend,
      '/login/oauth2': toBackend,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own long-cached chunks: a deploy that only
        // changes app code leaves these hashes alone, so returning visitors
        // re-download just the (much smaller) app chunk.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|react-redux|@reduxjs|redux|immer|reselect)[\\/]/, priority: 30 },
            { name: 'mantine', test: /node_modules[\\/](@mantine|mantine-contextmenu|@floating-ui|react-remove-scroll|react-textarea-autosize)/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/](@tanstack|axios|idb-keyval|lucide-react|colord|react-resizable-panels|react-hotkeys-hook|@bprogress)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    // Installable app ("Install Tierlist.fm" in Chrome/Edge): its own window,
    // launcher icon and taskbar entry. Same origin as the browser tab, so
    // Google login and the YouTube embed behave exactly as they do there.
    VitePWA({
      registerType: 'autoUpdate',
      // Icons come from pwa-assets.config.js (`npx pwa-assets-generator`).
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Tierlist.fm',
        short_name: 'Tierlist.fm',
        description: 'Rank your YouTube playlists into tier lists.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: defaultTheme.surface,
        background_color: defaultTheme.bg,
      },
      workbox: {
        // A new deploy takes over at once - no stale bundle in the app window.
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
