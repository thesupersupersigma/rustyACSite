// The burnout state machine: revs, wheelspin, tyre heat, the pop and the pit-stop timeline.
// Pure TypeScript on purpose (no three.js, no DOM), so vitest can run it and task 03 can read it.
//
//   idle -> revving -> settling -> idle
//           revving -> popped -> pitstop -> idle
//
// `step(dt, throttleHeld)` advances it and returns one snapshot object that is reused every call
// (nothing is allocated per step). Everything worth tuning is in TUNING below.

export const TUNING = {
  // ---- revs ----------------------------------------------------------------------------------
  /** rpm with the throttle closed. */
  IDLE_RPM: 4000,
  /** rpm where the ignition cut kicks in. */
  LIMITER_RPM: 18500,
  /** rpm gained per second just above idle with the throttle held. */
  REV_RISE: 14000,
  /** How much the climb slows toward the limiter: 0 is a straight line, 0.35 loses 35% of the rate. */
  REV_TAPER: 0.35,
  /** Length of one ignition cut at the limiter, in seconds. */
  LIMITER_CUT: 0.03,
  /** rpm lost per second during a cut (cut x fall = how far the needle bounces). */
  LIMITER_FALL: 20000,
  /** Speed of the fall back to idle after a release (natural frequency, rad/s). Higher = faster. */
  REV_FALL_SPEED: 7.5,
  /** Damping of that fall. Below 1 the revs dip under idle before they settle; 1 removes the dip. */
  REV_FALL_DAMPING: 0.72,

  // ---- rear wheels --------------------------------------------------------------------------
  /** Rear wheel speed at the limiter, rad/s (95 is about 15 turns a second). */
  WHEEL_MAX: 95,
  /** Share of WHEEL_MAX the wheels jump to as soon as the throttle opens. */
  WHEEL_LAUNCH: 0.12,
  /** Seconds the wheels take to follow the revs up / to spin down after a release / after the pop. */
  WHEEL_UP: 0.15,
  WHEEL_DOWN: 0.4,
  WHEEL_DOWN_FLAT: 0.22,

  // ---- tyre heat ------------------------------------------------------------------------------
  /** Seconds of continuous holding from cold until both rear tyres pop. */
  POP_SECONDS: 6.5,
  /** Seconds for a tyre at the limit to cool all the way down with the throttle closed. */
  COOL_SECONDS: 22,
  /** Seconds the tyres take to go flat after the pop. */
  POP_DEFLATE: 0.2,

  // ---- start lights ---------------------------------------------------------------------------
  /** Seconds of holding per red light. */
  LIGHT_STEP: 0.5,
  LIGHT_COUNT: 5,
  /** Seconds the pods stay green when the car is released from the pit stop. */
  GREEN_SECONDS: 0.6,

  // ---- pit stop: seconds per phase, in order (the total is their sum) ----------------------------
  PIT_LIFT: 0.3,
  PIT_NUTS_OFF: 0.4,
  PIT_WHEELS_OFF: 0.45,
  /** A beat with no wheels on the car. */
  PIT_SWAP: 0.25,
  PIT_WHEELS_ON: 0.45,
  PIT_NUTS_ON: 0.4,
  PIT_DROP: 0.3,
  /** How much later each corner starts its nut and wheel moves (FL, FR, RL, RR): four crews are never in sync. */
  PIT_STAGGER: [0, 0.04, 0.07, 0.02] as readonly number[],

  // ---- stepping -------------------------------------------------------------------------------
  /** Longest time one call to step() may cover; the rest of a long stall is dropped. */
  MAX_DT: 0.25,
  /** Internal step. A call is cut into steps no longer than this. */
  SUBSTEP: 1 / 120,
};

export type SimState = 'idle' | 'revving' | 'settling' | 'popped' | 'pitstop';

export type SimWheel = 'FL' | 'FR' | 'RL' | 'RR';
export const SIM_WHEELS: readonly SimWheel[] = ['FL', 'FR', 'RL', 'RR'];

