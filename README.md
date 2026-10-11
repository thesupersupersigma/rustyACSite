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
```

Add `?debug=1` to the homepage URL for the scene's overlay (FPS, frame time, quality tier, pixel
ratio, draw calls, triangles). With the overlay on, `&tier=high`, `&tier=mid` or `&tier=low` pins
the quality tier.

## Where things are

| Path | What |
|---|---|
| `src/pages/` | The homepage and the placeholder pages |
| `src/layouts/Base.astro` | Head tags, fonts, top bar, footer |
| `src/styles/` | Design tokens (dark and light) and global styles |
| `src/data/status.ts`, `src/data/proofs.ts` | The "What works today" grid and the proof log |
| `src/lib/release.ts` | Looks up the latest rustyAC release at build time (with a fallback) |
| `src/components/F2004Scene.astro` | The scene's shell: who gets it, scroll progress, lazy load |
| `src/scene/` | The three.js scene |
| `public/models/`, `public/textures/` | The car, the night track and its lightmaps |
| `scripts/make-brand.mjs` | Rebuilds the favicon, top-bar logo and share image (`npm run og`) |
| `scripts/shots.mjs` | Check screenshots with headless Chromium (`npm run shots`, after a build) |
| `Dockerfile`, `nginx.conf` | The production image: build, then nginx serving `dist/` |

## Trademarks

Assetto Corsa is a trademark of its owners. rustyAC is not affiliated with them and is not endorsed
by them.
