// Copies freshly captured rustyAC screenshots into the site and remakes the share image.
//
//   npm run screenshots                         from assets-src/media/screenshots/
//   node scripts/use-screenshots.mjs <folder>   from somewhere else
//
// Only the files the site uses are copied (the list below), under the same names, into
// src/assets/screenshots/. Then `npm run build` makes the AVIF/WebP sizes. See docs/screenshots.md.
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.resolve(root, process.argv[2] ?? 'assets-src/media/screenshots');
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

if (!existsSync(from)) {
  console.error(`nothing to copy: ${from} does not exist`);
  process.exit(1);
}
await mkdir(to, { recursive: true });

const pairs = new Map();
let copied = 0;
for (const shot of USED) {
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
  if (shot.pair) pairs.set(shot.pair, [...(pairs.get(shot.pair) ?? []), size]);
}

// a before/after pair only lines up under the slider when both halves have the same size
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
