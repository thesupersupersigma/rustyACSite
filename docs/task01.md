# Task 01 report

## Resume here

- **All five steps are done.** `npm run build` and `npx astro check` pass with zero errors, the
  screenshots are in `docs/task01/`, and the work is committed (see "Git" below).
- Nothing is half-finished. The next task is 02 (hold-to-rev burnout); its hooks are described under
  "Hooks for tasks 02 and 03".
- If something looks off in the scene, start with the constants at the top of `src/scene/main.ts`
  (exposure, env intensity, lights), `src/scene/track.ts` (wetness), `src/scene/streaks.ts` and
  `src/scene/rig.ts` (camera), and check with `?debug=1`.

## Git

Three commits on `master`, nothing pushed: the site (`dbfa055`), a `.gitattributes` follow-up that
keeps `public/models/`, `public/textures/` and `assets-src/` byte for byte, and this note. `brainstorm.md`,
`prompts/`, `scratch/`, `assets/`, `node_modules/` and `dist/` are ignored.

## Summary

The site now exists. It is an Astro + TypeScript project with the design system (charcoal, rust
accent, Syne / Inter / JetBrains Mono, dark and light themes), the top bar and footer, the whole
homepage with the real copy, five placeholder pages so no link is dead, and the server files for
the deploy.

The F2004 night scene is in and working: the car sits on the wet track, the page scrolls into it (a
rounded card grows to the full screen while the camera comes down), you can drag to look around, and
scrolling on fades it away into "What works today". The wet look is a real mirror image of the car
and the lights in the tarmac (sharp in puddles, blurred where it is only damp), light streaks,
and bloom. It picks one of three quality levels by itself, and `?debug=1` shows FPS and the level.

Phones never get the scene (the section is gone and three.js is never downloaded). Everything
outside the scene ships about 6 KB of JavaScript.

Not built, on purpose: the burnout, smoke, sound and the real content of the other pages (tasks
02 to 04), and nothing is deployed (task 05).

## What's built

**Project**
- `package.json`: `rustyacsite` 0.1.0, exact versions, scripts `dev`, `build`, `preview`, `check`
  (plus `og` and `shots`).
- `astro.config.mjs`: `site`, static output, sitemap (the placeholder pages are filtered out).
- `tsconfig.json`: Astro's strict preset. `.gitattributes`: LF line endings.
- `README.md`: how to run it and where things are.

**Design system and layout**
- `src/styles/tokens.css`: the colour table from the prompt as CSS variables, dark by default,
  light under `[data-theme="light"]`. `src/styles/global.css`: base styles, buttons, cards, focus
  ring, reduced motion.
- `src/layouts/Base.astro`: title, description, canonical, Open Graph and Twitter tags, JSON-LD
  slot, the no-flash theme script, self-hosted fonts (latin subsets only, two preloaded).
- `src/components/TopBar.astro`: logo + "rusty**AC**", the six links, GitHub and Discord icons,
  theme toggle (saved in `localStorage`, in try/catch), a menu button below 900 px.
- `src/components/Footer.astro`: logo, the four links, the trademark line, `put ai disclaimer
  here`, "© 2026 thesupersupersigma".
- `src/components/Icon.astro`, `StubPage.astro`: small helpers.

**Homepage** (`src/pages/index.astro`)
- Hero, the scene, "What works today" (from `src/data/status.ts`), "Bit-exact in 3 steps" with the
  proof log (from `src/data/proofs.ts`), the before/after slider
  (`src/components/CompareSlider.astro`: drag, touch and arrow keys; tabs for Spa, Monza and Laguna
  Seca), the Download and Play cards, the Discord band.
- `src/lib/release.ts`: asks GitHub for the latest release once per build; falls back to v0.22.1
  if the request fails, so the build can't break because of it.
- `src/lib/site.ts`: the links and the nav in one place.
- `SoftwareApplication` JSON-LD on the homepage.
- Screenshots and the logo go through `astro:assets` (AVIF with a WebP fallback, several widths).

**Placeholder pages**: `/download`, `/play`, `/how-it-works`, `/progress`, `/devlog` (noindex, out
of the sitemap), plus a `404`.

