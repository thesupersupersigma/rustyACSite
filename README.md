# rustyACSite

The website for [rustyAC](https://github.com/thesupersupersigma/rustyAC) (rustyac.com), a
from-scratch Rust rewrite of Assetto Corsa that is checked bit for bit against the original game.

Built with Astro and TypeScript. The pages are static HTML with almost no JavaScript; the homepage's
3D scene (three.js) is fetched only when a visitor scrolls near it, and never on phones.

## Run it

```
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm run check      # astro check (TypeScript strict)
npm test           # unit tests (vitest) for the burnout state machine
```

Add `?debug=1` to the homepage URL for the scene's overlay (FPS, frame time, quality tier, pixel
ratio, draw calls, triangles, and the burnout's state, revs, throttle, heat and smoke). With the
overlay on, `&tier=high`, `&tier=mid` or `&tier=low` pins the quality tier.

On the stage, hold the round button (or Space) to rev; hold about 6.5 s and the rear tyres pop, then
"Pit stop" changes all four wheels. In the console, `window.__f2004.sim` steps the same thing in
fixed steps (`hold(seconds)`, `release()`, `advance(seconds)`, `pop()`, `pitStop()`, `view(deg, m)`,
`bench()`, `resume()`).

## Where things are

| Path | What |
|---|---|
| `src/pages/` | The homepage and the placeholder pages |
| `src/layouts/Base.astro` | Head tags, fonts, top bar, footer |
| `src/styles/` | Design tokens (dark and light) and global styles |
| `src/data/status.ts`, `src/data/proofs.ts` | The "What works today" grid and the proof log |
| `src/lib/release.ts` | Looks up the latest rustyAC release at build time (with a fallback) |
| `src/components/F2004Scene.astro` | The scene's shell: who gets it, scroll progress, lazy load |
| `src/scene/` | The three.js scene. `sim.ts` is the burnout state machine (pure, unit-tested), `burnout.ts` puts it on the car, `smoke.ts` and `debris.ts` are the particles, `controls.ts` the button |
| `public/models/`, `public/textures/` | The car, the night track and its lightmaps |
| `scripts/make-brand.mjs` | Rebuilds the share image (`npm run og`); with `icons`, the favicons too |
| `scripts/use-screenshots.mjs` | Copies recaptured rustyAC screenshots into the site (`npm run screenshots`); see `docs/screenshots.md` |
| `scripts/shots.mjs` | Check screenshots with headless Chromium (`npm run shots`, after a build) |
| `scripts/bench.mjs` | Frame cost of the burnout per quality tier (`npm run bench`, after a build) |
| `docs/` | The task reports and `screenshots.md` (which game screenshot is used where) |
| `Dockerfile`, `nginx.conf` | The production image: build, then nginx serving `dist/` |

## Trademarks

Assetto Corsa is a trademark of its owners. rustyAC is not affiliated with them and is not endorsed
by them.
