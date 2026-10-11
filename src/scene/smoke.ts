// Tyre smoke: soft camera-facing sprites, all in one instanced draw call. Alpha-blended, no depth
// write, sorted back to front on the CPU, faked lighting from the floodlight's direction, and a soft
// fade where a puff meets the ground. The particle state lives in flat typed arrays and nothing is
// allocated after the constructor. A seeded random generator keeps the cloud repeatable for the
// check screenshots.
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Tier } from './types';

export const SMOKE = {
  /** Most particles alive at once, per quality tier. */
  CAP: { high: 450, mid: 260, low: 120 } as Record<Tier, number>,
  /** Seconds a puff lives (picked at random between the two). */
  LIFE_MIN: 6,
  LIFE_MAX: 10,
  /** Seconds of flat-out smoking that would emit a whole cap of puffs. Lower = the cloud builds faster. */
  FILL_SECONDS: 6,
  /** Metres per second a puff leaves the tyre with at full wheelspin: backwards, upwards, sideways spread. */
  SPEED_BACK: 4.6,
  SPEED_UP: 1.1,
  SPREAD: 1.0,
  /** How fast a puff loses that speed (per second). Higher keeps the cloud closer to the car. */
  DRAG: 1.15,
  /** Metres per second the cloud keeps rising, and drifts with the air (x, z). */
  RISE: 0.2,
  DRIFT_X: 0.16,
  DRIFT_Z: 0.12,
  /** Share of puffs that roll forward around the rear of the car instead of shooting back. */
  WRAP: 0.28,
  /** Metres across when a puff is born and when it is old. */
  SIZE_START: 0.5,
  SIZE_END: 4.2,
  /** Opacity of one fresh puff. The cloud gets its density from overlap. */
  OPACITY: 0.2,
  /** How fast puffs turn, radians per second at most. */
  SPIN: 0.45,
  /** Smoke colour under the floodlights (linear RGB) and its warm tint near the pit side. */
  COOL: [0.72, 0.77, 0.86] as const,
  WARM: [1.0, 0.7, 0.44] as const,
  WARMTH: 0.4,
  /** Brightness of the unlit and the floodlit side of a puff. */
  AMBIENT: 0.2,
  KEY: 0.52,
  /** Share of the particle cap spent on the burst when the tyres pop. */
  POP_BURST: 0.16,
  /** Draw the smoke in the wet ground's mirror image too. */
  IN_REFLECTION: true,
};

const MAX = 450;
const FLOATS = 4;

