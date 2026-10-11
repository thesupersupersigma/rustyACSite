# Task 03 report

## Resume here

- **All steps are done.** `npm run build`, `npx astro check` (0 errors, 0 warnings, 0 hints) and
  `npm test` (60 tests) pass. `node scripts/check-sound.mjs` passes its 35 checks. Version `0.3.0`,
  tag `v0.3.0`.
- Nothing is half-finished. **Nobody has listened to it yet**: I cannot hear. Everything below was
  checked by measuring. Start with `docs/task03/site_burnout.wav`.
- To tune the sound, everything is in one block: `AUDIO` in `src/scene/audio/constants.ts`. After a
  change, `npm run build && node scripts/render-sound.mjs` makes a new listening file.
- Three things I expect you to want to change after listening are in "Open questions" 1 to 3.

## Git

Tag: `v0.3.0`. Commits on `master`, nothing pushed:

- `chore(assets): give the brake discs their own rotor nodes`
- `chore: keep the audio sources as FLAC, ignore the raw WAVs and PNGs`
- `feat(audio): encode the clips to Opus and AAC with padded, checked loops`
- `feat(audio): add the pure sound model with vitest tests`
- `feat(scene): add the sound switch with engine, tyre, burst and pit-stop sound, and keep the brake discs on the hubs`
- `feat(audio): render the scripted burnout offline as a listening file`
- `docs(licensing): the sound clips are not covered, the burst made in code is`
- `docs: start the task 03 report`
- `fix(audio): review fixes for touch start, the mix after a pause, failed starts and the burst`
- `refactor(audio): name the tyre and pit levels WHEELSPIN_GAIN and PIT_GAIN`
- `docs: task 03 report`
- `chore(release): v0.3.0`

Your logo files (`public/apple-touch-icon.png`, `public/favicon.png`, `public/og/rustyac-og.webp`,
`src/assets/logo.png`, `src/assets/logo-mark.png`) were changed and uncommitted the whole time. I
did not touch or commit them.

## Summary

The F2004 scene has sound now, and it is silent until the visitor asks for it.

Next to the round **Hold to rev** button there is a small **speaker button**. It says "Sound off".
Click it and the page downloads about 1 MB of sound, shows a ring filling up around the speaker, and
the engine starts idling. Before that click the page downloads no sound at all and sets up nothing
for audio. I proved that with a headless run that counts the requests.

With sound on:

- **The engine** follows the revs. It is made from rustyAC's own recordings of the F2004 at five
  engine speeds, blended into each other, with a separate set for throttle on and throttle off. On
  the limiter it switches to the limiter recording.
- **The rear tyres squeal** while they spin.
- **Lifting off** at high revs gives one to three **backfires**.
- **The pop** is a double bang, one per rear tyre, left and right. Assetto Corsa has no such sound,
  so it is made in code: a crack, a thump and a hiss of air.
- **The pit stop** has the wheel guns: four undoing, four tightening, each from its own corner of
  the picture and never quite together. A soft thump when the car lands.
- Scroll away or switch tabs and it fades out and stops. Come back and it fades in.
- The choice is remembered. On the next visit sound waits for the first press of the rev button or
  the speaker, because a browser will not let a page start sound by itself.

There is a **listening file** for you: `docs/task03/site_burnout.wav`, 15.7 seconds, made by the
site's real sound code without playing it. Measured against rustyAC's own burnout recording, the
engine flat out has the same spectrum and is 3.4 dB quieter.

Also done: the **brake discs now stay on the car** during the pit stop.

Not done: nobody has listened to it, and Safari could not be tested on this Windows machine.

## What's built

**Encoding (A)**
- `scripts/encode-audio.mjs` (`npm run audio`): reads the FLAC sources, writes Opus (`.webm`) and
  AAC (`.m4a`) plus `manifest.json` into `public/audio/`, then decodes every file again and checks
  it. Uses `ffmpeg-static`. Skips `burnout_reference` and the two `idle` clips.
- `scripts/check-audio.mjs` (`npm run audio:check`): decodes every clip with `decodeAudioData` in
  each browser it can start, and writes `docs/task03/decode_check.json`.
- `public/audio/`: 15 clips in two formats and the manifest.

**The sound model (C), in `src/scene/audio/`**
- `constants.ts`: `AUDIO`, every number worth tuning, each with a comment.
- `mix.ts`: the maths, with no Web Audio in it. Which two engine loops play, how loud, at what pitch;
  the throttle and limiter blends; the tyre squeal; the backfire planner; pan and distance.
