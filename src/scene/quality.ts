// Automatic quality: averages the frame time over a window of frames and moves between three
// tiers. It starts on mid, steps down fast and steps up only after a few seconds of headroom. A
// tier it had to leave gets one more try after a longer good spell; leaving it twice rules it out,
// so it cannot flip back and forth.
import type { Tier } from './types';

export interface TierSettings {
  /** Upper limit for the device pixel ratio. */
  maxDpr: number;
  /** Planar reflection size as a fraction of the drawing buffer; 0 turns it off. */
  reflectionScale: number;
  /** Bloom resolution as a fraction of the drawing buffer; 0 turns post-processing off. */
  bloomScale: number;
  /** MSAA samples of the post-processing target. */
  samples: number;
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { maxDpr: 1.5, reflectionScale: 1 / 2, bloomScale: 1, samples: 4 },
  mid: { maxDpr: 1, reflectionScale: 1 / 3, bloomScale: 1 / 2, samples: 2 },
  low: { maxDpr: 0.75, reflectionScale: 0, bloomScale: 0, samples: 0 },
};

const ORDER: readonly Tier[] = ['low', 'mid', 'high'];
const WINDOW = 60; // frames per measurement
const SLOW_WINDOW_MS = 2000; // ...or this much time, when frames are too slow to fill a window
const MIN_FRAMES = 6;
const STALL_MS = 250; // longest time a single frame may add to the average
const WARMUP = 20; // frames ignored after a start or a tier change (shader compiles, resizes)
const WARMUP_MS = 1000;
const SLOW_MS = 25; // slower than about 40 fps: step down after one window
const FAST_MS = 18; // about 55 fps or better...
const FAST_WINDOWS = 4; // ...for this many windows in a row (about 4 s): step up
const RETRY_WINDOWS = 12; // ...or this many (about 12 s) to retry a tier that was left once

export class QualityGovernor {
  tier: Tier;
  /** Average frame time of the last full window, in ms. */
  averageMs = 0;

  private ceiling = ORDER.length - 1;
  private frames = 0;
  private sum = 0;
  private skip = WARMUP;
  private skipped = 0;
  private fastWindows = 0;
  private steppedDown = false;
  private readonly leaves: number[] = [0, 0, 0];
  private readonly locked: boolean;
  private readonly onChange: (tier: Tier) => void;

  /** `forced` pins the tier (used by `?debug=1&tier=...`). */
  constructor(onChange: (tier: Tier) => void, forced?: Tier) {
    this.onChange = onChange;
    this.tier = forced ?? 'mid';
    this.locked = forced !== undefined;
  }

  /** Call after a pause (tab hidden, section off screen) so the gap is not measured. */
  resume(): void {
    this.frames = 0;
    this.sum = 0;
    this.skip = WARMUP;
    this.skipped = 0;
  }

  /** Feed one frame time in ms. */
  sample(ms: number): void {
    if (this.skip > 0) {
      this.skip--;
      this.skipped += ms;
      // on a very slow device the warm-up ends after a second instead of after WARMUP frames
      if (this.skipped < WARMUP_MS) return;
      this.skip = 0;
      return;
    }
    // one long stall (a GC pause, a throttled tab) counts, but only as much as a very slow frame
    this.sum += Math.min(ms, STALL_MS);
    this.frames++;
    // a full window, or two seconds' worth of frames on a device too slow to fill one quickly
    const enough = this.frames >= WINDOW || (this.sum >= SLOW_WINDOW_MS && this.frames >= MIN_FRAMES);
    if (!enough) return;

    this.averageMs = this.sum / this.frames;
    this.frames = 0;
    this.sum = 0;
    if (this.locked) return;

    const index = ORDER.indexOf(this.tier);
    if (this.averageMs > SLOW_MS && index > 0) {
      // the first time may have been a hiccup; after the second, this tier is off the table
      this.leaves[index] = (this.leaves[index] ?? 0) + 1;
      if ((this.leaves[index] ?? 0) >= 2) this.ceiling = index - 1;
      this.steppedDown = true;
      this.set(ORDER[index - 1] ?? 'low');
    } else if (this.averageMs < FAST_MS && index < this.ceiling) {
      this.fastWindows++;
      // climbing back to a tier that was left once takes a much longer run of good windows
      const needed = this.steppedDown ? RETRY_WINDOWS : FAST_WINDOWS;
      if (this.fastWindows >= needed) this.set(ORDER[index + 1] ?? 'high');
    } else {
      this.fastWindows = 0;
    }
  }

  private set(tier: Tier): void {
    this.tier = tier;
    this.fastWindows = 0;
    this.skip = WARMUP;
    this.skipped = 0;
    this.onChange(tier);
  }
}
