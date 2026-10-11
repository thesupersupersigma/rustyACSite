# Task 04 report

## Resume here

- **All steps are done.** `npm run build`, `npx astro check` (0 errors, 0 warnings, 0 hints) and
  `npm test` (69 tests) pass. The link crawler finds no dead link. `node scripts/check-sound.mjs`
  passes its 35 checks. Version `0.4.0`, tag `v0.4.0`.
- Nothing is half-finished. Three things need you: the logo, a `GITHUB_TOKEN` in Coolify (optional)
  and the four devlog drafts. They are under "What you need to do".
- Read "Open questions" 1 to 4 first: they are places where I did not do exactly what the prompt
  said, because the game repo says something else.

## Git

Tag: `v0.4.0`. Commits on `master`, nothing pushed (`git log v0.3.0..v0.4.0` has the list).

Your logo files (`src/assets/logo.png`, `src/assets/logo-mark.png`, `public/favicon.png`,
`public/apple-touch-icon.png`, `public/og/rustyac-og.webp`) are still changed and uncommitted, with
the same content as before.

**One slip, undone:** near the end I ran `git add src`, which put your two logo files into a commit
of mine. I saw it in the next command, took my last two commits apart again (`git reset --soft`,
which does not touch files), unstaged the logos and committed again without them. The files' hashes
were checked before and after: unchanged. No commit in the history touches a logo file.

Two commits are not as tidy as they should be: `feat(release): ...` also carries the deletion of
`StubPage.astro` and the old `devlog.astro` (it does not build alone; the next commits repair it),
and `fix(scene): ...` also carries the un-tracking of the WAV.

## Summary

The five placeholder pages are real pages now, and there are three new ones.

- **Download** shows the newest release with a big button, what you need, the first run step by
  step, the keys, the most useful options, the honest limits and the last ten releases.
- **Play** explains the browser preview and has a button that starts it. The preview is hosted on
  rustyac.com itself, at `/play/app/`: every build downloads the newest one from GitHub, checks it,
  and unpacks it. On a phone the button is replaced by "Open this on a computer".
- **How it works** is the long version of the homepage's three steps, with two diagrams I drew
  (the pipeline, and the oracle) and a plain section on what "bit-exact" does and does not mean.
- **Progress** is the roadmap in five phases with a status for every task, a "Later" list, and
  every release.
- **Compatibility** lists what loads (119 of 123 cars, all 44 drivable layouts) and what is refused
  and why.
- **Devlog** exists, with an RSS feed. The four posts are written but are drafts, so the page says
  "The first posts are being written" and nothing of them is built.
- **FAQ** has 13 short answers that open when clicked. The AI answer is your placeholder.
- **`/what-next`** is the hidden page: one dark screen, one line, a link home.

Every number on these pages was checked against the game repo by a second reader (a Sonnet
subagent, about 460 claims). It found 2 wrong statements and about 30 that said more than the
reports do. All are fixed; the list is under "Fact check".

No page except the homepage loads a JavaScript file.

## The pages, file by file

