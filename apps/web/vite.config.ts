import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { buildRobotsTxt, buildSitemapXml } from "./src/lib/seo/seo-files";

// Vite's %VITE_APP_URL% HTML replacement (index.html) has no equivalent
// to JS's `import.meta.env.VITE_API_URL ?? "..."` fallback - an unset
// var is left as a literal, unresolved "%VITE_APP_URL%" string, which
// then crashes Vite's own HTML asset-URL resolution ("URI malformed").
// Providing the same local-dev default here, before Vite reads
// process.env, keeps `vite build` working out of the box exactly like
// every other env var in this app - VITE_APP_URL only needs to be set
// explicitly for a real deploy.
if (!process.env.VITE_APP_URL) {
  process.env.VITE_APP_URL = "http://localhost:5173";
}

/**
 * US-019: sitemap.xml/robots.txt need absolute URLs, so they can't be
 * static files in public/ without hardcoding a domain. Generates both
 * at build time (production build only, via `apply: "build"`) from
 * VITE_APP_URL, so the production domain is configured entirely through
 * the environment - never hardcoded in source. Defaults to the local
 * dev URL, same fallback pattern as VITE_API_URL.
 */
function seoFilesPlugin(): Plugin {
  return {
    name: "asodef-seo-files",
    apply: "build",
    writeBundle(options) {
      const siteUrl = process.env.VITE_APP_URL ?? "http://localhost:5173";
      const outDir = options.dir ?? "dist";
      writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemapXml(siteUrl));
      writeFileSync(path.join(outDir, "robots.txt"), buildRobotsTxt(siteUrl));
    },
  };
}

export default defineConfig({
  plugins: [react(), seoFilesPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Keep stable framework capabilities out of the application entry.
        // Route components are already loaded on demand in router.tsx; these
        // named vendor groups make that split effective without coupling the
        // public shell to admin, forms or animation implementation details.
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-routing": ["react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-motion": ["motion"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: false,
  },
});
