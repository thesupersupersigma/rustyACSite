// Encodes the sound clips for the web (`npm run audio`).
//
// Reads the lossless FLAC sources in assets-src/media/audio/ (rendered by rustyAC, see the README
// there) and writes, per clip, an Opus file (.webm, the main format) and an AAC file (.m4a, the
// fallback) into public/audio/, plus public/audio/manifest.json for the player.
//
// Loops. A lossy encoder adds priming samples at the start and padding at the end, and decoders do
// not agree on how much of that they remove. So a loop is not encoded bare: the last PAD_SECONDS of
// it are put in front and the first PAD_SECONDS after it. The decoded file then holds
// [end of the loop][the loop][start of the loop], the sound runs straight through both loop points,
// and a decoder that is early or late by anything less than the pad still loops cleanly, because the
// loop is exactly as long as before wherever it starts. Each encoded file is decoded again here and
// compared with its source: that gives the loop points in seconds of the decoded buffer, and the
// jump at the seam measured the way the source manifest measured it.
//
//   node scripts/encode-audio.mjs           encode everything and check it
//   node scripts/encode-audio.mjs --check   only decode what is there and print the table again
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets-src', 'media', 'audio');
const OUT = path.join(root, 'public', 'audio');
// the padded sources, kept for scripts/check-audio.mjs (scratch/ is gitignored)
const WORK = path.join(root, 'scratch', 'task03', 'encode');

const RATE = 48000;
const CHANNELS = 2;
/** Seconds of the loop repeated before and after it. Must be longer than any decoder's delay. */
const PAD_SECONDS = 0.2;
const PAD = Math.round(PAD_SECONDS * RATE);
const OPUS_KBPS = 96;
const AAC_KBPS = 128;
/** How far (in samples) the decoded file is searched for the source, either way. */
const MAX_LAG = 4096;

/** Clips that are not shipped: the reference recording, and idle (the same sound as 4000 rpm). */
const SKIP = /^(burnout_reference|engine_(on|off)_idle)$/;

const checkOnly = process.argv.includes('--check');

function ffmpeg(args, input) {
  const res = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    input,
    maxBuffer: 1 << 28,
  });
  if (res.status !== 0) {
    throw new Error(`ffmpeg ${args.join(' ')}\n${res.stderr?.toString() ?? res.error}`);
  }
  return res.stdout;
}