/**
 * What happened during a step, in order.
 * - `throttle:on` / `throttle:off`: the engine starts / stops being driven (also fires at the pop).
 *   A throttle still held at the pop has to be let go once before it counts again.
 * - `limiter`: the revs reached the limiter (once per hold, not once per ignition cut; `limiter` in the
 *   snapshot stays true while the needle bounces, and `rpm` shows each bounce).
 * - `lightsout`: the red start lights go out (only when at least one was lit).
 * - `pop`: both rear tyres let go.
 * - `pitstop:start`, then per corner `nut:off` (the gun starts undoing), once `wheel:off` (the wheels
 *   start to slide off), once `wheel:on` (the fresh wheels are seated), per corner `nut:on` (the gun
 *   starts tightening), then `pitstop:end` (the car is back on the ground). An instant stop (reduced
 *   motion) only emits `pitstop:start` and `pitstop:end`.
 */
export type SimEventType =
  | 'throttle:on'
  | 'throttle:off'
  | 'limiter'
  | 'lightsout'
  | 'pop'
  | 'pitstop:start'
  | 'nut:off'
  | 'wheel:off'
  | 'wheel:on'
  | 'nut:on'
  | 'pitstop:end';

export interface SimEvent {
  type: SimEventType;
  /** The corner, for `nut:off` and `nut:on`; null otherwise. */
  wheel: SimWheel | null;
}

/** Progress values of the pit stop, each 0 to 1. Per-corner arrays are in FL, FR, RL, RR order. */
export interface PitSnapshot {
  active: boolean;
  /** Seconds on the stop's clock. Stays at the final time after the stop, for the timer on screen. */
  time: number;
  total: number;
  progress: number;
  /** The car going up on the jacks. */
  lift: number;
  nutsOff: number[];
  wheelsOff: number[];
  wheelsOn: number[];
  nutsOn: number[];
  /** The car coming back down. */
  drop: number;
}

export interface SimSnapshot {
  state: SimState;
  rpm: number;
  /** 0 at idle, 1 at the limiter (can dip a little below 0 while the revs settle). */
  rpmNorm: number;
  /** 1 while the engine is being driven, otherwise 0. */
  throttle: number;
  /** True while the revs bounce off the limiter. */
  limiter: boolean;
  /** Rear wheel speed in rad/s (positive = rolling forward). */
  wheelSpeed: number;
  /** wheelSpeed / WHEEL_MAX. */
  wheelNorm: number;
  /** Tyre heat, 0 cold to 1 popping. It also cools while the tyres sit flat; fresh tyres start at 0. */
  heat: number;
  /** How hard the rear tyres smoke, 0 to 1. */
  smokeRate: number;
  /** Seconds the throttle has been held this time. */
  holdTime: number;
  /** Red start lights lit, 0 to LIGHT_COUNT. */
  lights: number;
  /** True while the pods show green after a stop. */
  green: boolean;
  /** True from the pop until the fresh wheels go on. */
  flat: boolean;
  /** How flat the rear tyres are, 0 to 1 (reaches 1 POP_DEFLATE seconds after the pop). */
  pop: number;
  /** Seconds since the pop (0 when the tyres are fine). */
  popTime: number;
  pit: PitSnapshot;
  /** The events of this step, in order. The array and its entries are reused by the next step. */
  events: readonly SimEvent[];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** True when the pit-stop clock passed `at` during this substep. */
const crossed = (before: number, now: number, at: number) => before < at && now >= at;
/** Progress (0 to 1) of a pit-stop phase that starts at `start` and lasts `length` seconds. */
const part = (active: boolean, t: number, start: number, length: number) =>
  active ? clamp01((t - start) / length) : 0;
const EVENT_POOL = 32;

export class BurnoutSim {
  /** The snapshot `step` returns; the same object every time. */
  readonly out: SimSnapshot;

  private state: SimState = 'idle';
  private rpm = TUNING.IDLE_RPM;
  private rpmVel = 0;
  private cut = 0;
  private limiting = false;
  private wheel = 0;
  private heat = 0;
  private holdTime = 0;
  private lights = 0;
  private green = 0;
  private flat = false;
  private popTime = 0;
  private pitTime = 0;
  private pitShown = 0;

