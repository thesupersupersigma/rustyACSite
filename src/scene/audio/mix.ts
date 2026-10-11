// The sound model: which clips play, how loud and at what pitch. Pure TypeScript on purpose (no Web
// Audio, no three.js, no DOM), so vitest can run it. graph.ts turns the numbers into audio nodes.
//
// The engine is the classic crossfaded-loop method: every loop plays all the time, the two loops
// whose recorded revs bracket the current revs are crossfaded at constant power, and each is
// pitch-shifted by `current rpm / its own rpm`.
import { AUDIO } from './constants';

const HALF_PI = Math.PI / 2;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (gain: number) => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/** The time constant for `setTargetAtTime` that gets about 95% of the way in `seconds`. */
export const timeConstant = (seconds: number) => Math.max(0.001, seconds / 3);

/** Moves `value` toward `target`, getting about 95% of the way in `seconds`, whatever the frame rate. */
export function smoothToward(value: number, target: number, dt: number, seconds: number): number {
  if (!(dt > 0)) return value;
  if (!(seconds > 0)) return target;
  return target + (value - target) * Math.exp((-3 * dt) / seconds);
}

/** A small repeatable random number generator (mulberry32): the same seed gives the same sounds. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Constant-power crossfade: at `t` = 0 all `a`, at 1 all `b`, and a² + b² = 1 all the way. */
export function crossfade(t: number, out: { a: number; b: number }): { a: number; b: number } {
  const x = clamp(t, 0, 1);
  out.a = Math.cos(x * HALF_PI);
  out.b = Math.sin(x * HALF_PI);
  return out;
}

export interface ClipPair {
  /** Index of the loop recorded at or below the current revs. */
  lo: number;
  /** Index of the loop above; the same as `lo` when the revs are outside the recorded range. */
  hi: number;
  /** 0 = all `lo`, 1 = all `hi`. */
  t: number;
}

/**
 * The two loops nearest to `rpm`. `rpms` must be sorted, lowest first. The position between them is
 * measured in pitch (the logarithm of the revs), so halfway is where both loops are detuned by the
 * same musical interval.
 */
export function pickPair(rpms: readonly number[], rpm: number, out: ClipPair): ClipPair {
  const last = rpms.length - 1;
  const first = rpms[0] ?? 0;
  const top = rpms[last] ?? 0;
  if (last <= 0 || !(rpm > first)) {
    out.lo = out.hi = 0;
    out.t = 0;
    return out;
  }
  if (rpm >= top) {
    out.lo = out.hi = last;
    out.t = 0;
    return out;
  }
  let i = 0;
  while (i < last - 1 && rpm >= (rpms[i + 1] ?? Infinity)) i++;
  const lo = rpms[i] ?? first;
  const hi = rpms[i + 1] ?? top;
  out.lo = i;
  out.hi = i + 1;
  out.t = clamp(Math.log(rpm / lo) / Math.log(hi / lo), 0, 1);
  return out;
}

/** How fast a loop recorded at `clipRpm` plays at `rpm`, inside the limits. */
export function clipRate(rpm: number, clipRpm: number): number {
  if (!(clipRpm > 0) || !Number.isFinite(rpm)) return 1;
  return clamp(rpm / clipRpm, AUDIO.RATE_MIN, AUDIO.RATE_MAX);
}

/** Everything the engine's audio nodes are set to for one frame. */
export interface EngineMix {
  pair: ClipPair;
  /** Gain per recorded rpm (the same for the on-throttle and the off-throttle loop of that rpm). */
  weights: number[];
  /** Playback rate per recorded rpm. */
  rates: number[];
  /** Gain of the whole on-throttle set and of the whole off-throttle set. */
  on: number;
  off: number;
  /** Gain of all the loops together, and of the limiter loop. */
  loops: number;
  limiter: number;
}