/** Decodes any audio file to interleaved 16-bit samples at 48 kHz stereo. */
function decode(file) {
  const out = ffmpeg(['-i', file, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', String(CHANNELS), '-ar', String(RATE), '-']);
  return new Int16Array(out.buffer, out.byteOffset, out.byteLength >> 1);
}

function wavBytes(samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * CHANNELS * 2, 28);
  header.writeUInt16LE(CHANNELS * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** [the last `pad` frames][everything][the first `pad` frames], interleaved. */
function padLoop(samples, pad) {
  const n = pad * CHANNELS;
  const out = new Int16Array(samples.length + 2 * n);
  out.set(samples.subarray(samples.length - n), 0);
  out.set(samples, n);
  out.set(samples.subarray(0, n), n + samples.length);
  return out;
}

/**
 * How many frames later the decoded file plays the source (negative = earlier): the lag with the
 * best match over a stretch from the middle of the clip.
 */
function findLag(source, decoded) {
  const frames = Math.min(source.length, decoded.length) / CHANNELS;
  const window = Math.min(8192, Math.max(256, frames - 2 * MAX_LAG - 2));
  const start = Math.max(MAX_LAG, Math.floor(frames / 2 - window / 2));
  const mono = (buf, frame) => (buf[frame * 2] ?? 0) + (buf[frame * 2 + 1] ?? 0);
  const ref = new Float64Array(window);
  for (let i = 0; i < window; i++) ref[i] = mono(source, start + i);
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -MAX_LAG; lag <= MAX_LAG; lag++) {
    if (start + lag < 0 || start + lag + window > decoded.length / CHANNELS) continue;
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < window; i++) {
      const d = mono(decoded, start + lag + i);
      dot += ref[i] * d;
      energy += d * d;
    }
    const score = energy > 0 ? dot / Math.sqrt(energy) : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

/**
 * The jump between neighbouring samples, in 16-bit steps, the way the source manifest measured it:
 * at the seam (last sample of the loop to its first) and inside the loop (99.9th percentile, max).
 */
function seamStats(samples, startFrame, frames) {
  const at = (frame, ch) => samples[(startFrame + frame) * CHANNELS + ch] ?? 0;
  let seam = 0;
  for (let ch = 0; ch < CHANNELS; ch++) seam = Math.max(seam, Math.abs(at(0, ch) - at(frames - 1, ch)));
  const jumps = new Float64Array((frames - 1) * CHANNELS);
  let k = 0;
  for (let i = 1; i < frames; i++) {
    for (let ch = 0; ch < CHANNELS; ch++) jumps[k++] = Math.abs(at(i, ch) - at(i - 1, ch));
  }
  jumps.sort();
  return {
    seam,
    p999: jumps[Math.min(jumps.length - 1, Math.floor(jumps.length * 0.999))] ?? 0,
    max: jumps[jumps.length - 1] ?? 0,
  };
}

function peakDb(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak > 0 ? 20 * Math.log10(peak / 32768) : -Infinity;
}

const FORMATS = [
  {
    ext: 'webm',
    mime: 'audio/webm; codecs="opus"',
    args: ['-c:a', 'libopus', '-b:a', `${OPUS_KBPS}k`, '-vbr', 'on', '-compression_level', '10', '-application', 'audio', '-f', 'webm'],
  },
  {
    ext: 'm4a',
    mime: 'audio/mp4; codecs="mp4a.40.2"',
    args: ['-c:a', 'aac', '-b:a', `${AAC_KBPS}k`, '-movflags', '+faststart', '-f', 'ipod'],
  },
];

const round = (x, digits) => Number(x.toFixed(digits));

const sourceManifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });

const clips = [];
const rows = [];
const totals = Object.fromEntries(FORMATS.map((f) => [f.ext, 0]));

for (const entry of sourceManifest.clips) {
  const id = entry.file.replace(/\.wav$/, '');
  if (SKIP.test(id)) continue;
  const loop = entry.kind === 'loop';

  const source = decode(path.join(SRC, `${id}.flac`));
  const frames = source.length / CHANNELS;
  if (frames !== entry.samples) {
    throw new Error(`${id}.flac has ${frames} frames, the manifest says ${entry.samples}`);
  }
  if (loop && (entry.loop_start !== 0 || entry.loop_end !== frames)) {
    throw new Error(`${id}: the loop is expected to be the whole file`);
  }
  const pad = loop ? PAD : 0;
  const padded = loop ? padLoop(source, pad) : source;
  const wav = path.join(WORK, `${id}.wav`);
  await writeFile(wav, wavBytes(padded));

  const sourceStats = loop ? seamStats(source, 0, frames) : undefined;
  const group = id.startsWith('engine_') ? 'engine' : id.startsWith('pit_') ? 'pit' : id.replace(/_\d+$/, '');
  const clip = {
    id,
    kind: entry.kind,
    group,
    ...(entry.rpm !== undefined ? { rpm: entry.rpm } : {}),
    ...(entry.throttle !== undefined ? { throttle: entry.throttle } : {}),
    seconds: round(frames / RATE, 5),
    peakDb: round(peakDb(source), 2),
    files: {},
  };

  for (const format of FORMATS) {
    const file = path.join(OUT, `${id}.${format.ext}`);
    if (!checkOnly) ffmpeg(['-i', wav, ...format.args, file]);
    const bytes = (await stat(file)).size;
    totals[format.ext] += bytes;

    const decoded = decode(file);
    const lag = findLag(padded, decoded);
    const info = { file: `${id}.${format.ext}`, bytes, seconds: round(decoded.length / CHANNELS / RATE, 5) };
    const row = { clip: id, format: format.ext, bytes, 'decoded frames': decoded.length / CHANNELS, 'source frames': padded.length / CHANNELS, lag };
    if (loop && sourceStats) {
      const startFrame = pad + lag;
      if (startFrame < 0 || startFrame + frames > decoded.length / CHANNELS) {
        throw new Error(`${file}: the loop does not fit in the decoded file (lag ${lag})`);
      }
      const stats = seamStats(decoded, startFrame, frames);
      info.loopStart = round(startFrame / RATE, 6);
      info.loopEnd = round((startFrame + frames) / RATE, 6);
      info.seamJump = stats.seam;
      Object.assign(row, {
        'loop start s': info.loopStart,
        'loop end s': info.loopEnd,
        'seam jump': stats.seam,
        'inside p99.9': Math.round(stats.p999),
        'inside max': stats.max,
        'source seam': sourceStats.seam,
        'source p99.9': Math.round(sourceStats.p999),
        ok: stats.seam <= stats.p999 ? 'yes' : stats.seam <= stats.max ? 'under max' : 'NO',
      });
    }
    clip.files[format.ext] = info;
    rows.push(row);
  }
  clips.push(clip);
}

const manifest = {
  note: 'Made by scripts/encode-audio.mjs from assets-src/media/audio/. Loop points are in seconds of the decoded file.',
  rustyacVersion: sourceManifest.rustyac_version,
  sampleRate: RATE,
  padSeconds: PAD_SECONDS,
  formats: FORMATS.map((f) => ({ ext: f.ext, mime: f.mime })),
  clips,
};
if (!checkOnly) await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

console.table(rows);
for (const format of FORMATS) {
  console.log(`${format.ext}: ${totals[format.ext].toLocaleString('en-US')} bytes in ${clips.length} files`);
}
const manifestBytes = (await stat(path.join(OUT, 'manifest.json'))).size;
console.log(`manifest.json: ${manifestBytes.toLocaleString('en-US')} bytes`);
const bad = rows.filter((r) => r.ok === 'NO');
if (bad.length > 0) {
  console.error(`${bad.length} loop(s) jump more at the seam than anywhere inside: ${bad.map((r) => `${r.clip}.${r.format}`).join(', ')}`);
  process.exitCode = 1;
}
await writeFile(path.join(WORK, 'report.json'), JSON.stringify({ rows, totals, manifestBytes }, null, 1));
