// The devlog's published posts. A post with `draft: true` never leaves this file, so it has no page
// and is in no list, feed or sitemap.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'devlog'>;

export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('devlog', (post) => !post.data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

const covers = import.meta.glob<{ default: ImageMetadata }>('../assets/screenshots/*.webp', { eager: true });

/** The picture a post's `cover` names (a file in src/assets/screenshots/, without its extension). */
export function coverImage(name: string | undefined): ImageMetadata | undefined {
  if (!name) return undefined;
  const hit = Object.entries(covers).find(([file]) => file.replace(/^.*\//, '').replace(/\.\w+$/, '') === name);
  if (!hit) throw new Error(`devlog cover "${name}" is not a picture in src/assets/screenshots/`);
  return hit[1].default;
}

/** Minutes to read, at 220 words a minute, never less than one. */
export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / 220));
}

export const postDate = (date: Date): string =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
