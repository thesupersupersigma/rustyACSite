import type { Mesh, Object3D } from 'three';

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
  setProgress(p: number): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}
