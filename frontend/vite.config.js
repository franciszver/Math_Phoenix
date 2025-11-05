import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    // Production build settings
    outDir: 'dist',
    sourcemap: false,
    // Environment variables are accessed via import.meta.env.VITE_API_URL
    // Set VITE_API_URL during build: VITE_API_URL=https://api.example.com npm run build
  },
  // Ensure public files are copied
  publicDir: 'public'
})