**The scene**
- `src/components/F2004Scene.astro`: decides before first paint who gets the scene (not phones,
  WebGL2 only), reads the scroll position into `p`, drives the card-to-fullscreen `clip-path` and
  the fade, and imports `src/scene/main.ts` when the section is about 1.5 screens away.
- `src/scene/main.ts`: renderer, environment map (one cube capture of the track), car, lights,
  contact shadow, sky gradient, the frame loop, tiers, dispose, and the API for tasks 02/03.
- `src/scene/assets.ts`: downloads (GLBs with byte progress for the loading bar), all with
  `?v=<package version>`.
- `src/scene/track.ts`: the track materials as in the reference (lightmaps, asphalt, glow panels,
  dark start lights) and the wet-asphalt shader.
- `src/scene/reflection.ts`: the planar reflection (mirrored camera, oblique clip plane).
- `src/scene/streaks.ts`: the light streaks, one instanced mesh for all 25 lights.
- `src/scene/rig.ts`: drag-to-orbit camera, idle sway, scroll entry and exit.
- `src/scene/quality.ts`: the three tiers and when to switch. `src/scene/debug.ts`: the overlay.
- `src/scene/types.ts`: the types of the scene API.

**Brand files** (`scripts/make-brand.mjs`, run with `npm run og`): `public/og/rustyac-og.webp`
(1200×630, from `renderer_car_burnout.png` with the wordmark), `public/favicon.png`,
`public/apple-touch-icon.png`, `src/assets/logo-mark.png`.

**Server files**: `Dockerfile` (node:22-alpine build, nginx:1.27-alpine serving `dist/` on port
80), `nginx.conf` (gzip, `.glb` MIME type, the three cache rules, the 404 page), `.dockerignore`.
`public/robots.txt` points at the sitemap.

## How to run it

```
npm install
npm run dev          # http://localhost:4321
npm run build && npm run preview
```

- `http://localhost:4321/?debug=1` shows the overlay: FPS, frame ms, tier, DPR, draw calls,
  triangles, and `p`.
- `?debug=1&tier=high` (or `mid`, `low`) pins a tier, to compare them.
- In the browser console, `window.__f2004` is the scene API.
- `npm run shots` (after a build) retakes the check screenshots. It needs
  `npx playwright install chromium` once.

### Hooks for tasks 02 and 03

`createF2004Scene()` in `src/scene/main.ts` resolves to an object (type `F2004Scene` in
`src/scene/types.ts`), also reachable as `window.__f2004` once the scene is ready:

- `getCar()`: `{ root, hubs, wheels, nuts }`, each of the last three keyed by `FL`, `FR`, `RL`, `RR`
- `getStartLights()`: the five pods in order; each has its own material, so one can be lit alone
- `onFrame(cb)`: runs every rendered frame with `{ dt, time, p }`; returns a function that removes it
- `p` and `tier` (read-only), `setProgress`, `setReducedMotion`, `dispose`

At load it checks that all four `hub_XX`, `wheel_XX` and `nut_XX` nodes exist and logs a clear
error naming the missing ones.

## Screenshots

All in `docs/task01/`, WebP, each under 300 KB, taken with headless Chromium on SwiftShader.

