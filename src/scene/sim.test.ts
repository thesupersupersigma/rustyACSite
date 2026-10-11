import { describe, expect, it } from 'vitest';
import { BurnoutSim, TUNING, pitTotal, type SimEventType, type SimSnapshot } from './sim';

const DT = 1 / 60;

/** Runs the sim for `seconds` at 60 steps a second and collects the event types. */
function run(
  sim: BurnoutSim,
  seconds: number,
  held: boolean,
  seen: SimEventType[] = [],
  each?: (s: SimSnapshot) => void,
): SimSnapshot {
  const steps = Math.round(seconds / DT);
  let last = sim.out;
  for (let i = 0; i < steps; i++) {
    last = sim.step(DT, held);
    for (const e of last.events) seen.push(e.type);
    each?.(last);
  }
  return last;
}

function popped(): BurnoutSim {
  const sim = new BurnoutSim();
  run(sim, TUNING.POP_SECONDS + 0.5, true);
  expect(sim.out.state).toBe('popped');
  return sim;
}

describe('revs', () => {
  it('starts at idle and does nothing by itself', () => {
    const sim = new BurnoutSim();
    const s = run(sim, 2, false);
    expect(s.state).toBe('idle');
    expect(s.rpm).toBe(TUNING.IDLE_RPM);
    expect(s.wheelSpeed).toBe(0);
    expect(s.heat).toBe(0);
    expect(s.smokeRate).toBe(0);
  });

  it('climbs to the limiter and bounces off it without ever passing it', () => {
    const sim = new BurnoutSim();
    const seen: SimEventType[] = [];
    let max = 0;
    let min = Infinity;
    run(sim, 2, true, seen);
    expect(sim.out.limiter).toBe(true);
    run(sim, 1, true, seen, (s) => {
      max = Math.max(max, s.rpm);
      min = Math.min(min, s.rpm);
    });
    expect(max).toBeLessThanOrEqual(TUNING.LIMITER_RPM);
    expect(max).toBeGreaterThan(TUNING.LIMITER_RPM - 300);
    expect(min).toBeLessThan(TUNING.LIMITER_RPM - 200);
    expect(min).toBeGreaterThan(TUNING.LIMITER_RPM - 2500);
    expect(seen.filter((t) => t === 'limiter')).toHaveLength(1);
    expect(seen[0]).toBe('throttle:on');
  });

  it('falls back to idle after a release, dipping a little under it first', () => {
    const sim = new BurnoutSim();
    run(sim, 2, true);
    let min = Infinity;
    const s = run(sim, 4, false, [], (snap) => {
      min = Math.min(min, snap.rpm);
    });
    expect(min).toBeLessThan(TUNING.IDLE_RPM - 50);
    expect(min).toBeGreaterThan(TUNING.IDLE_RPM - 1500);
    expect(s.state).toBe('idle');
    expect(s.rpm).toBe(TUNING.IDLE_RPM);
    expect(s.wheelSpeed).toBe(0);
  });

  it('spins the rear wheels with the revs, forward', () => {
    const sim = new BurnoutSim();
    const s = run(sim, 2.5, true);
    expect(s.wheelSpeed).toBeGreaterThan(TUNING.WHEEL_MAX * 0.85);
    expect(s.wheelSpeed).toBeLessThanOrEqual(TUNING.WHEEL_MAX);
    expect(s.smokeRate).toBeGreaterThan(0.3);
  });
});

