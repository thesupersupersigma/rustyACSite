import type { Mesh, Object3D } from 'three';
import type { BurnoutEvents } from './events';
import type { SimSnapshot, SimState } from './sim';

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR';
export const WHEEL_IDS: readonly WheelId[] = ['FL', 'FR', 'RL', 'RR'];

export type Tier = 'high' | 'mid' | 'low';

/** The nodes of `f2004.glb` that tasks 02/03 animate. */
export interface CarNodes {
  /** The `F2004` root. */
  root: Object3D;
  /** `hub_XX`: does not rotate; the caliper lives here. */
  hubs: Record<WheelId, Object3D>;
  /** `wheel_XX`: spin around local X; slide along X to take the wheel off. */
  wheels: Record<WheelId, Object3D>;
  /** `nut_XX`: the centre-lock nut; slide along local X to undo it. */
  nuts: Record<WheelId, Object3D>;
  /** `rotor_XX`: the brake disc, under the hub. Spins with the wheel but stays on the car in the pit stop. */
  rotors: Record<WheelId, Object3D>;
}

export interface FrameInfo {
  /** Seconds since the previous rendered frame (clamped). */
  dt: number;
  /** Seconds the scene has been running (only advances while it renders). */
  time: number;
  /** Scroll progress through the section, 0 to 1. */
  p: number;
}

export type FrameCallback = (frame: FrameInfo) => void;

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** The element the canvas fills; its size is the render size. */
  container: HTMLElement;
  /** The tall scroll section; rendering stops while it is off screen. */
  section: HTMLElement;
  /** Appended as `?v=` to every model and texture URL. */
  assetVersion: string;
  debug: boolean;
  reducedMotion: boolean;
  /** Download progress of the two GLBs, 0 to 1. */
  onProgress?: (fraction: number) => void;
}

/** The engine as task 03 (sound) reads it. Live values: read them whenever you need them. */
export interface EngineReadout {
  /** Revs per minute: about 4,000 at idle, 18,500 at the limiter. */
  readonly rpm: number;
  /** 0 at idle, 1 at the limiter. */
  readonly rpmNorm: number;
  /** 1 while the throttle is held and the engine is driven, otherwise 0. */
  readonly throttle: number;
  readonly state: SimState;
  /** Rear tyre heat, 0 cold to 1 popping. */
  readonly heat: number;
  /** Rear wheel speed in rad/s. */
  readonly wheelSpeed: number;
  /** True while the revs bounce off the limiter. */
  readonly limiter: boolean;
}

/**
 * Test hooks (`window.__f2004.sim`). Using any of them switches the burnout to a manual clock: it
 * then only moves in fixed 1/60 s steps when told to, which makes screenshots repeatable.
 * `resume()` hands it back to real time and to the visitor.
 */
export interface SimHooks {
  /** Holds the throttle and runs `seconds` of it. The throttle stays held afterwards. */
  hold(seconds: number): void;
  release(): void;
  /** Runs `seconds` with the throttle as it is. */
  advance(seconds: number): void;
  /** Pops the rear tyres now, whatever the heat. */
  pop(): void;
  /** Starts the pit stop (only does something while popped). */
  pitStop(): void;
  /** Hands the clock back to real time and the camera back to the visitor. */
  resume(): void;
  /**
   * Pins the camera: degrees around the car (0 = straight ahead of the nose, positive toward its left,
   * 180 = behind) and metres above the ground. It stays there until the visitor drags or `resume()`.
   */
  view(azimuthDeg: number, height: number): void;
  /** The simulation's current state (the same object every time). */
  snapshot(): SimSnapshot;
  /** Measures the current frame cost over `frames` frames (default 30). Blocks while it runs. */
  bench(frames?: number): BenchResult;
}

/** Average milliseconds per frame, measured with the GPU finished after every draw. */
export interface BenchResult {
  tier: Tier;
  frames: number;
  /** Smoke particles alive during the measurement. */
  particles: number;
  /** JavaScript: one simulation step plus writing it onto the scene. */
  updateMs: number;
  /** Drawing the whole frame as it is. */
  drawMs: number;
  /** The same frame with the smoke hidden. */
  drawWithoutSmokeMs: number;
  /** The same frame with the smoke in the wet ground's mirror image, and kept out of it. */
  drawSmokeMirroredMs: number;
  drawSmokeNotMirroredMs: number;
}

/**
 * The speaker button's state. `armed`: sound was on during the last visit and starts with the first
 * press of the rev button or the speaker (a browser will not let it start by itself).
 */
export type SoundState = 'off' | 'armed' | 'loading' | 'on';

/** The scripted burnout rendered to a file (see audio/offline.ts). */
export interface SoundRun {
  /** A 16-bit stereo WAV file. */
  wav: Uint8Array;
  seconds: number;
  sampleRate: number;
  /** The clip format this browser decoded: `webm` or `m4a`. */
  format: string;
  /** Where each part of the run starts, in seconds. */
  marks: Array<{ label: string; time: number }>;
}

/** The sound (`window.__f2004.sound`). */
export interface SoundHooks {
  state(): SoundState;
  /** What a click on the speaker button does. Turning sound on has to happen inside a click or key press. */
  toggle(): void;
  /** How loud the output is right now (RMS, 0 to 1); 0 while nothing is heard. For checks. */
  level(): number;
  /** Renders the scripted run without playing it. Takes over the burnout's clock while it records. */
  renderRun(): Promise<SoundRun>;
}

/** What the homepage and tasks 02/03 get back from `createF2004Scene`. */
export interface F2004Scene {
  /** Current scroll progress through the section, 0 to 1. */
  readonly p: number;
  readonly tier: Tier;
  getCar(): CarNodes;
  /** The five start-light pods, `startlight_0` to `startlight_4`, left to right in the file's order. */
  getStartLights(): Mesh[];
  /** Runs every rendered frame, before the camera and the draw. Returns a function that removes it. */
  onFrame(cb: FrameCallback): () => void;
  /** The engine read-out for the sound (task 03). */
  readonly engine: EngineReadout;
  /** `throttle:on`, `pop`, `nut:off` and the rest: see SimEventType in sim.ts. */
  readonly events: BurnoutEvents;
  /** Deterministic test hooks. */
  readonly sim: SimHooks;
  /** The sound switch and the offline render. */
  readonly sound: SoundHooks;
  setProgress(p: number): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}