| File | What |
|---|---|
| `src/layouts/Page.astro` | The layout of every subpage: breadcrumb, title, one-line intro, a text column, an optional table of contents (a box on phones, a sticky column on wide screens), `BreadcrumbList` JSON-LD |
| `src/layouts/Base.astro` | Now takes a per-page share image, several JSON-LD blocks and `bare` (no top bar, no footer). A `noindex` page gets no canonical address |
| `src/styles/prose.css` | Text styles for long pages: headings, lists, tables that scroll in their own box, code, the fold-open rows, the status dots |
| `src/components/ImageFigure.astro` | A picture with a caption: AVIF and WebP at 640 to 2560 px, lazy |
| `src/components/Changelog.astro` | The releases, each folded into a `<details>` |
| `src/components/PipelineDiagram.astro`, `OracleDiagram.astro` | The two inline SVG diagrams. They use the site's colour variables, so they follow the theme |
| `src/lib/release.ts`, `src/lib/notes.ts` | The release list (below) and a small, safe Markdown-to-HTML for release notes |
| `src/lib/og.ts` | Cuts a 1200×630 share image from a screenshot at build time |
| `src/lib/devlog.ts`, `src/content.config.ts` | The devlog collection: published posts only, reading time, cover pictures |
| `src/pages/download.astro` | /download |
| `src/pages/play.astro` | /play |
| `src/pages/how-it-works.astro` | /how-it-works |
| `src/pages/progress.astro` + `src/data/roadmap.ts` | /progress |
| `src/pages/compatibility.astro` + `src/data/compatibility.ts` | /compatibility |
| `src/pages/devlog/index.astro`, `[slug].astro`, `rss.xml.ts` | /devlog, one page per published post, the feed |
| `src/content/devlog/*.md` | The four drafts |
| `src/pages/faq.astro` + `src/data/faq.ts` | /faq, with `FAQPage` JSON-LD |
| `src/pages/what-next.astro` | The hidden page |
| `src/pages/404.astro` | Rewritten without `StubPage.astro`, which is deleted |
| `scripts/fetch-web-preview.mjs` | Downloads, checks and unpacks the browser preview (`prebuild`) |
| `scripts/check-links.mjs` | The link crawler (`npm run links`) |
| `scripts/shots-pages.mjs` | Page screenshots and checks (`npm run shots:pages`) |
| `scripts/use-screenshots.mjs` | New `--webp` mode: makes the WebP pictures and leaves the share image alone |
| `public/llms.txt` | A plain-text summary with a link to every page |
| `src/data/release-fallback.json` | A trimmed copy of GitHub's real answer, used when GitHub is down |

Also changed: the top bar and footer have **FAQ** (the footer also Compatibility); the sitemap has
every real page and leaves out `/what-next` and `/404`; `Dockerfile`, `nginx.conf` (gzip for
`.wasm` and the feed), `.gitignore`, `README.md`, `docs/screenshots.md`.

## Where each page's facts come from

Every fact has a comment next to it in the source naming the file in the rustyAC repo.

| Page | Sources in rustyAC |
|---|---|
| /download | `packaging/HOW_TO_RUN.txt` (requirements, commands, keys); `crates/rustyac-game/src/cli.rs` at the tag `v0.23.0` (that each option exists, and the default car and road); `README.md` and the HOW_TO_RUN intro (limits). Version, date, sizes and links: the GitHub API |
| /play | `docs/web.md` (what it is, keys, the folder, memory); `docs/port/web.md` (160 drives, the self-test, what is missing); the preview's own `app.js` (what the browser stores) |
| /how-it-works | `docs/map/*.md` (the build of `acs.exe`, 7,453 functions, how the maps were reviewed); `docs/map/tyre_oracle.md` and `docs/oracle/car_oracle.md` (the oracle); `docs/port/sctm.md`, `ode_stage1.md`, `tyre_step.md`, `whole_car.md`, `tracks.md`, `audio.md`, `renderer_core.md`, `renderer_car.md`, `postfx.md`, `web.md` (the numbers) |
| /progress | the ROADMAP section of rustyAC's `brainstorm.md` (phases 2 to 5, statuses, the "about a third" line); the reports for phase 1 and for each task's one-line description; the GitHub API for the changelog |
| /compatibility | `docs/port/suspensions.md` (cars), `docs/port/tracks.md` (tracks, section 3's table for the names), `awd_ers.md`, `drivetrain.md`, `whole_car.md`, `damage_sparkles.md` (what a car can have), `audio.md` (what "123 installed" means) |
| /faq | `LICENSING.md`, `HOW_TO_RUN.txt`, `README.md`, `docs/port/tracks.md`, `conditions.md`, `sctm.md`, the ROADMAP section |
| devlog drafts | the report named in each comment |

### Fact check

A Sonnet subagent compared every number and claim on the new pages and in the four drafts with the
game repo. It confirmed all counts, names, flags and key tables, and found these, all fixed:

- **Wrong:** a draft said the Windows-only parts "were already separate" (they were separated in
  that task); a draft said "the other functions have only one body" (the double `sin` has two that
  differ, `tanf` has two that agree).
- **Said too much:** "every part of the game goes through all four steps" (now "every part that is
  ported"); "the compiler had turned some sums into packed additions" (the report only infers the
  compiler; now "the game's machine code adds..."); the whole-tyre and every-track rows (now with
  their caveats: not-a-number inputs, one value left out on the drag strips); "each refused entry is
  one plain AC cannot load either" (five are just not installed); "Chrome or Edge" (only Chrome was
  run); "same results bit for bit" without "on any processor since about 2013"; the grip post's
  headline and its last-test paragraph; the "24 + 18 + 12 faults, every one caught" line (five of
  the 18 only showed on an altered test car, and the 12 are inside the 24).
