// Builds the checked-in brand files from the source logo and one screenshot:
//   src/assets/logo-mark.png   the logo without its lettering (for the top bar, next to the text wordmark)
//   public/favicon.png, public/apple-touch-icon.png
//   public/og/rustyac-og.webp  1200x630 share image
// Run with `npm run og` after changing the logo. The outputs are committed.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => path.join(root, p);

const LOGO = at('src/assets/logo.png');
const SHOT = at('src/assets/screenshots/renderer_car_burnout.png');

// Pango (sharp's text renderer) reads TTF but not WOFF, so the npm fonts are unpacked first.
// WOFF 1 is an sfnt whose tables are individually zlib-compressed.
async function woffToTtf(woffPath, ttfPath) {
  const w = await readFile(woffPath);
  const numTables = w.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const offset = w.readUInt32BE(o + 4);
    const compLength = w.readUInt32BE(o + 8);
    const origLength = w.readUInt32BE(o + 12);
    const raw = w.subarray(offset, offset + compLength);
    tables.push({
      tag: w.subarray(o, o + 4),
      checksum: w.readUInt32BE(o + 16),
      data: compLength < origLength ? inflateSync(raw) : raw,
    });
  }
  const pow = 2 ** Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + numTables * 16);
  w.copy(header, 0, 4, 8); // sfnt flavour
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(Math.log2(pow), 8);
  header.writeUInt16BE(numTables * 16 - pow * 16, 10);
  const parts = [header];
  let pos = header.length;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    t.tag.copy(header, o);
    header.writeUInt32BE(t.checksum, o + 4);
    header.writeUInt32BE(pos, o + 8);
    header.writeUInt32BE(t.data.length, o + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    parts.push(padded);
    pos += padded.length;
  });
  await writeFile(ttfPath, Buffer.concat(parts));
  return ttfPath;
}

await mkdir(at('scratch/task01/fonts'), { recursive: true });
const SYNE = await woffToTtf(
  at('node_modules/@fontsource/syne/files/syne-latin-700-normal.woff'),
  at('scratch/task01/fonts/syne-700.ttf'),
);
const MONO = await woffToTtf(
  at('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
  at('scratch/task01/fonts/jetbrains-mono-400.ttf'),
);

// The lettering sits below y=566 in the 1332x737 source, right of a slanted line that the left stroke
// of the mark stays clear of, so the lettering is masked out instead of cropped.
async function logoMark() {
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 566; y < info.height; y++) {
    const from = y > 668 ? 0 : Math.round(378 - (y - 566) * 0.3);
    for (let x = from; x < info.width; x++) data[(y * info.width + x) * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).trim().png({ compressionLevel: 9 }).toBuffer();
}

function text(markup, font, fontfile, dpi) {
  return sharp({ text: { text: markup, font, fontfile, rgba: true, dpi } }).png().toBuffer();
}

const mark = await logoMark();
await sharp(mark).resize({ height: 360 }).png({ compressionLevel: 9 }).toFile(at('src/assets/logo-mark.png'));

const square = (size) =>
  sharp(mark)
    .resize({ width: Math.round(size * 0.9), height: Math.round(size * 0.9), fit: 'contain', background: '#0000' })
    .extend({
      top: Math.round(size * 0.05),
      bottom: size - Math.round(size * 0.9) - Math.round(size * 0.05),
      left: Math.round(size * 0.05),
      right: size - Math.round(size * 0.9) - Math.round(size * 0.05),
      background: '#0000',
    });
await square(96).png().toFile(at('public/favicon.png'));
await square(180).flatten({ background: '#0E0E0E' }).png().toFile(at('public/apple-touch-icon.png'));

// Share image: the screenshot darkened toward the left, the mark, the wordmark and one line.
await mkdir(at('public/og'), { recursive: true });
const W = 1200;
const H = 630;
const shade = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0E0E0E" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="#0E0E0E" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#0E0E0E" stop-opacity="0.45"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="72" y="452" width="96" height="4" fill="#D2581F"/>
  </svg>`,
);
const wordmark = await text(
  '<span foreground="#F5F5F5">rusty</span><span foreground="#D2581F">AC</span>',
  'Syne Bold',
  SYNE,
  560,
);
const line = await text(
  '<span foreground="#F5F5F5">Assetto Corsa, rebuilt from scratch in Rust.</span>',
  'Syne Bold',
  SYNE,
  190,
);
const sub = await text(
  '<span foreground="#9A9A9A">rustyac.com</span>',
  'JetBrains Mono',
  MONO,
  118,
);
const markSmall = await sharp(mark).resize({ height: 150 }).toBuffer();

await sharp(SHOT)
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .composite([
    { input: shade, left: 0, top: 0 },
    { input: markSmall, left: 72, top: 70 },
    { input: wordmark, left: 72, top: 262 },
    { input: line, left: 72, top: 486 },
    { input: sub, left: 72, top: 548 },
  ])
  .webp({ quality: 82 })
  .toFile(at('public/og/rustyac-og.webp'));

console.log('brand files written');
