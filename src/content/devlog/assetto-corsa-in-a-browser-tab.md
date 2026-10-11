<!-- DRAFT written by Claude Code from the reports; rewrite before publishing -->
---
title: Assetto Corsa in a browser tab
date: 2026-10-11
summary: The same physics code that drives the desktop build, compiled to WebAssembly and proven to give the same bits. What it took, and what the preview cannot do.
draft: true
cover: web_spa
coverAlt: The browser preview with a Ferrari F2004 on track at Spa
---

rustyAC's physics is plain Rust: no graphics, no window, no sound in it. That made one side quest tempting. If the physics compiles for Windows, it should compile for a browser too, and then anybody with a copy of Assetto Corsa could try it without downloading a program.

The result is a preview that runs in a browser tab. The interesting part is not that it runs. It is that it computes the same numbers as the desktop, bit for bit.

<!-- docs/web.md, intro; docs/port/web.md section 1 -->

## The DLL problem

On the desktop, rustyAC gets its sines and powers the way the game does: it calls `sinf`, `cosf`, `powf` and their friends in `MSVCR120.dll`, the Visual C++ 2013 runtime. That is deliberate. A different `sinf` gives different last bits, and then nothing downstream matches.

A browser cannot load a Windows DLL. So the ten functions were read out of the DLL's machine code and written again in Rust, instruction by instruction, with the DLL's own tables copied by a script.

<!-- docs/port/web.md section 2.1 (the imports) and lines 62-67, 115 -->

Then the copy was proven. For each of the seven functions with one argument, every one of the 4,294,967,296 possible inputs gives the same bits as the DLL. The two-argument functions have too many input pairs for that, so they, and the double-precision `sin`, were tried on 59 billion more inputs. Not one difference, results that are not numbers included.

<!-- docs/port/web.md lines 64-68 and the proof table (lines 119-160) -->

## 160 drives

With the maths settled, the physics crates were built for WebAssembly as they were. The game around them needed sorting first: the window, Direct3D, the input devices and the sound library were put behind a "Windows only" switch.

The proof is a replay. The recorded drives from the earlier tasks, and nine recorded for this one, were each run twice: through the desktop build with the real DLL, and through the WebAssembly build with the Rust maths. After every single step, a hash of the car's whole state was compared.

**160 drives, 1,787,777 steps: every step's hash is equal in all 160.** The drives cover every suspension type, four-wheel drive, hybrids, crashes, loose cones and whole laps.

<!-- docs/port/web.md lines 217-229 and section 3.2 (lines 234-281) -->

It did not pass the first time. Seven drives differed, and all seven had something in common: a moment where the solver had eight or more contact rows at once. That path of the physics library uses a processor instruction for an approximate reciprocal, and its last bits are not defined by any standard. WebAssembly has no such instruction. The fix was to measure what the instruction answers on the test PC's Intel processor, for all 4,294,967,296 operands, and put that into a table.

<!-- docs/port/web.md lines 283-286 and 294-308 -->

That 160-drive proof runs the WebAssembly outside a browser. For the browser itself there is a self-test built into the page: a test driver does 10,000 steps (30 seconds of driving) and the page reports one number for the car's final state. On three car and track pairs, headless Chrome gives the same number as the desktop.

The first try at that differed too. The test driver's own steering maths had been using Rust's standard library, which is not the same in WebAssembly. It now uses the same copy of the game's maths as everything else.

<!-- docs/port/web.md lines 309-325 -->

## Reading a game the page does not have

The site holds no Assetto Corsa file. The cars and tracks come from your own install: you press "Open your Assetto Corsa folder" and pick it in the browser's own dialog. The page reads the files it needs on your computer. Nothing is uploaded.

The browser can remember which folder you picked, so the next visit needs one click at most.

<!-- docs/web.md lines 8-11 and 294-296; docs/port/web.md section 4.4 -->

The files are big. Spa's main model alone is 441 MB. The page reads each file in pieces straight into the WebAssembly memory, so a file is never held twice, and gives the memory back once the track's collision meshes are built and its textures are on the graphics card. Even so, a big track needs about 1 to 1.5 GB in the tab while it loads.

<!-- docs/web.md, "How the page copes with a 441 MB file" -->

## The picture

The picture is not Assetto Corsa's. The game's shaders are compiled for Direct3D and cannot run in a browser. The preview has a small renderer of its own, on WebGPU where the browser has it and on WebGL2 otherwise. It draws the track and the car with their textures, one sun, fog and the game's camera positions. The display (gear, speed, revs, lap times) is ordinary HTML laid over the picture.

<!-- docs/port/web.md section 4.2 (lines 354-372) and section 7 -->

It is fast enough. On the test PC, headless Chrome holds 60 frames a second with the physics at its fixed 333 steps a second. Run flat out, the WebAssembly physics reaches 60 to 75 % of the desktop's speed, which is still 13 to 31 times faster than real time.

<!-- docs/port/web.md lines 472-497 -->

## What it cannot do

It is a preview, and the list of what is missing is long:

- no sound: the game's sound library is native code
- not the game's look: no shadows, reflections or sky from Assetto Corsa's renderer
- one car, one session: picking another car or track reloads the page
- no wheel and no force feedback
- your own key bindings, saved setups and session weather are not read
- the page stands still for 2 to 5 seconds while a track's collision data is built

<!-- docs/port/web.md section 7 (lines 529-547) -->

And two honest notes about the testing. Only Chrome was run; other browsers were not tried. And no real gamepad was used: the pad code is covered by unit tests only.

<!-- docs/port/web.md lines 542-544 and line 777 -->

The desktop build was not disturbed by any of it: 14 recorded drives give byte-identical state dumps before and after.

<!-- docs/port/web.md lines 85-88 and 642-651 -->
