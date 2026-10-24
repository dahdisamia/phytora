import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "fonts/*.woff2", "icons/*.png"],
      manifest: {
        name: "FieldGuard — حارس الحقول",
        short_name: "حارس الحقول",
        description:
          "منصة إرشاد زراعي للتعرف على الآفات وإدارة المحاصيل، تعمل دون اتصال بالإنترنت.",
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f6f4ec",
        theme_color: "#175b45",
        categories: ["agriculture", "education", "productivity"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ico}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/docs\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "fieldguard-images",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 180 }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/fonts/"),
            handler: "CacheFirst",
            options: {
              cacheName: "fieldguard-fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
