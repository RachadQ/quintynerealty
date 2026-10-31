import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const mapsEnv = loadEnv(mode, process.cwd(), 'GOOGLE_MAPS_')
  return {
  // This browser key is intentionally public. Never expose the entire environment.
  define: {
    'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(mapsEnv.GOOGLE_MAPS_API_KEY || ''),
  },
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    },
  },
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  }
})