- `mix.test.ts`: 31 tests (D1).
- `graph.ts`: the audio nodes. Works on any audio context, so live playback and the listening file
  run the same code.
- `burst.ts`: the tyre burst and the landing thump, made from noise and a sine.
- `clips.ts`: downloads and decodes the clips. Finds out which format the browser really decodes by
  decoding the smallest clip first.
- `live.ts`: the sound while the page is open. Engine clips first, then the rest.
- `offline.ts`: the listening file's renderer.
- `sound.ts`: the switch. The only audio file in the scene chunk: it remembers the choice and, on
  the click, creates the audio context and fetches the three files above.

**The button (B)**
- `src/scene/controls.ts`: the speaker button, its states and its loading ring.

**Checks (D)**
- `scripts/check-sound.mjs`: 35 checks in headless Chromium (see "The silence check").
- `scripts/render-sound.mjs`: makes the listening file and its level table.
- The `?debug=1` overlay has four new lines: sound state and context state, clips loaded and
  format, the current pair of engine loops with their weights, and the levels of the squeal, the
  limiter and the throttle blend.

**Changed**
- `src/scene/burnout.ts`, `main.ts`, `types.ts`: create the sound, drive it each frame, add
  `sound` to the scene object, and the rotors (F).
- `LICENSING.md` (E), `.gitignore`, `package.json` (two scripts, one dev dependency).
- `tsconfig.json`: `scratch/` is now excluded from type checking. See open question 9.

## How to try it

```
npm run dev      # http://localhost:4321, scroll down to the car
```

- Click the **speaker** next to the rev button. Wait for the ring. The engine idles.
- **Hold** the rev button or Space. Let go at high revs for backfires.
- Hold about 6.5 s for the pop, then click **Pit stop**.
- Drag the camera around: the engine moves between the speakers, and gets a little quieter from
  further away.
- Scroll away and back. Reload: the speaker looks off with a small "tap to resume" hint, and the
  first rev (or a press of the speaker) starts the sound. (Changed in task 04: it used to show
  "Sound on" before any sound played.)
- `?debug=1` shows what the sound is doing.
- The listening file: `docs/task03/site_burnout.wav`. **It is not in git any more** (task 04: it is
  2.9 MB and differs on every render; `docs/task03/*.wav` is gitignored). To make it:
  `npm run build && node scripts/render-sound.mjs`. That writes the WAV and
  `site_burnout_levels.txt` (which stays in git) into `docs/task03/`. It needs the headless
  Chromium from `npx playwright install chromium`.
- In the console: `__f2004.sound.state()`, `.toggle()`, `.level()`.

## Encoding results

**Sizes**

| What | Bytes |
|---|---|
| Opus, 15 files | 1,018,303 |
| AAC, 15 files | 1,669,092 |
| `manifest.json` | 7,545 |
| **A visitor who turns sound on downloads** (manifest + 15 Opus files) | **1,025,848** |
| of that, before the engine starts (manifest, the 11 engine and limiter loops, one 4.8 KB test clip) | 924,791 |
| `public/audio/` in the repo, both formats | 2,694,940 |
| The FLAC sources in `assets-src/media/audio/` | about 13.6 MB |

Opus was asked for 96 kbps and came out at about 80 to 90 on these clips. AAC is 128 kbps.

**How the loops stay seamless**

An encoder adds a little silence at the start and padding at the end, and decoders do not agree on
how much they remove. So a loop is not encoded bare. The last 0.2 s of it is put in front and the
first 0.2 s after it. The decoded file is then `[end of the loop][the loop][start of the loop]`, the
sound runs straight through both loop points, and a decoder that is early or late by anything under
0.2 s still loops cleanly. The manifest gives the loop points in seconds of the decoded file.

**The jump at the seam after encoding**

Measured the way the source manifest did: the step from the last sample of the loop to the first,
in 16-bit steps, against the steps inside the loop. Decoded with ffmpeg. A seam is fine when its jump
is no bigger than the jumps that happen inside the loop anyway.

