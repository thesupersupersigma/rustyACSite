// The interactive part of the scene: hold to rev, wheelspin, the pop and the ghost pit stop.
// sim.ts decides what happens; this file makes the car, the lights and the page show it.
//
// Two halves: `advance(dt)` steps the simulation and everything that integrates over time, and
// `apply()` writes the current state onto the three.js objects. Both run every frame, so neither
// creates objects, arrays, closures or strings (the loops in them are indexed for that reason). The test hooks (`sim.hold()` and
// friends) call `advance` in fixed steps, which is what makes the check screenshots repeatable.
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { Sound } from './audio/sound';
import { Controls } from './controls';
import { Debris } from './debris';
import { Emitter } from './events';
import type { CameraRig } from './rig';
import { SMOKE, Smoke, makeRandom } from './smoke';
import { BurnoutSim, type SimEvent, type SimSnapshot } from './sim';
import {
  WHEEL_IDS,
  type BenchResult,
  type CarNodes,
  type EngineReadout,
  type SimHooks,
  type Tier,
  type WheelId,
} from './types';

/** How the burnout looks. The engine numbers (revs, heat, timings) are in TUNING in sim.ts. */
export const LOOK = {
  // ---- body ------------------------------------------------------------------------------------
  /** Metres the rear squats at full throttle. */
  SQUAT_REAR: 0.028,
  /** Metres the nose lifts at full throttle. */
  NOSE_LIFT: 0.007,
  /** Metres of high-frequency shake at the limiter. */
  SHAKE: 0.0022,
  /** Radians of roll shake at the limiter. */
  SHAKE_ROLL: 0.0014,
  /** Radians the rear steps sideways (slow yaw wiggle) at full wheelspin. */
  YAW_WIGGLE: 0.007,
  /** Metres of camera shake at the limiter. */
  CAMERA_SHAKE: 0.011,

  // ---- rear wheels -------------------------------------------------------------------------------
  /** Wheel speed (rad/s) where the blur disc starts to appear, and where it is fully in. */
  BLUR_START: 12,
  BLUR_FULL: 34,
  /** Opacity of the blur disc at full speed. */
  BLUR_OPACITY: 0.92,
  /** How much the real rim fades at full speed (0.35 leaves it at 65%). */
  RIM_FADE: 0.35,
  /** The blur disc sits this share of the rim's half width out from the hub, and is this share of its radius. */
  BLUR_OFFSET: 0.62,
  BLUR_RADIUS: 0.95,
  /** Brightness of the blur disc compared with the rim's average colour. */
  BLUR_BRIGHTNESS: 1.3,

  // ---- lights ------------------------------------------------------------------------------------
  /** Emissive strength of the steering-wheel rev LEDs at the limiter. */
  LED_GLOW: 4,
  /** How bright a lit start-light pod is (above 1 so the bloom picks it up). */
  LIGHT_GLOW: 5,
  /** Strength of the light the five lit pods throw onto the car (the gantry is behind the hero camera). */
  GANTRY_GLOW: 80,

  /** How far the rear wheels' textures smear into one colour at full speed (lettering and decals stop strobing). */
  SMEAR: 0.85,

  // ---- heat and rubber ---------------------------------------------------------------------------
  /** Colour and strength of the glow on a tyre about to pop (strength above 1 feeds the bloom). */
  HEAT_COLOR: 0xd2581f,
  HEAT_GLOW: 2.2,
  /** Heat (0 to 1) below which the tread shows no glow at all. */
  HEAT_VISIBLE: 0.3,
  /** Seconds of hard wheelspin until the rubber patches are as dark as they get, and how dark that is. */
  RUBBER_SECONDS: 10,
  RUBBER_MAX: 0.82,
  /** Metres: size of one rubber patch (across, along the car). */
  RUBBER_WIDTH: 0.5,
  RUBBER_LENGTH: 1.7,

  // ---- the pop -----------------------------------------------------------------------------------
  /** Metres the rear of the car drops when the tyres go flat. */
  POP_DROP: 0.11,
  /** How much wider a flat tyre gets (0.1 = 10%). */
  FLAT_WIDEN: 0.1,

  // ---- pit stop ----------------------------------------------------------------------------------
  /** Metres the jacks lift the car. */
  JACK_LIFT: 0.06,
  /** Metres a nut slides out, and how many turns it makes on the way. */
  NUT_SLIDE: 0.12,
  NUT_TURNS: 5,
  /** Metres a wheel slides out. */
  WHEEL_SLIDE: 0.6,
  /** Metres the body dips when the car lands. */
  LAND_BOUNCE: 0.012,
  /** Seconds the pit-stop time stays on screen after the stop. */
  TIMER_STAYS: 4,
};

