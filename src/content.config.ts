// The devlog: one Markdown file per post in src/content/devlog/.
//
// A post may start with one HTML comment line above its front matter (the drafts written from the
// reports all do). Astro's stock Markdown loader wants the front matter on the very first line, so
// this small loader takes that comment off before it reads the file.
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DEVLOG_DIR = 'src/content/devlog';

function devlogLoader(): Loader {
  return {
    name: 'devlog',
    load: async ({ store, parseData, renderMarkdown, generateDigest, watcher, logger }) => {
      const sync = async () => {
        store.clear();
        const files = (await readdir(DEVLOG_DIR).catch(() => [])).filter((name) => name.endsWith('.md'));
        for (const name of files) {
          const filePath = path.posix.join(DEVLOG_DIR, name);
          const raw = (await readFile(filePath, 'utf8')).replace(/\r\n?/g, '\n');
          const text = raw.replace(/^﻿?\s*<!--[\s\S]*?-->[ \t]*\n/, '');
          const rendered = await renderMarkdown(text);
          const id = name.replace(/\.md$/, '');
          const frontmatter = rendered.metadata?.frontmatter;
          if (!frontmatter || Object.keys(frontmatter).length === 0) {
            logger.warn(`${filePath} has no front matter, skipped`);
            continue;
          }
          const data = await parseData({ id, data: frontmatter, filePath });
          const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
          store.set({ id, data, body, filePath, digest: generateDigest(raw), rendered });
        }
      };
      await sync();
      watcher?.add(DEVLOG_DIR);
      watcher?.on('all', (_event, file) => {
        if (file.replace(/\\/g, '/').includes(DEVLOG_DIR)) void sync();
      });
    },
  };
}

const devlog = defineCollection({
  loader: devlogLoader(),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    /** A draft is not built at all: no page, not in the index, the feed or the sitemap. */
    draft: z.boolean().default(true),
    /** A picture in src/assets/screenshots/, by its file name without the extension. */
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
  }),
});

export const collections = { devlog };
