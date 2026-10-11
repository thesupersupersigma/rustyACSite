# Screenshots from the rustyAC repo

Every picture on the site that comes out of the game repo, where it is used, and how to replace it.

**State on 2026-10-10:** the 2560×1440 recaptures (made with rustyAC v0.23.1) were already in
`assets-src/media/screenshots/` when task 02 ran, so they are **in use**: the six slider pictures
and the share image below are the new ones.

## Inventory

"Largest shown" is the biggest size a visitor can see it at: CSS pixels × 2 for a high-DPI screen.

| Site file | rustyAC source | Used in | Resolution now | Largest shown | Capture at |
|---|---|---|---|---|---|
| `src/assets/screenshots/renderer_core_spa.png` | `docs/port/renderer_core_spa.png` | `src/components/CompareSlider.astro` (homepage, "Spa" tab, the "AC's shaders" half) | 2560×1440 (was 1280×720) | 1120×630 CSS px = 2240×1260 | 2560×1440 |
| `src/assets/screenshots/renderer_core_spa_debug.png` | `docs/port/renderer_core_spa_debug.png` | same slider, "Spa" tab, the "debug view" half | 2560×1440 (was 1280×720) | 2240×1260 | 2560×1440, the same frame as its pair |
| `src/assets/screenshots/renderer_core_monza.png` | `docs/port/renderer_core_monza.png` | same slider, "Monza" tab, "AC's shaders" | 2560×1440 (was 1152×648) | 2240×1260 | 2560×1440 |
| `src/assets/screenshots/renderer_core_monza_debug.png` | `docs/port/renderer_core_monza_debug.png` | same slider, "Monza" tab, "debug view" | 2560×1440 (was 1024×576) | 2240×1260 | 2560×1440, the same frame as its pair |
| `src/assets/screenshots/renderer_core_laguna_seca.png` | `docs/port/renderer_core_laguna_seca.png` | same slider, "Laguna Seca" tab, "AC's shaders" | 2560×1440 (was 1280×720) | 2240×1260 | 2560×1440 |
| `src/assets/screenshots/renderer_core_laguna_seca_debug.png` | `docs/port/renderer_core_laguna_seca_debug.png` | same slider, "Laguna Seca" tab, "debug view" | 2560×1440 (was 1280×720) | 2240×1260 | 2560×1440, the same frame as its pair |
| `src/assets/screenshots/og_burnout.png` | new capture from `tools/site_media/shots.sh` (no `docs/port` file); it replaces `docs/port/renderer_car_burnout.png` as the share image's source | `scripts/make-brand.mjs` → `public/og/rustyac-og.webp` | 2400×1260 | 1200×630 (the share image's fixed size) | 2400×1260 |
| `src/assets/screenshots/renderer_car_burnout.png` | `docs/port/renderer_car_burnout.png` | `scripts/make-brand.mjs`, only as the fallback when `og_burnout.png` is missing | 1152×648 | not shown while `og_burnout.png` exists | no recapture needed |

The old Monza pair was two different sizes (1152×648 and 1024×576); the new pair matches.

### Made from a screenshot

| Site file | Made from | By | Used in | Resolution |
|---|---|---|---|---|
| `public/og/rustyac-og.webp` | `og_burnout.png` + `src/assets/logo-mark.png` + the wordmark | `npm run og` (`scripts/make-brand.mjs`) | `src/layouts/Base.astro`: `og:image` and `twitter:image` on every page | 1200×630, 129 KB |
| `dist/_astro/renderer_core_*.avif` and `.webp` | the six slider pictures | `astro build` (`astro:assets`, `<Picture>` in `CompareSlider.astro`) | the `srcset` of the slider | 640, 960, 1280, 1920 and 2560 wide, AVIF with a WebP fallback |

### Stored as WebP (task 04)

The hero and gallery pictures are stored in `src/assets/screenshots/` as **WebP at quality 92**, not
PNG (about 0.6 to 1.3 MB each instead of 4.5 to 7.2 MB). `node scripts/use-screenshots.mjs --webp`
makes them from `assets-src/media/screenshots/*.png` and leaves the PNGs and the share image alone.

