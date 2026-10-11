import { describe, expect, it } from 'vitest';
import { AUDIO } from './constants';
import {
  LimiterPops,
  Mixer,
  clipRate,
  compressorMakeupDb,
  crossfade,
  dbToGain,
  distanceDb,
  engineMix,
  gainToDb,
  makeEngineMix,
  makeRandom,
  panFor,
  pickPair,
  planBackfires,
  smoothToward,
  wheelspinMix,
} from './mix';

const RPMS = [4000, 7000, 10000, 13000, 16000];
const pair = () => ({ lo: 0, hi: 0, t: 0 });
const power = (values: readonly number[]) => values.reduce((sum, v) => sum + v * v, 0);

describe('crossfade', () => {
  it('keeps constant power all the way', () => {
    const out = { a: 0, b: 0 };
    for (let t = 0; t <= 1.0001; t += 0.05) {
      crossfade(t, out);
      expect(out.a * out.a + out.b * out.b).toBeCloseTo(1, 12);
    }
  });

  it('is all of one side at the ends, and clamps beyond them', () => {
    const out = { a: 0, b: 0 };
    expect(crossfade(0, out)).toMatchObject({ a: 1, b: 0 });
    expect(crossfade(1, out).a).toBeCloseTo(0, 12);
    expect(crossfade(1, out).b).toBeCloseTo(1, 12);
    expect(crossfade(-3, out)).toMatchObject({ a: 1, b: 0 });
    expect(crossfade(7, out).b).toBeCloseTo(1, 12);
  });
});

