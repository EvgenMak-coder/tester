import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig({
  // относительные пути — сайт работает из подпапки GitHub Pages
  base: './',
  // по умолчанию Node слушает только IPv6 (::1), и http://localhost не открывается
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // регистрацию и проверку обновлений делает src/pwa.ts
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tester',
        short_name: 'Tester',
        description: 'Тесты по IT-курсам: тренировка, повторение, экзамен',
        lang: 'ru',
        display: 'standalone',
        background_color: '#101216',
        theme_color: '#3d5bd9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // знак занимает середину значка, поэтому картинка годится и для обрезки под форму
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
