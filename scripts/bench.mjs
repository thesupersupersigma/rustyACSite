// Measures what the burnout costs per frame on each quality tier, on this machine's GPU, in
// headless Chromium (`npm run build` first). It uses the scene's own test hook
// (`window.__f2004.sim.bench()`), which draws frames back to back and waits for the GPU after each.
//
//   node scripts/bench.mjs            1440x900, real GPU
//   node scripts/bench.mjs soft       software rendering (SwiftShader), for comparison
//
// Also reports the tier the governor settles on by itself after a full hold in real time.
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localBrowsers = path.join(root, 'scratch', 'task01', 'pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}
const { chromium } = await import('playwright');
const DIST = path.join(root, 'dist');
const PORT = 8767;
const soft = process.argv[2] === 'soft';

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
  args: soft
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function open(query) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`http://localhost:${PORT}/${query}`, { waitUntil: 'load' });
  const goto = (p) =>
    page.evaluate((progress) => {
      const s = document.querySelector('section[data-scene]');
      const top = s.getBoundingClientRect().top + scrollY;
      scrollTo(0, top + progress * (s.offsetHeight - innerHeight));
    }, p);
  await goto(0);
  await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
  await goto(0.5);
  await page.waitForTimeout(1500);
  return { context, page };
}

const frames = soft ? 4 : 60;
const ms = (x) => x.toFixed(2).padStart(7);

{
  const { context, page } = await open('?debug=1');
  console.log(
    'renderer:',
    await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    }),
  );
  await context.close();
}

console.log('\nper frame, ms (1440x900 window)        idle   revving   full smoke: all   no mirror   no smoke   JS update   particles');
for (const tier of ['high', 'mid', 'low']) {
  const { context, page } = await open(`?debug=1&tier=${tier}`);
  const result = await page.evaluate((n) => {
    const sim = window.__f2004.sim;
    sim.view(38, 1.3);
    const idle = sim.bench(n);
    sim.hold(0.6); // wheels spinning, hardly any smoke yet
    const revving = sim.bench(n);
    sim.hold(5.8); // just before the pop: the cloud is as big as a hold makes it
    const full = sim.bench(n);
    return { idle, revving, full };
  }, frames);
  const { idle, revving, full } = result;
  console.log(
    `${tier.padEnd(36)}${ms(idle.drawMs)}   ${ms(revving.drawMs)}   ${ms(full.drawSmokeMirroredMs)}           ` +
      `${ms(full.drawSmokeNotMirroredMs)}    ${ms(full.drawWithoutSmokeMs)}     ${ms(full.updateMs)}   ${full.particles}`,
  );
  await context.close();
}

// ---- what the governor does by itself: hold in real time until the pop, then read the tier --------------
{
  const { context, page } = await open('?debug=1');
  await page.waitForTimeout(soft ? 2000 : 6000);
  const before = await page.evaluate(() => window.__f2004.tier);
  const box = await page.locator('.rev__btn').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(6200);
  const during = await page.evaluate(() => ({
    tier: window.__f2004.tier,
    state: window.__f2004.engine.state,
    overlay: document.querySelector('[data-scene-debug]')?.textContent,
  }));
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const after = await page.evaluate(() => ({ tier: window.__f2004.tier, state: window.__f2004.engine.state }));
  console.log(`\ngovernor: ${before} before the hold, ${during.tier} after 6.2 s of holding (${during.state}), ${after.tier} after the pop (${after.state})`);
  console.log(during.overlay);
  await context.close();
}

await browser.close();
server.close();