export function makeEngineMix(count: number): EngineMix {
  return {
    pair: { lo: 0, hi: 0, t: 0 },
    weights: new Array<number>(count).fill(0),
    rates: new Array<number>(count).fill(1),
    on: 0,
    off: 1,
    loops: 1,
    limiter: 0,
  };
}

const fade = { a: 1, b: 0 };

/**
 * The engine at `rpm`. `throttle` (0 closed to 1 open) and `limiter` (0 to 1: how far the limiter
 * loop has taken over) are already smoothed.
 */
export function engineMix(rpms: readonly number[], rpm: number, throttle: number, limiter: number, out: EngineMix): EngineMix {
  const pair = pickPair(rpms, rpm, out.pair);
  for (let i = 0; i < rpms.length; i++) {
    out.weights[i] = 0;
    out.rates[i] = clipRate(rpm, rpms[i] ?? 0);
  }
  crossfade(pair.t, fade);
  out.weights[pair.lo] = fade.a;
  if (pair.hi !== pair.lo) out.weights[pair.hi] = fade.b;

  crossfade(throttle, fade);
  out.off = fade.a;
  out.on = fade.b;

  crossfade(limiter, fade);
  out.loops = fade.a;
  out.limiter = fade.b;
  return out;
}

/** Gain (before WHEELSPIN_DB) and pitch of the tyre squeal for a rear wheel speed of 0 to 1. */
export function wheelspinMix(wheelNorm: number, out: { gain: number; rate: number }): { gain: number; rate: number } {
  const n = clamp(Number.isFinite(wheelNorm) ? wheelNorm : 0, 0, 1);
  out.gain = clamp((n - AUDIO.WHEELSPIN_START) / (AUDIO.WHEELSPIN_FULL - AUDIO.WHEELSPIN_START), 0, 1);
  out.rate = AUDIO.WHEELSPIN_RATE_MIN + (AUDIO.WHEELSPIN_RATE_MAX - AUDIO.WHEELSPIN_RATE_MIN) * n;
  return out;
}

// ---- backfires ----------------------------------------------------------------------------------

export interface Shot {
  /** Seconds from now. */
  delay: number;
  /** Playback rate (pitch). */
  rate: number;
  /** Linear gain, before BACKFIRE_DB. */
  gain: number;
}

const between = (random: () => number, lo: number, hi: number) => lo + (hi - lo) * random();

function shot(random: () => number, delay: number, extraDb: number): Shot {
  return {
    delay,
    rate: between(random, AUDIO.BACKFIRE_RATE_MIN, AUDIO.BACKFIRE_RATE_MAX),
    gain: dbToGain(between(random, AUDIO.BACKFIRE_QUIETEST_DB, 0) + extraDb),
  };
}

/** The bangs for lifting off at `rpm`: none below BACKFIRE_MIN_RPM, otherwise 1 to BACKFIRE_MAX_COUNT. */
export function planBackfires(rpm: number, random: () => number): Shot[] {
  if (!(rpm >= AUDIO.BACKFIRE_MIN_RPM)) return [];
  const count = 1 + Math.min(AUDIO.BACKFIRE_MAX_COUNT - 1, Math.floor(random() * AUDIO.BACKFIRE_MAX_COUNT));
  const shots: Shot[] = [];
  let delay = between(random, 0, AUDIO.BACKFIRE_FIRST_MAX);
  for (let i = 0; i < count; i++) {
    shots.push(shot(random, delay, 0));
    delay += between(random, AUDIO.BACKFIRE_GAP_MIN, AUDIO.BACKFIRE_GAP_MAX);
  }
  return shots;
}

/**
 * Watches the revs bounce on the limiter and now and then lets one ignition cut pop. The `limiter`
 * event fires only once per hold, so this reads the revs every frame instead: a cut is where the
 * revs turn from rising to falling.
 */
export class LimiterPops {
  private previous = 0;
  private falling = false;
  private quiet = 0;

