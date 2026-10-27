import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative URLs: the build runs from any folder or sub-path.
  base: './',
  // `npm run dev:worker` (wrangler dev on :8787) answers /api/* while Vite serves the page.
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    // The admin console is a second page: dist/admin/index.html → /admin/
    rollupOptions: { input: { main: 'index.html', admin: 'admin/index.html', catalog: 'catalog/index.html' } },
  },
  plugins: [
    VitePWA({
      // A new version waits until the reader agrees (see src/pwa.js), so an open book
      // never loses the lazily loaded 3D chunk it was built with.
      registerType: 'prompt',
      injectRegister: false,
      buildBase: '/',
      scope: '/',
      // Manifest icons and the manifest itself are precached by the plugin automatically.
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Дай почитать! — детская библиотека в Баре',
        short_name: 'Дай почитать!',
        description: 'Маленькая некоммерческая библиотека для детей и подростков в жёлтом доме в Баре. Книга-раскладушка, кастинг на роль библиотекаря и книжные загадки.',
        lang: 'ru',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4e8cf',
        theme_color: undefined,
        categories: ['books', 'education', 'kids'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Волшебный сундук — что почитать?', short_name: 'Сундук', url: '/#chest', icons: [{ src: '/icons/shortcut-chest.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Праздники и встречи', short_name: 'Праздники', url: '/#events', icons: [{ src: '/icons/shortcut-events.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Как нас найти', short_name: 'Адрес', url: '/#find', icons: [{ src: '/icons/shortcut-find.png', sizes: '192x192', type: 'image/png' }] },
        ],
        screenshots: [
          { src: '/og.jpg', sizes: '1200x630', type: 'image/jpeg', form_factor: 'wide', label: 'Книга-раскладушка «Дай почитать!»' },
          { src: '/screenshots/narrow.jpg', sizes: '390x844', type: 'image/jpeg', form_factor: 'narrow', label: 'Жёлтый дом у моря' },
        ],
      },
      workbox: {
        // App shell + the fonts actually used (Latin & Cyrillic); illustrations are cached as they're seen.
        globPatterns: ['**/*.{js,css,html,svg}', 'assets/*-{latin,cyrillic}-*.woff2', 'art/{house,ginger-avatar}.webp'],
        globIgnores: ['**/*-ext-*.woff2'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/(?:robots\.txt|sitemap\.xml)$/, /^\/api\//, /^\/admin(?:\/|$)/, /^\/catalog(?:\/|$)/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 1_500_000,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/art\/[^/]+\.webp$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'dp-art', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/covers(?:-jpg)?\/[^/]+$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'dp-covers', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\.(?:woff2|png|jpg)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'dp-static', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});
