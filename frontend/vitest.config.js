import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Tests only (vite.config.js is the app build, with the PWA plugin).
// `npm test` runs everything once; `npm run test:watch` while coding.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
})
