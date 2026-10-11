// Copies freshly captured rustyAC screenshots into the site and remakes the share image.
//
//   npm run screenshots                         from assets-src/media/screenshots/
//   node scripts/use-screenshots.mjs <folder>   from somewhere else
//   node scripts/use-screenshots.mjs --webp     only the WebP pictures: no PNG is copied and the
//                                               share image (public/og/) is left alone
//
// Only the files the site uses are copied (the lists below), under the same names, into
// src/assets/screenshots/. The slider pictures and the share image's source stay PNG; the hero and
// gallery pictures are stored as WebP at quality 92, which keeps the repo small. Then
// `npm run build` makes the AVIF/WebP sizes. See docs/screenshots.md.
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// a folder given on the command line is relative to where the command is run
const args = process.argv.slice(2);
const webpOnly = args.includes('--webp');
const folder = args.find((arg) => !arg.startsWith('--'));
const from = folder ? path.resolve(folder) : path.join(root, 'assets-src', 'media', 'screenshots');
const to = path.join(root, 'src', 'assets', 'screenshots');

/** Every screenshot the site uses, with the size it should be captured at. */
const USED = [
  { file: 'renderer_core_spa.png', width: 2560, height: 1440, pair: 'spa' },
  { file: 'renderer_core_spa_debug.png', width: 2560, height: 1440, pair: 'spa' },
  { file: 'renderer_core_monza.png', width: 2560, height: 1440, pair: 'monza' },
  { file: 'renderer_core_monza_debug.png', width: 2560, height: 1440, pair: 'monza' },
  { file: 'renderer_core_laguna_seca.png', width: 2560, height: 1440, pair: 'laguna_seca' },
  { file: 'renderer_core_laguna_seca_debug.png', width: 2560, height: 1440, pair: 'laguna_seca' },
  { file: 'og_burnout.png', width: 2400, height: 1260 },
];

/**
 * Pictures stored as WebP (quality 92) instead of PNG. `from` names another source folder, relative
 * to the project, for the ones that are not in assets-src/media/screenshots/.
 */
const AS_WEBP = [
  { file: 'hero_burnout.png', width: 2560, height: 1440 },
  { file: 'gallery_488_gt3_laguna_seca.png', width: 2560, height: 1440 },
  { file: 'gallery_crash_damage.png', width: 2560, height: 1440 },
  { file: 'gallery_f2004_cockpit.png', width: 2560, height: 1440 },
  { file: 'gallery_f2004_spa_chase.png', width: 2560, height: 1440 },
  { file: 'gallery_f2004_spa_trackside.png', width: 2560, height: 1440 },
  { file: 'gallery_f40_monza.png', width: 2560, height: 1440 },
  { file: 'gallery_heavy_clouds.png', width: 2560, height: 1440 },
  { file: 'gallery_night_lights.png', width: 2560, height: 1440 },
  // the browser preview, a copy of rustyAC's docs/port/web_spa.png
  { file: 'web_spa.png', width: 1024, height: 576, from: path.join('assets-src', 'screenshots') },
];
const WEBP_QUALITY = 92;

if (!existsSync(from)) {
  console.error(`nothing to copy: ${from} does not exist`);
  process.exit(1);
}
await mkdir(to, { recursive: true });

let copied = 0;
for (const shot of webpOnly ? [] : USED) {
  const source = path.join(from, shot.file);
  if (!existsSync(source)) {
    console.log(`missing   ${shot.file} (the site keeps its current one)`);
    continue;
  }
  const meta = await sharp(source).metadata();
  const size = `${meta.width}x${meta.height}`;
  const wanted = `${shot.width}x${shot.height}`;
  await copyFile(source, path.join(to, shot.file));
  copied++;
  console.log(`copied    ${shot.file}  ${size}${size === wanted ? '' : `  (expected ${wanted})`}`);
}

let converted = 0;
for (const shot of AS_WEBP) {
  // a folder given on the command line wins; the list's own folder is the fallback
  const candidates = [path.join(from, shot.file), ...(shot.from ? [path.join(root, shot.from, shot.file)] : [])];
  const source = candidates.find((file) => existsSync(file));
  const name = shot.file.replace(/.png$/, '.webp');
  if (!source) {
    console.log(`missing   ${shot.file} (the site keeps its current ${name})`);
    continue;
  }
  const meta = await sharp(source).metadata();
  const size = `${meta.width}x${meta.height}`;
  const wanted = `${shot.width}x${shot.height}`;
  const out = await sharp(source).webp({ quality: WEBP_QUALITY, effort: 6 }).toFile(path.join(to, name));
  converted++;
  console.log(`webp q${WEBP_QUALITY}  ${name}  ${size}  ${(out.size / 1024).toFixed(0)} KB${size === wanted ? '' : `  (expected ${wanted})`}`);
}

// A before/after pair only lines up under the slider when both halves have the same size. This looks at
// what is in the site now, so replacing only one half of a pair is caught too.
const pairs = new Map();
for (const shot of USED) {
  const file = path.join(to, shot.file);
  if (!shot.pair || !existsSync(file)) continue;
  const meta = await sharp(file).metadata();
  pairs.set(shot.pair, [...(pairs.get(shot.pair) ?? []), `${meta.width}x${meta.height}`]);
}
for (const [pair, sizes] of pairs) {
  if (sizes.length === 2 && sizes[0] !== sizes[1]) {
    console.log(`WARNING   the ${pair} pair has two sizes (${sizes.join(' and ')}): the slider will not line up`);
  }
}

if (copied > 0) {
  const og = spawnSync(process.execPath, [path.join(root, 'scripts', 'make-brand.mjs')], { stdio: 'inherit' });
  if (og.status !== 0) process.exit(og.status ?? 1);
  console.log('\nnow run: npm run build');
}
