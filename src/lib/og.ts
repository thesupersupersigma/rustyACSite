// A page's own share image: a 1200x630 WebP cut from one of the screenshots at build time.
import { getImage } from 'astro:assets';

export async function shareImage(src: ImageMetadata, alt: string): Promise<{ src: string; alt: string }> {
  const image = await getImage({ src, width: 1200, height: 630, fit: 'cover', format: 'webp', quality: 82 });
  return { src: image.src, alt };
}
