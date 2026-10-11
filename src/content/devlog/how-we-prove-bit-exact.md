<!-- DRAFT written by Claude Code from the reports; rewrite before publishing -->
---
title: How we prove a Rust port is bit-exact with the original game
date: 2026-10-11
summary: rustyAC does not try to feel like Assetto Corsa. It loads the real game's code into a test program, asks both the same question, and compares every bit of the answer.
draft: true
cover: gallery_f2004_spa_trackside
coverAlt: The Ferrari F2004 passing the grandstand at Spa, drawn by rustyAC
---

A rewrite of a racing sim has an obvious problem: how do you know it drives the same? You can drive both and say it feels close. You can lay two telemetry traces over each other and say they look close. Neither tells you whether the tyre formula has a wrong sign in a corner case you never drove through.

rustyAC uses a stricter test. For the same inputs, the Rust code has to give the same numbers as the game's own code. Not close numbers: the same bits.

<!-- docs/port/sctm.md lines 30-31: "Bit-exact means all seven output fields ... of a row have the same 32 bits as AC's output" -->

## The game ships its own map

Assetto Corsa is one program, `acs.exe`. The build that rustyAC works from is game version 1.16.4, built on 2018-01-10. It ships with `acs.pdb`, its debug symbols, so a decompiler shows the real names of the game's functions: `Tyre::addTyreForcesV10`, `SCTM::solve`, `Car::step`.

<!-- docs/map/physics_engine.md line 3 (version 1.16.4, PE timestamp 2018-01-10); docs/map/tyre.md lines 3-4 (real PDB names) -->

All 7,453 hand-written functions were decompiled. Before any Rust is written, each system gets a written map: what its functions do and in which order. Every map was then checked by a second, independent reviewer: 658 claims were checked against the code, and 54 were found wrong and fixed.

<!-- docs/map/car.md section 5.1, items 1 and 3 -->

## The oracle

The proof tool is called the oracle. It does not start the game. It maps `acs.exe` into its own process as a plain block of code, with Windows' `LoadLibraryExW` and the flag that says "do not resolve DLL references". The game's entry point never runs, and neither does its start-up code.

<!-- docs/map/tyre_oracle.md, part C "How it calls AC's code"; docs/oracle/car_oracle.md line 75 -->

Two safety checks come first. The file must be the exact build that was decompiled, or the oracle refuses to go on. And a known slot of a known table must point at the function it is supposed to point at.

Then the oracle calls the game's functions directly, by address. The addresses come from the debug symbols. For the tyre formula that is `SCTM::solve`: the oracle fills in the same input structure the game would, calls the game's function, calls the Rust function, and compares the two results as 32-bit patterns.

<!-- docs/map/tyre_oracle.md, part C, steps 2 and 4 -->

The first result was the tyre formula: 329,734 questions, seven numbers each, zero differences.

<!-- docs/port/sctm.md section 1 -->

## Why the decompiler is not enough

The first surprise was that the decompiler's output is not enough for this. Its pseudo-C is right about what is computed, but it regroups arithmetic. In the tyre formula it shows

```
(cos · speed) · slipRatio
```

where the machine code computes

```
cos · (speed · slipRatio)
```

In ordinary maths those are the same. In floating point they can differ in the last bit. So every function was transcribed from its disassembly, instruction by instruction, with the game's operand order and the game's mix of single and double precision.

<!-- docs/port/sctm.md section 4, lines 136-144; docs/port/awd_ers.md lines 77-79 -->

The same thing happened with source code. The game's rigid-body physics is ODE 0.13.1, an open-source library, so its source is public. A literal port of that source matched the game on only 54 % of the steps of a car. The game's machine code adds some sums in packed four-lane blocks, which add up in a different order. The machine code was followed instead, and all 1,996,043 test steps came out identical.

<!-- docs/map/physics_engine.md lines 43-48 (ODE 0.13.1); docs/port/ode_stage1.md, the table of differences row 1 (54 %) and section 1 (1,996,043 steps) -->

## From one formula to a whole car

A formula is easy to call. A car is not: it wants a physics engine, a track and a driver. For that the oracle builds the game's real car, the Ferrari F2004 with all its parts, by calling the game's own constructors. It hands it a flat road, a scripted driver and a clock that only moves when told to.

Twelve drives were recorded this way, 70,673 steps in all. Each was run twice from scratch, and both runs give the same checksum over every byte of the recording. That matters: a recording is only a reference if the game agrees with itself.

<!-- docs/oracle/car_oracle.md lines 36-49 and section 2.1 -->

The Rust car is then told only what the driver did, and has to arrive at the same state, step after step. By the time the whole car was in, that was 49 drives and 228,184 steps, all identical.

<!-- docs/port/whole_car.md section 1 and the results table ("49 drives", "228,184") -->

Later tasks reused the idea for everything else:

- **Tracks:** 8,800,000 ray casts against the track models, every answer identical, and 2,752,168 steps in 89 drives with zero differences (one value is left out on the drag strips, where the game itself reads memory that is not its own).
- **Sound:** a log of every call into the game's sound library. On 18 recorded drives the port makes exactly the calls the game makes: 16,704,338 of them, every argument bit-equal.
- **The renderer:** the list of Direct3D 11 commands and the finished pixels, compared on a software graphics card so that two runs give the same picture. On the first 21 frames both were identical, line for line and byte for byte.

<!-- docs/port/tracks.md section 1 (lines 63-76); docs/port/audio.md section 1 (lines 41-43); docs/port/renderer_core.md section 1 (lines 32-37) -->

## Can the test fail?

A comparison that always says "identical" proves nothing. So deliberate small faults were put into the Rust car, one at a time, to see whether the comparison notices: 18 in the rolling chassis, and 24 in the whole car (12 of them in the drivetrain). All 24 were caught. Of the 18, five only showed on a car altered to reach the code they were in, which is itself worth knowing: a drive only tests what it touches.

<!-- docs/port/rolling_chassis.md lines 336-339; docs/port/whole_car.md lines 66 and 455 -->

## What it does not prove

"Bit-exact" is a narrow claim, and it should stay narrow:

- It is proven against the game's own code, run in a test program, for the drives that were recorded. A branch no drive reached was ported from the disassembly but never run against the game. The reports list those.
- It holds on the same processor path. The game's maths library gives different last bits on old processors, which is a story of its own.
- The reference is plain Assetto Corsa, without Custom Shaders Patch.
- The sound mix is not sample-identical, because the game's sound library mixes with random numbers. Two runs of the game's own code never gave the same file either.

<!-- docs/port/drivetrain.md section 6.3 and docs/port/whole_car.md sections 3.4 and 6.3 (untested branches); docs/port/web.md lines 174-176; docs/port/audio.md section 5.2 -->

The reports say what was not done. That list is as much a part of the proof as the numbers are.