describe('heat and the pop', () => {
  it('pops after POP_SECONDS of continuous holding from cold', () => {
    const sim = new BurnoutSim();
    let popAt = -1;
    let t = 0;
    const seen: SimEventType[] = [];
    run(sim, TUNING.POP_SECONDS + 2, true, seen, (s) => {
      t += DT;
      if (popAt < 0 && s.events.some((e) => e.type === 'pop')) popAt = t;
    });
    expect(popAt).toBeGreaterThanOrEqual(TUNING.POP_SECONDS - 1e-6);
    expect(popAt).toBeLessThan(TUNING.POP_SECONDS + 2 * DT);
    expect(seen.filter((e) => e === 'pop')).toHaveLength(1);
    // the pop puts the lights out and cuts the throttle, in that order
    const at = seen.indexOf('pop');
    expect(seen.slice(at, at + 3)).toEqual(['pop', 'lightsout', 'throttle:off']);
    const s = sim.out;
    expect(s.state).toBe('popped');
    expect(s.flat).toBe(true);
    expect(s.pop).toBe(1);
    expect(s.throttle).toBe(0);
    expect(s.lights).toBe(0);
  });

  it('cuts the revs to idle after the pop and ignores the throttle', () => {
    const sim = popped();
    const s = run(sim, 3, true);
    expect(s.state).toBe('popped');
    expect(Math.abs(s.rpm - TUNING.IDLE_RPM)).toBeLessThan(60);
    expect(s.wheelSpeed).toBeLessThan(0.5);
    expect(s.throttle).toBe(0);
  });

  it('does not pop when released in time', () => {
    const sim = new BurnoutSim();
    const seen: SimEventType[] = [];
    run(sim, TUNING.POP_SECONDS - 0.5, true, seen);
    expect(sim.out.heat).toBeGreaterThan(0.85);
    run(sim, 30, false, seen);
    expect(seen).not.toContain('pop');
    expect(sim.out.state).toBe('idle');
    expect(sim.out.flat).toBe(false);
  });

  it('cools slowly when released, all the way to 0', () => {
    const sim = new BurnoutSim();
    run(sim, 3, true);
    const hot = sim.out.heat;
    expect(hot).toBeCloseTo(3 / TUNING.POP_SECONDS, 2);
    let previous = hot;
    run(sim, 2, false, [], (s) => {
      expect(s.heat).toBeLessThanOrEqual(previous);
      previous = s.heat;
    });
    expect(sim.out.heat).toBeLessThan(hot);
    expect(sim.out.heat).toBeGreaterThan(hot - 0.2); // slowly
    run(sim, TUNING.COOL_SECONDS, false);
    expect(sim.out.heat).toBe(0);
  });

  it('keeps the heat between short lifts, so stabbing the throttle still pops', () => {
    const sim = new BurnoutSim();
    const seen: SimEventType[] = [];
    for (let i = 0; i < 12 && !seen.includes('pop'); i++) {
      run(sim, 1, true, seen);
      run(sim, 0.2, false, seen);
    }
    expect(seen).toContain('pop');
  });

  it('pops on request (the test hook)', () => {
    const sim = new BurnoutSim();
    sim.requestPop();
    const s = sim.step(0, false);
    expect(s.state).toBe('popped');
    expect(s.events.map((e) => e.type)).toEqual(['pop']);
    expect(s.heat).toBe(1);
  });
});

describe('start lights', () => {
  it('lights one pod per LIGHT_STEP and puts them out on release', () => {
    const sim = new BurnoutSim();
    expect(run(sim, TUNING.LIGHT_STEP * 0.5, true).lights).toBe(0);
    expect(run(sim, TUNING.LIGHT_STEP, true).lights).toBe(1);
    expect(run(sim, TUNING.LIGHT_STEP * 2, true).lights).toBe(3);
    expect(run(sim, TUNING.LIGHT_STEP * 4, true).lights).toBe(TUNING.LIGHT_COUNT);
    const seen: SimEventType[] = [];
    const s = run(sim, 0.1, false, seen);
    expect(s.lights).toBe(0);
    expect(seen).toEqual(['throttle:off', 'lightsout']);
  });

  it('says nothing about lights that were never lit', () => {
    const sim = new BurnoutSim();
    const seen: SimEventType[] = [];
    run(sim, 0.2, true, seen);
    run(sim, 0.2, false, seen);
    expect(seen).toEqual(['throttle:on', 'throttle:off']);
  });
});

