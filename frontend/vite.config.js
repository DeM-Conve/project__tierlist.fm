import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { DEFAULT_APPEARANCE, THEMES } from './src/themes.js'

// The window chrome before the app paints = the default theme's colors.
const defaultTheme = THEMES[DEFAULT_APPEARANCE.theme]

// https://vite.dev/config/
export default defineConfig({
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