  /** Call once per frame. Returns a bang to play now, or null. */
  update(dt: number, onLimiter: boolean, rpm: number, random: () => number): Shot | null {
    const wasFalling = this.falling;
    this.falling = onLimiter && rpm < this.previous;
    this.previous = rpm;
    if (this.quiet > 0) this.quiet -= dt;
    if (!onLimiter || !this.falling || wasFalling) return null;
    // a cut just started
    if (this.quiet > 0 || random() >= AUDIO.BACKFIRE_LIMITER_CHANCE) return null;
    this.quiet = AUDIO.BACKFIRE_LIMITER_GAP;
    return shot(random, 0, AUDIO.BACKFIRE_LIMITER_DB);
  }
}

// ---- space --------------------------------------------------------------------------------------

/**
 * Where a sound sits between the speakers: `side` is how far right of the middle of the picture
 * its source is (metres, in the camera's frame), `distance` how far from the camera.
 */
export function panFor(side: number, distance: number, width: number): number {
  if (!(distance > 0) || !Number.isFinite(side)) return 0;
  return clamp((side / distance) * width, -AUDIO.PAN_MAX, AUDIO.PAN_MAX);
}

/** The loss in dB for a camera `distance` metres from the car: none up close, DISTANCE_FAR_DB at DISTANCE_FAR. */
export function distanceDb(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  const t = (distance - AUDIO.DISTANCE_NEAR) / (AUDIO.DISTANCE_FAR - AUDIO.DISTANCE_NEAR);
  return clamp(t * AUDIO.DISTANCE_FAR_DB, AUDIO.DISTANCE_MAX_DB, 0);
}

// ---- master -------------------------------------------------------------------------------------

/**
 * Browsers' DynamicsCompressorNode adds a fixed make-up gain that depends only on its settings. This
 * is that gain in dB for a hard knee (knee = 0), so the graph can take it out again and the
 * compressor only ever turns things down.
 */
export function compressorMakeupDb(thresholdDb: number, ratio: number): number {
  const fullRangeDb = thresholdDb + (0 - thresholdDb) / ratio;
  return -0.6 * fullRangeDb;
}

// ---- one frame ----------------------------------------------------------------------------------

/** What the sound reads from the scene each frame. */
export interface SoundInput {
  rpm: number;
  /** 0 or 1, as the simulation reports it. */
  throttle: number;
  /** True while the revs bounce on the limiter. */
  limiter: boolean;
  /** Rear wheel speed as a share of its top speed, 0 to 1. */
  wheelNorm: number;
}

export interface MixFrame {
  engine: EngineMix;
  wheelspin: { gain: number; rate: number };
  /** A limiter pop to play now, or null. */
  pop: Shot | null;
}

/** Keeps the smoothed values between frames and works out one frame of the mix. */
export class Mixer {
  readonly frame: MixFrame;
  /** The smoothed throttle and limiter amounts, 0 to 1 (for the debug overlay). */
  throttle = 0;
  limiter = 0;

  private readonly rpms: readonly number[];
  private readonly pops = new LimiterPops();
  private readonly random: () => number;

  constructor(rpms: readonly number[], random: () => number) {
    this.rpms = rpms;
    this.random = random;
    this.frame = { engine: makeEngineMix(rpms.length), wheelspin: { gain: 0, rate: 1 }, pop: null };
  }

  step(dt: number, input: SoundInput): MixFrame {
    this.throttle = smoothToward(this.throttle, input.throttle > 0.5 ? 1 : 0, dt, AUDIO.THROTTLE_SECONDS);
    this.limiter = smoothToward(this.limiter, input.limiter ? 1 : 0, dt, AUDIO.LIMITER_SECONDS);
    engineMix(this.rpms, input.rpm, this.throttle, this.limiter, this.frame.engine);
    wheelspinMix(input.wheelNorm, this.frame.wheelspin);
    this.frame.pop = this.pops.update(dt, input.limiter, input.rpm, this.random);
    return this.frame;
  }
}
