// Check screenshots of the built site (`npm run build` first), taken with headless Chromium.
// Writes WebP files of at most 300 KB into docs/task01/ (the site and the scene's look) and
// docs/task02/ (the burnout), and prints the overflow check, the tier the scene picks by itself and
// what the scene downloads.
//
//   node scripts/shots.mjs            everything
//   node scripts/shots.mjs scene      only the groups whose name contains "scene"
//   node scripts/shots.mjs burnout    the burnout stills (task 02), repeatable through window.__f2004.sim
//   node scripts/shots.mjs video      a real-time recording of hold -> pop -> pit stop (docs/task02/burnout.webm)
//
// Rendering is software (SwiftShader) unless SHOTS_GPU=1 is set, which uses this machine's GPU
// through ANGLE/D3D11. The burnout stills work either way (slowly in software); the video needs the GPU.
//
// The browser comes from `npx playwright install chromium`.
import sharp from 'sharp';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, readFile, mkdir, rm, stat } from 'node:fs/promises';
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
const OUT2 = path.join(root, 'docs', 'task02');
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
  args: process.env.SHOTS_GPU
    ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

await mkdir(OUT, { recursive: true });
await mkdir(OUT2, { recursive: true });

/** Saves a PNG buffer as WebP, lowering the quality until it fits in 300 KB. */
async function save(name, png, dir = OUT) {
  const file = path.join(dir, `${name}.webp`);
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

async function sceneShot(page, name, dir = OUT) {
  // software-rendered WebGL makes the capture fail now and then, so it gets a few tries
  for (let attempt = 1; ; attempt++) {
    await freeze(page);
    try {
      await save(name, await page.screenshot({ timeout: 180000 }), dir);
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

// ---- task 02: the burnout, stepped through window.__f2004.sim so every run gives the same pictures ----------
if (wants('burnout')) {
  const openStage = async (tier) => {
    const { context, page } = await open(DESKTOP, `/?debug=1&tier=${tier}`);
    await gotoProgress(page, 0, 0);
    await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
    await gotoProgress(page, 0.5, 3000);
    const overlay = (show) =>
      page.evaluate((on) => {
        document.querySelector('[data-scene-debug]').style.display = on ? '' : 'none';
      }, show);
    // runs a few sim calls, then gives the scene a moment to draw the result
    const sim = async (code) => {
      await page.evaluate(`(() => { const sim = window.__f2004.sim; ${code}; })()`);
      await page.waitForTimeout(700);
    };
    const shot = (name) => sceneShot(page, name, OUT2);
    return { context, page, overlay, sim, shot };
  };

  {
    const { context, overlay, sim, shot } = await openStage('high');
    await overlay(false);
    await sim('sim.view(38, 1.3); sim.hold(1)');
    await shot('burnout-1s');
    await sim('sim.hold(2)');
    await shot('burnout-3s');
    await overlay(true);
    await shot('burnout-3s-debug');
    await overlay(false);
    await sim('sim.hold(3)');
    await shot('burnout-6s');
    await sim('sim.view(150, 1.6)');
    await shot('burnout-6s-rear');
    await sim('sim.view(96, 0.9)');
    await shot('burnout-6s-side');
    // the tyres let go 6.5 s in; this is a quarter of a second later
    await sim('sim.view(38, 1.3); sim.hold(0.75)');
    await shot('burnout-popped');
    await sim('sim.release(); sim.advance(1.5); sim.view(62, 2.2); sim.pitStop(); sim.advance(0.77)');
    await shot('pitstop-30');
    await sim('sim.advance(1.02)');
    await shot('pitstop-70');
    await sim('sim.advance(0.76 + 1.2); sim.view(38, 1.3)');
    await shot('burnout-idle-again');
    await context.close();
  }
  for (const tier of ['mid', 'low']) {
    const { context, overlay, sim, shot } = await openStage(tier);
    await overlay(true);
    await sim('sim.view(38, 1.3); sim.hold(6)');
    await shot(`burnout-6s-tier-${tier}`);
    await context.close();
  }
}

// ---- task 02: a real-time recording of a full hold, pop and pit stop, driven with the real button ----------
if (wants('video')) {
  const size = { width: 960, height: 600 };
  const raw = path.join(root, 'scratch', 'task02', 'video');
  await rm(raw, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: raw, size } });
  const started = Date.now();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await gotoProgress(page, 0, 0);
  await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
  await gotoProgress(page, 0.5, 5000);
  const from = (Date.now() - started) / 1000 - 1;
  const box = await page.locator('.rev__btn').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => window.__f2004.engine.state === 'popped', null, { timeout: 20000 });
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__f2004.engine.state === 'idle', null, { timeout: 20000 });
  await page.waitForTimeout(2200);
  const length = (Date.now() - started) / 1000 - from;
  const tier = await page.evaluate(() => window.__f2004.tier);
  const video = page.video();
  await context.close();
  const recorded = await video.path();
  const out = path.join(OUT2, 'burnout.webm');
  // Playwright brings its own small ffmpeg (VP9 only), which is enough to cut the loading off the front
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const ffmpegDir = browsers && existsSync(browsers) ? readdirSync(browsers).find((d) => d.startsWith('ffmpeg')) : undefined;
  const ffmpeg = ffmpegDir
    ? readdirSync(path.join(browsers, ffmpegDir))
        .filter((f) => f.startsWith('ffmpeg'))
        .map((f) => path.join(browsers, ffmpegDir, f))[0]
    : undefined;
  let cut = false;
  if (ffmpeg) {
    const args = ['-y', '-ss', from.toFixed(2), '-i', recorded, '-t', length.toFixed(2), '-c:v', 'libvpx-vp9', '-b:v', '1300k', '-deadline', 'good', '-cpu-used', '4', '-an', out];
    cut = spawnSync(ffmpeg, args, { stdio: 'ignore' }).status === 0;
  }
  if (!cut) await copyFile(recorded, out);
  const bytes = (await stat(out)).size;
  console.log(
    `video  burnout.webm  ${(bytes / 1048576).toFixed(2)} MB, ${cut ? `${length.toFixed(1)} s` : 'not trimmed (no ffmpeg)'}, tier ${tier}`,
  );
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
