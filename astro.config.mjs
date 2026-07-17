import { defineConfig } from 'astro/config';

// Private strategy portal. Deploys to ninja360.co via Cloudflare Pages.
// Trailing slashes off so /vision, /money, etc. work without redirect churn.
export default defineConfig({
  site: 'https://ninja360.co',
  trailingSlash: 'never',
  build: {
    format: 'file', // emits /vision.html style — plays nicely with Cloudflare Pages static hosting
  },
  compressHTML: true,
});
