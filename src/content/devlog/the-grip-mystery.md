<!-- DRAFT written by Claude Code from the reports; rewrite before publishing -->
---
title: "The grip mystery: it was CSP"
date: 2026-10-11
summary: rustyAC felt grippier than the real game in some corners. The physics matched bit for bit, so the difference had to be somewhere else. It was Custom Shaders Patch.
draft: true
cover: gallery_heavy_clouds
coverAlt: The Ferrari F2004 at Spa under heavy clouds, drawn by rustyAC
---

The first time rustyAC was driven next to the real game, something felt wrong. In some corners of Spa the car had more grip in rustyAC than in Assetto Corsa. The Bus Stop chicane was the worst: the complaint was, roughly, "I'd spin where rustyAC is almost flat".

That should not have been possible. By then rustyAC's physics matched the game's own code bit for bit, the Bus Stop kerbs included. So either the proof was wrong, or the two programs were not being given the same car on the same day.

<!-- docs/port/grip_investigation.md lines 56-57 ("I'd spin where rustyAC is almost flat") and section 3 (bit-exact, including the Bus Stop kerbs: spa_kerbs, spa_kerb_strike) -->

## First find: the air

The first difference turned up quickly. The real game on that PC runs with Custom Shaders Patch (CSP), and CSP makes the air thinner with altitude.

Plain Assetto Corsa works the air's density out from temperature alone: 1.2922 minus 0.0041 times the air temperature. At 14 °C that is 1.2348. A recording from the real game on the same day showed 1.157 at the top of the track and 1.172 at the bottom of Eau Rouge.

Thinner air is 5 to 6 % less downforce and less drag. In fast corners that is exactly "extra grip in some corners", seen from the other side: rustyAC was driving in the plain game's thick air.

<!-- docs/port/conditions.md lines 21-29 -->

Two smaller things were found and fixed on the way. rustyAC had been using its built-in weather (26 °C air, 30 °C road, no wind) while the game used the session's own (14 °C, 20 °C and some wind). And mechanical damage was off in the game but on in rustyAC. rustyAC now reads both from the game's own session file.

<!-- docs/port/conditions.md lines 30-38 -->

## Nine suspects

Thin air did not explain a spin at a slow chicane. So the next task started with a desk investigation, before anybody drove again. Nine suspects were listed and ranked: how CSP handles the car's body touching a kerb, traction control differing between the two drives, CSP's tyre pressure law, the thin air, a long drive against a fresh start, an old copy of the gamepad settings, and a few more.

<!-- docs/port/grip_investigation.md section 2, the table of nine suspects -->

Most of it was ruled out. The session start values matched: the same compound, the same tyre blankets, the same fuel, the same brake bias. CSP's "extended physics" was off. So were its rain, its gamepad script and its steering changes.

<!-- docs/port/grip_investigation.md section 3 and lines 43-48 -->

Two CSP changes were proven from the game's own recording, though, with extended physics off:

1. **The thin air**: 5.6 % less downforce and drag at the Bus Stop.
2. **A different tyre pressure law.** In the plain game a tyre's pressure follows its core temperature as `10 + 0.16 × (core − 26)` psi. The recording fits `10.97 + 0.084 × (core − 26)` instead, on all four wheels within 0.03 psi over three laps. Hot tyres had about 6 psi less: 18.8 against 24.9 psi at the Bus Stop.

Together they are worth about 2 % of the speed the corner can be taken at. Real, but not a spin.

<!-- docs/port/grip_investigation.md lines 49-57 and line 87; section 5.2 -->

## The reference lap was the wrong one

One finding turned an earlier conclusion upside down. The recording used as "the real game" was a lap driven by the game's AI. And the AI does not drive the car you drive: with the throttle closed it gets 20 % more tyre grip.

The numbers showed it. Tyre force per newton of load was 2.38 in the AI's lap against 1.93 for rustyAC's test driver, and 1.2 times 1.93 is 2.32. So the earlier note that rustyAC had more grip than the recording was the wrong way round. The recording had the extra grip.

<!-- docs/port/grip_investigation.md lines 58-63 and section 5.1 (lines 159-165) -->

The same work showed what is big and has nothing to do with CSP: traction control. With it switched off, rustyAC's test driver cannot even finish a lap of Spa.

<!-- docs/port/grip_investigation.md lines 64-68 -->

## The test that settled it

In the end the answer came from the simplest experiment: switch CSP off in the game and drive both. Same car (the plain Formula Alpha 2026), same track, same session files, traction control off in both, the same air density in both, and a person at the wheel.

| | AC lap 1 | AC lap 2 | rustyAC lap 1 | rustyAC lap 2 |
|---|---|---|---|---|
| Lap time | 1:53.086 | 1:56.474 | 1:56.598 | 2:00.658 |
| Bus Stop, lowest speed (km/h) | 65.8 | 68.9 | 59.8 | 72.7 |
| Bus Stop, peak lateral g | 2.42 | 2.84 | 2.87 | 3.99 |

<!-- docs/port/grip_investigation.md lines 9-19 (telemetry runs of 2026-10-08) -->

The driver's own spread from one lap to the next (65.8 against 68.9 km/h in the game, 59.8 against 72.7 in rustyAC) is bigger than the gap between the two programs. And the driver reported that with CSP off, the Bus Stop in the real game felt "a lot different".

The report's conclusion: the extra difficulty is CSP, not a rustyAC fault.

<!-- docs/port/grip_investigation.md lines 22-33 -->

## What is still open

Which CSP option does it is not known. The best remaining suspect is its handling of collisions between the car's body and the ground, which is switched on by default and runs on CSP's own physics code. That is a suspicion, not a result: the run that would test it, one option changed at a time, has not been done.

It is also worth saying what the last test was not. It used a different car from the one in the original complaint, and it compares a person's laps, not recordings. It shows that the two programs agree within what one driver can repeat. The bit-for-bit proof is a separate thing, and it is against the game's own code.

<!-- docs/port/grip_investigation.md lines 39-41 and 69-74 (the remaining suspect; run 6 not done) -->

For rustyAC the rule stays simple. It is the car of plain `acs.exe`. If CSP's behaviour is ever added, it will be something you switch on.

<!-- docs/port/grip_investigation.md, conclusion: "goes into the CSP layer later as opt-in ... plain rustyAC stays the car of plain acs.exe" -->