  private wantPop = false;
  private wantPit = false;
  private wantPitInstant = false;
  /** Set by the pop: the throttle has to be let go once before it can drive the engine again. */
  private needRelease = false;

  private readonly events: SimEvent[] = [];
  private readonly pool: SimEvent[] = [];

  constructor() {
    for (let i = 0; i < EVENT_POOL; i++) this.pool.push({ type: 'pop', wheel: null });
    this.out = {
      state: 'idle',
      rpm: TUNING.IDLE_RPM,
      rpmNorm: 0,
      throttle: 0,
      limiter: false,
      wheelSpeed: 0,
      wheelNorm: 0,
      heat: 0,
      smokeRate: 0,
      holdTime: 0,
      lights: 0,
      green: false,
      flat: false,
      pop: 0,
      popTime: 0,
      pit: {
        active: false,
        time: 0,
        total: pitTotal(),
        progress: 0,
        lift: 0,
        nutsOff: [0, 0, 0, 0],
        wheelsOff: [0, 0, 0, 0],
        wheelsOn: [0, 0, 0, 0],
        nutsOn: [0, 0, 0, 0],
        drop: 0,
      },
      events: this.events,
    };
  }

  /** Pops the rear tyres at the start of the next step, whatever the heat (a test hook). */
  requestPop(): void {
    this.wantPop = true;
  }

  /**
   * Starts the pit stop at the start of the next step. Only does something while the tyres are popped.
   * `instant` skips the animation (reduced motion): the stop is over at once, with 0.00 s on the clock.
   */
  requestPitStop(instant = false): void {
    this.wantPit = true;
    this.wantPitInstant = instant;
  }

  /** Advances by `dt` seconds. `throttleHeld` is the visitor's input; it is ignored while popped or in the pits. */
  step(dt: number, throttleHeld: boolean): SimSnapshot {
    this.events.length = 0;

    if (this.wantPop) {
      this.wantPop = false;
      if (this.state === 'idle' || this.state === 'revving' || this.state === 'settling') this.doPop();
    }
    if (this.wantPit) {
      this.wantPit = false;
      if (this.state === 'popped') this.startPit(this.wantPitInstant);
    }

    // a stalled tab or a broken clock must not fast-forward the tyres to a pop
    let time = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (time > TUNING.MAX_DT) time = TUNING.MAX_DT;
    if (time > 0) {
      const steps = Math.ceil(time / TUNING.SUBSTEP - 1e-9);
      const h = time / steps;
      for (let i = 0; i < steps; i++) this.substep(h, throttleHeld);
    }

    this.write();
    return this.out;
  }

  private emit(type: SimEventType, wheel: SimWheel | null = null): void {
    const e = this.pool[this.events.length];
    if (!e) return; // more events than one step can ever produce; drop instead of allocating
    e.type = type;
    e.wheel = wheel;
    this.events.push(e);
  }

  private lightsOut(): void {
    if (this.lights > 0) this.emit('lightsout');
    this.lights = 0;
    this.holdTime = 0;
  }

  private doPop(): void {
    const driving = this.state === 'revving';
    this.state = 'popped';
    this.needRelease = true;
    this.heat = 1;
    this.flat = true;
    this.popTime = 0;
    this.cut = 0;
    this.limiting = false;
    if (this.rpmVel > 0) this.rpmVel = 0;
    this.emit('pop');
    this.lightsOut();
    if (driving) this.emit('throttle:off');
  }

  private startPit(instant: boolean): void {
    this.green = 0;
    this.emit('pitstop:start');
    if (instant) {
      this.freshTyres();
      this.pitTime = 0;
      this.pitShown = 0;
      this.green = TUNING.GREEN_SECONDS;
      this.state = 'idle';
      this.emit('pitstop:end');
      return;
    }
    this.state = 'pitstop';
    this.pitTime = 0;
    this.pitShown = 0;
  }

  private freshTyres(): void {
    this.heat = 0;
    this.flat = false;
    this.popTime = 0;
    this.wheel = 0;
  }

