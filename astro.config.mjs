// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Stub pages (replaced in task 04) stay out of the sitemap until they have real content.
const STUBS = ['/download/', '/play/', '/how-it-works/', '/progress/', '/devlog/'];

/**
 * Astro copies every imported source image into dist/_astro/ next to the AVIF/WebP sizes it makes
 * from it. The pages only link to the generated sizes, so the 2560x1440 PNG sources (about 31 MB)
 * would ship as dead weight. This removes the PNGs that no built page, script or stylesheet names.
 * @returns {import('astro').AstroIntegration}
 */
function pruneUnusedSources() {
  return {
    name: 'prune-unused-sources',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        /** @type {string[]} */
        const texts = [];
        /** @param {string} folder */
        const walk = async (folder) => {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const full = path.join(folder, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (/\.(html|css|js|xml|json|webmanifest)$/.test(entry.name)) texts.push(await readFile(full, 'utf8'));
          }
        };
        await walk(dist);
        const everything = texts.join('\n');
        const assets = path.join(dist, '_astro');
        let bytes = 0;
        let count = 0;
        for (const name of await readdir(assets).catch(() => [])) {
          if (!name.endsWith('.png') || everything.includes(name)) continue;
          const file = path.join(assets, name);
          bytes += (await stat(file)).size;
          count++;
          await rm(file);
        }
        if (count > 0) logger.info(`removed ${count} unreferenced source image(s), ${(bytes / 1048576).toFixed(1)} MB`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://rustyac.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !STUBS.some((stub) => new URL(page).pathname === stub),
    }),
    pruneUnusedSources(),
  ],
});
