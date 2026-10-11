# Task 02 report

## Resume here

- **All steps are done.** `npm run build`, `npx astro check` and `npm test` (29 tests) pass with zero
  errors. The check screenshots and the video are in `docs/task02/`. Version `0.2.0`, tag `v0.2.0`.
- Nothing is half-finished. The next task is 03 (sound); its hooks are under "Hooks for task 03".
- To tune the feel, start with the three constants blocks: `TUNING` in `src/scene/sim.ts` (revs,
  heat, timings), `LOOK` in `src/scene/burnout.ts` (how it looks) and `SMOKE` in
  `src/scene/smoke.ts`. Check with `?debug=1` and `window.__f2004.sim`.
- Things that happened during the run that you should know about are in "Open questions" 1 to 3.

## Git

Tags: `v0.1.0` (created on the commit that was HEAD when the task started) and `v0.2.0`.

Commits on `master`, nothing pushed:

- `feat(scene): add the burnout state machine with vitest tests`
- `feat(scene): add hold-to-rev burnout, smoke, tyre pop and ghost pit stop`
- `chore: add a per-tier frame cost benchmark script`
- `feat: use the 2560x1440 screenshots, slider widths up to 2560 and the og_burnout share image`
- `fix(scene): review fixes for the controls, pit-stop pose, blur disc and per-frame code`
- `docs: task 02 report`
- `chore(release): v0.2.0`

## Summary

The F2004 scene is now interactive. On the stage there is a round **Hold to rev** button. Hold it
(mouse, touch, or Space) and the engine revs to the limiter, the rear wheels spin, the car squats and
shakes, the five start lights come on one by one, and tyre smoke builds into a cloud behind and
around the car. The rear tyres heat up and their tread starts to glow rust-orange. Let go and it all
settles.

Hold for about 6.5 seconds and **both rear tyres pop**: a burst of smoke, rubber bits flying, the
tyres go flat and the rear of the car drops onto its rims. The button becomes **Pit stop**. Click it
and a ghost crew changes all four wheels in 2.55 seconds with a big timer on screen: the car rises,
the nuts spin off, the wheels slide away, fresh ones slide in, the nuts go back, the car drops and
the lights flash green. Then you can rev again.

Underneath, the whole thing is one small state machine with no three.js in it, covered by unit
tests. The scene exposes an engine read-out and an event list for the sound in task 03, and test
hooks that step everything in fixed steps, which is how the screenshots are repeatable.

The screenshots you recaptured at 2560×1440 arrived while this ran, so they are in use: the
before/after slider now serves sizes up to 2560 wide, and the share image is made from
`og_burnout.png`. `docs/screenshots.md` lists every game picture on the site.

Not built: sound (task 03). Not checked: a real Chromebook.

## What's built

**The state machine**
- `src/scene/sim.ts`: `BurnoutSim`. `step(dt, throttleHeld)` returns one reused snapshot: state, rpm,
  wheel speed, heat, smoke rate, start lights, pop progress, pit-stop progress per phase and per
  corner, and the events of that step. States: `idle → revving → settling → idle` and
  `revving → popped → pitstop → idle`. No imports at all.
- `src/scene/sim.test.ts` (25 tests): pops after `POP_SECONDS`, does not pop when released in time,
  heat cools to 0, the pit stop runs in order and ends in idle with heat 0, huge / negative / NaN
  time steps do no harm, the limiter bounces without passing the limit, the revs dip under idle on
  release, start lights, the green flash, the same pop time at 30, 60 and 144 fps.
- `src/scene/events.ts` + `events.test.ts` (4 tests): the small event emitter.
- `vitest.config.ts`, `npm test`.

**On screen**
- `src/scene/burnout.ts`: `Burnout`. Steps the simulation and writes it onto the car: rear wheel spin,
  the motion-blur discs, squat / nose lift / shake / yaw wiggle, the rev LEDs, the start lights (and
  a glow from them on the car), tyre heat glow, rubber patches, the flat tyres and the dropped rear,
  the pit-stop moves, camera shake. Also the test hooks and the benchmark.
