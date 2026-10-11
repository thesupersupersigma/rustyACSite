# Scene test (reference only, not part of the site)

`scene-test.html` loads `public/models/f2004.glb` + `public/models/night_track.glb` with the lightmaps and the
wet asphalt shader. It is the reference for how the materials are wired (lightmap channels, lightMapIntensity,
puddle mask). `scene-test-shot.mjs` renders stills with headless Chromium (SwiftShader).

To run it: put it next to the `models/` and `textures/` folders from `public/`, run `npm i three@0.170.0 playwright@1.48.2`,
then `node scene-test-shot.mjs '[["out.png","exp=1.2&envg=0.15&cam=6.5,2.4,-7&look=-1,0.6,2"]]'`.
URL options: `exp` exposure, `envg` env reflection on the ground, `glow`, `bloom`, `key`, `cam`, `look`, `fov`, `wet=0`.

Known gaps the real build should fix:
- reflections use a cube env map, so they're in the wrong place; the site needs a half-resolution planar reflection
- the `rim` spotlight is a placeholder
