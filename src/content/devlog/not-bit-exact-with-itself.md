<!-- DRAFT written by Claude Code from the reports; rewrite before publishing -->
---
title: Assetto Corsa isn't even bit-exact with itself
date: 2026-10-11
summary: While copying the game's maths library into Rust, we found it has two versions of its own functions and picks one by the processor. They do not agree.
draft: true
cover: gallery_night_lights
coverAlt: A BMW 1M with its headlights on at Spa after sunset, drawn by rustyAC
---

rustyAC is built on one stubborn idea: for the same inputs, give the same bits as the original game. It turns out the original game does not manage that itself. Run it on two processors, ten years apart, and the same drive can come out differently.

Here is how that was found, and what it does and does not change.

## A question left open

The suspicion is as old as the first proof. The game does not compute its own sines, cosines and powers. It calls `sinf`, `cosf`, `powf` and a few more from `MSVCR120.dll`, the Visual C++ 2013 runtime. So does rustyAC on the desktop: it loads the same DLL and calls the same functions, because a different `sinf` would be a different game.

The very first report noted a thing it had not looked into: whether that DLL returns different bits on different processors. The test tool and the port run the same DLL on the same processor, so they would agree either way. The question was written down and left.

<!-- docs/port/sctm.md lines 111-113 and 125-127; docs/oracle/car_oracle.md lines 672-674 -->

## Two bodies

It came back when the browser preview was built. A browser cannot load a Windows DLL, so the maths functions had to be rewritten in Rust, from the DLL's machine code.

Six of them (`sinf`, `cosf`, `tanf`, `expf`, `powf` and the double-precision `sin`) are hand-written assembly from AMD's maths library. Each one starts with the same instruction: a test of a flag. And each one has two bodies after that test. One uses the older SSE2 instructions. The other uses FMA3, the fused multiply-add instructions.

<!-- docs/port/web.md section 2.1, lines 96-98 -->

The flag is set when the DLL is loaded, if the processor has FMA3 and the operating system supports it. The game never turns it off. So on a processor made since about 2013 the game runs the FMA3 bodies, and on an older one it runs the SSE2 bodies.

<!-- docs/port/web.md lines 68-72 and 98-101 -->

A fused multiply-add computes `a × b + c` with one rounding instead of two. It is more accurate. It is also, for that reason, a different answer.

## Measuring it

Nobody had to guess how different. The DLL has a switch to turn the FMA3 path off, so the proof tool flips it and compares the DLL against itself. Out of all 4,294,967,296 possible inputs:

| Function | Inputs where the two bodies disagree |
|---|---|
| `sinf` | 44,232 |
| `cosf` | 18,018 |
| `expf` | 1 |
| `tanf` | none |

For `powf`, 7,020 of 400 million sampled pairs differ. The other functions have only one body.

<!-- docs/port/web.md, the fma3-off table, lines 162-172 -->

44,232 out of 4.29 billion is about one input in a hundred thousand. That sounds like nothing. But a car's physics runs 333 steps a second, each step calls these functions many times, and every step starts from the result of the one before. One different last bit does not stay a last bit.

The report states the consequence plainly: Assetto Corsa's maths depends on whether the processor has FMA3. A drive recorded on a pre-2013 processor would not replay bit for bit on a modern one, in the real game either.

<!-- docs/port/web.md lines 174-176 -->

## A second one

It is not the only place. The game's rigid-body physics library uses a processor instruction that gives an approximate reciprocal. Its last bits are not fixed by any standard, and they differ between Intel and AMD processors. It is only used on one rare path, when there are eight or more contact points at once.

So there, too, the game is not the same on every PC.

<!-- docs/port/contacts.md lines 51-52; docs/port/web.md lines 294-308 -->

## What rustyAC does about it

On the desktop, nothing changes. rustyAC calls the real DLL, so it takes whichever path the game would take on that processor. On an old processor that is the old path, exactly as in the game.

<!-- docs/port/web.md lines 195-204 and 808-811 -->

The Rust copy of the maths is the FMA3 path only. That is the one the game runs on any current processor. It was proven against the DLL on every possible input of the seven one-argument functions, and it is what the browser preview uses. For the reciprocal, the browser uses a table measured on an Intel processor. So the browser computes what a modern Intel desktop computes.

<!-- docs/port/web.md lines 64-72 and 301-308 -->

What is not done:

- The older SSE2 bodies are not ported. A drive from a pre-2013 processor cannot be reproduced without the DLL.
- There is no table for AMD's reciprocal. Measuring one needs an AMD machine.

Both are listed as open questions in the report.

<!-- docs/port/web.md section 8, items 1 and 2 -->

## What "bit-exact" means after this

It means the claim needs one more clause. Not "the same bits as Assetto Corsa", because there is no single Assetto Corsa to match. The claim is: the same bits as the game's own code, for the same inputs, on the same processor path.

That is a smaller sentence than the one we started with. It is also the true one. And there is something pleasing about a port that had to be more careful about the game's arithmetic than the game ever was.