| What | Dark | Light |
|---|---|---|
| Top of the homepage, 1440×900 | [home-top-dark](task01/home-top-dark.webp) | [home-top-light](task01/home-top-light.webp) |
| Scene arriving (before it pins) | [scene-arriving-dark](task01/scene-arriving-dark.webp) | |
| Scene at p ≈ 0.1 (entry) | [scene-p01-dark](task01/scene-p01-dark.webp) | [scene-p01-light](task01/scene-p01-light.webp) |
| Scene at p ≈ 0.5 (the stage) | [scene-p05-dark](task01/scene-p05-dark.webp) | [scene-p05-light](task01/scene-p05-light.webp) |
| Scene at p ≈ 0.9 (exit) | [scene-p09-dark](task01/scene-p09-dark.webp) | |
| The stage on the mid and low tiers | [mid](task01/scene-p05-tier-mid.webp), [low](task01/scene-p05-tier-low.webp) | |
| What works today | [home-status-dark](task01/home-status-dark.webp) | [home-status-light](task01/home-status-light.webp) |
| Bit-exact in 3 steps | [home-bit-exact-dark](task01/home-bit-exact-dark.webp) | [home-bit-exact-light](task01/home-bit-exact-light.webp) |
| Before/after slider | [home-renderer-dark](task01/home-renderer-dark.webp) | [home-renderer-light](task01/home-renderer-light.webp) |
| Download / Play cards | [home-get-dark](task01/home-get-dark.webp) | [home-get-light](task01/home-get-light.webp) |
| Discord band and footer | [home-discord-dark](task01/home-discord-dark.webp) | [home-discord-light](task01/home-discord-light.webp) |
| Placeholder page | [stub-download-dark](task01/stub-download-dark.webp) | |
| Phone 390×844, touch: top | [phone-top-dark](task01/phone-top-dark.webp) | [phone-top-light](task01/phone-top-light.webp) |
| Phone: the hero runs straight into "What works today" | [phone-hero-to-status-dark](task01/phone-hero-to-status-dark.webp) | [phone-hero-to-status-light](task01/phone-hero-to-status-light.webp) |
| Phone: menu open | [phone-menu-dark](task01/phone-menu-dark.webp) | |

The scene shots use `?debug=1&tier=high`, so the overlay is visible in them.

**Phone check** (390×844, touch emulation): the section computes to `display: none` with height
0, the gate flag is never set, and no scene script is requested.

**Overflow check** at 360, 768, 1024 and 1440 px on `/` and `/download`: no horizontal overflow at
any of them (the page is as wide as the window, and no element sticks out past either edge).

## Sizes

JavaScript per route (after `npm run build`):

| Route | Inline JS | Module JS | Notes |
|---|---|---|---|
| `/` | 2.5 KB | 3.3 KB (1.6 KB gzip) | theme + menu + slider inline; the scene's shell as a module |
| `/download`, `/play`, `/how-it-works`, `/progress`, `/devlog`, 404 | 1.2 KB | none | theme + menu |

So the homepage without the scene ships about 5.9 KB of JavaScript, and the other pages 1.2 KB.

What the scene downloads, only when a visitor who gets it scrolls near it:

| File | Bytes |
|---|---|
| scene chunk (three.js + the scene code) | 679,310 (172 KB gzip) |
| `models/f2004.glb` | 3,447,684 |
| `models/night_track.glb` | 60,020 |
| `models/night_track.json` | 5,291 |
| `textures/asphalt_albedo.webp` | 244,124 |
| `textures/asphalt_rough.webp` | 77,894 |
| `textures/night_track_lm_ground.webp` | 12,410 |
| `textures/night_track_lm_props.webp` | 90,104 |
| `textures/puddle_mask.webp` | 9,680 |
| **Total** | **4,626,517 (4.41 MB)** uncompressed; about 3.7 MB with nginx's gzip |

**Tier the headless render picked:** `mid`, the tier it starts on. That says little: headless
Chromium only hands out a frame every few seconds while nothing is capturing the page, so the
frame-time measurement there is not meaningful. The real answer needs a real GPU and the
Chromebook (`?debug=1`).

## Not done

- No burnout, smoke, tyre heat, start-light logic, tyre pop, pit stop or sound (tasks 02 and 03).
  The start lights are dark red and the hooks are there.
- The other pages are placeholders (task 04). Nothing is deployed (task 05).
- **The Dockerfile and `nginx.conf` were not run.** This machine has neither Docker nor nginx, so
  they are written carefully but untested. Test them first thing in task 05.
- **Not tested on a real GPU or on the Chromebook.** Every render here is software (SwiftShader).
  The look is checked; real frame rates and the automatic tier are not.
- The scene has no keyboard control for the camera (the prompt asks for drag and touch only).

## Open questions

Choices I made without asking, for you to confirm or change:

1. **Git.** The prompt says no git commands; you said in chat that git is allowed, so I committed.
   `brainstorm.md` is not in the repo (it was already ignored, and the repo had no commits).
