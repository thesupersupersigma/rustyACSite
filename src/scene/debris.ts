// The rubber bits that fly off when the rear tyres pop: a handful of dark shards in one instanced
// mesh, thrown out, bounced once or twice and left lying on the tarmac until the pit stop.
import {
  BoxGeometry,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';

export const DEBRIS = {
  /** Shards per pop (both tyres together). */
  COUNT: 18,
  /** Metres: longest side of the smallest and the largest shard. */
  SIZE_MIN: 0.05,
  SIZE_MAX: 0.13,
  /** Metres per second they leave with. */
  SPEED: 6.5,
  GRAVITY: 9.8,
  /** Share of the speed kept after hitting the ground. */
  BOUNCE: 0.32,
};

const N = DEBRIS.COUNT;

export class Debris {
  readonly mesh: InstancedMesh;

  private active = false;
  private moving = false;
  private readonly p = new Float32Array(N * 3);
  private readonly v = new Float32Array(N * 3);
  /** Per shard: size, tumble angle, tumble speed. */
  private readonly look = new Float32Array(N * 3);

  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly euler = new Euler();
  private readonly material: MeshBasicMaterial;

  constructor() {
    // unlit on purpose: at night a rubber shard is a dark shape against the wet ground
    this.material = new MeshBasicMaterial({ color: 0x060606 });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 0.22, 0.55), this.material, N);
    this.mesh.name = 'tyre_debris';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Throws the shards out from the two rear tyres. `random` is the scene's seeded generator. */
  burst(rearZ: number, halfTrack: number, hubY: number, random: () => number): void {
    const { p, v, look } = this;
    for (let i = 0; i < N; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const angle = random() * Math.PI * 2;
      const speed = DEBRIS.SPEED * (0.35 + random() * 0.65);
      const o = i * 3;
      // start on the tyre's tread, fly off along the wheel's plane with a push outward
      p[o] = side * (halfTrack + (random() - 0.5) * 0.2);
      p[o + 1] = Math.max(0.05, hubY + Math.sin(angle) * 0.3);
      p[o + 2] = rearZ + Math.cos(angle) * 0.3;
      v[o] = side * (0.6 + random() * 2.6);
      v[o + 1] = Math.abs(Math.sin(angle)) * speed * 0.7 + 1.2;
      v[o + 2] = Math.cos(angle) * speed * 0.8 - 1;
      look[o] = DEBRIS.SIZE_MIN + random() * (DEBRIS.SIZE_MAX - DEBRIS.SIZE_MIN);
      look[o + 1] = random() * 6.28;
      look[o + 2] = (random() - 0.5) * 30;
    }
    this.active = true;
    this.moving = true;
    this.mesh.visible = true;
  }

  /** Sweeps the track (the pit stop does this when the old wheels come off). */
  clear(): void {
    this.active = false;
    this.moving = false;
    this.mesh.visible = false;
  }

  step(dt: number): void {
    if (!this.moving || dt <= 0) return;
    const { p, v, look } = this;
    let moving = false;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const rest = (look[o] ?? 0.05) * 0.12;
      let y = (p[o + 1] ?? 0) + (v[o + 1] ?? 0) * dt;
      let vy = (v[o + 1] ?? 0) - DEBRIS.GRAVITY * dt;
      let vx = v[o] ?? 0;
      let vz = v[o + 2] ?? 0;
      if (y <= rest) {
        y = rest;
        vy = Math.abs(vy) * DEBRIS.BOUNCE;
        vx *= 0.55;
        vz *= 0.55;
        look[o + 2] = (look[o + 2] ?? 0) * 0.4;
        if (vy < 0.5) {
          vy = 0;
          vx *= 0.2;
          vz *= 0.2;
        }
      }
      p[o] = (p[o] ?? 0) + vx * dt;
      p[o + 1] = y;
      p[o + 2] = (p[o + 2] ?? 0) + vz * dt;
      v[o] = vx;
      v[o + 1] = vy;
      v[o + 2] = vz;
      look[o + 1] = (look[o + 1] ?? 0) + (look[o + 2] ?? 0) * dt;
      if (y > rest + 0.001 || Math.abs(vy) > 0.01 || Math.abs(vx) + Math.abs(vz) > 0.05) moving = true;
    }
    this.moving = moving;
  }

  /** Uploads the shard transforms. Once per rendered frame while any are out. */
  write(): void {
    if (!this.active) return;
    const { p, look, matrix, position, scale, quaternion, euler, mesh } = this;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const size = look[o] ?? 0.05;
      const angle = look[o + 1] ?? 0;
      position.set(p[o] ?? 0, p[o + 1] ?? 0, p[o + 2] ?? 0);
      // lying flat once it has stopped tumbling
      const resting = (p[o + 1] ?? 0) <= size * 0.12 + 0.001;
      euler.set(resting ? 0 : angle, angle * 0.7 + i, resting ? 0 : angle * 1.3);
      quaternion.setFromEuler(euler);
      scale.setScalar(size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
