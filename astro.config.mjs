// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Pages that stay out of the sitemap: the hidden page and the error page. Devlog drafts need no entry
// here, because a draft is not built at all.
const NOT_IN_SITEMAP = ['/what-next/', '/404/'];

/**
 * Astro copies every imported source image into dist/_astro/ next to the AVIF/WebP sizes it makes
 * from it. The pages only link to the generated sizes, so the 2560x1440 sources (about 31 MB of PNG,
 * 9 MB of WebP) would ship as dead weight. This removes the PNG and WebP files that no built page,
 * script or stylesheet names.
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
          if (!/\.(png|webp)$/.test(name) || everything.includes(name)) continue;
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
  // Off on purpose: with it on, a line break between a word and a link (or <code>, <strong>) in an
  // .astro file is removed, and the two run together in the page.
  compressHTML: false,
  integrations: [
    sitemap({
      filter: (page) => !NOT_IN_SITEMAP.some((hidden) => new URL(page).pathname.replace(/\/?$/, '/') === hidden),
    }),
    pruneUnusedSources(),
  ],
});
