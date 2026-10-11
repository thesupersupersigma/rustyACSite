// Renders the listening file (`npm run build` first): one scripted burnout through the site's real
// sound code and the real clips in public/audio/, without playing it.
//
//   docs/task03/site_burnout.wav          48 kHz stereo: idle 1 s, two blips, a full hold to the pop,
//                                         1 s, the pit stop, idle 2 s
//   docs/task03/site_burnout_levels.txt   peak and RMS over time, and a comparison of level and
//                                         spectrum with rustyAC's own burnout recording
//                                         (assets-src/media/audio/burnout_reference.flac)
//
// The run happens in headless Chromium: `window.__f2004.sound.renderRun()` steps the burnout through
// the same hooks the screenshots use and renders it with an OfflineAudioContext (src/scene/audio/offline.ts).
import ffmpegPath from 'ffmpeg-static';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localBrowsers = path.join(root, 'scratch', 'task01', 'pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}
const { chromium } = await import('playwright');

const DIST = path.join(root, 'dist');
const OUT = path.join(root, 'docs', 'task03');
const REFERENCE = path.join(root, 'assets-src', 'media', 'audio', 'burnout_reference.flac');
const PORT = 8768;
const RATE = 48000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
};

const server = http
  .createServer(async (req, res) => {
    let pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = path.join(DIST, pathname);
    if (!path.extname(file)) file = path.join(file, 'index.html');
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-length': data.length });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(PORT);

// ---- render in the browser ---------------------------------------------------------------------------
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
const scrollTo = (p) =>
  page.evaluate((progress) => {
    const s = document.querySelector('section[data-scene]');
    const top = s.getBoundingClientRect().top + scrollY;
    window.scrollTo(0, top + progress * (s.offsetHeight - innerHeight));
  }, p);
await scrollTo(0);
await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
await scrollTo(0.5);
await page.waitForTimeout(2500);

const run = await page.evaluate(async () => {
  const result = await window.__f2004.sound.renderRun();
  let binary = '';
  for (let i = 0; i < result.wav.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, result.wav.subarray(i, i + 0x8000));
  }
  return { base64: btoa(binary), seconds: result.seconds, format: result.format, marks: result.marks };
});
const userAgent = await page.evaluate(() => navigator.userAgent);
await browser.close();
server.close();

const wav = Buffer.from(run.base64, 'base64');
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'site_burnout.wav'), wav);

// ---- measure --------------------------------------------------------------------------------------------
/** Interleaved 16-bit samples -> one Float32Array per channel. */
function split(samples) {
  const frames = samples.length >> 1;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = samples[i * 2] / 32768;
    right[i] = samples[i * 2 + 1] / 32768;
  }
  return [left, right];
}

function decodeReference() {
  const res = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', REFERENCE, '-f', 's16le', '-ac', '2', '-ar', String(RATE), '-'], {
    maxBuffer: 1 << 28,
  });
  if (res.status !== 0) throw new Error(res.stderr.toString());
  return split(new Int16Array(res.stdout.buffer, res.stdout.byteOffset, res.stdout.byteLength >> 1));
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = (x, width = 7) => (Number.isFinite(x) ? x.toFixed(1) : '-inf').padStart(width);

function level(channels, from, to) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const data of channels) {
    for (let i = Math.max(0, from); i < Math.min(data.length, to); i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sum += v * v;
      n++;
    }
  }
  return { peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, n))) };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Level per octave band (dBFS, both channels averaged) between two sample positions. */
function octaves(channels, from, to) {
  const N = 8192;
  const power = new Float64Array(N / 2);
  const window = new Float64Array(N);
  let gain = 0;
  for (let i = 0; i < N; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    gain += window[i] * window[i];
  }
  let blocks = 0;
  for (const data of channels) {
    for (let start = Math.max(0, from); start + N <= Math.min(data.length, to); start += N / 2) {
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = data[start + i] * window[i];
      fft(re, im);
      for (let k = 0; k < N / 2; k++) power[k] += (2 * (re[k] * re[k] + im[k] * im[k])) / (N * gain);
      blocks++;
    }
  }
  return BANDS.map((centre) => {
    const lo = centre / Math.SQRT2;
    const hi = centre * Math.SQRT2;
    let sum = 0;
    for (let k = Math.ceil((lo * N) / RATE); k <= Math.min(N / 2 - 1, Math.floor((hi * N) / RATE)); k++) sum += power[k];
    return 10 * Math.log10(sum / Math.max(1, blocks) + 1e-20);
  });
}