const VERTEX = /* glsl */ `
attribute vec4 aCenter; // world position, size
attribute vec4 aLook;   // rotation, alpha, unused, unused
uniform vec3 uKeyDir;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform float uWarmth;
varying vec2 vUv;
varying vec2 vTurn;
varying float vAlpha;
varying float vSoft;
varying float vDist;
varying vec3 vTint;
varying vec3 vLight;
void main() {
  vec2 corner = position.xy;
  vTurn = vec2( cos( aLook.x ), sin( aLook.x ) );
  vec2 turned = vec2( vTurn.x * corner.x - vTurn.y * corner.y, vTurn.y * corner.x + vTurn.x * corner.y ) * aCenter.w;
  vec4 mv = viewMatrix * vec4( aCenter.xyz, 1.0 );
  mv.xy += turned;
  gl_Position = projectionMatrix * mv;
  vUv = corner + 0.5;
  vAlpha = aLook.y;
  vDist = length( mv.xyz );
  // height of this corner above the ground, in units of the fade distance
  float worldY = aCenter.y + viewMatrix[1][0] * turned.x + viewMatrix[1][1] * turned.y;
  vSoft = worldY / ( 0.22 * aCenter.w );
  // cool under the floodlights, warmer low down on the pit side (-x), where the garages glow
  float warm = smoothstep( 1.5, -8.0, aCenter.x ) * smoothstep( 5.0, 0.3, aCenter.y ) * uWarmth;
  vTint = mix( uCool, uWarm, warm );
  vLight = normalize( ( viewMatrix * vec4( uKeyDir, 0.0 ) ).xyz );
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAmbient;
uniform float uKey;
varying vec2 vUv;
varying vec2 vTurn;
varying float vAlpha;
varying float vSoft;
varying float vDist;
varying vec3 vTint;
varying vec3 vLight;
void main() {
  float alpha = texture2D( uMap, vUv ).r * vAlpha * smoothstep( 0.0, 1.0, vSoft );
  if ( alpha < 0.002 ) discard;
  // treat the puff as a ball: a normal from where we are on the sprite, turned with it
  vec2 q = ( vUv - 0.5 ) * 2.0;
  vec2 n2 = vec2( vTurn.x * q.x - vTurn.y * q.y, vTurn.y * q.x + vTurn.x * q.y );
  vec3 normal = vec3( n2, sqrt( max( 0.0, 1.0 - dot( n2, n2 ) ) ) );
  float lit = 0.5 + 0.5 * dot( normal, vLight );
  vec3 color = vTint * ( uAmbient + uKey * lit * lit );
  float fog = 1.0 - exp( -uFogDensity * uFogDensity * vDist * vDist );
  gl_FragColor = vec4( mix( color, uFogColor, fog ), alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Small, fast, seedable random numbers (mulberry32). */
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

/** A lumpy soft puff: a dozen blurred blobs inside a circle that fades to nothing at the edge. */
function makePuffTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const random = makeRandom(7);
    const c = size / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const blob = (x: number, y: number, r: number, strength: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${strength})`);
      g.addColorStop(0.5, `rgba(255,255,255,${strength * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    };
    blob(c, c, c * 0.95, 0.5);
    for (let i = 0; i < 14; i++) {
      const angle = random() * Math.PI * 2;
      const reach = random() * c * 0.5;
      blob(c + Math.cos(angle) * reach, c + Math.sin(angle) * reach, c * (0.22 + random() * 0.22), 0.16 + random() * 0.14);
    }
    // nothing may touch the edge of the quad
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(c, c, c * 0.45, c, c, c * 0.98);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
    // destination-in left the outside transparent; the shader reads red, so flatten onto black
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export interface SmokeOptions {
  fogColor: Color;
  fogDensity: number;
  /** World position of the floodlight that lights the car; the smoke is shaded as if lit from there. */
  keyLight: Vector3;
}

export class Smoke {
  readonly mesh: Mesh;
  /** Particles alive right now. */
  alive = 0;

  private cap = SMOKE.CAP.mid;
  private emitDebt = 0;
  private side = 1;
  private readonly random = makeRandom(2004);

  private readonly px = new Float32Array(MAX);
  private readonly py = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly vz = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly sizeFrom = new Float32Array(MAX);
  private readonly sizeTo = new Float32Array(MAX);
  private readonly turn = new Float32Array(MAX);
  private readonly spin = new Float32Array(MAX);
  private readonly strength = new Float32Array(MAX);
  private readonly depth = new Float32Array(MAX);
  private readonly order = new Uint16Array(MAX);

  private readonly centers: InstancedBufferAttribute;
  private readonly looks: InstancedBufferAttribute;
  private readonly geometry: InstancedBufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly texture: CanvasTexture;

  constructor(options: SmokeOptions) {
    // an octagon around the round puff instead of a square: a sixth less to fill for the same picture
    const shape = new CircleGeometry(0.5 / Math.cos(Math.PI / 8), 8);
    const geometry = new InstancedBufferGeometry();
    geometry.index = shape.index;
    geometry.setAttribute('position', shape.getAttribute('position'));
    this.centers = new InstancedBufferAttribute(new Float32Array(MAX * FLOATS), FLOATS);
    this.looks = new InstancedBufferAttribute(new Float32Array(MAX * FLOATS), FLOATS);
    this.centers.setUsage(DynamicDrawUsage);
    this.looks.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aCenter', this.centers);
    geometry.setAttribute('aLook', this.looks);
    geometry.instanceCount = 0;
    this.geometry = geometry;

    this.texture = makePuffTexture();
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: this.texture },
        uFogColor: { value: options.fogColor.clone() },
        uFogDensity: { value: options.fogDensity },
        uKeyDir: { value: options.keyLight.clone().sub(new Vector3(0, 1, -3)).normalize() },
        uCool: { value: new Color(...SMOKE.COOL) },
        uWarm: { value: new Color(...SMOKE.WARM) },
        uWarmth: { value: SMOKE.WARMTH },
        uAmbient: { value: SMOKE.AMBIENT },
        uKey: { value: SMOKE.KEY },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'tyre_smoke';
    this.mesh.frustumCulled = false;
    // after everything else that is see-through (wheels, blur discs, ground decals)
    this.mesh.renderOrder = 10;
  }

  /** The cap follows the quality tier live; going down drops the oldest puffs first. */
  setCap(cap: number): void {
    const next = Math.max(0, Math.min(MAX, Math.floor(cap)));
    if (next === this.cap) return;
    this.cap = next;
    while (this.alive > next) this.kill(this.oldest());
  }

  /**
   * Advances the cloud by `dt` seconds. `rate` (0 to 1) is how hard the rear tyres smoke and `drive`
   * (0 to 1) how fast they turn; `rearZ` and `halfTrack` place the two contact patches.
   */
  step(dt: number, rate: number, drive: number, rearZ: number, halfTrack: number): void {
    if (dt <= 0) return;

    // ---- emit: a cap's worth of puffs every FILL_SECONDS at rate 1 -----------------------------------
    if (rate > 0 && this.cap > 0) {
      this.emitDebt += (rate * dt * this.cap) / SMOKE.FILL_SECONDS;
      while (this.emitDebt >= 1) {
        this.emitDebt -= 1;
        this.side = -this.side;
        this.puff(this.side * halfTrack, rearZ, drive, false);
      }
    } else {
      this.emitDebt = 0;
    }

    // ---- move --------------------------------------------------------------------------------------
    const keep = Math.exp(-SMOKE.DRAG * dt);
    const { px, py, pz, vx, vy, vz, age, life, turn, spin } = this;
    for (let i = this.alive - 1; i >= 0; i--) {
      const a = (age[i] ?? 0) + dt;
      if (a >= (life[i] ?? 0)) {
        this.kill(i);
        continue;
      }
      age[i] = a;
      // a slow wobble so the puffs do not travel in straight lines
      const phase = (turn[i] ?? 0) * 3 + a * 0.9;
      vx[i] = (vx[i] ?? 0) * keep + Math.sin(phase) * 0.12 * dt;
      vy[i] = (vy[i] ?? 0) * keep;
      vz[i] = (vz[i] ?? 0) * keep + Math.cos(phase * 1.3) * 0.1 * dt;
      px[i] = (px[i] ?? 0) + ((vx[i] ?? 0) + SMOKE.DRIFT_X) * dt;
      py[i] = (py[i] ?? 0) + ((vy[i] ?? 0) + SMOKE.RISE) * dt;
      pz[i] = (pz[i] ?? 0) + ((vz[i] ?? 0) + SMOKE.DRIFT_Z) * dt;
      turn[i] = (turn[i] ?? 0) + (spin[i] ?? 0) * dt;
    }
  }

  /** The pop: a sharp ring of extra smoke around both rear tyres. */
  burst(rearZ: number, halfTrack: number): void {
    const count = Math.round(this.cap * SMOKE.POP_BURST);
    for (let i = 0; i < count; i++) {
      this.side = -this.side;
      this.puff(this.side * halfTrack, rearZ, 1, true);
    }
  }

  /** Sorts back to front for this camera and uploads the instances. Once per rendered frame. */
  write(camera: Vector3): void {
    const n = this.alive;
    const { px, py, pz, age, life, sizeFrom, sizeTo, turn, strength, depth, order } = this;
    for (let i = 0; i < n; i++) {
      const dx = (px[i] ?? 0) - camera.x;
      const dy = (py[i] ?? 0) - camera.y;
      const dz = (pz[i] ?? 0) - camera.z;
      depth[i] = dx * dx + dy * dy + dz * dz;
      order[i] = i;
    }
    // shell sort, farthest first: no allocation, and fast on a few hundred items
    for (let gap = n >> 1; gap > 0; gap = gap === 2 ? 1 : Math.floor(gap / 2.2)) {
      for (let i = gap; i < n; i++) {
        const item = order[i] ?? 0;
        const key = depth[item] ?? 0;
        let j = i;
        while (j >= gap && (depth[order[j - gap] ?? 0] ?? 0) < key) {
          order[j] = order[j - gap] ?? 0;
          j -= gap;
        }
        order[j] = item;
      }
    }

    const centers = this.centers.array as Float32Array;
    const looks = this.looks.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = order[k] ?? 0;
      const a = age[i] ?? 0;
      const t = a / (life[i] ?? 1);
      // grows fast at first, then slowly; fades in quickly and out over its whole life
      const grown = 1 - Math.exp(-a * 0.55);
      const size = (sizeFrom[i] ?? 0) + ((sizeTo[i] ?? 0) - (sizeFrom[i] ?? 0)) * grown;
      const fadeIn = a < 0.3 ? a / 0.3 : 1;
      const fadeOut = (1 - t) * (1 - t);
      const o = k * FLOATS;
      centers[o] = px[i] ?? 0;
      // a puff never sinks into the tarmac
      centers[o + 1] = Math.max(py[i] ?? 0, size * 0.2);
      centers[o + 2] = pz[i] ?? 0;
      centers[o + 3] = size;
      looks[o] = turn[i] ?? 0;
      looks[o + 1] = (strength[i] ?? 0) * fadeIn * fadeOut;
    }
    this.centers.clearUpdateRanges();
    this.looks.clearUpdateRanges();
    this.centers.addUpdateRange(0, n * FLOATS);
    this.looks.addUpdateRange(0, n * FLOATS);
    this.centers.needsUpdate = true;
    this.looks.needsUpdate = true;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  /** Draws one puff in front of the camera so the shader compiles before it is needed. */
  warm(on: boolean): void {
    if (on && this.alive === 0) {
      this.spawn(0, 1, 0, 0, 0, 0, 1, 1, 1, 0.001);
    } else if (!on) {
      this.alive = 0;
      this.emitDebt = 0;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private puff(x: number, rearZ: number, drive: number, burst: boolean): void {
    const r = this.random;
    const outward = Math.sign(x) || 1;
    let vx: number;
    let vy: number;
    let vz: number;
    let size = SMOKE.SIZE_START * (0.7 + r() * 0.6);
    let strength = SMOKE.OPACITY * (0.75 + r() * 0.5);
    if (burst) {
      // a ring thrown out from the tyre in every direction
      const angle = r() * Math.PI * 2;
      const speed = 2.5 + r() * 4.5;
      vx = Math.cos(angle) * speed * 0.7 + outward * 1.2;
      vz = Math.sin(angle) * speed * 0.7 - 0.6;
      vy = 0.8 + r() * 3.2;
      size *= 1.5;
      strength *= 1.5;
    } else if (r() < SMOKE.WRAP) {
      // rolls out sideways and forward around the tyre: this is what wraps the cloud around the car
      vx = outward * (0.3 + r() * 1.4) * SMOKE.SPREAD + (r() - 0.5) * 0.8;
      vz = (0.9 - r() * 1.6) * (0.4 + 0.6 * drive);
      vy = SMOKE.SPEED_UP * (0.6 + r() * 1.3);
    } else {
      const back = SMOKE.SPEED_BACK * (0.3 + 0.7 * drive) * (0.45 + r() * 0.85);
      vx = (r() - 0.5) * 2 * SMOKE.SPREAD + outward * 0.25;
      vz = -back;
      vy = SMOKE.SPEED_UP * r() * (0.4 + 0.6 * drive);
    }
    this.spawn(
      x + (r() - 0.5) * 0.3,
      0.08 + r() * 0.16,
      rearZ - 0.22 - r() * 0.25,
      vx,
      vy,
      vz,
      SMOKE.LIFE_MIN + r() * (SMOKE.LIFE_MAX - SMOKE.LIFE_MIN),
      size,
      SMOKE.SIZE_END * (0.7 + r() * 0.6),
      strength,
    );
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    sizeFrom: number,
    sizeTo: number,
    strength: number,
  ): void {
    if (this.cap <= 0) return;
    // full: the oldest puff is the most faded one, so it makes room
    if (this.alive >= this.cap) this.kill(this.oldest());
    const i = this.alive++;
    const r = this.random;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.sizeFrom[i] = sizeFrom;
    this.sizeTo[i] = sizeTo;
    this.turn[i] = r() * Math.PI * 2;
    this.spin[i] = (r() - 0.5) * 2 * SMOKE.SPIN;
    this.strength[i] = strength;
  }

  /** Index of the puff closest to the end of its life. */
  private oldest(): number {
    let best = 0;
    let most = -1;
    for (let i = 0; i < this.alive; i++) {
      const t = (this.age[i] ?? 0) / (this.life[i] ?? 1);
      if (t > most) {
        most = t;
        best = i;
      }
    }
    return best;
  }

  /** Removes a puff by moving the last one into its slot. */
  private kill(i: number): void {
    const last = --this.alive;
    if (i === last || last < 0) return;
    this.px[i] = this.px[last] ?? 0;
    this.py[i] = this.py[last] ?? 0;
    this.pz[i] = this.pz[last] ?? 0;
    this.vx[i] = this.vx[last] ?? 0;
    this.vy[i] = this.vy[last] ?? 0;
    this.vz[i] = this.vz[last] ?? 0;
    this.age[i] = this.age[last] ?? 0;
    this.life[i] = this.life[last] ?? 0;
    this.sizeFrom[i] = this.sizeFrom[last] ?? 0;
    this.sizeTo[i] = this.sizeTo[last] ?? 0;
    this.turn[i] = this.turn[last] ?? 0;
    this.spin[i] = this.spin[last] ?? 0;
    this.strength[i] = this.strength[last] ?? 0;
  }
}
