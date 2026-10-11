// Checks and screenshots of every page of the built site (`npm run build` first), with headless
// Chromium. Written for task 04; `scripts/shots.mjs` is the one for the homepage scene.
//
//   node scripts/shots-pages.mjs            everything            (npm run shots:pages)
//   node scripts/shots-pages.mjs faq        only pages whose name contains "faq" (home, download, play, ...)
//
// What it does:
//   - a full-page WebP of every page at 1440 and 390 px wide, dark and light, at most 300 KB each,
//     into docs/task04/
//   - the overflow check: no page may scroll sideways at 360 px
//   - the JavaScript each page loads (requests and bytes)
//   - the browser preview at /play/app/: it has to reach its "Open your Assetto Corsa folder" button
//     with no error in the console
//
// The browser comes from `npx playwright install chromium`.
import sharp from 'sharp';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// keeps the downloaded browser inside the project (scratch/ is gitignored) when it was installed there
const localBrowsers = path.join(root, 'scratch', 'task01', 'pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}
// imported after the path is set: playwright reads it when it loads
const { chromium } = await import('playwright');

const DIST = path.join(root, 'dist');
const OUT = path.join(root, 'docs', 'task04');
const PORT = 8766;
const ORIGIN = `http://localhost:${PORT}`;
const MAX_BYTES = 300 * 1024;
const only = process.argv[2] ?? '';

const PAGES = [
  // the homepage: only its first screen (the top bar with the new FAQ link); scripts/shots.mjs has the rest
  { name: 'home', url: '/', firstScreenOnly: true },
  { name: 'download', url: '/download' },
  { name: 'play', url: '/play' },
  { name: 'how-it-works', url: '/how-it-works' },
  { name: 'progress', url: '/progress' },
  { name: 'compatibility', url: '/compatibility' },
  { name: 'devlog', url: '/devlog' },
  { name: 'faq', url: '/faq' },
  { name: 'what-next', url: '/what-next' },
  { name: '404', url: '/404' },
].filter((page) => page.name.includes(only));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// Serves dist/ the way nginx.conf does: a folder's index.html, and 404.html for anything missing.
const server = http
  .createServer(async (req, res) => {
    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const candidates = [path.join(DIST, pathname), path.join(DIST, pathname, 'index.html'), path.join(DIST, `${pathname}.html`)];
    for (const file of candidates) {
      try {
        const data = await readFile(file);
        res.writeHead(200, {
          'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
          'content-length': data.length,
        });
        res.end(data);
        return;
      } catch {
        // try the next one
      }
    }
    const notFound = await readFile(path.join(DIST, '404.html')).catch(() => Buffer.from('not found'));
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(notFound);
  })
  .listen(PORT);

/** A WebP under the size limit: lower the quality first, then the size. */
async function saveWebp(png, file) {
  const meta = await sharp(png).metadata();
  let width = meta.width ?? 1440;
  for (;;) {
    for (const quality of [82, 72, 62, 52, 42]) {
      const out = await sharp(png, { limitInputPixels: false })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer();
      if (out.length <= MAX_BYTES) {
        await writeFile(file, out);
        return { bytes: out.length, width, quality };
      }
    }
    width = Math.round(width * 0.8);
  }
}

/** Scrolls through the page once, so every lazy picture has loaded before the screenshot. */
async function settle(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : new Promise((resolve) => ((img.onload = resolve), (img.onerror = resolve))))),
    );
    await document.fonts.ready;
  });
  await page.waitForTimeout(250);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
// The homepage's 3D scene is not what this script looks at (scripts/shots.mjs does that), and drawing
// it in software takes minutes. Without WebGL2 the page leaves the scene out, as it does on a phone.
const NO_SCENE = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return type === 'webgl2' ? null : original.call(this, type, ...rest);
  };
};
const newContext = async (options) => {
  const context = await browser.newContext(options);
  await context.addInitScript(NO_SCENE);
  return context;
};
let failed = false;
const fail = (message) => {
  failed = true;
  console.log(`FAIL  ${message}`);
};

