import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Trailing slash matters: '/api/' won't string-prefix-match the SPA's own page
      // route '/apis' the way a bare '/api' would (Vite's proxy match is a plain
      // string prefix, not a path-segment boundary).
      '/api/': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
