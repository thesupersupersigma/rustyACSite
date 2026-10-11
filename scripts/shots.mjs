// Check screenshots of the built site (`npm run build` first), taken with headless Chromium on
// SwiftShader. Writes WebP files of at most 300 KB into docs/task01/ and prints the overflow check,
// the tier the scene picks by itself and what the scene downloads.
//
//   node scripts/shots.mjs            everything
//   node scripts/shots.mjs scene      only the groups whose name contains "scene"
//
// The browser comes from `npx playwright install chromium`.
import sharp from 'sharp';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
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
const OUT = path.join(root, 'docs', 'task01');
const PORT = 8765;
const ORIGIN = `http://localhost:${PORT}`;
const only = process.argv[2] ?? '';
const wants = (group) => group.includes(only);

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
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

const server = http
  .createServer(async (req, res) => {
    let pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = path.join(DIST, pathname);
    if (!path.extname(file)) file = path.join(file, 'index.html');
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'content-length': data.length,
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(PORT);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

await mkdir(OUT, { recursive: true });

/** Saves a PNG buffer as WebP, lowering the quality until it fits in 300 KB. */
async function save(name, png) {
  const file = path.join(OUT, `${name}.webp`);
  for (const quality of [86, 78, 68, 58, 46, 34]) {
    const out = await sharp(png).webp({ quality }).toBuffer();
    if (out.length <= 300 * 1024 || quality === 34) {
      await sharp(out).toFile(file);
      console.log(`shot  ${name}.webp  ${(out.length / 1024).toFixed(0)} KB`);
      return;
    }
  }
}

async function open(options, url, theme) {
  const context = await browser.newContext(options);
  if (theme === 'light') {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'light');
      } catch {}
    });
  }
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  console error:', m.text());
  });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

const DESKTOP = { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' };

// Headless Chromium on SwiftShader can hang in page.screenshot() while a WebGL loop is running,
// so the scene's requestAnimationFrame loop is parked for the moment of the screenshot.
async function freeze(page) {
  await page.evaluate(() => {
    window.__parked ??= [];
    window.__raf ??= window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      window.__parked.push(cb);
      return 0;
    };
  });
  await page.waitForTimeout(400);
}

async function thaw(page) {
  await page.evaluate(() => {
    if (!window.__raf) return;
    window.requestAnimationFrame = window.__raf;
    for (const cb of window.__parked.splice(0)) window.__raf(cb);
  });
}

async function sceneShot(page, name) {
  // software-rendered WebGL makes the capture fail now and then, so it gets a few tries
  for (let attempt = 1; ; attempt++) {
    await freeze(page);
    try {
      await save(name, await page.screenshot({ timeout: 180000 }));
      await thaw(page);
      return;
    } catch (err) {
      await thaw(page);
      if (attempt >= 4) throw err;
      console.log(`  retrying ${name}: ${String(err).slice(0, 120)}`);
      await page.waitForTimeout(3000);
    }
  }
}

/** Scrolls so the scene section is at progress `p`, then waits for a few frames to be drawn. */
async function gotoProgress(page, p, settle = 2500) {
  await page.evaluate((progress) => {
    const s = document.querySelector('section[data-scene]');
    const top = s.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + progress * (s.offsetHeight - innerHeight));
  }, p);
  await page.waitForTimeout(settle);
}

// ---- homepage sections, both themes ----------------------------------------------------------------
if (wants('sections')) {
  for (const theme of ['dark', 'light']) {
    const { context, page } = await open(DESKTOP, '/', theme);
    await save(`home-top-${theme}`, await page.screenshot());
    for (const id of ['status', 'bit-exact', 'renderer', 'get', 'discord']) {
      await page.evaluate((sel) => {
        const el = document.getElementById(sel);
        scrollTo(0, el.getBoundingClientRect().top + scrollY - 72);
      }, id);
      // lazy pictures in the slider need a moment
      await page.waitForTimeout(id === 'renderer' ? 1500 : 300);
      await save(`home-${id}-${theme}`, await page.screenshot());
    }
    await context.close();
  }
  const { context, page } = await open(DESKTOP, '/download');
  await save('stub-download-dark', await page.screenshot());
  await context.close();
}