  private substep(h: number, held: boolean): void {
    const T = TUNING;

    // ---- transitions driven by the throttle -------------------------------------------------------
    if (!held) this.needRelease = false;
    if (this.state === 'idle' || this.state === 'settling') {
      if (held && !this.needRelease) {
        this.state = 'revving';
        this.holdTime = 0;
        this.green = 0;
        this.emit('throttle:on');
      }
    } else if (this.state === 'revving' && !held) {
      this.state = 'settling';
      this.cut = 0;
      this.limiting = false;
      if (this.rpmVel > 0) this.rpmVel = 0;
      this.emit('throttle:off');
      this.lightsOut();
    }

    // ---- revs -------------------------------------------------------------------------------------
    const span = T.LIMITER_RPM - T.IDLE_RPM;
    if (this.state === 'revving') {
      if (this.cut > 0) {
        this.cut -= h;
        this.rpmVel = -T.LIMITER_FALL;
      } else {
        const x = clamp01((this.rpm - T.IDLE_RPM) / span);
        this.rpmVel = T.REV_RISE * (1 - T.REV_TAPER * x);
      }
      this.rpm += this.rpmVel * h;
      if (this.rpm >= T.LIMITER_RPM) {
        this.rpm = T.LIMITER_RPM;
        this.cut = T.LIMITER_CUT;
        if (!this.limiting) {
          this.limiting = true;
          this.emit('limiter');
        }
      }
      if (this.rpm < T.IDLE_RPM) this.rpm = T.IDLE_RPM;
    } else {
      // a damped spring back to idle (semi-implicit Euler: stable for these step sizes)
      const w = T.REV_FALL_SPEED;
      const accel = -w * w * (this.rpm - T.IDLE_RPM) - 2 * T.REV_FALL_DAMPING * w * this.rpmVel;
      this.rpmVel += accel * h;
      this.rpm += this.rpmVel * h;
    }

    // ---- rear wheels ------------------------------------------------------------------------------
    let wheelGoal = 0;
    let wheelTau = this.flat ? T.WHEEL_DOWN_FLAT : T.WHEEL_DOWN;
    if (this.state === 'revving') {
      const x = clamp01((this.rpm - T.IDLE_RPM) / span);
      wheelGoal = T.WHEEL_MAX * (T.WHEEL_LAUNCH + (1 - T.WHEEL_LAUNCH) * x);
      wheelTau = T.WHEEL_UP;
    }
    this.wheel += (wheelGoal - this.wheel) * (1 - Math.exp(-h / wheelTau));

    // ---- heat, lights, pop ------------------------------------------------------------------------
    if (this.state === 'revving') {
      this.holdTime += h;
      this.lights = Math.min(T.LIGHT_COUNT, Math.floor(this.holdTime / T.LIGHT_STEP + 1e-9));
      this.heat += h / T.POP_SECONDS;
      if (this.heat >= 1) this.doPop();
    } else if (this.state !== 'pitstop') {
      this.heat = Math.max(0, this.heat - h / T.COOL_SECONDS);
    }
    if (this.flat) this.popTime += h;
    if (this.green > 0) this.green = Math.max(0, this.green - h);

    // ---- settling ends when the needle and the wheels are still --------------------------------------
    if (this.state === 'settling') {
      const still = Math.abs(this.rpm - T.IDLE_RPM) < 40 && Math.abs(this.rpmVel) < 200 && this.wheel < 0.5;
      if (still) {
        this.state = 'idle';
        this.rpm = T.IDLE_RPM;
        this.rpmVel = 0;
        this.wheel = 0;
      }
    }

    if (this.state === 'pitstop') this.pitStep(h);
  }