export interface BurnoutContext {
  scene: Scene;
  car: CarNodes;
  /** Every material of the car; clones made here are added so they get the environment map too. */
  carMaterials: MeshStandardMaterial[];
  startLights: Mesh[];
  rig: CameraRig;
  /** The element the controls are added to (the frame the canvas fills). */
  container: HTMLElement;
  /** Appended as `?v=` to the audio URLs. */
  assetVersion: string;
  /** Objects lying on the tarmac; they are hidden while the mirror image is drawn. */
  groundLayer: Object3D[];
  getTier(): Tier;
  getReducedMotion(): boolean;
  camera: PerspectiveCamera;
  fogColor: Color;
  fogDensity: number;
  /** World position of the floodlight aimed at the car (the smoke is shaded from there). */
  keyLight: Vector3;
  /** Draws `frames` frames back to back, waiting for the GPU each time; returns the average in ms. */
  measureDraw(frames: number): number;
}

const FIXED_STEP = 1 / 60;
const TAU = Math.PI * 2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInCubic = (t: number) => t * t * t;
const easeInQuad = (t: number) => t * t;
/** 0 to 1 with one overshoot and a quick settle: the tyre letting go. `t` is in seconds. */
const popEase = (t: number) => 1 - Math.exp(-t / 0.05) * Math.cos(TAU * 5.5 * t);

const sideOf = (id: WheelId) => (id.endsWith('L') ? 1 : -1);

function meshNamed(root: Object3D, prefix: string): Mesh | undefined {
  let found: Mesh | undefined;
  root.traverse((o) => {
    if (!found && o instanceof Mesh && o.name.startsWith(prefix)) found = o;
  });
  return found;
}

/** Radius (in the YZ plane) and half width (along X) of a wheel part, in the wheel's own frame. */
function measure(mesh: Mesh | undefined, fallbackRadius: number, fallbackHalfWidth: number) {
  if (!mesh) return { radius: fallbackRadius, halfWidth: fallbackHalfWidth };
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return { radius: fallbackRadius, halfWidth: fallbackHalfWidth };
  return {
    radius: Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) * mesh.scale.y,
    halfWidth: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * mesh.scale.x,
  };
}

/** Average colour of a material's texture, for the blur disc. Falls back to mid grey. */
function averageColor(material: MeshStandardMaterial, out: Color): Color {
  out.setRGB(0.42, 0.42, 0.44);
  const image = material.map?.image as CanvasImageSource | undefined;
  if (image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i] ?? 0;
          g += data[i + 1] ?? 0;
          b += data[i + 2] ?? 0;
        }
        const n = (data.length / 4) * 255;
        out.setRGB(r / n, g / n, b / n, SRGBColorSpace);
      }
    } catch {
      // a texture the canvas cannot read: keep the grey
    }
  }
  return out.multiply(material.color);
}

/** A strip of laid rubber: darkest under the tyre, feathering out backwards and at the sides. */
function makeRubberTexture(): CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const along = ctx.createLinearGradient(0, 0, 0, h);
    // the bottom of the canvas ends up at the front of the strip, under the tyre
    along.addColorStop(0, 'rgba(255,255,255,0)');
    along.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    along.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    along.addColorStop(0.93, 'rgba(255,255,255,1)');
    along.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const across = ctx.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.22, 'rgba(0,0,0,1)');
    across.addColorStop(0.78, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
  }
  return new CanvasTexture(canvas);
}