// ---- screenshots ---------------------------------------------------------------------------------
const VIEWS = [
  { name: '1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: '390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
console.log('screenshots (docs/task04/)');
for (const view of VIEWS) {
  for (const theme of ['dark', 'light']) {
    const context = await newContext({ ...view, reducedMotion: 'reduce' });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem('theme', value);
      } catch {
        // no storage: the page stays dark
      }
    }, theme);
    const page = await context.newPage();
    for (const target of PAGES) {
      // the hidden page is dark in both themes, and the error page needs no second set
      if (theme === 'light' && (target.name === 'what-next' || target.name === '404')) continue;
      await page.goto(ORIGIN + target.url, { waitUntil: 'load' });
      if (target.firstScreenOnly) await page.waitForTimeout(600);
      else await settle(page);
      const height = target.firstScreenOnly ? view.viewport.height : await page.evaluate(() => document.documentElement.scrollHeight);
      // Chromium cannot make a picture taller than 16,384 px: a long page is taken at one pixel per CSS pixel
      const scale = height * view.deviceScaleFactor > 15000 ? 'css' : 'device';
      // A full-page screenshot resizes the emulated screen, and Chromium then stops reporting a touch
      // screen for a moment: /play would be drawn with its desktop button. What the page showed before
      // the screenshot is pinned for the picture.
      if (view.isMobile && target.name === 'play') {
        const phone = await page.evaluate(() => matchMedia('(pointer: coarse) and (max-width: 900px)').matches);
        if (phone) await page.addStyleTag({ content: '.launch__desktop{display:none!important}.launch__phone{display:block!important}' });
      }
      const png = await page.screenshot({ fullPage: !target.firstScreenOnly, scale });
      const file = `${target.name}-${view.name}-${theme}.webp`;
      const saved = await saveWebp(png, path.join(OUT, file));
      console.log(`  ${file.padEnd(34)} ${String(Math.round(saved.bytes / 1024)).padStart(3)} KB  ${saved.width} px wide, page ${height} px tall`);
    }
    await context.close();
  }
}