describe('pit stop', () => {
  it('only starts when the tyres are popped', () => {
    const sim = new BurnoutSim();
    sim.requestPitStop();
    expect(sim.step(DT, false).state).toBe('idle');
    run(sim, 1, true);
    sim.requestPitStop();
    expect(sim.step(DT, true).state).toBe('revving');
  });

  it('runs the stop in order and ends in idle with cold, round tyres', () => {
    const sim = popped();
    run(sim, 1, false);
    sim.requestPitStop();
    const seen: SimEventType[] = [];
    let time = 0;
    let endAt = -1;
    let sawNoWheels = false;
    run(sim, pitTotal() + 1, false, seen, (s) => {
      time += DT;
      if (endAt < 0 && s.events.some((e) => e.type === 'pitstop:end')) endAt = time;
      if (s.pit.active && s.pit.wheelsOff.every((p) => p === 1) && s.pit.wheelsOn.every((p) => p === 0)) {
        sawNoWheels = true;
      }
    });
    expect(seen).toEqual([
      'pitstop:start',
      'nut:off',
      'nut:off',
      'nut:off',
      'nut:off',
      'wheel:off',
      'wheel:on',
      'nut:on',
      'nut:on',
      'nut:on',
      'nut:on',
      'pitstop:end',
    ]);
    expect(endAt).toBeGreaterThan(pitTotal() - 2 * DT);
    expect(endAt).toBeLessThan(pitTotal() + 2 * DT);
    expect(pitTotal()).toBeGreaterThanOrEqual(2.5);
    expect(pitTotal()).toBeLessThanOrEqual(3);
    expect(sawNoWheels).toBe(true);
    const s = sim.out;
    expect(s.state).toBe('idle');
    expect(s.heat).toBe(0);
    expect(s.flat).toBe(false);
    expect(s.pop).toBe(0);
    expect(s.pit.active).toBe(false);
    expect(s.pit.time).toBeCloseTo(pitTotal(), 5);
    expect(s.pit.lift).toBe(0);
    expect(s.green).toBe(false);
  });

  it('names each corner once for the nuts', () => {
    const sim = popped();
    sim.requestPitStop();
    const off: string[] = [];
    const on: string[] = [];
    for (let i = 0; i < 400; i++) {
      for (const e of sim.step(DT, false).events) {
        if (e.type === 'nut:off') off.push(String(e.wheel));
        if (e.type === 'nut:on') on.push(String(e.wheel));
      }
    }
    expect([...off].sort()).toEqual(['FL', 'FR', 'RL', 'RR']);
    expect([...on].sort()).toEqual(['FL', 'FR', 'RL', 'RR']);
  });

  it('shows green when the car is released and for a moment after', () => {
    const sim = popped();
    sim.requestPitStop();
    run(sim, pitTotal() - TUNING.PIT_DROP / 2, false);
    expect(sim.out.green).toBe(true);
    run(sim, TUNING.PIT_DROP / 2 + 0.05, false);
    expect(sim.out.state).toBe('idle');
    expect(sim.out.green).toBe(true);
    run(sim, TUNING.GREEN_SECONDS, false);
    expect(sim.out.green).toBe(false);
  });

  it('can rev again straight after the stop', () => {
    const sim = popped();
    sim.requestPitStop();
    run(sim, pitTotal() + 0.1, false);
    const s = run(sim, 1, true);
    expect(s.state).toBe('revving');
    expect(s.heat).toBeCloseTo(1 / TUNING.POP_SECONDS, 2);
  });

  it('is over at once when asked to be instant (reduced motion)', () => {
    const sim = popped();
    sim.requestPitStop(true);
    const s = sim.step(DT, false);
    expect(s.events.map((e) => e.type)).toEqual(['pitstop:start', 'pitstop:end']);
    expect(s.state).toBe('idle');
    expect(s.heat).toBe(0);
    expect(s.flat).toBe(false);
    expect(s.pit.time).toBe(0);
    expect(s.pit.active).toBe(false);
  });
});