| Site file | Source | Used in |
|---|---|---|
| `hero_burnout.webp` | `assets-src/media/screenshots/hero_burnout.png` | `/download` (beside the button, and its share image) |
| `gallery_f2004_spa_chase.webp` | `gallery_f2004_spa_chase.png` | `/how-it-works` |
| `gallery_f2004_cockpit.webp` | `gallery_f2004_cockpit.png` | `/how-it-works` |
| `gallery_f2004_spa_trackside.webp` | `gallery_f2004_spa_trackside.png` | `/how-it-works` share image; cover of a devlog draft |
| `gallery_488_gt3_laguna_seca.webp` | `gallery_488_gt3_laguna_seca.png` | `/compatibility` |
| `gallery_heavy_clouds.webp`, `gallery_night_lights.webp` | the PNGs of the same name | covers of devlog drafts (not built while they are drafts) |
| `gallery_crash_damage.webp`, `gallery_f40_monza.webp` | the PNGs of the same name | not used yet |
| `web_spa.webp` | rustyAC `docs/port/web_spa.png` (1024×576; the copy in `assets-src/screenshots/`) | `/play`; cover of a devlog draft |

Pages show them through `src/components/ImageFigure.astro` (AVIF and WebP at 640 to 2560 px wide,
lazy). The build deletes the source files from `dist/` when no page links to them.

### Captured but not on the site yet (written in task 02; see the table above for what task 04 uses)

These are in `assets-src/media/screenshots/` and nothing uses them (no page for them exists yet;
task 04): `hero_burnout.png` and the eight `gallery_*.png` (`gallery_488_gt3_laguna_seca`,
`gallery_crash_damage`, `gallery_f2004_cockpit`, `gallery_f2004_spa_chase`,
`gallery_f2004_spa_trackside`, `gallery_f40_monza`, `gallery_heavy_clouds`, `gallery_night_lights`),
all 2560×1440. When a page shows one full-width, 2560×1440 is the right size.

`assets-src/screenshots/` still holds the 31 older, smaller copies of `docs/port/*.png` (960×540 up
to 1280×720). The site does not read that folder.

**How each picture was captured:** `assets-src/media/README.md` lists the exact `rustyac.exe` command
for every file (car, track, time, camera, size), including the 2400×1260 `og_burnout.png`. In the
rustyAC repo the script that runs them all is `tools/site_media/shots.sh`, and the write-up is
`docs/site_media.md`.

## How the site handles the big files

- **Slider:** `astro:assets` makes each picture 640, 960, 1280, 1920 and 2560 px wide, in AVIF and
  WebP. `sizes` tells the browser the slider is 1120 px wide on a desktop and the window width minus
  the gutters below that, so a normal laptop downloads the 1280 one (about 70 KB), a high-DPI laptop
  the 2560 one (about 280 KB) and a phone the 640 or 1280 one. Checked in headless Chromium at 1×, 2×
  and on a 390 px phone.
- **Share image:** `scripts/make-brand.mjs` uses `src/assets/screenshots/og_burnout.png` when it
  exists and falls back to `renderer_car_burnout.png`. The two layouts differ: with `og_burnout.png`
  (car on the left, calm tarmac below) the logo and wordmark sit along the bottom; with the old
  picture they sit on the left.
- **The 2560×1440 PNG sources are not deployed.** Astro copies them into `dist/_astro/`; a small step
  in `astro.config.mjs` deletes the ones no page links to (29.8 MB), so `dist/` stays about 13 MB.

## How to swap them in

1. Put the new files in `assets-src/media/screenshots/` with the names from the table
   (`renderer_core_spa.png`, `renderer_core_spa_debug.png`, the two Monza and two Laguna Seca ones,
   `og_burnout.png`).
2. Run `npm run screenshots`. It copies those seven into `src/assets/screenshots/` under the same
   names, warns if a before/after pair has two different sizes, and remakes
   `public/og/rustyac-og.webp`.
   - By hand it is the same thing: copy the files over the ones in `src/assets/screenshots/`, then
     `npm run og`.
   - From another folder: `node scripts/use-screenshots.mjs <folder>`.
3. Run `npm run build`. The first build after new pictures takes about 35 s longer (AVIF encoding);
   later builds reuse the cache.
4. Look at the slider on the homepage (all three tabs) and at `public/og/rustyac-og.webp`, then
   commit `src/assets/screenshots/` and `public/og/rustyac-og.webp`.

Rules for a recapture:
- A slider pair must be the **same frame at the same size** (the debug view and AC's renderer of one
  moment), 16:9.
- `og_burnout.png` is 2400×1260 with the bottom 30% calm, because the wordmark goes there.
- New pictures that are not in the list (a new gallery, a hero) are not copied by the script: add
  them to the `USED` list in `scripts/use-screenshots.mjs` when a page starts using them.