- **No source:** "Most of the renderer has been ported since" on /progress (deleted); the argument
  that one different bit grows over a drive (deleted); "ten years apart" (now "a 2012 and a 2014
  processor", as the report says).
- **One wrong citation** on /how-it-works, corrected, and the caveat it really pointed at (the test
  hands both renderers some of the same inputs) is now on the page.

Still on the pages and not from the game repo, because a page needs them: that a browser cannot
load a Windows DLL (the report says so too), what WARP is, and that /play "does not run on a
phone" (the reports never mention phones; the prompt asked for the notice).

## How /play gets the preview

1. `npm run build` first runs `scripts/fetch-web-preview.mjs` (`"prebuild"` in `package.json`).
2. It asks GitHub for the release list, once. With `GITHUB_TOKEN` in the environment it sends it
   (never printed, never written to a file).
3. It takes the newest release that has a `rustyAC-vX.Y.Z-web.zip` and its `.sha256`, downloads
   both, and compares the SHA-256.
4. It reads the zip's file list **before unpacking anything**. Only `index.html`, `app.js`,
   `style.css`, `LICENSE-GPL`, `LICENSING.md` and files directly in `pkg/` are allowed (what
   rustyAC's `docs/release.md` says the zip holds). Anything else: it stops and publishes nothing.
5. It unpacks into `public/play/app.new/`, writes `VERSION` there, and only then swaps it in as
   `public/play/app/`. That folder is gitignored.
6. It saves the release list in `node_modules/.cache/rustyacsite/releases.json`. `src/lib/release.ts`
   uses that copy when it is less than 15 minutes old, so **one build makes one API request**.

**When GitHub is down** (tested by making every request fail):

- With a copy from an earlier build: the script says so, keeps it, the build passes.
- With no copy: the build passes, `/play` shows "The preview is unavailable right now" with a link
  to the release, and no `/play/app/` exists.
- The pages then take the version, date, sizes and changelog from
  `src/data/release-fallback.json` (v0.23.0 and the 13 before it). The build log says
  `[release] using the checked-in fallback`.

**Sub-path:** the preview uses only relative addresses (`style.css`, `app.js`, `./pkg/...`), so it
works at `/play/app/` unchanged. Checked in headless Chromium: from `/play`, through the button, it
reaches "Open your Assetto Corsa folder", the WebAssembly program starts (the page prints
`rustyAC 0.23.0 (browser preview), maths: Pure`), and its own code logs no error. See open
question 5 for the one 404 it causes.

**Docker:** the build stage must reach `api.github.com` and `github.com`. `GITHUB_TOKEN` is an
optional build argument, used for the build command only. The final image is a separate stage with
nginx and `dist/`, so the token is not in it. **The Dockerfile was not built here** (no Docker on
this PC, as in task 01).

## How to publish a devlog post

1. Open the post in `src/content/devlog/`. Rewrite it in your own voice.
2. Delete the first line (`<!-- DRAFT written by Claude Code ... -->`) when it is yours. The site
   also works with it left in.
3. Set `draft: false` and check `date`.
4. `npm run build`. The post gets a page at `/devlog/<file name>`, and appears in the index, the
   RSS feed and the sitemap. The "being written" message goes away with the first published post.

Front matter: `title`, `date`, `summary`, `draft`, and optionally `cover` (the name of a picture in
`src/assets/screenshots/` without `.webp`) and `coverAlt`. A new post is a new `.md` file there.

I built once with all four set to `draft: false` to see that the pages, covers, feed and sitemap
work, then set them back. Word counts: 834 to 960.

## How to update the roadmap and compatibility data

- **Roadmap:** `src/data/roadmap.ts`. The comment at the top has the rules. When a task is done:
  `status: 'done'`, add `version` and `report`. **A report is only linked once its version is in
  GitHub's release list.** That is why Task 24 shows "v0.24.0, not released yet" and no link: the
  tag and `docs/port/several_cars.md` are on your PC but not pushed. It fixes itself on the first
  build after you push rustyAC.
- **The changelog's titles** ("Every suspension" next to v0.17.0) come from the same file: a
  release gets the title of the task with that `version`.
- **Compatibility:** `src/data/compatibility.ts`. Each block names the report it comes from.
- **FAQ:** `src/data/faq.ts`. Each answer exists twice, as HTML and as plain text for search
  engines. Keep them saying the same.

## Checks

| Check | Result |
|---|---|
| `npm run build` | passes, 10 pages |
| `npx astro check` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 69 tests pass (9 new, for the release list and the release notes) |
| `node scripts/check-links.mjs` | 11 HTML files, about 460 internal links, **no dead links**; nothing links to `/what-next`; every built page is in the sitemap except `/what-next` and `/404` |
| External links (one-off) | all 81 different external links answered (GitHub pages and files, Discord) |
| Overflow at 360 px | none on all ten pages |
| `/play` on a phone | shows "Open this on a computer", hides the button; a computer gets the button |
| `/play/app/` in headless Chromium | loads to "Open your Assetto Corsa folder", no error from its own code |
| `node scripts/check-sound.mjs` | all 35 checks pass, with the speaker check changed for H1 |
| GitHub down | build passes with and without an older preview copy |

**JavaScript per page:** no subpage requests a script file. Each carries the two small inline
scripts every page had before this task (the theme before first paint, and the theme and menu
buttons): 1,186 characters together. `/what-next` has only the first (211 characters). The
homepage is as it was: the scene's shell is still 3,363 bytes; the scene chunk grew by 548 bytes
(the "tap to resume" hint), to 736,310.

**Sizes:** `dist/` is about 26 MB with the preview (4.3 MB) and the new pictures.

## The two leftovers from task 03

1. **The speaker button.** On a return visit it now looks off (the crossed speaker, not pressed)
   with a small "tap to resume" label above it, until sound is really playing. While the clips load
   it is the bare speaker with the ring, also not pressed. It is "pressed" only in the `on` state.
   Its name for screen readers is "Sound off, tap to resume". Nothing else about the sound changed.
2. **The WAV.** `docs/task03/site_burnout.wav` is no longer tracked, `docs/task03/*.wav` is
   gitignored, `site_burnout_levels.txt` stays. `docs/task03.md` says how to remake it
   (`npm run build && node scripts/render-sound.mjs`).

## Screenshots

In `docs/task04/`, 37 WebP files, each under 300 KB (6 MB in all). The name is
`<page>-<width>-<theme>.webp`:

- pages: `home` (first screen only), `download`, `play`, `how-it-works`, `progress`,
  `compatibility`, `devlog`, `faq`, `what-next`, `404`
- widths: `1440` and `390`; themes: `dark` and `light` (`what-next` and `404` dark only)
- `play-app-1280.webp`: the preview itself at its first screen

The long pages are full-page pictures. To stay under 300 KB some were made narrower than the
screen they show (the tallest, `how-it-works`, is 1152 px wide for the 1440 screen and 312 or 390
for the phone), so small text in those is soft. Remake them with `npm run shots:pages` after a
build; `node scripts/shots-pages.mjs faq` does one page.

## What you need to do

1. **Logo.** Your new logo files are still uncommitted. Commit them when you are happy. The share
   image `public/og/rustyac-og.webp` is yours too; `/download` and `/how-it-works` have their own
   share pictures (cut from `hero_burnout` and `gallery_f2004_spa_trackside`), every other page
   uses yours.
2. **`GITHUB_TOKEN` in Coolify (optional).** Without a token GitHub allows 60 requests an hour per
   address, and a build makes one, so it is only needed if the server shares its address with other
   heavy users. If you add it: a token with no permissions at all is enough (public data), set as a
   **build variable** named `GITHUB_TOKEN`.
3. **Push rustyAC.** The site shows v0.23.0, the newest release on GitHub. Your v0.23.1 and v0.24.0
   are local. After you push them and rebuild the site, it picks up the new release, the new
   preview and the Task 24 report link by itself.
4. **The devlog.** Four drafts wait in `src/content/devlog/` (see "How to publish").
5. **The AI line.** `put ai disclaimer here` is in the footer and in the FAQ answer "Who made it,
   and was AI used?" (`AI_DISCLAIMER` in `src/data/faq.ts`).
6. **Read the pages once.** I checked facts and layout, not taste.

## Not done

- **The Dockerfile was not built** (no Docker here). The new `ARG GITHUB_TOKEN` line is untested.
- **The homepage is not in the full-page screenshots**, only its first screen. Its 3D scene cannot
  be drawn by the software renderer in a useful time; `scripts/shots.mjs` from task 01 covers it.
- **No real phone and no real browser other than headless Chromium.**
- **`gallery_crash_damage`, `gallery_f40_monza`** are stored but on no page;
  `gallery_heavy_clouds` and `gallery_night_lights` are only covers of drafts.
- **No list of car names** on /compatibility: no report lists the 119 cars. The four refused ones
  are named.
- **Track names are folder names** (`ks_nordschleife / touristenfahrten`), because the reports only
  have those.
- **A devlog post page is not in the screenshots** (drafts are not built).
- **`robots.txt` is unchanged.** `/play/app/` is not in the sitemap but is not disallowed either.

## Open questions

1. **A bare `rustyac.exe` does not start on a track.** The prompt says "it starts the F2004 at its
   default track". The code and the run guide say it starts the F2004 on **an endless flat road**,
   full screen. The page says that, and gives `rustyac.exe --track spa --windowed` as the next line.
2. **"123 installed cars" means your install.** The reports count the cars on the PC they were
   written on (base game, some DLC, a few mods; 70 more DLC cars are not installed). The page says
   "for one Assetto Corsa install, the one rustyAC is tested on". Say so if you want other wording.
3. **"acs.pdb, 66 MB" is in no public report.** It is in your prompt, on the homepage since task 01,
   and in section 0 of rustyAC's private `brainstorm.md`. I kept it on /how-it-works. If the number
   should be checkable, add it to a report.
4. **F9 is left out of the keys.** The run guide says F9 is the handbrake; the program's own
   `--help` says F9 switches the frame counter. The page lists B for the handbrake. Also:
   `HOW_TO_RUN.txt` has a typo, `cfgudio.ini` for `cfg\audio.ini` (line 88). Both are for the
   rustyAC repo.
5. **The preview asks for `preview/manifest.json` and gets a 404** on every visit, because it looks
   for an optional pack next to itself. Nothing breaks (it then offers the folder button), but
   Chromium prints one "failed to load" line in the console. Smallest fix in the game repo: in
   `web/app.js`, skip the pack lookup when the page is given `?pack=none` (or a
   `<meta name="rustyac-pack" content="none">`), and I link to `/play/app/?pack=none`. Not done:
   the game repo is read only.
6. **The devlog loader is my own, 30 lines.** You asked for the DRAFT comment as the first line of
   each file. Astro's stock loader needs the front matter on the first line, so
   `src/content.config.ts` takes a leading comment off first. Because of that, `cover` is the name
   of a picture in `src/assets/screenshots/`, not a path.
7. **"Why Rust?"** No report gives a reason. The answer says what the reports do say: it is a
   rewrite, the build never reorders floating-point operations, and the same code compiles to
   WebAssembly. Replace it with your real reason.
8. **"Is it legal?"** Facts only, as asked, with "this is not legal advice" in front.
9. **Multiplayer on /progress** says rustyAC would join "a normal Assetto Corsa server next to
   players of the real game". That is the roadmap's M1 without the hosting details. Cut it if it is
   more than you want to promise.
10. **The changelog entries are thin**: GitHub's generated notes are one "Full Changelog" link per
    release. I added the task's title next to each version. Writing real release notes on GitHub
    would fill them in.
11. **`compressHTML` is off** in `astro.config.mjs`. With it on, Astro removed the space at a line
    break before a link or `<code>` ("to read:the whole car,one physics step"). It costs a few KB of
    spaces per page. The homepage is built with it off too; its first screen looks the same.
12. **Top bar at 360 to 400 px**: with the icons it was 18 px too wide at exactly 360 px (it was so
    before this task). The compact rule that was for under 360 px now applies under 400 px.
13. **HTML comments with the sources ship in the pages** (the rule asked for HTML comments). They
    add about 2 KB to /how-it-works. I can turn them into build-only comments if you prefer.
14. **The release screenshots cannot be remade with the public build**: the fact check noticed that
    the commands in `docs/site_media.md` use options (`--supersample`, `--no-hud`,
    `--free-camera`) that are not in v0.23.0. They are in your local v0.23.1. Fixed by the push.
