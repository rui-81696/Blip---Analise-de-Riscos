import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const coopCoepHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const coopCoepPlugin = {
  name: 'coop-coep-headers',
  configureServer(server) {
    server.middlewares.use((_, res, next) => {
      for (const [key, value] of Object.entries(coopCoepHeaders)) {
        res.setHeader(key, value)
      }
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((_, res, next) => {
      for (const [key, value] of Object.entries(coopCoepHeaders)) {
        res.setHeader(key, value)
      }
      next()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    coopCoepPlugin,
  ],
  server: {
    headers: coopCoepHeaders,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: coopCoepHeaders,
  },
})
