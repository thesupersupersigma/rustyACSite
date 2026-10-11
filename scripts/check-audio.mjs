// What do real browsers make of public/audio/? Run `npm run audio` first.
//
// Every clip is decoded with decodeAudioData in each browser that can be started here, and compared
// with the padded source the encoder kept in scratch/task03/encode/: does it decode at all, how many
// frames come out, how far the sound is shifted (encoder priming a decoder did not remove shows up as
// a positive lag), and how big the jump at the loop seam is at the loop points of the manifest.
//
//   node scripts/check-audio.mjs        prints one line per browser and format, writes the details
//                                       to docs/task03/decode_check.json
//
// Browsers: Playwright's Chromium, Firefox and WebKit (`npx playwright install chromium firefox
// webkit`), and the installed Chrome and Edge when they are there. Playwright's WebKit on Windows is
// not Safari: it has no Apple media frameworks, so what it cannot decode says nothing about Safari.
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localBrowsers = path.join(root, 'scratch', 'task01', 'pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}
const { chromium, firefox, webkit } = await import('playwright');

const AUDIO = path.join(root, 'public', 'audio');
const WORK = path.join(root, 'scratch', 'task03', 'encode');
const OUT = path.join(root, 'docs', 'task03');
const PORT = 8766;
const MIME = { '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.json': 'application/json', '.html': 'text/html' };

const server = http
  .createServer(async (req, res) => {
    const name = path.basename(decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (name === '' || name === 'index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>audio check</title>');
      return;
    }
    const file = path.join(name.endsWith('.wav') ? WORK : AUDIO, name);
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

/** Runs in the page. */
async function checkInPage() {
  const RATE = 48000;
  const MAX_LAG = 4096;
  const manifest = await (await fetch('/manifest.json')).json();
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const decodeUrl = async (url) => {
    const bytes = await (await fetch(url)).arrayBuffer();
    // the callback form works in every browser, old Safari included
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes, resolve, reject);
      if (p && typeof p.catch === 'function') p.catch(reject);
    });
  };
  const mono = (buffer) => {
    const a = buffer.getChannelData(0);
    const b = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : a;
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
  };
  const findLag = (source, decoded) => {
    const frames = Math.min(source.length, decoded.length);
    const window = Math.min(8192, Math.max(256, frames - 2 * MAX_LAG - 2));
    const start = Math.max(MAX_LAG, Math.floor(frames / 2 - window / 2));
    let best = 0;
    let bestScore = -Infinity;
    for (let lag = -MAX_LAG; lag <= MAX_LAG; lag++) {
      if (start + lag < 0 || start + lag + window > decoded.length) continue;
      let dot = 0;
      let energy = 0;
      for (let i = 0; i < window; i++) {
        const d = decoded[start + lag + i];
        dot += source[start + i] * d;
        energy += d * d;
      }
      const score = energy > 0 ? dot / Math.sqrt(energy) : -Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    return best;
  };
  const seam = (buffer, startFrame, frames) => {
    let jump = 0;
    const jumps = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      jump = Math.max(jump, Math.abs(data[startFrame] - data[startFrame + frames - 1]));
      for (let i = 1; i < frames; i++) jumps.push(Math.abs(data[startFrame + i] - data[startFrame + i - 1]));
    }
    const sorted = Float32Array.from(jumps).sort();
    // in 16-bit steps, like the manifests
    return { seam: Math.round(jump * 32768), p999: Math.round(sorted[Math.floor(sorted.length * 0.999)] * 32768) };
  };

  const rows = [];
  for (const clip of manifest.clips) {
    let source;
    try {
      source = await decodeUrl(`/${clip.id}.wav`);
    } catch (err) {
      rows.push({ clip: clip.id, format: 'wav', decodes: false, error: String(err) });
      continue;
    }
    const sourceMono = mono(source);
    for (const [format, info] of Object.entries(clip.files)) {
      const row = { clip: clip.id, format, decodes: false };
      try {
        const buffer = await decodeUrl(`/${info.file}`);
        row.decodes = true;
        row.rate = buffer.sampleRate;
        row.channels = buffer.numberOfChannels;
        row.frames = buffer.length;
        row.extraFrames = buffer.length - source.length;
        row.lag = findLag(sourceMono, mono(buffer));
        if (clip.kind === 'loop') {
          const start = Math.round(info.loopStart * buffer.sampleRate);
          const frames = Math.round((info.loopEnd - info.loopStart) * buffer.sampleRate);
          row.loopFits = start >= 0 && start + frames <= buffer.length;
          if (row.loopFits) Object.assign(row, seam(buffer, start, frames));
        }
      } catch (err) {
        row.error = String(err && err.message ? err.message : err);
      }
      rows.push(row);
    }
  }
  return { userAgent: navigator.userAgent, rows };
}

const targets = [
  { name: 'Chromium (Playwright build)', launch: () => chromium.launch({ headless: true }) },
  { name: 'Google Chrome (installed)', launch: () => chromium.launch({ headless: true, channel: 'chrome' }) },
  { name: 'Microsoft Edge (installed)', launch: () => chromium.launch({ headless: true, channel: 'msedge' }) },
  { name: 'Firefox (Playwright build)', launch: () => firefox.launch({ headless: true }) },
  { name: 'WebKit (Playwright build for Windows, not Safari)', launch: () => webkit.launch({ headless: true }) },
];

const results = [];
for (const target of targets) {
  let browser;
  try {
    browser = await target.launch();
  } catch (err) {
    console.log(`${target.name}: could not start (${String(err.message).split('\n')[0]})`);
    results.push({ browser: target.name, started: false });
    continue;
  }
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`);
    const { userAgent, rows } = await page.evaluate(checkInPage);
    results.push({ browser: target.name, started: true, userAgent, rows });
    console.log(`\n${target.name}\n  ${userAgent}`);
    for (const format of [...new Set(rows.map((r) => r.format))]) {
      const mine = rows.filter((r) => r.format === format);
      const ok = mine.filter((r) => r.decodes);
      if (ok.length === 0) {
        console.log(`  ${format}: decodes 0 of ${mine.length} (${mine[0]?.error ?? ''})`);
        continue;
      }
      const loops = ok.filter((r) => r.seam !== undefined);
      const range = (key) => `${Math.min(...ok.map((r) => r[key]))}..${Math.max(...ok.map((r) => r[key]))}`;
      const worst = loops.reduce((a, r) => (r.seam / r.p999 > a.seam / a.p999 ? r : a), loops[0]);
      console.log(
        `  ${format}: decodes ${ok.length} of ${mine.length}, ${ok[0].rate} Hz, extra frames ${range('extraFrames')}, lag ${range('lag')}, ` +
          `loops that fit ${ok.filter((r) => r.loopFits).length}/${ok.filter((r) => r.loopFits !== undefined).length}, ` +
          `seam jumps ${Math.min(...loops.map((r) => r.seam))}..${Math.max(...loops.map((r) => r.seam))} ` +
          `(worst against its own p99.9: ${worst.clip} ${worst.seam} vs ${worst.p999})`,
      );
    }
  } catch (err) {
    console.log(`${target.name}: failed (${String(err.message).split('\n')[0]})`);
    results.push({ browser: target.name, started: true, error: String(err.message) });
  } finally {
    await browser.close();
  }
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'decode_check.json'), `${JSON.stringify(results, null, 1)}\n`);
server.close();
