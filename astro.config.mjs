import { defineConfig } from 'astro/config';

// Astro's current Cloudflare adapter targets Workers, not Pages. Keep the
// public shell static on Pages and route dynamic article/profile requests
// through first-party Pages Functions in /functions.
export default defineConfig({
  output: 'static',
  site: 'https://dutimz.com',
  build: {
    assets: '_assets',
  },
});
