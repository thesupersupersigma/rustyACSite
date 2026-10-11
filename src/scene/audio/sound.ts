// The sound switch. This file is part of the scene chunk and stays tiny and silent: it remembers the
// visitor's choice, and only when they turn sound on does it create the AudioContext (inside that
// click, as browsers demand) and fetch live.ts and the clips. Before that nothing audio is downloaded.
//
// Sound is heard when all of these hold: the visitor turned it on, the engine clips are loaded, the
// stage is on screen (the same phase the rev button lives in) and the tab is visible. When one stops
// holding, everything fades out and the context is suspended; when they hold again it fades back in.
import type { PerspectiveCamera } from 'three';
import type { Controls } from '../controls';
import type { BurnoutEvent, BurnoutEvents } from '../events';
import { TUNING } from '../sim';
import { WHEEL_IDS, type CarNodes, type EngineReadout, type SimHooks, type SoundHooks, type SoundState } from '../types';
import { AUDIO } from './constants';
import type { SoundSpace } from './graph';
import type { LiveSound } from './live';
import { distanceDb, panFor, type SoundInput } from './mix';

const STORE_KEY = 'rustyac:sound';
/** Any of these is a user gesture a browser accepts for starting audio. */
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;
/** The events that make a sound. */
const SOUNDING = new Set(['throttle:off', 'pop', 'nut:off', 'nut:on', 'pitstop:end']);

export interface SoundDeps {
  controls: Controls;
  events: BurnoutEvents;
  engine: EngineReadout;
  sim: SimHooks;
  camera: PerspectiveCamera;
  car: CarNodes;
  /** Appended as `?v=` to every audio URL. */
  assetVersion: string;
}

function remembered(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === 'on';
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch {
    // private mode or storage turned off: the choice just lasts for this visit
  }
}

function createContext(): AudioContext {
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('this browser has no Web Audio');
  try {
    // the clips are 48 kHz: asking for the same rate saves a resampling of every one of them
    return new Ctor({ sampleRate: 48000, latencyHint: 'interactive' });
  } catch {
    return new Ctor();
  }
}

const ignore = () => {
  // a resume or suspend the browser refused; the next gesture tries again
};

export class Sound {
  readonly hooks: SoundHooks;

  private readonly deps: SoundDeps;
  private state: SoundState;
  /** The visitor's choice (also what is stored). */
  private wanted: boolean;
  private inStage = false;
  private audible = false;
  private ctx: AudioContext | undefined;
  private live: LiveSound | undefined;
  private starting: Promise<void> | undefined;
  private suspendTimer = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;

  private readonly input: SoundInput = { rpm: 0, throttle: 0, limiter: false, wheelNorm: 0 };
  private readonly wheelPans = [0, 0, 0, 0];
  private readonly space: { car: number; wheels: number[]; distanceDb: number } = {
    car: 0,
    wheels: this.wheelPans,
    distanceDb: 0,
  };

  constructor(deps: SoundDeps) {
    this.deps = deps;
    this.wanted = remembered();
    // "armed": it was on last time. Sound may not start by itself, so it waits for the first press of
    // the rev button or of the speaker.
    this.state = this.wanted ? 'armed' : 'off';
    deps.controls.setSound(this.state);
    deps.controls.onSound = this.toggle;
    deps.controls.onPress = this.onPress;
    this.unsubscribe = deps.events.on('*', this.onEvent);
    document.addEventListener('visibilitychange', this.refresh);

    this.hooks = {
      state: () => this.state,
      toggle: this.toggle,
      renderRun: async () => {
        const { renderRun } = await import('./offline');
        return renderRun({
          sim: deps.sim,
          engine: deps.engine,
          events: deps.events,
          space: () => this.measure(),
          assetVersion: deps.assetVersion,
        });
      },
    };
  }

  /** The speaker button. */
  readonly toggle = (): void => {
    if (this.disposed) return;
    if (this.state === 'off') {
      this.wanted = true;
      remember(true);
      this.turnOn();
    } else if (this.state === 'armed') {
      this.turnOn();
    } else {
      this.wanted = false;
      remember(false);
      this.setState('off');
      this.refresh();
    }
  };

  /** True while the scene is in its stage phase (the rev button is on screen). */
  setStage(on: boolean): void {
    if (on === this.inStage) return;
    this.inStage = on;
    this.refresh();
  }

  /** Once per rendered frame. */
  update(dt: number): void {
    const live = this.live;
    if (!live || !this.audible) return;
    const { engine } = this.deps;
    const input = this.input;
    input.rpm = engine.rpm;
    input.throttle = engine.throttle;
    input.limiter = engine.limiter;
    input.wheelNorm = engine.wheelSpeed / TUNING.WHEEL_MAX;
    live.frame(dt, input, this.measure());
  }

  /** Lines for the `?debug=1` overlay. */
  debugText(): string {
    const live = this.live;
    let text = `sound  ${this.state}`;
    if (this.ctx) text += ` · ctx ${this.ctx.state} ${this.ctx.sampleRate} Hz`;
    if (!live) return text;
    text += `\nclips  ${live.loaded}/${live.total} ${live.format}`;
    const mix = live.last;
    if (!mix) return text;
    const { pair, weights, limiter } = mix.engine;
    const rpms = live.rpms;
    text += `\npair   ${rpms[pair.lo] ?? 0} ×${(weights[pair.lo] ?? 0).toFixed(2)}`;
    if (pair.hi !== pair.lo) text += ` + ${rpms[pair.hi] ?? 0} ×${(weights[pair.hi] ?? 0).toFixed(2)}`;
    text += `\nlayers spin ${mix.wheelspin.gain.toFixed(2)} · limiter ${limiter.toFixed(2)} · on ${mix.engine.on.toFixed(2)}`;
    return text;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    document.removeEventListener('visibilitychange', this.refresh);
    for (const type of GESTURES) window.removeEventListener(type, this.nudge, true);
    window.clearTimeout(this.suspendTimer);
    this.deps.controls.onSound = undefined;
    this.deps.controls.onPress = undefined;
    this.live?.dispose();
    void this.ctx?.close().catch(ignore);
  }

