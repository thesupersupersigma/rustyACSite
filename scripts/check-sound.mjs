// Checks the sound switch on the built site (`npm run build` first) in headless Chromium:
//
//   - the homepage downloads no audio and creates no AudioContext before the visitor asks for sound,
//     not even after scrolling the whole page and revving the engine;
//   - one click on the speaker creates one context, downloads the clips in one format and starts;
//   - scrolling the stage away or hiding the tab suspends it, coming back resumes it;
//   - the choice is remembered, and on the next visit sound waits for the first press;
//   - the same with reduced motion.
//
//   node scripts/check-sound.mjs     prints every check; exits with 1 if one fails
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
const ORIGIN = `http://localhost:${PORT}`;
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

// the scene needs a GPU to run in real time; software rendering takes seconds per frame
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'],
});

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/** Counts every AudioContext the page makes, and keeps them so their state can be read. */
function watchContexts() {
  window.__contexts = [];
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Real = window[name];
    if (!Real) continue;
    window[name] = class extends Real {
      constructor(...args) {
        super(...args);
        window.__contexts.push(this);
      }
    };
  }
}

async function open(options, url = '/') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addInitScript(watchContexts);
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  const audio = () => requests.filter((r) => r.startsWith('/audio/'));
  const scripts = () => requests.filter((r) => r.endsWith('.js'));
  const contexts = () => page.evaluate(() => window.__contexts.map((c) => c.state));
  const state = () => page.evaluate(() => window.__f2004.sound.state());
  return { context, page, audio, scripts, contexts, state, errors };
}

async function gotoProgress(page, p, settle = 1200) {
  await page.evaluate((progress) => {
    const s = document.querySelector('section[data-scene]');
    const top = s.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + progress * (s.offsetHeight - innerHeight));
  }, p);
  await page.waitForTimeout(settle);
}

async function toStage(page) {
  await gotoProgress(page, 0, 0);
  await page.waitForSelector('[data-scene][data-state="ready"]', { timeout: 240000 });
  await gotoProgress(page, 0.5, 2500);
}

