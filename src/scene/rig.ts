// The camera: drag to orbit the car, an idle sway around the hero angle, and the scroll-driven
// entry (dolly down from a high wide shot) and exit (pull up and back). The mouse wheel is never
// listened to, so it always scrolls the page.
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

const DEG = Math.PI / 180;

/** Azimuth 0 looks at the nose from straight ahead (+Z); positive turns toward the car's left (+X). */
const HERO_AZIMUTH = 38 * DEG;
const HERO_HEIGHT = 1.3;
const TARGET_Y = 0.45;
const TARGET_Z = 0.15;

const MIN_HEIGHT = 0.5;
const MAX_HEIGHT = 5;
const MIN_DISTANCE = 4.5;
const MAX_DISTANCE = 9;

const IDLE_AFTER = 3; // seconds without input before the camera drifts back
const SWAY = 28 * DEG; // how far the idle orbit swings either side of the hero angle
const SWAY_RATE = (2 * DEG) / SWAY; // peak angular speed of 2 degrees per second

const ENTRY_AZIMUTH = -42 * DEG;
const ENTRY_HEIGHT = 9;
const ENTRY_DISTANCE = 21;
const EXIT_HEIGHT = 8;
const EXIT_DISTANCE = 17;

const BASE_FOV = 38;
const BASE_ASPECT = 1.6;

const smooth = (a: number, b: number, x: number) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Distance follows height: close when low, further back when high (no zoom control needed). */
function distanceFor(height: number): number {
  if (height <= HERO_HEIGHT) {
    return MathUtils.mapLinear(height, MIN_HEIGHT, HERO_HEIGHT, MIN_DISTANCE + 0.5, 6.2);
  }
  return MathUtils.mapLinear(height, HERO_HEIGHT, MAX_HEIGHT, 6.2, MAX_DISTANCE);
}

export class CameraRig {
  private azimuth = HERO_AZIMUTH;
  private height = HERO_HEIGHT;
  private goalAzimuth = HERO_AZIMUTH;
  private goalHeight = HERO_HEIGHT;

  private idle = IDLE_AFTER;
  private swayClock = 0;
  private dragging = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;
  private reducedMotion: boolean;
  private pinned = false;
  private shake = 0;
  private shakeClock = 0;

  private readonly target = new Vector3();
  private readonly element: HTMLElement;
  private readonly camera: PerspectiveCamera;

  constructor(camera: PerspectiveCamera, element: HTMLElement, reducedMotion: boolean) {
    this.camera = camera;
    this.element = element;
    this.reducedMotion = reducedMotion;
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
    element.addEventListener('lostpointercapture', this.onUp);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** Metres of camera shake (the burnout sets it from the revs). Ignored with reduced motion. */
  setShake(amount: number): void {
    this.shake = amount;
  }

  /** Puts the camera at a fixed angle and keeps it there (test hook); `null` or a drag releases it. */
  setView(view: { azimuth: number; height: number } | null): void {
    this.pinned = view !== null;
    if (!view) return;
    this.azimuth = this.goalAzimuth = view.azimuth;
    this.height = this.goalHeight = MathUtils.clamp(view.height, MIN_HEIGHT, MAX_HEIGHT);
  }

  setAspect(aspect: number): void {
    // keep the horizontal field of view on narrow windows so the car still fits
    const camera = this.camera;
    camera.aspect = aspect;
    if (aspect >= BASE_ASPECT) {
      camera.fov = BASE_FOV;
    } else {
      const horizontal = 2 * Math.atan(Math.tan((BASE_FOV * DEG) / 2) * BASE_ASPECT);
      camera.fov = Math.min(70, (2 * Math.atan(Math.tan(horizontal / 2) / aspect)) / DEG);
    }
    camera.updateProjectionMatrix();
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.dragging = true;
    this.pinned = false;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.idle = 0;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // the pointer may already be gone; dragging still works while it stays over the canvas
    }
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.idle = 0;
    this.goalAzimuth -= dx * 0.0055;
    // touch drags orbit sideways only, so vertical swipes are left to scroll the page
    if (e.pointerType !== 'touch') {
      this.goalHeight = MathUtils.clamp(this.goalHeight + dy * 0.012, MIN_HEIGHT, MAX_HEIGHT);
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = -1;
    this.idle = 0;
  };

  /** Advances the rig and writes the camera transform. `p` is the scroll progress, 0 to 1. */
  update(dt: number, p: number): void {
    if (!this.dragging) this.idle += dt;

    // with reduced motion the camera only moves when the visitor drags it: no drift back, no sway
    if (this.idle >= IDLE_AFTER && !this.reducedMotion && !this.pinned) {
      // ease the goals back toward the hero angle and its slow sway
      this.swayClock += dt;
      const hero = HERO_AZIMUTH + Math.sin(this.swayClock * SWAY_RATE) * SWAY;
      // the nearest full turn, so the camera never unwinds several laps
      const turns = Math.round((this.goalAzimuth - hero) / (2 * Math.PI));
      const nearest = hero + turns * 2 * Math.PI;
      const back = 1 - Math.exp(-dt * 0.9);
      this.goalAzimuth += (nearest - this.goalAzimuth) * back;
      this.goalHeight += (HERO_HEIGHT - this.goalHeight) * back;
    }

    // damping: the camera trails its goal
    const follow = 1 - Math.exp(-dt * 7);
    this.azimuth += (this.goalAzimuth - this.azimuth) * follow;
    this.height += (this.goalHeight - this.height) * follow;

    let azimuth = this.azimuth;
    let height = this.height;
    let distance = distanceFor(height);
    let lift = 0;

    if (!this.reducedMotion) {
      const entry = smooth(0, 0.2, p);
      const exit = smooth(0.8, 1, p);
      azimuth += (1 - entry) * ENTRY_AZIMUTH;
      height = MathUtils.lerp(ENTRY_HEIGHT, height, entry);
      distance = MathUtils.lerp(ENTRY_DISTANCE, distance, entry);
      height = MathUtils.lerp(height, EXIT_HEIGHT, exit);
      distance = MathUtils.lerp(distance, EXIT_DISTANCE, exit);
      lift = exit * 1.2;
    }

    const rise = height - TARGET_Y;
    const radius = Math.sqrt(Math.max(distance * distance - rise * rise, 2.25));
    this.target.set(0, TARGET_Y + lift, TARGET_Z);
    this.camera.position.set(Math.sin(azimuth) * radius, height, TARGET_Z + Math.cos(azimuth) * radius);
    if (this.shake > 0 && !this.reducedMotion) {
      this.shakeClock += dt;
      const c = this.shakeClock;
      this.camera.position.x += this.shake * (Math.sin(c * 97) * 0.6 + Math.sin(c * 151 + 1.1) * 0.4);
      this.camera.position.y += this.shake * (Math.sin(c * 113 + 2.3) * 0.6 + Math.sin(c * 181) * 0.4);
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    const el = this.element;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('lostpointercapture', this.onUp);
  }
}
