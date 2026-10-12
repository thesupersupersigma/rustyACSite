// Fetches the browser preview of the latest rustyAC release into public/play/app/, so the site can
// serve it at /play/app/. Runs before every `astro build` ("prebuild" in package.json).
//
//   node scripts/fetch-web-preview.mjs
//
// What it does:
//   1. asks GitHub for the release list (with GITHUB_TOKEN when it is set; the token is never printed)
//      and leaves the answer in node_modules/.cache/rustyacsite/releases.json for src/lib/release.ts,
//      so one build makes one request
//   2. downloads the newest rustyAC-vX.Y.Z-web.zip and its .sha256, and compares the hash
//   3. reads the zip's file list: anything other than what rustyAC's docs/release.md names
//      (index.html, app.js, style.css, servers.json, pkg/..., LICENSE-GPL, LICENSING.md) stops it
//   4. unpacks it into public/play/app/ and writes public/play/app/VERSION
//
// It never fails the build. When a step goes wrong the copy from the last run stays; with no copy at
// all, the /play page says the preview is unavailable and links to the release.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(root, 'public', 'play', 'app');
const CACHE = path.join(root, 'node_modules', '.cache', 'rustyacsite', 'releases.json');
const REPO = 'https://github.com/thesupersupersigma/rustyAC';
const API = 'https://api.github.com/repos/thesupersupersigma/rustyAC/releases?per_page=30';
/** The preview is about 1.6 MB; anything far beyond that is not it. */
const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;

/** What docs/release.md says the zip holds: "the site only". */
const ALLOWED_FILES = new Set(['index.html', 'app.js', 'style.css', 'servers.json', 'LICENSE-GPL', 'LICENSING.md']);
const ALLOWED_IN_PKG = /^pkg\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isAllowed = (name) => ALLOWED_FILES.has(name) || ALLOWED_IN_PKG.test(name);

const log = (message) => console.log(`[play] ${message}`);

async function get(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'rustyacsite-build', ...headers },
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

