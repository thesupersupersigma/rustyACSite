// Crawls the built site (`npm run build` first) and checks every internal link.
//
//   node scripts/check-links.mjs        (npm run links)
//
// It reads every HTML file in dist/ and follows each href, src and srcset that points into the site:
// the file has to exist, and a #fragment has to be an id on the page it points at. The sitemap, the
// RSS feed and llms.txt are checked the same way. It also makes sure nothing links to the hidden page
// and that no built page is missing from the sitemap. External links are counted, not fetched.
// Exit code 1 when something is dead.
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const SITE = 'https://rustyac.com';
/** Pages that must not be linked from anywhere and must not be in the sitemap. */
const HIDDEN = ['/what-next'];
/** Built pages that are not in the sitemap on purpose. */
const NOT_IN_SITEMAP = ['/what-next', '/404'];

if (!existsSync(DIST)) {
  console.error('dist/ does not exist: run `npm run build` first');
  process.exit(1);
}

async function walk(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

/** The file in dist/ that a site path is served from, the way nginx.conf resolves it. */
function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname);
  const direct = path.join(DIST, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const index = path.join(DIST, clean, 'index.html');
  if (existsSync(index)) return index;
  return undefined;
}

const idsByFile = new Map();
async function idsOf(file) {
  if (!idsByFile.has(file)) {
    const html = await readFile(file, 'utf8');
    idsByFile.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsByFile.get(file);
}

const dead = [];
const hiddenLinks = [];
let checked = 0;
const external = new Set();

/** Checks one link found in `from` (a path inside dist/, for the message). */
async function check(from, raw) {
  const link = raw.trim().replace(/&amp;/g, '&');
  if (link === '' || /^(mailto:|tel:|data:|javascript:)/i.test(link)) return;
  const pagePath = '/' + path.relative(DIST, from).split(path.sep).join('/');
  // a folder's index.html is served at the folder's address
  const base = new URL(pagePath.replace(/index\.html$/, ''), SITE);
  let url;
  try {
    url = new URL(link, base);
  } catch {
    dead.push(`${pagePath}: unreadable link "${raw}"`);
    return;
  }
  if (url.origin !== SITE) {
    external.add(url.origin + url.pathname);
    return;
  }
  checked++;
  const file = resolveFile(url.pathname);
  if (!file) {
    dead.push(`${pagePath}: ${link} (no such file)`);
    return;
  }
  const target = url.pathname.replace(/\/$/, '') || '/';
  if (HIDDEN.includes(target) && !HIDDEN.includes(base.pathname.replace(/\/$/, ''))) hiddenLinks.push(`${pagePath}: ${link}`);
  if (url.hash.length > 1 && file.endsWith('.html')) {
    const id = decodeURIComponent(url.hash.slice(1));
    if (!(await idsOf(file)).has(id)) dead.push(`${pagePath}: ${link} (no id="${id}" on that page)`);
  }
}

const files = await walk(DIST);
const pages = files.filter((file) => file.endsWith('.html'));

for (const file of pages) {
  const html = (await readFile(file, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  for (const match of html.matchAll(/\s(?:href|src|poster)="([^"]*)"/g)) await check(file, match[1]);
  for (const match of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const candidate of match[1].split(',')) await check(file, candidate.trim().split(/\s+/)[0]);
  }
  // the share image and the canonical address are full URLs in <meta> and <link>
  for (const match of html.matchAll(/<meta[^>]+(?:property|name)="(?:og:image|og:url|twitter:image)"[^>]+content="([^"]*)"/g)) {
    await check(file, match[1]);
  }
}

// the sitemap, the feed and llms.txt name full addresses
const inSitemap = new Set();
for (const file of files.filter((f) => /sitemap-\d+\.xml$/.test(f))) {
  for (const match of (await readFile(file, 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    inSitemap.add(new URL(match[1]).pathname.replace(/\/$/, '') || '/');
    await check(file, match[1]);
  }
}
for (const file of files.filter((f) => f.endsWith('rss.xml'))) {
  for (const match of (await readFile(file, 'utf8')).matchAll(/<link>([^<]+)<\/link>/g)) await check(file, match[1]);
}
const llms = path.join(DIST, 'llms.txt');
if (existsSync(llms)) {
  for (const match of (await readFile(llms, 'utf8')).matchAll(/\]\(([^)]+)\)/g)) await check(llms, match[1]);
}

// every built page of the site itself is in the sitemap, except the ones kept out on purpose
const missing = [];
for (const file of pages) {
  const rel = '/' + path.relative(DIST, file).split(path.sep).join('/');
  if (rel.startsWith('/play/app/')) continue; // rustyAC's own preview site, not a page of this one
  const address = rel.replace(/\/?index\.html$/, '').replace(/\.html$/, '') || '/';
  if (NOT_IN_SITEMAP.includes(address)) {
    if (inSitemap.has(address)) dead.push(`sitemap: ${address} is listed but must stay out`);
  } else if (!inSitemap.has(address)) missing.push(address);
}

console.log(`${pages.length} HTML files, ${checked} internal links checked, ${external.size} different external links (not fetched)`);
console.log(`sitemap: ${[...inSitemap].sort().join('  ')}`);
for (const line of dead) console.log(`DEAD     ${line}`);
for (const line of hiddenLinks) console.log(`HIDDEN   ${line} (the hidden page must not be linked)`);
for (const address of missing) console.log(`MISSING  ${address} is built but not in the sitemap`);
if (dead.length + hiddenLinks.length + missing.length > 0) process.exit(1);
console.log('no dead links');