function centroid(bands) {
  let weighted = 0;
  let total = 0;
  bands.forEach((value, i) => {
    const p = 10 ** (value / 10);
    weighted += p * Math.log2(BANDS[i]);
    total += p;
  });
  return 2 ** (weighted / total);
}

const site = split(new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1));
const reference = decodeReference();
const siteFrames = site[0].length;
const refFrames = reference[0].length;
const at = (label) => run.marks.find((m) => m.label === label)?.time ?? 0;

const lines = [];
lines.push('site_burnout.wav: the scripted run, rendered offline through the site\'s sound code');
lines.push(`rendered ${new Date().toISOString().slice(0, 10)} in ${userAgent}`);
lines.push(`clips decoded as ${run.format}; ${(siteFrames / RATE).toFixed(2)} s, ${RATE} Hz, 16 bit, stereo, ${wav.length.toLocaleString('en-US')} bytes`);
lines.push('');
lines.push('Parts (seconds)');
for (const m of run.marks) lines.push(`  ${m.time.toFixed(2).padStart(6)}  ${m.label}`);
lines.push('');

const whole = level(site, 0, siteFrames);
lines.push(`Whole file: peak ${fmt(whole.peak, 0)} dBFS, RMS ${fmt(whole.rms, 0)} dBFS`);
lines.push('');
lines.push('Peak and RMS per quarter second (dBFS, both channels)');
lines.push('  time     peak     rms');
const STEP = RATE / 4;
for (let from = 0; from < siteFrames; from += STEP) {
  const l = level(site, from, from + STEP);
  const here = run.marks.filter((m) => m.time * RATE >= from && m.time * RATE < from + STEP).map((m) => `<- ${m.label}`);
  lines.push(`  ${(from / RATE).toFixed(2).padStart(5)} ${fmt(l.peak)} ${fmt(l.rms)}  ${here.join(' ')}`.trimEnd());
}
lines.push('');

// ---- against rustyAC's own recording --------------------------------------------------------------------
// Comparable stretches: flat out on the limiter with the tyres spinning. On the site that is the last
// three seconds before the pop; in the reference (a 30 s burnout that ends in the burst) seconds 20 to 28.
const sitePart = [Math.round((at('pop') - 3.2) * RATE), Math.round((at('pop') - 0.2) * RATE)];
const refPart = [20 * RATE, 28 * RATE];
const rows = [
  ['site, whole file', site, 0, siteFrames],
  ['reference, whole file', reference, 0, refFrames],
  ['site, flat out before the pop', site, ...sitePart],
  ['reference, flat out (20 to 28 s)', reference, ...refPart],
  ['site, idle (first second)', site, 0, RATE],
  ['reference, idle (first second)', reference, 0, RATE],
];
lines.push("Against rustyAC's own recording of a burnout (burnout_reference, 32.1 s, the game's mix)");
lines.push(`  ${'part'.padEnd(34)}    peak     rms  ${BANDS.map((b) => String(b >= 1000 ? `${b / 1000}k` : b).padStart(6)).join('')}  centre Hz`);
const measured = {};
for (const [name, channels, from, to] of rows) {
  const l = level(channels, from, to);
  const bands = octaves(channels, from, to);
  measured[name] = { ...l, bands };
  lines.push(`  ${name.padEnd(34)} ${fmt(l.peak)} ${fmt(l.rms)}  ${bands.map((b) => fmt(b, 6)).join('')}  ${centroid(bands).toFixed(0).padStart(9)}`);
}
const a = measured['site, flat out before the pop'];
const b = measured['reference, flat out (20 to 28 s)'];
lines.push('');
lines.push(`  flat out, site minus reference: RMS ${fmt(a.rms - b.rms, 0)} dB; per octave ${a.bands.map((v, i) => fmt(v - b.bands[i], 0)).join(' ')}`);
lines.push('  (octave columns are dBFS per band, 31.5 Hz to 16 kHz; "centre" is the power-weighted middle of the spectrum)');

await writeFile(path.join(OUT, 'site_burnout_levels.txt'), `${lines.join('\n')}\n`);
console.log(lines.slice(lines.indexOf("Against rustyAC's own recording of a burnout (burnout_reference, 32.1 s, the game's mix)")).join('\n'));
console.log(`\nwrote docs/task03/site_burnout.wav (${(wav.length / 1048576).toFixed(2)} MB) and site_burnout_levels.txt`);
