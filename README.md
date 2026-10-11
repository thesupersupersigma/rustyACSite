# rustyACSite

The website for [rustyAC](https://github.com/thesupersupersigma/rustyAC) (rustyac.com), a
from-scratch Rust rewrite of Assetto Corsa that is checked bit for bit against the original game.

Built with Astro and TypeScript. The pages are static HTML with almost no JavaScript; the homepage's
3D scene (three.js) is fetched only when a visitor scrolls near it, and never on phones.

## Run it

```
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/ (first fetches the browser preview into public/play/app/)
npm run check      # astro check (TypeScript strict)
npm test           # unit tests (vitest): the burnout, the sound model, the release list
npm run links      # after a build: every internal link in dist/ (no dead links)
npm run shots:pages  # after a build: page screenshots, overflow at 360 px, JS per page, the preview
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
| `src/pages/` | The homepage, Download, Play, How it works, Progress, Compatibility, Devlog, FAQ |
| `src/layouts/Base.astro`, `Page.astro` | Head tags, fonts, top bar, footer; `Page` adds the page header, the text column and the table of contents |
| `src/content/devlog/` | The devlog's posts (Markdown). `draft: true` keeps a post out of the build |
| `src/data/roadmap.ts`, `compatibility.ts`, `faq.ts` | What /progress, /compatibility and /faq show. Each file says at the top how to update it |
| `src/data/release-fallback.json` | The release list used when GitHub cannot be reached during a build |
| `scripts/fetch-web-preview.mjs` | Downloads, verifies and unpacks the browser preview before a build (`npm run play:fetch`) |
| `scripts/check-links.mjs`, `scripts/shots-pages.mjs` | The link crawler and the page checks |
| `src/styles/` | Design tokens (dark and light) and global styles |
| `src/data/status.ts`, `src/data/proofs.ts` | The "What works today" grid and the proof log |
| `src/lib/release.ts` | Reads rustyAC's releases from GitHub once per build (with a fallback). `GITHUB_TOKEN` is used when set |
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
