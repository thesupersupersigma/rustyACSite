// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Stub pages (replaced in task 04) stay out of the sitemap until they have real content.
const STUBS = ['/download/', '/play/', '/how-it-works/', '/progress/', '/devlog/'];

export default defineConfig({
  site: 'https://rustyac.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !STUBS.some((stub) => new URL(page).pathname === stub),
    }),
  ],
});
