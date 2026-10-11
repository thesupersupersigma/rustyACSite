// Planar reflection for the wet ground: the scene drawn once more from a camera mirrored about
// y = 0, into a small render target that the ground shader samples. Same maths as three's
// Reflector (mirrored camera + oblique near plane), without the mesh.
import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';

const UP = new Vector3(0, 1, 0);
const ORIGIN = new Vector3(0, 0, 0);
/** Pushes the clip plane a hair below the ground so the mirror image has no gap at the contact line. */
const CLIP_BIAS = 0.003;

export class PlanarReflection {
  readonly target: WebGLRenderTarget;
  /** World position to reflection UV; shared with the ground shader as a uniform value. */
  readonly matrix: Matrix4;

  private readonly camera = new PerspectiveCamera();
  private readonly camPos = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly rotation = new Matrix4();
  private readonly plane = new Plane();
  private readonly clip = new Vector4();
  private readonly q = new Vector4();
  private readonly hidden: boolean[] = [];

  constructor(matrix: Matrix4) {
    this.matrix = matrix;
    this.target = new WebGLRenderTarget(4, 4, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
    this.camera.matrixAutoUpdate = true;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(4, Math.floor(width));
    const h = Math.max(4, Math.floor(height));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
  }

  /** Renders the mirror image. `hide` lists the objects lying on the ground. */
  render(renderer: WebGLRenderer, scene: Scene, main: PerspectiveCamera, hide: readonly Object3D[]): void {
    const { camera, camPos, lookAt, rotation, plane, clip, q } = this;

    camPos.setFromMatrixPosition(main.matrixWorld);
    if (camPos.y <= 0.01) return; // the camera never goes below the ground; nothing to mirror

    rotation.extractRotation(main.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camPos);

    // mirror position, target and up vector about y = 0
    camera.position.set(camPos.x, -camPos.y, camPos.z);
    lookAt.y = -lookAt.y;
    camera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(UP);
    camera.lookAt(lookAt);
    camera.near = main.near;
    camera.far = main.far;
    camera.updateMatrixWorld();
    camera.projectionMatrix.copy(main.projectionMatrix);
    camera.projectionMatrixInverse.copy(main.projectionMatrixInverse);

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(camera.projectionMatrix);
    this.matrix.multiply(camera.matrixWorldInverse);

    // Oblique near plane (Lengyel): clip everything below the ground out of the mirror image.
    plane.setFromNormalAndCoplanarPoint(UP, ORIGIN);
    plane.applyMatrix4(camera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = camera.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + (p[8] ?? 0)) / (p[0] ?? 1);
    q.y = (Math.sign(clip.y) + (p[9] ?? 0)) / (p[5] ?? 1);
    q.z = -1;
    q.w = (1 + (p[10] ?? 0)) / (p[14] ?? 1);
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1 - CLIP_BIAS;
    p[14] = clip.w;

    for (let i = 0; i < hide.length; i++) {
      const o = hide[i];
      if (!o) continue;
      this.hidden[i] = o.visible;
      o.visible = false;
    }

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);

    for (let i = 0; i < hide.length; i++) {
      const o = hide[i];
      if (o) o.visible = this.hidden[i] ?? true;
    }
  }

  dispose(): void {
    this.target.dispose();
  }
}