- `src/scene/smoke.ts`: the smoke. One instanced draw call of soft sprites, sorted back to front,
  alpha-blended with no depth write, shaded as if lit by the floodlight, cool white with a warm tint
  low on the pit side, fading softly where a puff meets the ground. The cap follows the quality tier
  live (450 / 260 / 120).
- `src/scene/debris.ts`: 18 dark rubber shards for the pop, one instanced draw call.
- `src/scene/controls.ts`: the button, the hint, the pit-stop timer and the screen-reader
  announcements. Built in JavaScript inside the scene chunk, so the homepage's own HTML, CSS and
  JavaScript are unchanged (the shell script is still 3.3 KB).
- Changed: `src/scene/main.ts` (creates the burnout, drives it each frame, exposes the hooks),
  `rig.ts` (camera shake, a pinned view for screenshots), `types.ts` (the new API), `debug.ts` (the
  overlay's new lines).

**Screenshots (section H)**
- `src/components/CompareSlider.astro`: widths 640 / 960 / 1280 / 1920 / 2560, AVIF + WebP, `sizes`
  that follows the page gutters.
- `scripts/make-brand.mjs`: uses `og_burnout.png` (2400×1260) when it exists, else the old picture.
  The step that masked the old logo by pixel position is gone (rule 5); icons are now made from
  `src/assets/logo-mark.png` as it is.
- `scripts/use-screenshots.mjs` (`npm run screenshots`): copies the recaptures in and remakes the
  share image.
- `astro.config.mjs`: a small step removes the 2560×1440 PNG sources from `dist/` (29.8 MB that no
  page links to).
- `docs/screenshots.md`: the inventory and how to swap pictures.

**Checks**
- `scripts/shots.mjs`: two new groups, `burnout` (stills) and `video`. `SHOTS_GPU=1` renders on this
  machine's GPU instead of in software.
- `scripts/bench.mjs` (`npm run bench`): the cost table below.

## How to try it

```
npm run dev      # http://localhost:4321, scroll down to the car
```

- **Hold** the round button, or hold **Space**. With the button focused, Enter works too.
- Keep holding about 6.5 s: the tyres pop. Click **Pit stop**.
- Drag the scene while revving: the camera still orbits.
- `?debug=1` adds state, rpm, throttle, heat and smoke particles to the overlay.
  `?debug=1&tier=low` (or `mid`, `high`) pins a tier.
- In the console: `__f2004.sim.hold(3)`, `.release()`, `.advance(1)`, `.pop()`, `.pitStop()`,
  `.view(150, 1.6)` (camera: degrees around the car, metres up), `.bench()`, `.resume()` (back to
  real time). Using a hook freezes the burnout's clock until `resume()`.

## Constants to tune

**`TUNING` in `src/scene/sim.ts`** (the engine and the timings)

| Constant | Value | What it does |
|---|---|---|
| `IDLE_RPM`, `LIMITER_RPM` | 4000, 18500 | The rev range |
| `REV_RISE`, `REV_TAPER` | 14000, 0.35 | rpm gained per second, and how much the climb slows near the top (about 1.3 s from idle to the limiter) |
| `LIMITER_CUT`, `LIMITER_FALL` | 0.03, 20000 | Length of one ignition cut and rpm lost per second during it (the needle bounces about 650 rpm, 9 times a second) |
| `REV_FALL_SPEED`, `REV_FALL_DAMPING` | 7.5, 0.72 | How fast the revs fall on release; damping below 1 gives the dip under idle (about 500 rpm) |
| `WHEEL_MAX`, `WHEEL_LAUNCH` | 95, 0.12 | Rear wheel speed at the limiter (rad/s), and the share it jumps to at once |
| `WHEEL_UP`, `WHEEL_DOWN`, `WHEEL_DOWN_FLAT` | 0.15, 0.4, 0.22 | Seconds for the wheels to follow the revs up, spin down, and stop after the pop |
| **`POP_SECONDS`** | 6.5 | Seconds of continuous holding from cold until the pop |
| `COOL_SECONDS` | 22 | Seconds for a tyre at the limit to cool completely |
| `LIGHT_STEP`, `GREEN_SECONDS` | 0.5, 0.6 | Seconds per red light; how long the green flash lasts |
| `PIT_LIFT`, `PIT_NUTS_OFF`, `PIT_WHEELS_OFF`, `PIT_SWAP`, `PIT_WHEELS_ON`, `PIT_NUTS_ON`, `PIT_DROP` | 0.3, 0.4, 0.45, 0.25, 0.45, 0.4, 0.3 | Seconds per pit-stop phase. Their sum, 2.55 s, is the time on the clock |
| `PIT_STAGGER` | 0, 0.04, 0.07, 0.02 | How much later each corner (FL, FR, RL, RR) starts: four crews are never in sync |

**`LOOK` in `src/scene/burnout.ts`** (how it looks)

| Constant | Value | What it does |
|---|---|---|
| `SQUAT_REAR`, `NOSE_LIFT` | 0.028, 0.007 | Metres the rear squats and the nose lifts at full throttle |
| `SHAKE`, `SHAKE_ROLL`, `YAW_WIGGLE` | 0.0022, 0.0014, 0.007 | Body shake (m), roll shake (rad) and the slow sideways step of the rear (rad) at the limiter |
| `CAMERA_SHAKE` | 0.011 | Metres of camera shake at the limiter |
| `BLUR_START`, `BLUR_FULL` | 12, 34 | Wheel speed (rad/s) where the blur disc starts and where it is fully in |
| `BLUR_OPACITY`, `RIM_FADE`, `SMEAR` | 0.92, 0.35, 0.85 | Blur disc opacity, how much the real rim fades, how far tyre lettering and rim decals smear into one colour |
| `LED_GLOW`, `LIGHT_GLOW`, `GANTRY_GLOW` | 4, 5, 80 | Rev LEDs, lit start-light pods, and the light the pods throw on the car |
| `HEAT_GLOW`, `HEAT_VISIBLE`, `HEAT_COLOR` | 2.2, 0.3, `#D2581F` | Strength of the tread glow, the heat where it starts to show, its colour |
| `RUBBER_SECONDS`, `RUBBER_MAX` | 10, 0.82 | Seconds of hard wheelspin until the rubber patches are darkest, and how dark |
| `POP_DROP`, `FLAT_WIDEN` | 0.11, 0.1 | Metres the rear drops on flat tyres; how much wider a flat tyre gets |
| `JACK_LIFT`, `NUT_SLIDE`, `NUT_TURNS`, `WHEEL_SLIDE` | 0.06, 0.12, 5, 0.6 | Pit stop: lift, nut travel, nut turns, wheel travel (metres) |
| `LAND_BOUNCE`, `TIMER_STAYS` | 0.012, 4 | Metres of body dip on landing; seconds the time stays on screen |

**`SMOKE` in `src/scene/smoke.ts`**

| Constant | Value | What it does |
|---|---|---|
| `CAP` | 450 / 260 / 120 | Most particles alive per tier |
| `LIFE_MIN`, `LIFE_MAX` | 6, 10 | Seconds a puff lives |
| `FILL_SECONDS` | 6 | Seconds of flat-out smoking that emit a whole cap of puffs. Lower = a thicker cloud sooner |
| `SPEED_BACK`, `SPEED_UP`, `SPREAD`, `DRAG` | 4.6, 1.1, 1.0, 1.15 | How puffs leave the tyre, and how fast they slow down |
| `WRAP` | 0.28 | Share of puffs that roll forward around the car instead of shooting back |
| `SIZE_START`, `SIZE_END`, `OPACITY` | 0.5, 4.2, 0.2 | Metres across when new and when old; opacity of one puff |
| `COOL`, `WARM`, `WARMTH`, `AMBIENT`, `KEY` | see file | Colours and brightness |
| `POP_BURST` | 0.16 | Share of the cap spent on the burst at the pop |
| `IN_REFLECTION` | true | Draw the smoke in the wet ground's mirror image |

`DEBRIS` in `src/scene/debris.ts` has the shard count (18), sizes and speed.

## Costs per tier

Measured with `npm run bench`: frames drawn back to back with the GPU finished after each one, in
headless Chromium at 1440×900 on this machine's **AMD Radeon Pro 5500M** (ANGLE / Direct3D 11).
Milliseconds per frame.

| Tier | Idle | Wheels spinning, no smoke yet | Full hold, just before the pop | of that: smoke | of that: smoke in the mirror | JavaScript | Particles (cap) |
|---|---|---|---|---|---|---|---|
| high | 7.7 | 8.2 | 12.4 | 4.7 | 0.6 | 0.15 | 337 (450) |
| mid | 6.6 | 7.2 | 9.6 | 2.4 | 0.2 | 0.10 | 194 (260) |
| low | 3.7 | 3.8 | 5.3 | 1.4 | none (no mirror on low) | 0.04 | 89 (120) |

- **The smoke is the cost**: 4.7 ms on high. It is fill rate (big see-through sprites on a 4× MSAA
  half-float target), not particle count on the CPU.
- **Everything else** (blur discs, glow, lights, shards, rubber, the wheel materials now being
  see-through capable) is about 0.5 ms while revving and nothing measurable at idle.
- **The smoke in the reflection** costs 0.6 ms on high and 0.2 ms on mid, so it stays on.
- **JavaScript** (simulation, particles, sorting, writing the scene) is 0.15 ms at most.
- **Did a full cloud drop a tier on the headless run?** No. The governor went from mid to high before
  the hold and stayed on high through the hold and the pop. In the real-time loop the frame time on
  high with the cloud up was about 20 ms (50 fps); the step-down limit is 25 ms. So a GPU slower than
  this one will step down to mid while the cloud is full, and back up later. That is the governor
  doing its job, and the smoke cap follows it at once.
- **Software rendering** (SwiftShader) takes seconds per frame with the cloud up. It is only good for
  stills.
- **Allocation:** the frame code creates no objects, arrays, closures or strings (the sim was checked
  in Node at 0.9 bytes per step over 300,000 steps). In the browser the heap still grew by about 250
  bytes per step in a cold test harness; heap sampling pointed at V8 boxing floating-point numbers in
  code it had not optimised yet, not at objects the code makes. That is one minor garbage collection
  every couple of minutes at worst.
- The scene chunk is now 722,538 bytes (186.7 KB gzip), up 43 KB (14.7 KB gzip).
- Not compared against v0.1.0 frame by frame: there was no benchmark then.

## Screenshots and video

All in `docs/task02/`, taken with `SHOTS_GPU=1 node scripts/shots.mjs burnout` through
`window.__f2004.sim`, so they come out the same every time. WebP, each under 60 KB.

| What | File |
|---|---|
| Revving at 1 s | [burnout-1s](task02/burnout-1s.webp) |
| Revving at 3 s | [burnout-3s](task02/burnout-3s.webp) |
| Revving at 3 s with the debug overlay | [burnout-3s-debug](task02/burnout-3s-debug.webp) |
| Revving at 6 s | [burnout-6s](task02/burnout-6s.webp) |
| 6 s, from behind and from the side | [burnout-6s-rear](task02/burnout-6s-rear.webp), [burnout-6s-side](task02/burnout-6s-side.webp) |
| Just popped (0.25 s after) | [burnout-popped](task02/burnout-popped.webp) |
| Pit stop at 30% and 70% | [pitstop-30](task02/pitstop-30.webp), [pitstop-70](task02/pitstop-70.webp) |
| Back to idle after the stop | [burnout-idle-again](task02/burnout-idle-again.webp) |
| 6 s on the mid and low tiers | [mid](task02/burnout-6s-tier-mid.webp), [low](task02/burnout-6s-tier-low.webp) |
| **Video**: a real hold, pop and pit stop with the real button, 14 s, 2.0 MB | [burnout.webm](task02/burnout.webm) |

The video is a WebM, not a GIF (smaller and sharper). It is a real-time recording of headless
Chromium on the GPU, made with `SHOTS_GPU=1 node scripts/shots.mjs video`.

Also run, not kept as pictures: a scripted interaction check (34 checks: mouse hold, pointer leaving
the button, Space on the page, Space in a text field, Enter, window blur, scrolling the stage away, a
jump straight to the bottom of the page, the pop, the click after the pop, the pit stop, the timer,
the announcements, the event order, reduced motion) and a touch hold through Chromium's touch
emulation. All passed.

## Screenshot inventory

See **[docs/screenshots.md](screenshots.md)** for the table of every game picture on the site, where
it is used, its size, and how to swap in new ones.

## Hooks for task 03 (sound)

On the object `createF2004Scene()` resolves to (also `window.__f2004`):

- `engine`: live values, read them whenever needed: `rpm`, `rpmNorm` (0 at idle, 1 at the limiter),
  `throttle` (0 or 1), `state` (`idle`, `revving`, `settling`, `popped`, `pitstop`), `heat`,
  `wheelSpeed` (rad/s), `limiter` (true while the needle bounces).
- `events.on(type, listener)` returns a function that removes the listener; `'*'` listens to
  everything. The event object is `{ type, wheel }` and is reused, so read it and do not keep it.
  - `throttle:on`, `throttle:off` (also at the pop)
  - `limiter`: once per hold, when the revs first reach the limiter. For the bounce itself read
    `engine.limiter` and `engine.rpm`.
  - `lightsout`: the red lights go out (only if at least one was lit)
  - `pop`
  - `pitstop:start`, `nut:off` ×4 (`wheel` says which corner; the gun starts undoing), `wheel:off`
    (the wheels start to slide off), `wheel:on` (the fresh wheels are seated), `nut:on` ×4 (the gun
    starts tightening), `pitstop:end` (the car is back on the ground)
  - With reduced motion the stop is instant and only `pitstop:start` and `pitstop:end` fire.
- No audio code was added.

## Not done

- **Sound** (task 03). Only the hooks exist.
- **Not tested on the Chromebook, in a real browser window or on a real touch screen.** The checks
  ran in headless Chromium: the look and the timing on this machine's GPU, touch through emulation.
- **Soft smoke edges only against the ground**, not against the car. Against the car would need a
  depth texture of the scene, which is not cheap with the anti-aliased target.
- **The blur disc is drawn, not measured**: soft rings in the rim's average colour, not a true
  radial blur of the real rim.
- **The brake discs leave with the wheels** in the pit stop. In the model they are children of
  `wheel_XX`; keeping them on the car needs a change to `public/models/f2004.glb`, which this task
  may not touch.
- **`hero_burnout.png` and the eight `gallery_*.png`** are not on the site: no page uses them yet.
- **The task 01 screenshots were not retaken.** The stage ones would now show the button.
- **No software-rendering benchmark** in the final run (it takes seconds per frame).

## Open questions

Choices I made without asking, for you to confirm or change.

**Things that happened during the run**

1. **The licence commit.** `LICENSE`, `LICENSING.md` and the `license` field were already committed
   (`eb73f55 license`) when I started, so there was nothing to commit under rule 2.2. `v0.1.0` is on
   that commit.
2. **Your `logo change` commit (`9e810d3`) contains my first version of the scene files.** They were
   in the working tree, uncommitted, when you committed. Nothing is wrong with the result; the history
   just shows those files arriving under your message. I left it alone.
3. **`assets-src/media/` arrived while I was working.** I used the screenshots (the brief says to use
   them if they are there). I did **not** commit that folder: it is 113 MB with the audio, and it is
   yours. The seven PNGs copied into `src/assets/screenshots/` add about 36 MB to the repo, because
   the build needs the sources. If that is too much, say so and I can store them as lossless WebP.

**The burnout**

4. **Start lights.** The first pod lights 0.5 s into the hold and all five are on at 2.5 s (not "pod
   1 at once"). From the hero angle the gantry is behind the camera, so I added a red (then green)
   glow on the car from the gantry (`GANTRY_GLOW`), and the lit pods show in the puddles.
5. **Heat rises with holding time, not with wheel speed**, so `POP_SECONDS` is exact. Short lifts keep
   the heat, so stabbing the throttle still pops. Heat also cools while the tyres sit flat.
6. **`limiter` fires once per hold**, not on every cut (9 a second seemed useless as an event).
7. **After a pop the throttle must be let go once** before it counts again, so holding through the
   stop does not launch straight into the next burnout.
8. **The pit stop takes 2.55 s**: the listed phases plus a quarter-second beat with no wheels on the
   car. The clock stops when the car is back on the ground. Green starts when the car is released
   (the start of the drop) and lasts 0.6 s.
9. **The corners are 0.02 to 0.07 s out of step** with each other, like a real crew.
10. **Space on the page also starts the pit stop** (the brief says "a normal click"). Presses in the
    first 0.6 s after the pop are ignored, so a reflex second tap does nothing.
11. **Reduced motion** also turns off the body shake, yaw wiggle, camera shake and landing bounce.
    Wheelspin, smoke and the pop still play.
12. **The smoke reaches about 75% of the cap by the pop** on a single hold (`FILL_SECONDS`). Lower
    that number for a thicker cloud, at a higher cost.
13. **Every wheel part now has its own copy of its material**, marked see-through so it can fade
    during the stop. The model's textures keep other data in their alpha channel, so those copies
    ignore it.
14. **The car's floor.** With the rear dropped 11 cm the rims sit about 3 cm off the ground. I saw no
    clipping in the renders, but I did not measure the floor.
15. **`window.__f2004.sim` exists for every visitor**, not only with `?debug=1`. It is harmless, and
    it is what the screenshots use.

**The screenshots**

16. **The share image has a new layout** when it is made from `og_burnout.png`: logo and wordmark
    along the bottom, over the tarmac, because the car and the smoke fill the top.
17. **`src/assets/logo.png` and `logo-mark.png` are still the old logo.** Your commit changed
    `assets-src/logo/` only. The share image therefore still shows the old mark. After you replace
    the two files, run `node scripts/make-brand.mjs icons`.
18. **I removed the lettering mask from `make-brand.mjs`.** It cut the old logo by pixel position,
    which rule 5 forbids. `logo-mark.png` now has to be made by hand.
19. **`astro.config.mjs` deletes PNGs in `dist/_astro/` that no built file names.** Today that is
    only the six slider sources.
20. **The old Monza pair had two sizes** (1152×648 and 1024×576). The new pair matches.

**Other**

21. **One new dev dependency: `vitest` 5.0.3.** No new runtime dependency.
22. **`brainstorm.md` was not edited** (rule 4). It could now say that task 02 is done and that the
    headless checks can use the GPU.
23. **Files in `public/models/` and `public/textures/`:** none changed. One wish is in "Not done"
    (the brake discs).

## Review

Three read-only Sonnet subagents read the code against the brief (the state machine and tests; the
three.js side; the controls and the screenshot work). What they found is fixed:

- Space stayed captured on the whole page after a fast jump past the stage, because the "on stage"
  flag was only refreshed by the frame loop.
- Holding Enter through the pop started the pit stop by itself (key repeat clicked the button), and
  a held Enter stayed stuck if focus left the button.
- The button jumped down when the hint disappeared.
- The rear of the car snapped up 11 cm in the middle of the pit stop.
- The instant (reduced motion) stop left the rubber shards lying there.
- The blur disc never got the car's environment map, so it was far too dark.
- The shard shader was first compiled at the pop instead of during loading.
- A shader call that is undefined on some GPUs (`smoothstep` with its edges reversed).
- A lost and restored WebGL context would have baked the smoke into the car's reflections.
- The click after a touch hold that ended in a pop could arrive late and start the stop.
- Smaller ones: a listener removing itself skipped the next listener, `release()` in the test hooks
  did nothing until the next step, the shards were re-uploaded every frame after they stopped.