// ---- the scene at p = 0.1, 0.5, 0.9 ----------------------------------------------------------------
if (wants('scene')) {
  for (const theme of ['dark', 'light']) {
    // SwiftShader would settle on the low tier; the look is checked on the high one
    const { context, page } = await open(DESKTOP, '/?debug=1&tier=high', theme);
    await gotoProgress(page, 0, 0);
    await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
    for (const p of theme === 'dark' ? [0.1, 0.5, 0.9] : [0.1, 0.5]) {
      await gotoProgress(page, p, 4000);
      await sceneShot(page, `scene-p${String(p).replace('.', '')}-${theme}`);
    }
    if (theme === 'dark') {
      await gotoProgress(page, -0.25, 3000);
      await sceneShot(page, 'scene-arriving-dark');
    }
    await context.close();
  }
  for (const tier of ['mid', 'low']) {
    const { context, page } = await open(DESKTOP, `/?debug=1&tier=${tier}`);
    await gotoProgress(page, 0, 0);
    await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
    await gotoProgress(page, 0.5, 4000);
    await sceneShot(page, `scene-p05-tier-${tier}`);
    await context.close();
  }
}

// ---- what the scene downloads, and the tier it picks on its own -----------------------------------------
if (wants('tier')) {
  const { context, page } = await open(DESKTOP, '/?debug=1');
  const before = new Set();
  const sizes = new Map();
  page.on('response', async (res) => {
    try {
      const body = await res.body();
      sizes.set(new URL(res.url()).pathname, body.length);
    } catch {}
  });
  for (const r of await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))) {
    before.add(new URL(r).pathname);
  }
  await gotoProgress(page, 0, 0);
  await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
  await gotoProgress(page, 0.5, 20000);
  const tier = await page.evaluate(() => window.__f2004?.tier);
  const overlay = await page.evaluate(() => document.querySelector('[data-scene-debug]')?.textContent);
  console.log(`tier picked by the headless render: ${tier}`);
  console.log(overlay);
  let total = 0;
  for (const [name, bytes] of [...sizes].sort()) {
    if (before.has(name) || name === '/') continue;
    if (!/\.(js|glb|json|webp)$/.test(name) || /renderer_core|logo/.test(name)) continue;
    total += bytes;
    console.log(`  scene download  ${String(bytes).padStart(9)}  ${name}`);
  }
  console.log(`  scene download total: ${total} bytes (${(total / 1048576).toFixed(2)} MB, uncompressed)`);
  await context.close();
}

// ---- phone: the scene section must be gone --------------------------------------------------------------
if (wants('phone')) {
  for (const theme of ['dark', 'light']) {
    const { context, page } = await open(
      { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
      '/',
      theme,
    );
    const state = await page.evaluate(() => {
      const s = document.querySelector('section[data-scene]');
      return {
        coarsePhone: matchMedia('(pointer: coarse) and (max-width: 900px)').matches,
        sceneFlag: document.documentElement.dataset.webgl ?? null,
        display: getComputedStyle(s).display,
        height: s.getBoundingClientRect().height,
        sceneChunkLoaded: performance.getEntriesByType('resource').some((e) => /three|main\./.test(e.name)),
      };
    });
    console.log(`phone ${theme}:`, JSON.stringify(state));
    await save(`phone-top-${theme}`, await page.screenshot());
    // the hero ends and "What works today" follows directly
    await page.evaluate(() => {
      const el = document.getElementById('status');
      scrollTo(0, el.getBoundingClientRect().top + scrollY - 420);
    });
    await page.waitForTimeout(300);
    await save(`phone-hero-to-status-${theme}`, await page.screenshot());
    if (theme === 'dark') {
      await page.click('[data-nav-toggle]');
      await page.waitForTimeout(200);
      await save('phone-menu-dark', await page.screenshot());
    }
    await context.close();
  }
}

// ---- horizontal overflow ------------------------------------------------------------------------------
if (wants('overflow')) {
  for (const url of ['/', '/download']) {
    for (const width of [360, 768, 1024, 1440]) {
      const { context, page } = await open({ viewport: { width, height: 900 } }, url);
      const result = await page.evaluate(async () => {
        // walk the whole page so sticky and lazy parts have been laid out
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
          scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(r));
        }
        const doc = document.documentElement;
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
          })
          .filter((el) => !el.closest('.sr-only, .skip, [data-scene], .cmp__view, .proof__log'))
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
        return { scrollWidth: doc.scrollWidth, innerWidth, wide: wide.slice(0, 5) };
      });
      const ok = result.scrollWidth <= result.innerWidth && result.wide.length === 0;
      console.log(`overflow ${url} @${width}: ${ok ? 'ok' : 'FAIL'} ${JSON.stringify(result)}`);
      await context.close();
    }
  }
}

await browser.close();
server.close();