  /** Called inside a click or key press: the only place the AudioContext may be made. */
  private turnOn(): void {
    try {
      if (!this.ctx) {
        this.ctx = createContext();
        for (const type of GESTURES) window.addEventListener(type, this.nudge, { capture: true, passive: true });
      }
    } catch (err) {
      this.fail(err);
      return;
    }
    void this.ctx.resume().catch(ignore);
    if (this.live?.ready) {
      this.setState('on');
      this.refresh();
      return;
    }
    this.setState('loading');
    this.starting ??= this.load(this.ctx);
  }

  private async load(ctx: AudioContext): Promise<void> {
    try {
      const { LiveSound } = await import('./live');
      if (this.disposed) return;
      const live = new LiveSound(ctx, this.deps.assetVersion);
      this.live = live;
      await live.start(this.onProgress);
      if (this.disposed) return;
      // the visitor may have switched it off again while it loaded
      if (this.wanted) this.setState('on');
      this.apply();
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    console.error('[f2004] sound could not start', err);
    this.live?.dispose();
    this.live = undefined;
    this.starting = undefined;
    this.wanted = false;
    this.setState('off');
    this.apply();
    this.deps.controls.announce('Sound could not start');
  }

  private setState(state: SoundState): void {
    if (state === this.state) return;
    this.state = state;
    this.deps.controls.setSound(state);
  }

  private readonly onProgress = (loaded: number, total: number): void => {
    if (this.state === 'loading') this.deps.controls.setSoundProgress(total > 0 ? loaded / total : 0);
  };

  /** The rev button (or Space) went down: with sound remembered from last time, that starts it. */
  private readonly onPress = (): void => {
    if (this.state === 'armed') this.turnOn();
  };

  /** A context the browser stopped (or never let start) gets another go on every gesture. */
  private readonly nudge = (): void => {
    const ctx = this.ctx;
    if (ctx && this.audible && ctx.state !== 'running') void ctx.resume().catch(ignore);
  };

  private readonly refresh = (): void => {
    const audible =
      this.state === 'on' && this.live?.ready === true && this.inStage && document.visibilityState === 'visible';
    if (audible !== this.audible) {
      this.audible = audible;
      this.apply();
    }
  };

  /** Fades in or out and resumes or suspends the context, to match `audible`. */
  private apply(): void {
    this.audible =
      this.state === 'on' && this.live?.ready === true && this.inStage && document.visibilityState === 'visible';
    const ctx = this.ctx;
    window.clearTimeout(this.suspendTimer);
    if (!ctx) return;
    if (this.audible) {
      void ctx.resume().catch(ignore);
      this.live?.setAudible(true);
      return;
    }
    this.live?.setAudible(false);
    // still loading: the context keeps running (silently) so the clips can be started on time
    if (this.state === 'loading') return;
    this.suspendTimer = window.setTimeout(
      () => {
        if (!this.audible && this.state !== 'loading') void ctx.suspend().catch(ignore);
      },
      AUDIO.FADE_SECONDS * 1000 + 100,
    );
  }

  private readonly onEvent = (event: BurnoutEvent): void => {
    if (!this.live || !this.audible || !SOUNDING.has(event.type)) return;
    const wheel = event.wheel ? WHEEL_IDS.indexOf(event.wheel) : -1;
    this.live.event(event.type, wheel, this.deps.engine.rpm, this.measure());
  };

  /**
   * Where the car and its wheels sit between the speakers, and how far away the camera is. Read from
   * the matrices of the last drawn frame, so it costs nothing. The engine's sound comes from the back
   * of the car (the exhausts), not from its middle, which the camera always looks at.
   */
  private measure(): SoundSpace {
    const { camera, car } = this.deps;
    const c = camera.matrixWorld.elements;
    // the camera's position and its "right" direction, in world space
    const cx = c[12] as number;
    const cy = c[13] as number;
    const cz = c[14] as number;
    const rx = c[0] as number;
    const ry = c[1] as number;
    const rz = c[2] as number;

    let rearX = 0;
    let rearY = 0;
    let rearZ = 0;
    for (let i = 0; i < 4; i++) {
      const e = car.hubs[WHEEL_IDS[i] as (typeof WHEEL_IDS)[number]].matrixWorld.elements;
      const x = (e[12] as number) - cx;
      const y = (e[13] as number) - cy;
      const z = (e[14] as number) - cz;
      this.wheelPans[i] = panFor(x * rx + y * ry + z * rz, Math.hypot(x, y, z), AUDIO.FX_PAN_WIDTH);
      if (i >= 2) {
        rearX += x / 2;
        rearY += y / 2;
        rearZ += z / 2;
      }
    }
    const space = this.space;
    space.car = panFor(rearX * rx + rearY * ry + rearZ * rz, Math.hypot(rearX, rearY, rearZ), AUDIO.PAN_WIDTH);
    const root = car.root.matrixWorld.elements;
    space.distanceDb = distanceDb(Math.hypot(cx - (root[12] as number), cy - (root[13] as number) - 0.45, cz - (root[14] as number)));
    return space;
  }
}
