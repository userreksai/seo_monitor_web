import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 8889,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_API_URL || 'http://127.0.0.1:10001',
        changeOrigin: true,
        headers: process.env.VITE_BACKEND_API_TOKEN
          ? { Authorization: `Bearer ${process.env.VITE_BACKEND_API_TOKEN}` }
          : undefined,
      },
    },
  },
})