async function holdRev(page, ms) {
  const box = await page.locator('.rev__btn').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

const speaker = (page) => page.locator('.rev__sound');
const waitOn = (page) => page.waitForFunction(() => window.__f2004.sound.state() === 'on', null, { timeout: 60000 });

// ---- 1. a visit without sound: nothing audio happens ---------------------------------------------------
{
  const { context, page, audio, scripts, contexts, state, errors } = await open({});
  await toStage(page);
  const before = scripts().length;
  await holdRev(page, 1500);
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  await gotoProgress(page, 1, 800);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await gotoProgress(page, 0.5, 1500);
  check('no visit: the speaker says "Sound off", not pressed', (await speaker(page).getAttribute('aria-label')) === 'Sound off' && (await speaker(page).getAttribute('aria-pressed')) === 'false');
  check('no visit: state is off', (await state()) === 'off');
  check('no visit: no audio file requested', audio().length === 0, `${audio().length} requests`);
  check('no visit: no AudioContext created', (await contexts()).length === 0, `${(await contexts()).length} contexts`);
  check('no visit: no extra script fetched by revving and scrolling', scripts().length === before, scripts().slice(before).join(', '));
  const lazy = () => scripts().filter((f) => /\/(live|graph|offline)\./.test(f));
  check('no visit: the sound chunks were never fetched', lazy().length === 0, lazy().join(', '));
  check('no visit: nothing is heard', (await page.evaluate(() => window.__f2004.sound.level())) === 0);
  console.log(`      scripts on the homepage: ${scripts().join(', ')}`);

  // ---- 2. turning it on -------------------------------------------------------------------------------
  await speaker(page).click();
  const early = await state();
  await waitOn(page);
  await page.waitForTimeout(1500);
  const files = audio();
  check('on: the click showed a loading state first', early === 'loading' || early === 'on', early);
  check('on: exactly one AudioContext, running', JSON.stringify(await contexts()) === '["running"]', JSON.stringify(await contexts()));
  check('on: the manifest and 15 clips, one format only', files.length === 16 && files.filter((f) => f.endsWith('.webm')).length === 15, `${files.length} requests, ${files.filter((f) => f.endsWith('.m4a')).length} m4a`);
  const firstClip = files.findIndex((f) => !f.includes('engine_') && !f.includes('limiter') && !f.includes('manifest') && !f.includes('backfire'));
  const lastEngine = files.findLastIndex((f) => f.includes('engine_') || f.includes('limiter'));
  check('on: the engine clips are asked for before the rest', firstClip > lastEngine, files.map((f) => f.replace('/audio/', '')).join(' '));
  check('on: the sound chunks were fetched on the click', lazy().length >= 2, lazy().join(', '));
  const idle = await page.evaluate(() => window.__f2004.sound.level());
  check('on: the idling engine is heard', idle > 0.005 && idle < 0.2, `RMS ${idle.toFixed(4)}`);
  check('on: the speaker says "Sound on", pressed', (await speaker(page).getAttribute('aria-label')) === 'Sound on' && (await speaker(page).getAttribute('aria-pressed')) === 'true');
  check('on: the mouse click did not leave the focus on the speaker', await page.evaluate(() => document.activeElement !== document.querySelector('.rev__sound')));
  check('on: the choice is stored', (await page.evaluate(() => localStorage.getItem('rustyac:sound'))) === 'on');

  // ---- 3. the stage scrolls away and comes back ----------------------------------------------------------
  await gotoProgress(page, 0.95, 900);
  check('scrolled away: nothing is heard', (await page.evaluate(() => window.__f2004.sound.level())) === 0);
  check('scrolled away: the context is suspended', JSON.stringify(await contexts()) === '["suspended"]', JSON.stringify(await contexts()));
  await gotoProgress(page, 0.5, 900);
  check('scrolled back: the context runs again', JSON.stringify(await contexts()) === '["running"]', JSON.stringify(await contexts()));

  // the tab is hidden and shown again (faked: a headless page cannot really be put in the background)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(700);
  check('tab hidden: the context is suspended', JSON.stringify(await contexts()) === '["suspended"]', JSON.stringify(await contexts()));
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  check('tab shown: the context runs again', JSON.stringify(await contexts()) === '["running"]', JSON.stringify(await contexts()));

  // ---- 4. a full burnout with sound on: nothing may throw -------------------------------------------------
  const box = await page.locator('.rev__btn').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => window.__f2004.engine.limiter, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const flatOut = await page.evaluate(() => window.__f2004.sound.level());
  check('flat out: much louder than idle', flatOut > idle * 2.5, `RMS ${flatOut.toFixed(4)} against ${idle.toFixed(4)}`);
  await page.waitForFunction(() => window.__f2004.engine.state === 'popped', null, { timeout: 20000 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__f2004.engine.state === 'idle', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  check('burnout, pop and pit stop with sound on: no errors', errors.length === 0, errors.join(' | '));

  // ---- 5. off again ------------------------------------------------------------------------------------
  await speaker(page).click();
  await page.waitForTimeout(700);
  check('off: state off, not pressed, stored', (await state()) === 'off' && (await speaker(page).getAttribute('aria-pressed')) === 'false' && (await page.evaluate(() => localStorage.getItem('rustyac:sound'))) === 'off');
  check('off: the context is suspended', JSON.stringify(await contexts()) === '["suspended"]', JSON.stringify(await contexts()));
  const count = audio().length;
  await speaker(page).click();
  await waitOn(page);
  await page.waitForTimeout(400);
  check('on again: no new context, nothing downloaded twice', (await contexts()).length === 1 && audio().length === count, `${(await contexts()).length} contexts, ${audio().length - count} new requests`);
  check('on again: running', JSON.stringify(await contexts()) === '["running"]');

  // ---- 6. the next visit: remembered, but silent until a press ------------------------------------------------
  await page.reload({ waitUntil: 'load' });
  const mark = audio().length;
  await toStage(page);
  check('next visit: state is armed, nothing made or downloaded yet', (await state()) === 'armed' && (await contexts()).length === 0 && audio().length === mark, `${await state()}, ${(await contexts()).length} contexts, ${audio().length - mark} requests`);
  check(
    'next visit: the speaker looks off, not pressed, with the "tap to resume" hint',
    (await speaker(page).getAttribute('aria-label')) === 'Sound off, tap to resume' &&
      (await speaker(page).getAttribute('aria-pressed')) === 'false' &&
      (await speaker(page).evaluate((b) => b.classList.contains('is-off') && getComputedStyle(b, '::before').content.includes('tap to resume'))),
  );
  await holdRev(page, 400);
  await waitOn(page);
  await page.waitForTimeout(300);
  check('next visit: the first rev starts the sound', (await state()) === 'on' && JSON.stringify(await contexts()) === '["running"]', JSON.stringify(await contexts()));
  check('whole visit: no errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---- 7. reduced motion: silent by default, the switch works the same ------------------------------------------
{
  const { context, page, audio, contexts, state, errors } = await open({ reducedMotion: 'reduce' });
  await toStage(page);
  await holdRev(page, 800);
  check('reduced motion: silent by default', audio().length === 0 && (await contexts()).length === 0);
  await speaker(page).focus();
  await page.keyboard.press('Enter');
  await waitOn(page);
  check('reduced motion: Enter on the speaker turns sound on', (await state()) === 'on' && JSON.stringify(await contexts()) === '["running"]');
  check('reduced motion: a keyboard press keeps the focus on the speaker', await page.evaluate(() => document.activeElement === document.querySelector('.rev__sound')));
  check('reduced motion: no errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
process.exitCode = failed === 0 ? 0 : 1;