/** The release list, trimmed to what the site reads, and saved for src/lib/release.ts. */
async function fetchReleases() {
  const token = process.env.GITHUB_TOKEN;
  const res = await get(API, {
    accept: 'application/vnd.github+json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('unexpected answer from GitHub');
  const releases = json.map((r) => ({
    tag_name: r.tag_name,
    name: r.name,
    draft: r.draft,
    prerelease: r.prerelease,
    published_at: r.published_at,
    html_url: r.html_url,
    body: r.body,
    assets: (Array.isArray(r.assets) ? r.assets : []).map((a) => ({
      name: a.name,
      size: a.size,
      browser_download_url: a.browser_download_url,
    })),
  }));
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify({ fetchedAt: Date.now(), releases }));
  return releases;
}

/** The newest published release that has a web zip with its .sha256. */
function pickWebRelease(releases) {
  const usable = releases
    .filter((r) => /^v\d+\.\d+\.\d+$/.test(r.tag_name ?? '') && !r.draft && !r.prerelease && r.published_at)
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
  for (const release of usable) {
    const zipName = `rustyAC-${release.tag_name}-web.zip`;
    const zip = release.assets.find((a) => a.name === zipName);
    const sum = release.assets.find((a) => a.name === `${zipName}.sha256`);
    const inRepo = (a) => typeof a?.browser_download_url === 'string' && a.browser_download_url.startsWith(`${REPO}/`);
    if (inRepo(zip) && inRepo(sum)) return { tag: release.tag_name, zipName, zip, sum, newest: usable[0].tag_name };
  }
  return undefined;
}

/**
 * The files of a zip, from its central directory. Small on purpose: no zip64, no encryption, stored or
 * deflated entries only, which is all `python web/build.py --zip` writes.
 * @returns {{ name: string, method: number, crc: number, packed: number, size: number, offset: number }[]}
 */
function listZip(zip) {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip file (no end record)');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('zip64 is not supported');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('broken zip directory');
    const flags = zip.readUInt16LE(at + 8);
    const nameLength = zip.readUInt16LE(at + 28);
    const entry = {
      name: zip.toString('utf8', at + 46, at + 46 + nameLength),
      method: zip.readUInt16LE(at + 10),
      crc: zip.readUInt32LE(at + 16),
      packed: zip.readUInt32LE(at + 20),
      size: zip.readUInt32LE(at + 24),
      offset: zip.readUInt32LE(at + 42),
    };
    if (flags & 0x1) throw new Error(`${entry.name} is encrypted`);
    if (entry.packed === 0xffffffff || entry.size === 0xffffffff) throw new Error('zip64 is not supported');
    entries.push(entry);
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return entries;
}

function readEntry(zip, entry) {
  const at = entry.offset;
  if (zip.readUInt32LE(at) !== 0x04034b50) throw new Error(`broken zip entry ${entry.name}`);
  const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
  const packed = zip.subarray(start, start + entry.packed);
  let data;
  if (entry.method === 0) data = packed;
  else if (entry.method === 8) data = zlib.inflateRawSync(packed, { maxOutputLength: MAX_UNPACKED_BYTES });
  else throw new Error(`${entry.name} uses compression method ${entry.method}`);
  if (data.length !== entry.size || zlib.crc32(data) !== entry.crc) throw new Error(`${entry.name} is damaged`);
  return data;
}

async function currentVersion() {
  try {
    if (!existsSync(path.join(APP, 'index.html'))) return undefined;
    return (await readFile(path.join(APP, 'VERSION'), 'utf8')).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const have = await currentVersion();
  const picked = pickWebRelease(await fetchReleases());
  if (!picked) throw new Error('no release has a web zip with a .sha256');
  if (picked.newest !== picked.tag) log(`${picked.newest} has no web zip; using ${picked.tag}`);
  if (have === picked.tag) {
    log(`public/play/app/ already holds ${have}`);
    return;
  }

  const sumText = await (await get(picked.sum.browser_download_url)).text();
  const expected = /^[0-9a-f]{64}/i.exec(sumText.trim())?.[0]?.toLowerCase();
  if (!expected) throw new Error(`${picked.zipName}.sha256 holds no SHA-256`);

  if (picked.zip.size > MAX_ZIP_BYTES) throw new Error(`${picked.zipName} is ${picked.zip.size} bytes, too large`);
  const zip = Buffer.from(await (await get(picked.zip.browser_download_url)).arrayBuffer());
  if (zip.length > MAX_ZIP_BYTES) throw new Error(`${picked.zipName} is ${zip.length} bytes, too large`);
  const actual = createHash('sha256').update(zip).digest('hex');
  if (actual !== expected) throw new Error(`${picked.zipName}: SHA-256 is ${actual}, the release says ${expected}`);

  // The file list is read before anything is unpacked. Folder entries end in "/".
  const entries = listZip(zip).filter((entry) => !entry.name.endsWith('/'));
  const unexpected = listZip(zip)
    .map((entry) => entry.name)
    .filter((name) => (name.endsWith('/') ? name !== 'pkg/' : !isAllowed(name)));
  if (unexpected.length > 0) {
    throw new Error(`${picked.zipName} holds files the release notes do not name, not publishing it: ${unexpected.join(', ')}`);
  }
  if (!entries.some((entry) => entry.name === 'index.html')) throw new Error(`${picked.zipName} has no index.html`);
  if (entries.reduce((sum, entry) => sum + entry.size, 0) > MAX_UNPACKED_BYTES) throw new Error('the zip unpacks too large');

  // Unpacked next to the real folder and swapped in at the end, so a failure half-way leaves the old copy.
  const fresh = `${APP}.new`;
  await rm(fresh, { recursive: true, force: true });
  for (const entry of entries) {
    const file = path.join(fresh, ...entry.name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, readEntry(zip, entry));
  }
  await writeFile(path.join(fresh, 'VERSION'), `${picked.tag}\n`);
  await rm(APP, { recursive: true, force: true });
  await rename(fresh, APP);
  log(`unpacked ${picked.zipName} (${entries.length} files, SHA-256 ok) into public/play/app/`);
}

try {
  await main();
} catch (err) {
  const have = await currentVersion();
  log(`could not fetch the preview: ${err instanceof Error ? err.message : String(err)}`);
  log(have ? `keeping the copy from the last run (${have})` : 'no copy from an earlier run: /play will say the preview is unavailable');
}