describe('robustness', () => {
  it('survives huge, negative and broken time steps', () => {
    const sim = new BurnoutSim();
    const seen: SimEventType[] = [];
    const steps = [1000, -5, NaN, Infinity, 0, 3, 1e9, 0.0001, 60, 0.25];
    const check = (s: SimSnapshot) => {
      for (const e of s.events) seen.push(e.type);
      expect(Number.isFinite(s.rpm)).toBe(true);
      expect(s.rpm).toBeGreaterThan(TUNING.IDLE_RPM - 2000);
      expect(s.rpm).toBeLessThanOrEqual(TUNING.LIMITER_RPM);
      expect(s.heat).toBeGreaterThanOrEqual(0);
      expect(s.heat).toBeLessThanOrEqual(1);
      expect(s.wheelSpeed).toBeGreaterThanOrEqual(0);
      expect(s.wheelSpeed).toBeLessThanOrEqual(TUNING.WHEEL_MAX);
      expect(s.smokeRate).toBeGreaterThanOrEqual(0);
      expect(s.smokeRate).toBeLessThanOrEqual(1);
      expect(['idle', 'revving', 'settling', 'popped', 'pitstop']).toContain(s.state);
    };
    // one spike counts as at most MAX_DT, so ten of them cannot have popped anything...
    const fresh = new BurnoutSim();
    for (let i = 0; i < 10; i++) check(fresh.step(1e6, true));
    expect(fresh.out.heat).toBeCloseTo((10 * TUNING.MAX_DT) / TUNING.POP_SECONDS, 5);
    expect(seen).not.toContain('pop');
    // ...but a long run of them does, exactly once
    for (let round = 0; round < 40; round++) {
      for (const dt of steps) check(sim.step(dt, true));
    }
    expect(seen.filter((e) => e === 'pop')).toHaveLength(1);
    expect(sim.out.state).toBe('popped');

    sim.requestPitStop();
    for (let i = 0; i < 40; i++) check(sim.step(1e6, false));
    expect(sim.out.state).toBe('idle');
    expect(sim.out.heat).toBe(0);
    expect(seen.filter((e) => e === 'pitstop:end')).toHaveLength(1);
    expect(seen.filter((e) => e === 'nut:off')).toHaveLength(4);
    expect(seen.filter((e) => e === 'nut:on')).toHaveLength(4);
  });

  it('gives the same answer for the same input', () => {
    const a = new BurnoutSim();
    const b = new BurnoutSim();
    for (let i = 0; i < 900; i++) {
      const held = i % 200 < 150;
      const dt = 0.004 + (i % 7) * 0.003;
      a.step(dt, held);
      b.step(dt, held);
    }
    expect(a.out.rpm).toBe(b.out.rpm);
    expect(a.out.heat).toBe(b.out.heat);
    expect(a.out.wheelSpeed).toBe(b.out.wheelSpeed);
  });

  it('returns the same snapshot object every step', () => {
    const sim = new BurnoutSim();
    const first = sim.step(DT, true);
    const second = sim.step(DT, true);
    expect(second).toBe(first);
    expect(second.events).toBe(first.events);
  });
});

describe('edge cases', () => {
  it('needs the throttle let go after a pop before it counts again', () => {
    const sim = popped();
    const seen: SimEventType[] = [];
    sim.requestPitStop();
    // still held through the whole stop and a second after it
    run(sim, pitTotal() + 1, true, seen);
    expect(sim.out.state).toBe('idle');
    expect(seen).not.toContain('throttle:on');
    run(sim, 0.1, false, seen);
    expect(run(sim, 0.5, true, seen).state).toBe('revving');
    expect(seen.filter((e) => e === 'throttle:on')).toHaveLength(1);
  });

  it('pops at the same moment whatever the frame rate', () => {
    const popTime = (dt: number) => {
      const sim = new BurnoutSim();
      let t = 0;
      while (sim.out.state !== 'popped' && t < 20) {
        sim.step(dt, true);
        t += dt;
      }
      return t;
    };
    for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
      expect(popTime(dt)).toBeGreaterThanOrEqual(TUNING.POP_SECONDS - 1e-6);
      expect(popTime(dt)).toBeLessThan(TUNING.POP_SECONDS + dt + 1e-6);
    }
  });

  it('treats a broken clock (NaN, Infinity, negative) as no time at all', () => {
    const sim = new BurnoutSim();
    run(sim, 1, true);
    const { rpm, heat, holdTime } = sim.out;
    for (const dt of [NaN, Infinity, -Infinity, -1]) sim.step(dt, true);
    expect(sim.out.rpm).toBe(rpm);
    expect(sim.out.heat).toBe(heat);
    expect(sim.out.holdTime).toBe(holdTime);
  });

  it('ignores a pop request while popped or in the pits, and a second pit-stop request', () => {
    const sim = popped();
    const seen: SimEventType[] = [];
    sim.requestPop();
    run(sim, 0.2, false, seen);
    sim.requestPitStop();
    run(sim, 0.5, false, seen);
    sim.requestPop();
    sim.requestPitStop();
    run(sim, pitTotal() + 0.5, false, seen);
    expect(seen.filter((e) => e === 'pop')).toHaveLength(0);
    expect(seen.filter((e) => e === 'pitstop:start')).toHaveLength(1);
    expect(seen.filter((e) => e === 'pitstop:end')).toHaveLength(1);
    expect(sim.out.state).toBe('idle');
  });
});