// ---- no sideways scrolling at 360 px ----------------------------------------------------------------
console.log('\noverflow at 360 px');
{
  const context = await newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const target of PAGES) {
    await page.goto(ORIGIN + target.url, { waitUntil: 'load' });
    if (!target.firstScreenOnly) await settle(page);
    const result = await page.evaluate(() => {
      const wide = [];
      const limit = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= limit + 0.5) continue;
        // something inside a box that scrolls by itself (a table, a diagram, a code block) is fine
        let scroller = el.parentElement;
        let inside = false;
        while (scroller && scroller !== document.body) {
          const overflow = getComputedStyle(scroller).overflowX;
          if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden' || overflow === 'clip') {
            inside = true;
            break;
          }
          scroller = scroller.parentElement;
        }
        if (!inside) wide.push(`${el.tagName.toLowerCase()}.${el.className} (${Math.round(rect.right)} px)`);
      }
      return { scroll: document.documentElement.scrollWidth, limit, wide: wide.slice(0, 5) };
    });
    const ok = result.scroll <= result.limit && result.wide.length === 0;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${target.url.padEnd(16)} page ${result.scroll} px in a ${result.limit} px window${result.wide.length ? `: ${result.wide.join(', ')}` : ''}`);
    if (!ok) failed = true;
  }
  await context.close();
}

// ---- /play on a phone ----------------------------------------------------------------------------------
if (PAGES.some((target) => target.name === 'play') && existsSync(path.join(DIST, 'play', 'app', 'index.html'))) {
  console.log('\n/play on a phone and on a computer');
  for (const phone of [true, false]) {
    const context = await newContext(
      phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
    );
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/play`, { waitUntil: 'load' });
    const notice = await page.getByText('Open this on a computer.').isVisible();
    const button = await page.getByRole('link', { name: 'Launch the preview' }).isVisible();
    const ok = phone ? notice && !button : button && !notice;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${phone ? 'phone' : 'computer'}: "Open this on a computer" ${notice ? 'shown' : 'hidden'}, the launch button ${button ? 'shown' : 'hidden'}`);
    if (!ok) failed = true;
    await context.close();
  }
}

// ---- the JavaScript each page loads ------------------------------------------------------------------
console.log('\nJavaScript per page (desktop, 1440 px; the homepage is not scrolled, so its scene is not fetched)');
{
  const context = await newContext({ viewport: { width: 1440, height: 900 } });
  for (const target of PAGES) {
    const page = await context.newPage();
    const scripts = [];
    page.on('response', async (response) => {
      if (response.request().resourceType() !== 'script') return;
      const body = await response.body().catch(() => Buffer.alloc(0));
      scripts.push({ url: new URL(response.url()).pathname, bytes: body.length });
    });
    await page.goto(ORIGIN + target.url, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const inline = await page.evaluate(
      () => [...document.querySelectorAll('script:not([src]):not([type="application/ld+json"])')].map((s) => s.textContent?.length ?? 0),
    );
    const total = scripts.reduce((sum, s) => sum + s.bytes, 0);
    console.log(
      `  ${target.url.padEnd(16)} ${scripts.length} file(s), ${total} bytes${scripts.length ? ` (${scripts.map((s) => `${s.url} ${s.bytes}`).join(', ')})` : ''}; ` +
        `${inline.length} inline script(s), ${inline.reduce((a, b) => a + b, 0)} characters`,
    );
    await page.close();
  }
  await context.close();
}

// ---- the browser preview ------------------------------------------------------------------------------
if (PAGES.some((target) => target.name === 'play')) {
  console.log('\nthe browser preview at /play/app/');
  if (!existsSync(path.join(DIST, 'play', 'app', 'index.html'))) {
    console.log('  not in dist/ (the download did not work): /play says the preview is unavailable');
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    const notFound = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('response', (response) => {
      if (response.status() >= 400) notFound.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    // from the /play page, through its button, the way a visitor gets there
    await page.goto(`${ORIGIN}/play`, { waitUntil: 'load' });
    await page.getByRole('link', { name: 'Launch the preview' }).click();
    await page.waitForURL('**/play/app/');
    const button = page.getByRole('button', { name: 'Open your Assetto Corsa folder' });
    await button.waitFor({ state: 'visible', timeout: 30000 });
    // the version line is filled in by the WebAssembly program, so text there means it started
    await page.waitForFunction(() => (document.getElementById('version')?.textContent ?? '').trim() !== '', null, { timeout: 30000 });
    const version = (await page.locator('#version').textContent())?.trim();
    const secure = await page.evaluate(() => window.isSecureContext);
    const picker = await page.evaluate(() => typeof window.showDirectoryPicker === 'function');
    await page.waitForTimeout(500);
    console.log(`  reached "Open your Assetto Corsa folder"; the page says: ${version}`);
    console.log(`  secure context: ${secure}; folder picker there: ${picker}`);
    // The page looks for an optional preview pack next to itself. There is none on this site, so that
    // one request answers 404, and Chromium prints a line for it. It is the only one allowed.
    const expected404 = notFound.filter((line) => line.endsWith('/play/app/preview/manifest.json'));
    const other404 = notFound.filter((line) => !expected404.includes(line));
    const realErrors = errors.filter((text) => !(expected404.length > 0 && /Failed to load resource.*404/.test(text)));
    console.log(`  requests that failed: ${notFound.length ? notFound.join(', ') : 'none'}${expected404.length ? ' (the optional preview pack, expected)' : ''}`);
    console.log(`  console errors from the page's own code: ${realErrors.length ? realErrors.join(' | ') : 'none'}`);
    if (realErrors.length > 0 || other404.length > 0) fail('the preview logged an error or a request failed');
    const shot = await page.screenshot({ fullPage: true });
    const saved = await saveWebp(shot, path.join(OUT, 'play-app-1280.webp'));
    console.log(`  play-app-1280.webp ${Math.round(saved.bytes / 1024)} KB`);
    await context.close();
  }
}

await browser.close();
server.close();
if (failed) process.exit(1);
