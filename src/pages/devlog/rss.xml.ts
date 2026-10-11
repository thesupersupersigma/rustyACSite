// The devlog's RSS feed: published posts only, newest first. With every post a draft it is a valid,
// empty feed.
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts } from '../../lib/devlog';
import { SITE_URL } from '../../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: 'rustyAC devlog',
    description: 'How Assetto Corsa is being rebuilt in Rust, and what turned up on the way.',
    site: context.site ?? SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `/devlog/${post.id}`,
    })),
    customData: '<language>en</language>',
  });
}