2. **`.gitignore` additions.** I added `/assets/` (your 15.8 MB `f2004.blend`, the same reasoning as
   the already-ignored `assets-src/models/`), `.env*`, editor/OS leftovers and `.claude/`. Every
   existing line is kept. Say if `assets/` should be tracked after all.
3. **Is this repo meant to carry a licence?** I did not add a `LICENSE` file or a `license` field;
   the site only states rustyAC's licence (GPL-3.0-or-later) in the JSON-LD, as the prompt asks.
4. **TypeScript 6.0.3, not 7.** `@astrojs/check` only accepts TypeScript 5 or 6 for now.
5. **The logo.** In the top bar the logo sits next to the text wordmark at 28 px, where its own
   lettering would be unreadable, so `scripts/make-brand.mjs` masks the lettering out and the top
   bar, favicon and share image use the mark alone. The footer uses the full logo. Two things to
   know: the mark is red (the prompt says no Ferrari red in the UI; I left your logo's colours
   alone), and it is drawn in the style of Assetto Corsa's own logo, which sits awkwardly with
   rule 5 ("no AC logos"). Your call; I only used the file as given.
6. **A second real-time light on the car.** The prompt lists a key light from `flood_5` and a warm
   fill from the pit side. With only those, the side of the car facing the camera at the hero angle
   was black, so I added one more spotlight from `flood_1` (the nearest floodlight on the
   grandstand side, at 420 against the key's 900).
7. **The track is lit only by its lightmaps.** In the reference page the key spotlight also lit the
   ground and walls, on top of the baked light. Here the real-time lights only affect the car
   (as brainstorm 1.11 says). It removed a blown-out glare on the wet ground at low camera angles.
8. **Hero angle and camera distance.** The hero angle is front-left (38° off the nose, 1.3 m up),
   with the lit garages as the backdrop. There is no zoom (the wheel scrolls the page), so the
   distance follows the height: 5 m when the camera is low, 6.2 m at the hero angle, 9 m at the top.
9. **"Slow cinematic orbit around the hero angle"** is a slow swing of 28° either side of the hero
   angle, at most 2°/s, not a full lap, so the garages stay behind the car.
10. **Puddle mask tiling.** The prompt says ×0.35 on UV0; the reference page effectively used ×1.05
    (0.35 of the already ×3 asphalt UV). I followed the prompt: bigger puddles, about one tile per
    11 m.
11. **gzip for `.glb`.** Beyond the prompt's list I added `model/gltf-binary` to nginx's gzip types:
    the car goes from 3.45 MB to 3.07 MB. Remove it from `nginx.conf` if you'd rather not.
12. **Tier thresholds.** Step down when a 60-frame average is above 25 ms (under 40 fps); step up
    after four windows in a row under 18 ms. A tier it had to leave gets one retry after about 12 s
    of good frames; leaving it twice rules it out for the visit. On the mid and high tiers the
    post-processing target uses 2× / 4× MSAA.
13. **If the scene fails to load** (network error, lost context at start) the whole section is
    removed, so nobody scrolls through three empty screens.
14. **Astro copies the original PNG screenshots into `dist/_astro/`** (1.7 MB) even though no page
    links to them. Harmless, but it is dead weight in the image; it can be cleaned up in task 05.
15. **Files in `public/models/` and `public/textures/`**: none needed changing.
16. **The release fallback** (used only when GitHub can't be reached during a build) shows
    "rustyAC v0.22.1" and 10 October 2026. Those are that release's real name and date as GitHub
    reported them today, not placeholders.
17. **Reduced motion.** Besides "no dolly, no auto camera", the camera also doesn't drift back to
    the hero angle after a drag; it stays where the visitor left it.

## Review

Three read-only Sonnet subagents read the finished code against the prompt (one for the copy and
config, one for the three.js code, one for accessibility and the server files). They confirmed the
copy is word for word and the tokens, versions, links and cache rules match. They found no
blocking bug. What they did find is fixed: arrow keys moved the slider only 0.1% per press; the
proof log's focus ring was clipped away; the phone menu's links came before its button in tab
order; a failure halfway through the scene's setup left the renderer alive; a lost and restored
WebGL context lost the car's reflections; one slow moment could pin the low tier for good.