describe('pickPair', () => {
  it('picks the two loops around the revs', () => {
    expect(pickPair(RPMS, 5000, pair())).toMatchObject({ lo: 0, hi: 1 });
    expect(pickPair(RPMS, 8500, pair())).toMatchObject({ lo: 1, hi: 2 });
    expect(pickPair(RPMS, 12999, pair())).toMatchObject({ lo: 2, hi: 3 });
    expect(pickPair(RPMS, 15000, pair())).toMatchObject({ lo: 3, hi: 4 });
  });

  it('is exactly on a loop at its recorded revs', () => {
    for (let i = 1; i < RPMS.length - 1; i++) {
      const p = pickPair(RPMS, RPMS[i] as number, pair());
      expect(p.lo).toBe(i);
      expect(p.t).toBe(0);
    }
  });

  it('uses one loop alone below the lowest and above the highest', () => {
    expect(pickPair(RPMS, 3500, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(pickPair(RPMS, 4000, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(pickPair(RPMS, 16000, pair())).toEqual({ lo: 4, hi: 4, t: 0 });
    expect(pickPair(RPMS, 18500, pair())).toEqual({ lo: 4, hi: 4, t: 0 });
  });

  it('survives nonsense', () => {
    expect(pickPair(RPMS, Number.NaN, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(pickPair(RPMS, -1, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(pickPair(RPMS, Number.POSITIVE_INFINITY, pair())).toEqual({ lo: 4, hi: 4, t: 0 });
    expect(pickPair([], 9000, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(pickPair([9000], 12000, pair())).toEqual({ lo: 0, hi: 0, t: 0 });
  });

  it('moves steadily from one loop to the next', () => {
    let before = -1;
    for (let rpm = 7000; rpm < 10000; rpm += 100) {
      const p = pickPair(RPMS, rpm, pair());
      expect(p.t).toBeGreaterThan(before);
      expect(p.t).toBeLessThan(1);
      before = p.t;
    }
  });

  it('is halfway where both loops are detuned by the same interval', () => {
    const middle = Math.sqrt(7000 * 10000);
    expect(pickPair(RPMS, middle, pair()).t).toBeCloseTo(0.5, 9);
    expect(clipRate(middle, 7000) * clipRate(middle, 10000)).toBeCloseTo(1, 9);
  });
});

describe('clipRate', () => {
  it('is the ratio of the revs', () => {
    expect(clipRate(7700, 7000)).toBeCloseTo(1.1, 12);
    expect(clipRate(16000, 16000)).toBe(1);
  });

  it('is clamped both ways', () => {
    expect(clipRate(18500, 4000)).toBe(AUDIO.RATE_MAX);
    expect(clipRate(4000, 16000)).toBe(AUDIO.RATE_MIN);
    expect(clipRate(3500, 4000)).toBeCloseTo(0.875, 12);
    // the top loop reaches the limiter without hitting the clamp
    expect(clipRate(18500, 16000)).toBeLessThan(AUDIO.RATE_MAX);
  });

  it('survives nonsense', () => {
    expect(clipRate(Number.NaN, 4000)).toBe(1);
    expect(clipRate(9000, 0)).toBe(1);
  });
});

describe('engineMix', () => {
  it('plays exactly two loops at constant power between two recorded revs', () => {
    const mix = makeEngineMix(RPMS.length);
    for (let rpm = 4100; rpm < 16000; rpm += 137) {
      engineMix(RPMS, rpm, 1, 0, mix);
      expect(power(mix.weights)).toBeCloseTo(1, 12);
      expect(mix.weights.filter((w) => w > 0).length).toBeLessThanOrEqual(2);
      expect(mix.weights[mix.pair.lo]).toBeGreaterThan(0);
      for (let i = 0; i < RPMS.length; i++) {
        if (i !== mix.pair.lo && i !== mix.pair.hi) expect(mix.weights[i]).toBe(0);
      }
    }
  });

  it('plays one loop alone at the edges', () => {
    const mix = makeEngineMix(RPMS.length);
    expect(engineMix(RPMS, 3600, 0, 0, mix).weights).toEqual([1, 0, 0, 0, 0]);
    expect(engineMix(RPMS, 18500, 1, 0, mix).weights).toEqual([0, 0, 0, 0, 1]);
  });

  it('gives every loop a clamped rate, playing or not', () => {
    const mix = makeEngineMix(RPMS.length);
    for (const rpm of [3000, 4000, 5500, 9000, 14000, 18500, 25000]) {
      engineMix(RPMS, rpm, 1, 0, mix);
      for (const rate of mix.rates) {
        expect(rate).toBeGreaterThanOrEqual(AUDIO.RATE_MIN);
        expect(rate).toBeLessThanOrEqual(AUDIO.RATE_MAX);
      }
    }
    expect(engineMix(RPMS, 8000, 1, 0, mix).rates[1]).toBeCloseTo(8000 / 7000, 12);
  });

  it('blends the on-throttle set against the off-throttle set at constant power', () => {
    const mix = makeEngineMix(RPMS.length);
    expect(engineMix(RPMS, 9000, 0, 0, mix)).toMatchObject({ on: 0, off: 1 });
    engineMix(RPMS, 9000, 1, 0, mix);
    expect(mix.on).toBeCloseTo(1, 12);
    expect(mix.off).toBeCloseTo(0, 12);
    for (let throttle = 0; throttle <= 1; throttle += 0.1) {
      engineMix(RPMS, 9000, throttle, 0, mix);
      expect(mix.on * mix.on + mix.off * mix.off).toBeCloseTo(1, 12);
    }
    engineMix(RPMS, 9000, 0.5, 0, mix);
    expect(mix.on).toBeCloseTo(mix.off, 12);
  });

  it('hands over to the limiter loop at constant power', () => {
    const mix = makeEngineMix(RPMS.length);
    expect(engineMix(RPMS, 18500, 1, 0, mix)).toMatchObject({ loops: 1, limiter: 0 });
    engineMix(RPMS, 18500, 1, 1, mix);
    expect(mix.limiter).toBeCloseTo(1, 12);
    expect(mix.loops).toBeCloseTo(0, 12);
    engineMix(RPMS, 18500, 1, 0.3, mix);
    expect(mix.loops * mix.loops + mix.limiter * mix.limiter).toBeCloseTo(1, 12);
  });
});

describe('wheelspinMix', () => {
  const out = { gain: 0, rate: 0 };

  it('is silent with the wheels still and full well before top speed', () => {
    expect(wheelspinMix(0, out).gain).toBe(0);
    expect(wheelspinMix(AUDIO.WHEELSPIN_FULL, out).gain).toBeCloseTo(1, 12);
    expect(wheelspinMix(1, out).gain).toBe(1);
  });

  it('keeps its pitch inside the limits', () => {
    expect(wheelspinMix(0, out).rate).toBe(AUDIO.WHEELSPIN_RATE_MIN);
    expect(wheelspinMix(1, out).rate).toBeCloseTo(AUDIO.WHEELSPIN_RATE_MAX, 12);
    expect(wheelspinMix(5, out).rate).toBeCloseTo(AUDIO.WHEELSPIN_RATE_MAX, 12);
    expect(wheelspinMix(-2, out)).toMatchObject({ gain: 0, rate: AUDIO.WHEELSPIN_RATE_MIN });
    expect(wheelspinMix(Number.NaN, out)).toMatchObject({ gain: 0, rate: AUDIO.WHEELSPIN_RATE_MIN });
  });
});

describe('backfires', () => {
  it('never fire below the minimum revs', () => {
    const random = makeRandom(1);
    for (let rpm = 3000; rpm < AUDIO.BACKFIRE_MIN_RPM; rpm += 250) expect(planBackfires(rpm, random)).toEqual([]);
    expect(planBackfires(Number.NaN, random)).toEqual([]);
  });

  it('respect their limits: count, gaps, pitch and level', () => {
    const random = makeRandom(7);
    const counts = new Set<number>();
    for (let run = 0; run < 2000; run++) {
      const shots = planBackfires(9000 + run * 4, random);
      counts.add(shots.length);
      expect(shots.length).toBeGreaterThanOrEqual(1);
      expect(shots.length).toBeLessThanOrEqual(AUDIO.BACKFIRE_MAX_COUNT);
      expect(shots[0]?.delay).toBeGreaterThanOrEqual(0);
      expect(shots[0]?.delay).toBeLessThanOrEqual(AUDIO.BACKFIRE_FIRST_MAX);
      shots.forEach((s, i) => {
        expect(s.rate).toBeGreaterThanOrEqual(AUDIO.BACKFIRE_RATE_MIN);
        expect(s.rate).toBeLessThanOrEqual(AUDIO.BACKFIRE_RATE_MAX);
        expect(gainToDb(s.gain)).toBeGreaterThanOrEqual(AUDIO.BACKFIRE_QUIETEST_DB - 1e-9);
        expect(gainToDb(s.gain)).toBeLessThanOrEqual(1e-9);
        const before = shots[i - 1];
        if (before) {
          expect(s.delay - before.delay).toBeGreaterThanOrEqual(AUDIO.BACKFIRE_GAP_MIN - 1e-12);
          expect(s.delay - before.delay).toBeLessThanOrEqual(AUDIO.BACKFIRE_GAP_MAX + 1e-12);
        }
      });
    }
    // every count from 1 to the maximum turns up
    expect([...counts].sort()).toEqual(Array.from({ length: AUDIO.BACKFIRE_MAX_COUNT }, (_, i) => i + 1));
  });

  it('are the same for the same seed', () => {
    expect(planBackfires(15000, makeRandom(3))).toEqual(planBackfires(15000, makeRandom(3)));
  });

  /** Ten seconds of the revs bouncing on the limiter at 60 fps; returns the times of the pops. */
  const bounce = (random: () => number, onLimiter = true) => {
    const pops = new LimiterPops();
    const times: number[] = [];
    const dt = 1 / 60;
    for (let frame = 0; frame < 600; frame++) {
      // six frames per bounce: up for four, down for two
      const phase = frame % 6;
      const rpm = 18500 - (phase < 4 ? (3 - phase) * 150 : (phase - 3) * 300);
      const shot = pops.update(dt, onLimiter, rpm, random);
      if (shot) {
        times.push(frame * dt);
        expect(shot.delay).toBe(0);
        expect(gainToDb(shot.gain)).toBeLessThanOrEqual(AUDIO.BACKFIRE_LIMITER_DB + 1e-9);
      }
    }
    return times;
  };

  it('pop on the limiter only at the start of a cut, and never twice in a row', () => {
    // a generator that always says yes: every allowed cut pops
    const times = bounce(() => 0);
    expect(times.length).toBeGreaterThan(5);
    for (let i = 1; i < times.length; i++) {
      expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(AUDIO.BACKFIRE_LIMITER_GAP - 1e-9);
    }
  });

  it('pop only now and then with real chances, and never off the limiter', () => {
    const times = bounce(makeRandom(11));
    // 100 cuts at a few percent each
    expect(times.length).toBeLessThan(15);
    // ...but they do happen: 20 such runs are 2000 cuts
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) total += bounce(makeRandom(seed)).length;
    expect(total).toBeGreaterThan(20);
    expect(total).toBeLessThan(2000 * AUDIO.BACKFIRE_LIMITER_CHANCE * 2);
    expect(bounce(() => 0, false)).toEqual([]);
  });
});

describe('space', () => {
  it('pans toward the side the source is on, inside the limit', () => {
    expect(panFor(0, 6, AUDIO.PAN_WIDTH)).toBe(0);
    expect(panFor(1, 6, AUDIO.PAN_WIDTH)).toBeGreaterThan(0);
    expect(panFor(-1, 6, AUDIO.PAN_WIDTH)).toBeCloseTo(-panFor(1, 6, AUDIO.PAN_WIDTH), 12);
    expect(panFor(100, 1, AUDIO.PAN_WIDTH)).toBe(AUDIO.PAN_MAX);
    expect(panFor(-100, 1, AUDIO.PAN_WIDTH)).toBe(-AUDIO.PAN_MAX);
    expect(panFor(1, 0, AUDIO.PAN_WIDTH)).toBe(0);
    expect(panFor(Number.NaN, 6, AUDIO.PAN_WIDTH)).toBe(0);
  });

  it('loses nothing up close and DISTANCE_FAR_DB at DISTANCE_FAR', () => {
    expect(distanceDb(AUDIO.DISTANCE_NEAR)).toBeCloseTo(0, 12);
    expect(distanceDb(1)).toBe(0);
    expect(distanceDb(AUDIO.DISTANCE_FAR)).toBeCloseTo(AUDIO.DISTANCE_FAR_DB, 12);
    expect(distanceDb((AUDIO.DISTANCE_NEAR + AUDIO.DISTANCE_FAR) / 2)).toBeCloseTo(AUDIO.DISTANCE_FAR_DB / 2, 12);
    expect(distanceDb(1000)).toBe(AUDIO.DISTANCE_MAX_DB);
    expect(distanceDb(Number.NaN)).toBe(0);
  });
});

describe('helpers', () => {
  it('convert decibels both ways', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 4);
    expect(gainToDb(dbToGain(9))).toBeCloseTo(9, 12);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('smooth toward a target at the same speed whatever the frame rate', () => {
    const run = (fps: number) => {
      let value = 0;
      for (let i = 0; i < fps * 0.06; i++) value = smoothToward(value, 1, 1 / fps, 0.06);
      return value;
    };
    // about 95% of the way after the given time
    expect(run(60)).toBeGreaterThan(0.9);
    expect(run(60)).toBeLessThan(1);
    expect(run(600)).toBeCloseTo(1 - Math.exp(-3), 6);
    expect(smoothToward(0.3, 1, 0, 0.06)).toBe(0.3);
    expect(smoothToward(0.3, 1, Number.NaN, 0.06)).toBe(0.3);
    expect(smoothToward(0.3, 1, 0.01, 0)).toBe(1);
  });

  it('know the make-up gain a browser compressor adds', () => {
    // threshold -24, ratio 12, hard knee: the curve maps 0 dB to -22 dB, and 0.6 of that comes back
    expect(compressorMakeupDb(-24, 12)).toBeCloseTo(13.2, 12);
    expect(compressorMakeupDb(0, 12)).toBeCloseTo(0, 12);
  });
});

describe('Mixer', () => {
  const input = { rpm: 4000, throttle: 0, limiter: false, wheelNorm: 0 };

  it('idles on the off-throttle 4000 loop alone', () => {
    const mixer = new Mixer(RPMS, makeRandom(1));
    const frame = mixer.step(1 / 60, input);
    expect(frame.engine.weights).toEqual([1, 0, 0, 0, 0]);
    expect(frame.engine).toMatchObject({ on: 0, off: 1, loops: 1, limiter: 0 });
    expect(frame.wheelspin.gain).toBe(0);
    expect(frame.pop).toBeNull();
  });

  it('opens the throttle in about THROTTLE_SECONDS and closes it again', () => {
    const mixer = new Mixer(RPMS, makeRandom(1));
    const open = { ...input, rpm: 9000, throttle: 1 };
    mixer.step(1 / 60, open);
    expect(mixer.throttle).toBeGreaterThan(0);
    expect(mixer.throttle).toBeLessThan(1);
    for (let t = 0; t < AUDIO.THROTTLE_SECONDS * 2; t += 1 / 60) mixer.step(1 / 60, open);
    expect(mixer.throttle).toBeGreaterThan(0.99);
    expect(mixer.frame.engine.on).toBeGreaterThan(0.99);
    for (let t = 0; t < AUDIO.THROTTLE_SECONDS * 2; t += 1 / 60) mixer.step(1 / 60, { ...open, throttle: 0 });
    expect(mixer.throttle).toBeLessThan(0.01);
  });

  it('brings the limiter loop in while the revs are on the limiter, and out after', () => {
    const mixer = new Mixer(RPMS, () => 1);
    const on = { rpm: 18500, throttle: 1, limiter: true, wheelNorm: 1 };
    for (let t = 0; t < AUDIO.LIMITER_SECONDS * 2; t += 1 / 60) mixer.step(1 / 60, on);
    expect(mixer.frame.engine.limiter).toBeGreaterThan(0.99);
    expect(mixer.frame.engine.loops).toBeLessThan(0.1);
    expect(mixer.frame.wheelspin.gain).toBe(1);
    for (let t = 0; t < AUDIO.LIMITER_SECONDS * 2; t += 1 / 60) mixer.step(1 / 60, { ...on, limiter: false, throttle: 0 });
    expect(mixer.frame.engine.limiter).toBeLessThan(0.02);
  });
});