/** What a spinning rim smears into: soft concentric bands, see-through between the spokes' average. */
function makeBlurTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    // [radius 0..1, brightness 0..1, alpha 0..1]: bright hub and nut, darker spoke band, bright lip
    const bands: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0.95, 1],
      [0.16, 0.9, 1],
      [0.24, 0.5, 0.95],
      [0.45, 0.42, 0.78],
      [0.7, 0.46, 0.8],
      [0.84, 0.7, 0.95],
      [0.93, 1, 1],
      [0.985, 0.8, 0.9],
      [1, 0.6, 0],
    ];
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    for (const [r, v, a] of bands) {
      const level = Math.round(v * 255);
      g.addColorStop(r, `rgba(${level},${level},${level},${a})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class Burnout {
  readonly events = new Emitter();
  readonly engine: EngineReadout;
  readonly hooks: SimHooks;
  readonly sound: Sound;

  private readonly ctx: BurnoutContext;
  private readonly sim = new BurnoutSim();
  private readonly controls: Controls;
  private snap: SimSnapshot;

  // ---- things that integrate over time (advanced in fixed steps by the test hooks) --------------------
  private clock = 0;
  private wheelAngle = 0;
  private throttle = 0;
  private landTime = 10;
  private timerLeft = 0;
  private manual = false;
  private manualHeld = false;

  // ---- the car ----------------------------------------------------------------------------------------
  private readonly frontZ: number;
  private readonly wheelbase: number;
  // per wheel, in FL, FR, RL, RR order (plain arrays, so the frame code never looks anything up by name)
  private readonly hubNodes: Object3D[] = [];
  private readonly wheelNodes: Object3D[] = [];
  private readonly nutNodes: Object3D[] = [];
  /** The brake discs: they turn with the wheels but stay on the hubs when the wheels come off. */
  private readonly rotorNodes: Object3D[] = [];
  /** +1 on the car's left, -1 on its right: the way a wheel or nut comes off. */
  private readonly wheelSide: number[] = [];
  private readonly wheelFront: boolean[] = [];
  private readonly hubBaseY: number[] = [];
  private readonly nutBase: Vector3[] = [];
  private readonly nutScale: number[] = [];
  private readonly wheelMaterials: MeshStandardMaterial[] = [];
  /** Rear rim, rim decal and nut materials: these fade a little under the blur disc. */
  private readonly rearSpin = new Set<MeshStandardMaterial>();
  /** The two rear tyre materials (one each): their emissive is the heat glow. */
  private readonly hotTyres: MeshStandardMaterial[] = [];
  /** Shared by every rear wheel material: how far its texture has smeared into its average colour. */
  private readonly smear = { value: 0 };
  private readonly rearZ: number;
  private readonly halfTrack: number;
  private readonly rearHubY: number;

  // ---- smoke, rubber on the track, shards ---------------------------------------------------------------
  private readonly smoke: Smoke;
  private readonly debris = new Debris();
  private readonly random = makeRandom(31);
  private readonly rubberMeshes: Mesh[] = [];
  private readonly rubberMaterial: MeshBasicMaterial;
  private readonly rubberTexture: CanvasTexture;
  private rubber = 0;
  private smokeReflected = true;
  private readonly rearTyres: Mesh[] = [];
  private readonly rearTyrePos: Vector3[] = [];
  private readonly rearTyreScale: Vector3[] = [];
  private readonly blurDiscs: Mesh[] = [];
  private readonly blurMaterial: MeshStandardMaterial;
  private readonly blurTexture: CanvasTexture;
  private readonly led: MeshStandardMaterial | undefined;
  /** Height of a flat rear tyre as a share of a round one, so its bottom stays on the ground. */
  private readonly flatHeight: number;

  private readonly lightDark = new Color(0x220000);
  private readonly lightRed = new Color(1, 0.06, 0.03).multiplyScalar(LOOK.LIGHT_GLOW);
  private readonly lightGreen = new Color(0.08, 1, 0.22).multiplyScalar(LOOK.LIGHT_GLOW * 0.8);
  private lightsShown = 0;
  private readonly gantryGlow: PointLight;
  private readonly scratch = new Vector3();

  private readonly mA = new Matrix4();
  private readonly mB = new Matrix4();
  private readonly mC = new Matrix4();
  private readonly noRotation = new Quaternion();
  private warm = false;

  constructor(ctx: BurnoutContext) {
    this.ctx = ctx;
    this.snap = this.sim.out;
    const { car } = ctx;

    this.frontZ = car.hubs.FL.position.z;
    this.rearZ = car.hubs.RL.position.z;
    this.rearHubY = car.hubs.RL.position.y;
    this.halfTrack = (Math.abs(car.hubs.RL.position.x) + Math.abs(car.hubs.RR.position.x)) / 2;
    this.wheelbase = Math.max(0.5, this.frontZ - this.rearZ);

    // ---- smoke and shards ---------------------------------------------------------------------------------
    this.smoke = new Smoke({ fogColor: ctx.fogColor, fogDensity: ctx.fogDensity, keyLight: ctx.keyLight });
    this.smoke.setCap(SMOKE.CAP[ctx.getTier()]);
    ctx.scene.add(this.smoke.mesh, this.debris.mesh);
    this.setSmokeReflected(SMOKE.IN_REFLECTION);

    // ---- rubber laid on the tarmac under and behind each rear tyre. On the ground layer, so the mirror
    // image never shows it (a decal has no business in its own reflection).
    this.rubberTexture = makeRubberTexture();
    this.rubberMaterial = new MeshBasicMaterial({
      map: this.rubberTexture,
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const rubberGeometry = new PlaneGeometry(LOOK.RUBBER_WIDTH, LOOK.RUBBER_LENGTH);
    for (const side of [1, -1]) {
      const patch = new Mesh(rubberGeometry, this.rubberMaterial);
      patch.name = side > 0 ? 'rubber_RL' : 'rubber_RR';
      patch.rotation.x = -Math.PI / 2;
      // the strip starts just ahead of the contact patch and runs back from it
      patch.position.set(side * this.halfTrack, 0.01, this.rearZ + 0.22 - LOOK.RUBBER_LENGTH / 2);
      patch.renderOrder = 1;
      patch.visible = false;
      ctx.scene.add(patch);
      ctx.groundLayer.push(patch);
      this.rubberMeshes.push(patch);
    }

    // ---- wheels: every wheel part gets a clone of its material, so fading the wheels during the stop
    // (and the rear rims under the blur disc) never touches the body or the front tyres
    const clones = new Map<string, MeshStandardMaterial>();
    for (const id of WHEEL_IDS) {
      const rear = id.startsWith('R');
      this.hubNodes.push(car.hubs[id]);
      this.wheelNodes.push(car.wheels[id]);
      this.nutNodes.push(car.nuts[id]);
      this.rotorNodes.push(car.rotors[id]);
      this.wheelSide.push(sideOf(id));
      this.wheelFront.push(!rear);
      this.hubBaseY.push(car.hubs[id].position.y);
      this.nutBase.push(car.nuts[id].position.clone());
      this.nutScale.push(car.nuts[id].scale.x);
      car.wheels[id].traverse((o) => {
        if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return;
        const tyre = o.name.startsWith('tyre');
        // each rear tyre gets a material of its own (the heat glow); the rest is shared per axle
        const key = `${o.material.uuid}:${tyre && rear ? id : rear ? 'R' : 'F'}`;
        let clone = clones.get(key);
        if (!clone) {
          clone = this.wheelMaterial(o.material, rear ? (tyre ? 'tyre' : 'rear') : 'front');
          clones.set(key, clone);
          ctx.carMaterials.push(clone);
          this.wheelMaterials.push(clone);
          if (tyre && rear) this.hotTyres.push(clone);
        }
        if (rear && /^(rim|rimdecal|nut)_/.test(o.name)) this.rearSpin.add(clone);
        o.material = clone;
      });
    }

    // ---- rear tyres: squashed by hand when flat, so they keep their own matrix --------------------------
    const tyreSize = measure(meshNamed(car.wheels.RL, 'tyre_'), 0.33, 0.19);
    const rimSize = measure(meshNamed(car.wheels.RL, 'rim_'), 0.184, 0.18);
    this.flatHeight = Math.min(1, Math.max(0.3, (this.rearHubY - LOOK.POP_DROP) / tyreSize.radius));
    for (const id of ['RL', 'RR'] as const) {
      const tyre = meshNamed(car.wheels[id], 'tyre_');
      if (!tyre) continue;
      tyre.matrixAutoUpdate = false;
      this.rearTyres.push(tyre);
      this.rearTyrePos.push(tyre.position.clone());
      this.rearTyreScale.push(tyre.scale.clone());
    }

    // ---- motion-blur discs over the rear rims ------------------------------------------------------------
    const rim = meshNamed(car.wheels.RL, 'rim_')?.material;
    this.blurTexture = makeBlurTexture();
    this.blurMaterial = new MeshStandardMaterial({
      map: this.blurTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      metalness: rim instanceof MeshStandardMaterial ? rim.metalness : 0.6,
      roughness: rim instanceof MeshStandardMaterial ? Math.max(0.35, rim.roughness) : 0.45,
    });
    // a little brighter than the rim's average: the smear catches the light the spokes would
    if (rim instanceof MeshStandardMaterial) averageColor(rim, this.blurMaterial.color).multiplyScalar(LOOK.BLUR_BRIGHTNESS);
    if (rim instanceof MeshStandardMaterial) {
      // the environment map was handed out before this material existed
      this.blurMaterial.envMap = rim.envMap;
      this.blurMaterial.envMapIntensity = rim.envMapIntensity;
    }
    ctx.carMaterials.push(this.blurMaterial);
    const discGeometry = new CircleGeometry(rimSize.radius * LOOK.BLUR_RADIUS, 40);
    for (const id of ['RL', 'RR'] as const) {
      const disc = new Mesh(discGeometry, this.blurMaterial);
      disc.name = `blur_${id}`;
      disc.rotation.y = (sideOf(id) * Math.PI) / 2;
      disc.position.x = sideOf(id) * rimSize.halfWidth * LOOK.BLUR_OFFSET;
      disc.renderOrder = 3;
      disc.visible = false;
      car.hubs[id].add(disc);
      this.blurDiscs.push(disc);
    }

    // ---- the start lights' glow on the car: one point light at the gantry, dark until a pod is lit -----------
    this.gantryGlow = new PointLight(0xff0000, 0, 60, 2);
    for (const pod of ctx.startLights) {
      pod.updateWorldMatrix(true, false);
      pod.getWorldPosition(this.scratch);
      this.gantryGlow.position.addScaledVector(this.scratch, 1 / ctx.startLights.length);
    }
    ctx.scene.add(this.gantryGlow);

    // ---- the rev LEDs on the steering wheel -------------------------------------------------------------
    this.led = ctx.carMaterials.find((m) => m.name.startsWith('LED_Light'));
    if (this.led) {
      this.led.emissive.setRGB(1, 0.16, 0.05);
      this.led.emissiveIntensity = 0;
    } else {
      console.warn('[f2004] no LED_Light material on the car: the rev LEDs stay dark');
    }

    this.controls = new Controls(ctx.container);
    this.controls.onPitStop = () => this.sim.requestPitStop(ctx.getReducedMotion());

    const sim = this.sim;
    this.engine = {
      get rpm() {
        return sim.out.rpm;
      },
      get rpmNorm() {
        return sim.out.rpmNorm;
      },
      get throttle() {
        return sim.out.throttle;
      },
      get state() {
        return sim.out.state;
      },
      get heat() {
        return sim.out.heat;
      },
      get wheelSpeed() {
        return sim.out.wheelSpeed;
      },
      get limiter() {
        return sim.out.limiter;
      },
    };

    this.hooks = {
      hold: (seconds) => {
        this.manual = true;
        this.manualHeld = true;
        this.run(seconds);
      },
      release: () => {
        this.manual = true;
        this.manualHeld = false;
        this.run(0);
      },
      advance: (seconds) => {
        this.manual = true;
        this.run(seconds);
      },
      pop: () => {
        this.manual = true;
        this.sim.requestPop();
        this.run(0);
      },
      pitStop: () => {
        this.manual = true;
        this.sim.requestPitStop(ctx.getReducedMotion());
        this.run(0);
      },
      resume: () => {
        this.manual = false;
        this.manualHeld = false;
        ctx.rig.setView(null);
      },
      view: (azimuthDeg, height) => ctx.rig.setView({ azimuth: (azimuthDeg * Math.PI) / 180, height }),
      snapshot: () => this.sim.out,
      bench: (frames = 30) => this.bench(frames),
    };

    this.sound = new Sound({
      controls: this.controls,
      events: this.events,
      engine: this.engine,
      sim: this.hooks,
      camera: ctx.camera,
      car,
      assetVersion: ctx.assetVersion,
    });

    this.apply();
  }

  /** Once per rendered frame, before the camera and the draw. `p` is the scroll progress. */
  update(dt: number, p: number): void {
    this.setProgress(p);
    if (!this.manual) this.advance(dt, this.controls.held);
    this.apply();
    this.sound.update(dt);
  }

  /**
   * The scroll progress, straight from the scroll handler. The controls only exist in the stage phase
   * (0.2 to 0.8) and leaving it lets go of the throttle. This must not wait for a rendered frame: the
   * frame loop stops when the section is off screen, and Space has to go back to the page then.
   */
  setProgress(p: number): void {
    const stage = p >= 0.2 && p <= 0.8;
    this.controls.setStage(stage);
    this.sound.setStage(stage);
  }

  /** Shows the parts that are normally hidden, so the first frame can compile their shaders. */
  setWarm(on: boolean): void {
    this.warm = on;
    this.smoke.warm(on);
    this.debris.warm(on);
    this.apply();
  }

  /** Everything this file added to the scene that must not end up in the car's environment map. */
  get captureHidden(): Object3D[] {
    return [this.smoke.mesh, this.debris.mesh, ...this.rubberMeshes];
  }

  /** Particles alive right now. */
  get smokeAlive(): number {
    return this.smoke.alive;
  }

  /** Lines for the `?debug=1` overlay. */
  debugText(): string {
    const s = this.snap;
    return (
      `state  ${s.state}${this.manual ? ' (manual clock)' : ''}\n` +
      `rpm    ${s.rpm.toFixed(0)}${s.limiter ? ' LIM' : ''}\n` +
      `thr    ${s.throttle}\n` +
      `heat   ${s.heat.toFixed(2)}\n` +
      `smoke  ${this.smoke.alive} / ${SMOKE.CAP[this.ctx.getTier()]}\n` +
      this.sound.debugText()
    );
  }

  dispose(): void {
    this.sound.dispose();
    this.controls.dispose();
    this.events.clear();
    this.ctx.rig.setShake(0);
    for (const disc of this.blurDiscs) disc.removeFromParent();
    this.blurDiscs[0]?.geometry.dispose();
    this.blurMaterial.dispose();
    this.blurTexture.dispose();
    this.gantryGlow.removeFromParent();
    this.gantryGlow.dispose();
    this.smoke.mesh.removeFromParent();
    this.smoke.dispose();
    this.debris.mesh.removeFromParent();
    this.debris.dispose();
    for (const patch of this.rubberMeshes) patch.removeFromParent();
    this.rubberMeshes[0]?.geometry.dispose();
    this.rubberMaterial.dispose();
    this.rubberTexture.dispose();
  }

  /**
   * A wheel part's own copy of its material. All of them can fade (the pit stop); the rear ones also
   * smear toward their average colour as they spin, so lettering and decals do not strobe; the rear
   * tyres add the heat glow, on the tread only.
   */
  private wheelMaterial(source: MeshStandardMaterial, kind: 'front' | 'rear' | 'tyre'): MeshStandardMaterial {
    const cutout = source.transparent || source.alphaTest > 0;
    const clone = source.clone();
    // always "transparent" so fading needs no shader rebuild; at opacity 1 it draws like before
    clone.transparent = true;
    // the model's materials are double-sided; without this each wheel part would be drawn twice
    clone.forceSinglePass = true;
    const smearColor = kind === 'front' ? undefined : { value: averageColor(source, new Color()) };
    if (kind === 'tyre') clone.emissive.setHex(LOOK.HEAT_COLOR);
    clone.onBeforeCompile = (shader) => {
      let fragment = shader.fragmentShader;
      // these textures keep other data in their alpha channel, so an opaque part must not start reading it
      if (!cutout) {
        fragment = fragment.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a = opacity;');
      }
      if (smearColor) {
        shader.uniforms['uSmear'] = this.smear;
        shader.uniforms['uSmearColor'] = smearColor;
        fragment = fragment
          .replace('#include <common>', 'uniform float uSmear;\nuniform vec3 uSmearColor;\n#include <common>')
          .replace(
            '#include <map_fragment>',
            '#include <map_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, uSmearColor, uSmear );',
          );
      }
      if (kind === 'tyre') {
        // the quantised tyre mesh has its tread at radius 1 around the axle (local x)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', 'varying float vTread;\n#include <common>')
          .replace(
            '#include <begin_vertex>',
            // tread = far from the axle and facing away from it (the sidewalls face along x)
            '#include <begin_vertex>\nvTread = smoothstep( 0.8, 0.95, length( position.yz ) ) * ( 1.0 - smoothstep( 0.35, 0.75, abs( normal.x ) ) );',
          );
        fragment = fragment
          .replace('#include <common>', 'varying float vTread;\n#include <common>')
          .replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vTread;',
          );
      }
      shader.fragmentShader = fragment;
    };
    clone.customProgramCacheKey = () => `wheel-${kind}-${cutout ? 'cutout' : 'solid'}`;
    return clone;
  }

  /** Runs the simulation for `seconds` in fixed steps (the test hooks). Zero still handles requests. */
  private run(seconds: number): void {
    const steps = Math.max(0, Math.round(seconds / FIXED_STEP));
    // a step of no time runs no substep, and the throttle edge lives in the substep
    if (steps === 0) this.advance(1e-6, this.manualHeld);
    for (let i = 0; i < steps; i++) this.advance(FIXED_STEP, this.manualHeld);
    this.apply();
  }

  private advance(dt: number, held: boolean): void {
    const s = this.sim.step(dt, held);
    this.snap = s;
    for (let i = 0; i < s.events.length; i++) {
      const event = s.events[i];
      if (!event) continue;
      this.react(event);
      this.events.emit(event);
    }

    this.clock += dt;
    this.wheelAngle = (this.wheelAngle + s.wheelSpeed * dt) % TAU;
    this.throttle += (s.throttle - this.throttle) * (1 - Math.exp(-dt / 0.1));
    this.landTime += dt;
    if (!s.pit.active && this.timerLeft > 0) this.timerLeft -= dt;

    this.smoke.step(dt, s.smokeRate, clamp01(s.wheelNorm), this.rearZ, this.halfTrack);
    this.debris.step(dt);
    this.rubber = Math.min(1, this.rubber + (s.smokeRate * dt) / LOOK.RUBBER_SECONDS);
  }

  /**
   * Times the burnout as it is right now (the test hook). The simulation is not moved on: the steps
   * use a vanishing dt, which still walks every particle.
   */
  private bench(frames: number): BenchResult {
    const n = Math.max(1, Math.floor(frames));
    const { measureDraw } = this.ctx;
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      this.advance(1e-7, this.manualHeld);
      this.apply();
    }
    const updateMs = (performance.now() - start) / n;

    const mesh = this.smoke.mesh;
    const reflected = this.smokeReflected;
    const shown = mesh.visible;
    measureDraw(3); // settle
    const drawMs = measureDraw(n);
    this.setSmokeReflected(!reflected);
    const otherMs = measureDraw(n);
    this.setSmokeReflected(reflected);
    mesh.visible = false;
    const drawWithoutSmokeMs = measureDraw(n);
    mesh.visible = shown;
    return {
      tier: this.ctx.getTier(),
      frames: n,
      particles: this.smoke.alive,
      updateMs,
      drawMs,
      drawWithoutSmokeMs,
      drawSmokeMirroredMs: reflected ? drawMs : otherMs,
      drawSmokeNotMirroredMs: reflected ? otherMs : drawMs,
    };
  }

  /** Puts the smoke in the wet ground's mirror image, or keeps it out (the ground layer is hidden there). */
  private setSmokeReflected(on: boolean): void {
    this.smokeReflected = on;
    const layer = this.ctx.groundLayer;
    const at = layer.indexOf(this.smoke.mesh);
    if (on && at >= 0) layer.splice(at, 1);
    else if (!on && at < 0) layer.push(this.smoke.mesh);
  }

  private react(event: SimEvent): void {
    const controls = this.controls;
    switch (event.type) {
      case 'throttle:on':
        controls.hideHint();
        break;
      case 'pop':
        controls.setMode('pit');
        controls.announce('Tyres popped');
        this.smoke.burst(this.rearZ, this.halfTrack);
        this.debris.burst(this.rearZ, this.halfTrack, this.rearHubY, this.random);
        break;
      case 'pitstop:start':
        controls.setMode('busy');
        break;
      case 'wheel:off':
        // the old wheels go, and the shards with them
        this.debris.clear();
        break;
      case 'pitstop:end':
        // (an instant stop has no wheel:off, so the shards go here)
        this.debris.clear();
        controls.setMode('rev');
        controls.announce('Back on fresh tyres');
        this.timerLeft = LOOK.TIMER_STAYS;
        // an instant stop (reduced motion) has no landing to bounce from
        this.landTime = this.snap.pit.time > 0 ? 0 : 10;
        break;
      default:
        break;
    }
  }

  /** Writes the current state onto the scene. Split up so each part stays small and simple. */
  private apply(): void {
    const s = this.snap;
    const blur = this.warm ? 1 : smoothstep(LOOK.BLUR_START, LOOK.BLUR_FULL, s.wheelSpeed);
    this.applyRearWheels(s, blur);
    this.applyEffects();
    this.applyPitStop(s.pit, blur);
    this.applyBody(s);
    this.applyLights(s);

    const rpm = clamp01(s.rpmNorm);
    this.ctx.rig.setShake(this.ctx.getReducedMotion() ? 0 : LOOK.CAMERA_SHAKE * rpm * this.throttle);
    this.controls.setRev(s.state === 'popped' || s.state === 'pitstop' ? 1 : s.rpmNorm);
    this.controls.setTimer(s.pit.time, s.pit.active || this.timerLeft > 0);
  }

  /** Spin, the blur disc, the smear, the heat glow and the flat-tyre squash. */
  private applyRearWheels(s: SimSnapshot, blur: number): void {
    const angle = this.wheelAngle;
    (this.wheelNodes[2] as Object3D).rotation.x = angle;
    (this.wheelNodes[3] as Object3D).rotation.x = angle;
    (this.rotorNodes[2] as Object3D).rotation.x = angle;
    (this.rotorNodes[3] as Object3D).rotation.x = angle;
    this.blurMaterial.opacity = blur * LOOK.BLUR_OPACITY;
    for (let i = 0; i < this.blurDiscs.length; i++) (this.blurDiscs[i] as Mesh).visible = blur > 0.01;
    this.smear.value = blur * LOOK.SMEAR;

    // heat: a rust glow on the tread that dies quickly once the tyre has let go
    const hot = smoothstep(LOOK.HEAT_VISIBLE, 1, s.heat);
    const glow = hot * hot * (s.flat ? Math.max(0, 1 - s.popTime / 0.7) : 1);
    for (let i = 0; i < this.hotTyres.length; i++) {
      (this.hotTyres[i] as MeshStandardMaterial).emissiveIntensity = LOOK.HEAT_GLOW * glow;
    }

    // Flat tyres are squashed about the hub, in the hub's frame (the wheel may have stopped at any
    // angle). One hanging in the air on the jacks is less squashed than one carrying the car.
    const lifted = s.pit.active ? easeOutCubic(s.pit.lift) : 0;
    const flat = s.flat ? popEase(s.popTime) * (1 - 0.5 * lifted) : 0;
    for (let i = 0; i < this.rearTyres.length; i++) {
      const tyre = this.rearTyres[i] as Mesh;
      tyre.matrix.compose(this.rearTyrePos[i] as Vector3, this.noRotation, this.rearTyreScale[i] as Vector3);
      if (flat !== 0) {
        this.mA.makeRotationX(-angle);
        this.mB.makeScale(1 + LOOK.FLAT_WIDEN * flat, 1 - (1 - this.flatHeight) * flat, 1 + 0.03 * flat);
        this.mC.makeRotationX(angle);
        tyre.matrix.premultiply(this.mC).premultiply(this.mB).premultiply(this.mA);
      }
      tyre.matrixWorldNeedsUpdate = true;
    }
  }

  /** Smoke, shards and the rubber on the track. */
  private applyEffects(): void {
    this.smoke.setCap(SMOKE.CAP[this.ctx.getTier()]);
    this.smoke.write(this.ctx.camera.position);
    this.debris.write();
    const rubber = this.warm ? 0.01 : this.rubber * LOOK.RUBBER_MAX;
    this.rubberMaterial.opacity = rubber;
    for (let i = 0; i < this.rubberMeshes.length; i++) (this.rubberMeshes[i] as Mesh).visible = rubber > 0.004;
  }

  /** The pit stop's wheels and nuts (and every wheel part's opacity, which the blur also touches). */
  private applyPitStop(pit: SimSnapshot['pit'], blur: number): void {
    let fade = 1;
    if (pit.active) {
      let off = 0;
      let on = 0;
      for (let i = 0; i < 4; i++) {
        off += (pit.wheelsOff[i] as number) / 4;
        on += (pit.wheelsOn[i] as number) / 4;
      }
      fade = on > 0 ? smoothstep(0, 0.8, on) : 1 - smoothstep(0.2, 1, off);
    }
    for (let i = 0; i < this.wheelMaterials.length; i++) {
      const m = this.wheelMaterials[i] as MeshStandardMaterial;
      m.opacity = fade * (this.rearSpin.has(m) ? 1 - blur * LOOK.RIM_FADE : 1);
    }

    for (let i = 0; i < 4; i++) {
      const wheel = this.wheelNodes[i] as Object3D;
      const nut = this.nutNodes[i] as Object3D;
      const base = this.nutBase[i] as Vector3;
      const scale = this.nutScale[i] as number;
      const side = this.wheelSide[i] as number;
      nut.position.copy(base);

      if (!pit.active) {
        wheel.position.x = 0;
        wheel.visible = true;
        nut.rotation.x = 0;
        nut.scale.setScalar(scale);
        nut.visible = true;
        continue;
      }

      const wheelOff = pit.wheelsOff[i] as number;
      const wheelOn = pit.wheelsOn[i] as number;
      const nutOff = pit.nutsOff[i] as number;
      const nutOn = pit.nutsOn[i] as number;

      if (wheelOn > 0) wheel.position.x = side * LOOK.WHEEL_SLIDE * (1 - easeOutCubic(wheelOn));
      else wheel.position.x = side * LOOK.WHEEL_SLIDE * easeInCubic(wheelOff);
      wheel.visible = wheelOn > 0 || wheelOff < 1;

      if (nutOn > 0) {
        // back on: slides in while it spins the other way
        nut.position.x += side * LOOK.NUT_SLIDE * (1 - easeOutCubic(nutOn));
        nut.rotation.x = -side * (1 - nutOn) * LOOK.NUT_TURNS * TAU;
        nut.scale.setScalar(scale);
        nut.visible = true;
      } else if (wheelOff > 0 || nutOff >= 1) {
        nut.visible = false;
      } else {
        // undone: spins out along the axle, then drops away and shrinks to nothing
        const out = Math.min(1, nutOff / 0.65);
        const fall = Math.max(0, (nutOff - 0.65) / 0.35);
        const angle = wheel.rotation.x;
        nut.position.x += side * LOOK.NUT_SLIDE * easeOutCubic(out);
        // "down" seen from inside a wheel that stopped at any angle
        nut.position.y -= Math.cos(angle) * 0.3 * fall * fall;
        nut.position.z += Math.sin(angle) * 0.3 * fall * fall;
        nut.rotation.x = side * nutOff * LOOK.NUT_TURNS * TAU;
        nut.scale.setScalar(scale * (1 - fall));
        nut.visible = true;
      }
    }
  }

  /** Squat, nose lift, shake, yaw wiggle, the flat-tyre sag and the jacks. */
  private applyBody(s: SimSnapshot): void {
    const pit = s.pit;
    const calm = this.ctx.getReducedMotion();
    const rpm = clamp01(s.rpmNorm);
    const t = this.clock;

    // Whole car, wheels included: the jacks, and the rear sitting down on flat tyres. The jack lifts the
    // rear out of that sag, so the car is level before the wheels come off and nothing jumps when the
    // fresh ones arrive.
    const lifted = pit.active ? easeOutCubic(pit.lift) : 0;
    const jack = pit.active ? LOOK.JACK_LIFT * (lifted - easeInQuad(pit.drop)) : 0;
    const sag = s.flat ? popEase(s.popTime) * (1 - lifted) : 0;
    const carFront = jack;
    const carRear = jack - LOOK.POP_DROP * sag;
    // suspension (the wheels stay on the ground): squat, nose lift, and the bounce after landing
    const land =
      this.landTime < 0.8 && !calm
        ? -LOOK.LAND_BOUNCE * Math.exp(-this.landTime / 0.11) * Math.sin(TAU * 3.8 * this.landTime) * 1.6
        : 0;
    const susFront = LOOK.NOSE_LIFT * this.throttle + land;
    const susRear = -LOOK.SQUAT_REAR * this.throttle + land;
    // shake and wiggle grow with the revs; none of it with reduced motion
    const buzz = calm || pit.active ? 0 : 0.12 + 0.88 * rpm;
    const shake = buzz * LOOK.SHAKE * (Math.sin(t * 201) * 0.6 + Math.sin(t * 317 + 1.3) * 0.4);
    const roll = buzz * LOOK.SHAKE_ROLL * (Math.sin(t * 173 + 0.7) * 0.6 + Math.sin(t * 291) * 0.4);
    const wiggle = calm
      ? 0
      : clamp01(s.wheelNorm) * LOOK.YAW_WIGGLE * (Math.sin(t * 4.1) * 0.65 + Math.sin(t * 6.7 + 2) * 0.35);

    const frontDy = carFront + susFront + shake;
    const rearDy = carRear + susRear + shake;
    const pitch = (rearDy - frontDy) / this.wheelbase;
    const root = this.ctx.car.root;
    root.rotation.set(pitch, wiggle, roll);
    // pitch and yaw both pivot on the front axle: the fronts are held on the brakes
    root.position.set(-this.frontZ * Math.sin(wiggle), frontDy + pitch * this.frontZ, 0);
    for (let i = 0; i < 4; i++) {
      (this.hubNodes[i] as Object3D).position.y =
        (this.hubBaseY[i] as number) - (this.wheelFront[i] ? susFront : susRear);
    }
  }

  /** The rev LEDs, the start-light pods and the glow they throw on the car. */
  private applyLights(s: SimSnapshot): void {
    if (this.led) {
      const blink = s.limiter && Math.sin(this.clock * TAU * 11) < 0;
      this.led.emissiveIntensity = blink ? 0 : LOOK.LED_GLOW * smoothstep(0.05, 0.85, clamp01(s.rpmNorm));
    }
    const shown = s.green ? -1 : s.lights;
    if (shown === this.lightsShown) return;
    this.lightsShown = shown;
    const pods = this.ctx.startLights;
    this.gantryGlow.color.copy(shown < 0 ? this.lightGreen : this.lightRed).multiplyScalar(1 / LOOK.LIGHT_GLOW);
    this.gantryGlow.intensity = (LOOK.GANTRY_GLOW * (shown < 0 ? pods.length : shown)) / Math.max(1, pods.length);
    for (let i = 0; i < pods.length; i++) {
      const material = pods[i]?.material;
      if (!material || Array.isArray(material) || !('color' in material)) continue;
      (material.color as Color).copy(shown < 0 ? this.lightGreen : i < shown ? this.lightRed : this.lightDark);
    }
  }
}