| Loop | Source seam | Opus seam | AAC seam | Jumps inside (99.9% are under) |
|---|---|---|---|---|
| engine_on_4000 | 56 | 105 | 193 | 622 |
| engine_off_4000 | 42 | 188 | 176 | 496 |
| engine_on_7000 | 296 | 747 | 435 | 1,688 |
| engine_off_7000 | 297 | 138 | 313 | 1,267 |
| engine_on_10000 | 987 | 526 | 1,336 | 2,753 |
| engine_off_10000 | 16 | 477 | 170 | 2,091 |
| engine_on_13000 | 415 | 1,200 | 524 | 3,438 |
| engine_off_13000 | 344 | 295 | 719 | 1,860 |
| engine_on_16000 | 305 | 1,624 | 501 | 4,747 |
| engine_off_16000 | 1,289 | 930 | 973 | 2,575 |
| limiter | 1,217 | 1,712 | 1,785 | 5,640 |
| wheelspin | 74 | 8 | 18 | 486 |

Every seam, in both formats, is below what 99.9% of the steps inside its own loop stay under. The
worst is the AAC `engine_on_10000` at about half of that.

**What browsers really decode** (`decodeAudioData`, all 15 clips, on this machine)

| Browser | Opus `.webm` | AAC `.m4a` | Shift against the source | Worst seam against its loop |
|---|---|---|---|---|
| Chrome 155 (installed) | 15 of 15 | 15 of 15 | none | 0.45 (Opus), 0.49 (AAC) |
| Edge 155 (installed) | 15 of 15 | 15 of 15 | none | 0.45, 0.49 |
| Chromium 156 (Playwright's build) | 15 of 15 | 15 of 15 | Opus starts 24 samples (0.5 ms) early | 0.56, 0.49 |
| Firefox 157 (Playwright's build) | 15 of 15 | 15 of 15 | none | 0.45, 0.47 |
| Safari | **not tested** | **not tested** | | |

"Worst seam" is the seam jump divided by the 99.9% figure of that loop; under 1 is fine. The 24
early samples in one Chromium build are exactly the kind of difference the padding is there for:
its loops are as clean as the others.

**Safari** cannot run on Windows. Playwright's WebKit build for Windows has no Web Audio at all, so
it says nothing. What I could find out by reading (WebKit's bug tracker, release notes and source):

- Safari has decoded Opus in WebM with `decodeAudioData` for some years, but its answers were
  inconsistent between macOS, iOS and iPadOS up to about Safari 17.4. `canPlayType` has been wrong
  about it in both directions. That is why the loader does not ask: it decodes the smallest clip and
  sees what happens. If Opus fails, it uses AAC for everything.
- Safari's code removes the encoder's priming for both formats. Not measured.
- One bug report says a beta of iOS 27 failed to decode some AAC `.m4a` files, fixed in July 2026.
  I do not know which release has the fix.
- So: **Safari on a Mac or an iPad still needs a real test** (the "Not done" list).

## The silence check

`node scripts/check-sound.mjs` runs the built site in headless Chromium with Chromium's "a user
gesture is required" audio policy, counts every network request and every `AudioContext` the page
creates, and reads how loud the output is. All 35 checks pass. The main ones:

- **A visit without sound:** after loading the scene, holding the rev button, holding Space and
  scrolling the whole page down and back: 0 audio requests, 0 audio contexts, the sound files of the
  scene were never fetched, output level 0.
- **One click on the speaker:** a loading state, then exactly 1 context, running; 16 requests (the
  manifest and 15 `.webm`, no `.m4a`); the engine clips asked for before the rest; the idling engine
  is measurably there; the choice is stored.
- **Scrolled away / tab hidden:** silent and suspended. **Back:** running again.
- **Flat out:** more than 2.5 times the level of idle. A whole burnout, pop and pit stop: no errors.
- **Off:** suspended, stored. **On again:** the same context, nothing downloaded twice.
- **Next visit:** the speaker shows "Sound on", but 0 contexts and 0 requests until the first rev,
  which starts it.
- **Reduced motion:** silent by default; Enter on the speaker turns it on.

## JavaScript sizes

| File | Before (v0.2.0) | Now | Loaded |
|---|---|---|---|
| The scene's shell script (homepage) | 3,348 | 3,363 | with the homepage |
| The scene chunk | 722,538 | 735,762 | when the scene comes near |
| `graph` | | 8,733 | on the speaker click |
| `live` | | 1,265 | on the speaker click |
| `offline` | | 2,368 | only by `render-sound.mjs` |

- The scene chunk grew 13.2 KB (the button, the switch, the maths and the constants). It is about
  188 KB gzipped.
- **The shell grew by 15 bytes.** I did not edit it. The bundler's small "load a chunk" helper lives
  in it, and the scene chunk now uses that helper for its own lazy files, so the shell has to export
  it (`export{a as t}`). I see no way to avoid that short of putting all the audio code in the scene
  chunk.
- No other page has any JavaScript file, before or after.

## Constants to tune

All in `AUDIO`, `src/scene/audio/constants.ts`. Levels are in dB: 0 is as recorded, +6 is about twice
as loud.

| Constant | Value | What it does |
|---|---|---|
| **`MASTER_DB`** | -3 | Everything |
| `CEILING_DB` | -1 | Nothing leaves louder than this. A hard limit |
| `COMP_THRESHOLD_DB`, `COMP_RATIO`, `COMP_ATTACK`, `COMP_RELEASE` | -3, 20, 0.002, 0.12 | The safety compressor |
| `FADE_SECONDS` | 0.15 | Fade when sound goes on or off |
| `ENGINE_DB` | 0 | The engine and limiter loops |
| `RATE_MIN`, `RATE_MAX` | 0.8, 1.25 | How far a loop may be pitched from its own revs |
| `THROTTLE_SECONDS` | 0.06 | Time for throttle-on sound to take over from throttle-off |
| `LIMITER_SECONDS` | 0.08 | Time for the limiter loop to take over |
| `PARAM_SECONDS` | 0.04 | Smoothing of every gain and pitch between frames |
| **`WHEELSPIN_GAIN`** | +9 | The tyre squeal. See open question 1 |
| `WHEELSPIN_START`, `WHEELSPIN_FULL` | 0.04, 0.55 | Wheel speed (share of top speed) where the squeal starts and where it is full |
| `WHEELSPIN_RATE_MIN`, `WHEELSPIN_RATE_MAX` | 0.9, 1.15 | Its pitch, slow to fast |
| `BACKFIRE_DB` | +2 | Backfires |
| `BACKFIRE_MIN_RPM`, `BACKFIRE_MAX_COUNT` | 9000, 3 | No backfire below these revs; at most this many per lift |
| `BACKFIRE_FIRST_MAX`, `BACKFIRE_GAP_MIN`, `BACKFIRE_GAP_MAX` | 0.05, 0.06, 0.14 | Seconds to the first bang, and between bangs |
| `BACKFIRE_RATE_MIN`, `BACKFIRE_RATE_MAX`, `BACKFIRE_QUIETEST_DB` | 0.9, 1.1, -3 | Random pitch and level of each bang |
| `BACKFIRE_LIMITER_CHANCE`, `BACKFIRE_LIMITER_DB`, `BACKFIRE_LIMITER_GAP` | 0.035, -5, 0.35 | Pops on the limiter: chance per ignition cut, how much quieter, shortest time between two |
| **`BURST_DB`** | +3 | The tyre burst as a whole |
| `BURST_GAP`, `BURST_SPREAD` | 0.04, 0.55 | Seconds between the two tyres; how far left and right they sit |
| `CRACK_LEVEL`, `CRACK_SECONDS`, `CRACK_HIGHPASS`, `CRACK_LOWPASS_FROM`, `CRACK_LOWPASS_TO` | 1, 0.025, 700, 14000, 1600 | The crack |
| `THUMP_LEVEL`, `THUMP_FROM`, `THUMP_TO`, `THUMP_SECONDS` | 0.9, 90, 45, 0.18 | The thump |
| `HISS_LEVEL`, `HISS_HZ`, `HISS_Q`, `HISS_SECONDS` | 0.3, 2900, 0.7, 0.7 | The air |
| **`PIT_GAIN`** | +12 | The wheel guns. See open question 2 |
| `PIT_OFFSET_MAX`, `PIT_PITCH_SPREAD` | 0.06, 0.04 | Each gun starts up to this late, and is pitched up to 4% off |
| `DROP_THUMP_DB` | -15 | The thump when the car lands. -60 turns it off |
| `PAN_WIDTH`, `FX_PAN_WIDTH`, `PAN_MAX` | 1.5, 3, 0.8 | How far the car, and the guns, move between the speakers |
| `DISTANCE_NEAR`, `DISTANCE_FAR`, `DISTANCE_FAR_DB`, `DISTANCE_MAX_DB` | 4.5, 9, -5, -12 | Camera distance: no loss at 4.5 m, 5 dB at 9 m |
| `SPACE_SECONDS` | 0.2 | How fast pan and distance follow the camera |

## The listening file

`docs/task03/site_burnout.wav` (not in git since task 04; remake it with
`npm run build && node scripts/render-sound.mjs`): 15.65 s, 48 kHz, 16-bit stereo, 2.87 MB. Rendered in headless
Chromium by `window.__f2004.sound.renderRun()`. It steps the burnout through `__f2004.sim` in
1/60 s steps, records what the engine did, and plays that through the same graph and the same
`public/audio/` files as the live sound, into an offline audio context. The camera is pinned at the
hero angle.

| From | What |
|---|---|
| 0.00 s | idle |
| 1.00 s | first blip (0.2 s) |
| 1.90 s | second blip (0.35 s) |
| 3.25 s | the full hold |
| 9.70 s | the pop |
| 10.70 s | the pit stop |
| 13.25 s | back on the ground, idle |

`docs/task03/site_burnout_levels.txt` has peak and RMS for every quarter second.

**Against `burnout_reference`** (rustyAC's own 32 s burnout)

| | Peak dBFS | RMS dBFS |
|---|---|---|
| Site, whole file | -2.3 | -18.3 |
| Reference, whole file | -1.0 | -12.0 |
| Site, flat out (the 3 s before the pop) | -4.7 | -15.1 |
| Reference, flat out (seconds 20 to 28) | -3.3 | -11.7 |
| Site, idle | -17.4 | -30.4 |
| Reference, first second | -15.0 | -30.8 |

What is the same:
- **The spectrum flat out.** Octave by octave from 125 Hz to 16 kHz the site is between 3.3 and
  4.1 dB under the reference: the same shape, just quieter. The middle of the spectrum is at 1,074 Hz
  against 1,072 Hz. That is no surprise. On the limiter both are the same limiter recording.

What is different:
- **The site is 3.4 dB quieter flat out.** On purpose: `MASTER_DB` is -3, and the hero camera is
  6.2 m away, which costs another 1.9 dB (the compressor gives a little back). The reference sits at
  -11.7 dBFS RMS for 30 seconds, which is very loud for a web page. The site flat out is at about
  the level of a normalised online video.
- **The whole file is 6 dB quieter**, because the reference is flat out nearly all the time and the
  site's run idles, blips and has a pit stop.
- **The site has a burst.** The reference has none (the game has no such sound). Its peak, -2.3 dBFS,
  is the loudest moment of the file and about 4.6 dB over the engine.
- **The site has more bass at 31 and 63 Hz** (+6 and +2 dB flat out, more in the whole file). That
  is the burst's thump and the idle clip's own 82 Hz line.
- **Idle is as loud as the reference's first second**, although the site is turned down 5 dB. The
  reference's first second is quieter than the idle clip by itself, so it is probably not a plain
  idle. I did not look further.
- **The tyre squeal is hardly there in either.** See open question 1.

## The brake discs (F)

- `getCar()` now has `rotors` (`rotor_FL` and so on), and the types say so.
- The rear rotors get the same angle as the rear wheels every frame (checked: both 4.6056 rad at the
  same moment).
- In the pit stop the wheels slide off and the discs stay on the hubs. Checked halfway through the
  stop: wheel hidden and 0.6 m out, rotor visible at 0, and a screenshot shows disc and caliper on
  the bare hub.
- The load-time check names `rotor_XX` too.

## Not done

- **Nobody has listened to it.** Levels, spectrum, seams and timing were measured. Whether it sounds
  good was not judged.
- **Safari was not tested** (Mac, iPad). Chrome, Edge and Firefox were, on Windows.
- **Not tested on a touch screen.** The code handles the case that a touch going down is not yet a
  "gesture" for the browser (sound then starts when the finger lifts), but only a mouse was tried.
- **Not tested on the Chromebook**, like task 02.
- **A really hidden tab** was not tested. The check fakes the "hidden" signal, because a headless
  page cannot be put in the background.
- **No jack sounds**, as the brief says.
- **`gallery_*` and `hero_burnout.png`** are left for task 04, as the brief says.
- **The task 02 screenshots and video were not retaken.** They do not show the speaker button.

## Open questions

Choices I made without asking, for you to confirm or change.

**Things to listen for**

1. **The tyre squeal at +9 dB is probably still too quiet to hear.** The `wheelspin` clip is at
   -32.5 dBFS RMS, 21 dB under the limiter loop. At +9 dB it is still 12 dB under the engine in its
   own band (around 1 kHz), so the engine covers it. I kept your default. If you want to hear it,
   try `WHEELSPIN_GAIN` 15 to 18.
2. **The wheel guns at +12 dB are loud.** Four together peak at about -4 dBFS, which is as loud as
   the engine on the limiter, right after a quiet idle. I kept your default. If it is too much, try
   `PIT_GAIN` 6.
3. **Overall level.** `MASTER_DB` -3 puts the engine flat out 3.4 dB under rustyAC's own recording.
   Raise it to 0 to match the game. The ceiling keeps it under -1 dBFS either way.

**Choices in the sound**

4. **Constant names.** `WHEELSPIN_GAIN` and `PIT_GAIN` are in dB (9 and 12), as you wrote them. The
   other levels end in `_DB`.
5. **The crossfade between two engine loops is measured in pitch**, not in rpm: halfway is where both
   loops are detuned by the same interval. Between 4,000 and 7,000 the loops are far apart, so for a
   moment around 5,300 rpm both are at their pitch limit and slightly out of tune with the revs. A
   rev sweep passes that in about 40 ms.
6. **The engine's sound comes from the back of the car**, not its middle. The camera always looks at
   the middle, so a pan from there would always be zero. From the hero angle the rear is on the
   right, so the engine is about 3 dB louder in the right speaker.
7. **No backfires at the pop.** The pop closes the throttle, which would fire one to three backfires
   under the burst. I left them out there so the burst is clean. A reviewer suggested it; the brief
   does not say.
8. **Extras you did not ask for:** each gun is pitched up to 4% off so four guns differ; the landing
   thump (you called it optional); the compressor's built-in volume boost is taken out again, so it
   only ever turns things down; on iPhones and iPads the sound plays even with the mute switch on,
   because the visitor asked for it.

**Choices in the button**

9. **"Sound on" before any sound.** On a later visit with sound remembered, the speaker shows "Sound
   on" and counts as pressed, though nothing plays until the first press. Clicking it then starts
   the sound, it does not turn it off. A reviewer would rather show it as not pressed. I kept it,
   because showing "off" and then starting sound on a rev seemed worse.
10. **The label changes** between "Sound off" and "Sound on" and `aria-pressed` changes too, as the
    brief says. A screen reader says both ("Sound on, pressed"). Some would use a fixed label.
11. **After a mouse click the speaker gives up the focus**, so Space revs again. After a keyboard
    press it keeps the focus (as buttons should), so Space switches the sound, not the engine.
12. **The loading ring fills with the engine clips** and sound starts then. The squeal, backfire and
    guns arrive a moment later.
13. **If sound cannot start** (no Web Audio, files missing), the button goes back to off, the choice
    is forgotten, and a screen reader hears "Sound could not start". Nothing is shown on screen.

**Other**

14. **`tsconfig.json` now excludes `scratch/`.** I installed Firefox and WebKit for the decode check
    into `scratch/task01/pw-browsers/`, and `astro check` then tried to check the JavaScript inside
    them and ran out of memory. `scratch/` is ignored by git, so nothing in it should be checked.
15. **One new dev dependency: `ffmpeg-static` 5.3.0** (an 83 MB ffmpeg in `node_modules`). npm
    printed a warning that its install script is not on an allow list; the binary was downloaded
    anyway and works.
16. **Three new scripts with no `npm run` name:** `check-sound.mjs` and `render-sound.mjs` need a
    build first, like `shots.mjs`. `check-audio.mjs` is `npm run audio:check`.
17. **`docs/task03/site_burnout.wav` is 2.9 MB in git**, and each new render adds another. Say so if
    you would rather keep it out of the repo.
    - Done in task 04: the file is untracked and `docs/task03/*.wav` is gitignored.
18. **The listening file is not byte-identical from run to run** (the numbers in the level table
    are). I did not find out why.
19. **`__f2004.sound.level()`** exists for every visitor, like `__f2004.sim`. It is what the check
    reads.
20. **`brainstorm.md` was not edited** (rule 3). It could now say task 03 is done.

## Review

Two read-only Sonnet subagents read the code against the brief (the audio engine; the button and
its life cycle). A third looked up what browsers decode. What they found is fixed:

- A press that started as a touch would have loaded the sound but stayed silent until the next tap.
- Coming back to the stage after scrolling away played a moment of the old mix first.
- A browser that cannot start sound would have shown "Sound on" again on every visit.
- If one small clip failed to load, the tyre squeal never started.
- The loading ring stopped at 73%.
- Backfires played under the tyre burst (open question 7).
- The check could pass with nothing audible: it now measures the output level and looks at which
  files were fetched.
- One test only had an upper bound.

Not changed: open questions 9 to 11.