  private pitStep(h: number): void {
    const T = TUNING;
    const before = this.pitTime;
    const now = before + h;
    this.pitTime = now;

    const nutsOff = T.PIT_LIFT;
    const wheelsOff = nutsOff + T.PIT_NUTS_OFF;
    const wheelsOn = wheelsOff + T.PIT_WHEELS_OFF + T.PIT_SWAP;
    const nutsOn = wheelsOn + T.PIT_WHEELS_ON;
    const drop = nutsOn + T.PIT_NUTS_ON;
    const total = drop + T.PIT_DROP;

    for (let i = 0; i < SIM_WHEELS.length; i++) {
      if (crossed(before, now, nutsOff + (T.PIT_STAGGER[i] ?? 0))) this.emit('nut:off', SIM_WHEELS[i] ?? null);
    }
    if (crossed(before, now, wheelsOff)) this.emit('wheel:off');
    if (crossed(before, now, wheelsOn)) this.freshTyres();
    if (crossed(before, now, nutsOn)) this.emit('wheel:on');
    for (let i = 0; i < SIM_WHEELS.length; i++) {
      if (crossed(before, now, nutsOn + (T.PIT_STAGGER[i] ?? 0))) this.emit('nut:on', SIM_WHEELS[i] ?? null);
    }
    if (crossed(before, now, drop)) this.green = T.GREEN_SECONDS;
    this.pitShown = Math.min(now, total);
    if (now >= total) {
      this.pitTime = total;
      this.state = 'idle';
      this.emit('pitstop:end');
    }
  }

  private write(): void {
    const T = TUNING;
    const o = this.out;
    const span = T.LIMITER_RPM - T.IDLE_RPM;
    o.state = this.state;
    o.rpm = this.rpm;
    o.rpmNorm = (this.rpm - T.IDLE_RPM) / span;
    o.throttle = this.state === 'revving' ? 1 : 0;
    o.limiter = this.limiting;
    o.wheelSpeed = this.wheel;
    o.wheelNorm = this.wheel / T.WHEEL_MAX;
    o.heat = this.heat;
    o.smokeRate = this.flat ? 0 : clamp01(o.wheelNorm) * (0.3 + 0.7 * Math.sqrt(this.heat));
    o.holdTime = this.holdTime;
    o.lights = this.lights;
    o.green = this.green > 0;
    o.flat = this.flat;
    o.popTime = this.popTime;
    o.pop = this.flat ? clamp01(this.popTime / T.POP_DEFLATE) : 0;

    const pit = o.pit;
    const active = this.state === 'pitstop';
    const t = active ? this.pitTime : 0;
    const total = pitTotal();
    pit.active = active;
    pit.time = this.pitShown;
    pit.total = total;
    pit.progress = active ? clamp01(t / total) : 0;

    const nutsOff = T.PIT_LIFT;
    const wheelsOff = nutsOff + T.PIT_NUTS_OFF;
    const wheelsOn = wheelsOff + T.PIT_WHEELS_OFF + T.PIT_SWAP;
    const nutsOn = wheelsOn + T.PIT_WHEELS_ON;
    const drop = nutsOn + T.PIT_NUTS_ON;
    let maxStagger = 0;
    for (let i = 0; i < T.PIT_STAGGER.length; i++) maxStagger = Math.max(maxStagger, T.PIT_STAGGER[i] ?? 0);

    pit.lift = part(active, t, 0, T.PIT_LIFT);
    pit.drop = part(active, t, drop, T.PIT_DROP);
    for (let i = 0; i < SIM_WHEELS.length; i++) {
      const late = T.PIT_STAGGER[i] ?? 0;
      // every corner finishes inside its phase: the late ones just move a little faster
      pit.nutsOff[i] = part(active, t, nutsOff + late, T.PIT_NUTS_OFF - maxStagger);
      pit.wheelsOff[i] = part(active, t, wheelsOff + late, T.PIT_WHEELS_OFF - maxStagger);
      pit.wheelsOn[i] = part(active, t, wheelsOn + late, T.PIT_WHEELS_ON - maxStagger);
      pit.nutsOn[i] = part(active, t, nutsOn + late, T.PIT_NUTS_ON - maxStagger);
    }
  }
}

/** Length of the whole pit stop in seconds. */
export function pitTotal(): number {
  const T = TUNING;
  return (
    T.PIT_LIFT + T.PIT_NUTS_OFF + T.PIT_WHEELS_OFF + T.PIT_SWAP + T.PIT_WHEELS_ON + T.PIT_NUTS_ON + T.PIT_DROP
  );
}
