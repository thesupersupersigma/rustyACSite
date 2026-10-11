// Wet-road light streaks: one additive quad per light, laid on the ground at the point where the
// light would mirror toward the camera and stretched along the line of sight. All of them are one
// instanced mesh (one draw call); only the instance matrices and colours change per frame.
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';
import type { TrackInfo } from './assets';
import { PUDDLE_TILING, type Track } from './track';

interface StreakLight {
  x: number;
  y: number;
  z: number;
  color: Color;
  /** Relative brightness of this kind of light. */
  power: number;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vColor = instanceColor;
  vec4 world = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uPuddle;
uniform vec3 uGroundU;
uniform vec3 uGroundV;
uniform float uFogDensity;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  // soft across, long along the line of sight, fading out at both ends
  float shape = exp( -c.x * c.x * 3.2 ) * pow( max( 0.0, 1.0 - c.y * c.y ), 2.0 );
  vec2 groundUv = vec2(
    dot( uGroundU.xy, vWorld.xz ) + uGroundU.z,
    dot( uGroundV.xy, vWorld.xz ) + uGroundV.z
  );
  float puddle = texture2D( uPuddle, groundUv * ${PUDDLE_TILING.toFixed(2)} ).r;
  // a second, finer look at the same mask breaks the streak up like uneven tarmac does
  float broken = texture2D( uPuddle, groundUv * 1.9 + 0.37 ).r;
  float wet = mix( 0.22, 1.0, puddle ) * ( 0.55 + 0.6 * broken );
  float dist = length( cameraPosition - vWorld );
  float fog = exp( -uFogDensity * uFogDensity * dist * dist );
  gl_FragColor = vec4( vColor * shape * wet * fog, 1.0 );
  // no-ops when drawing into the post-processing target; needed when drawing straight to the canvas
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Streaks {
  readonly mesh: InstancedMesh;

  private readonly lights: StreakLight[];
  private readonly material: ShaderMaterial;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly color = new Color();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor(info: TrackInfo, track: Track, puddle: Texture, fogDensity: number) {
    this.lights = [
      ...info.floodlights.map((f) => ({
        x: f.pos[0],
        y: f.pos[1],
        z: f.pos[2],
        color: new Color(...f.color),
        power: 1,
      })),
      ...info.garage_lights.map((g) => ({
        x: g.pos[0],
        y: g.pos[1],
        z: g.pos[2],
        color: new Color(...g.color),
        power: 0.22,
      })),
    ];

    // a unit quad lying on the ground: x across, z along
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uPuddle: { value: puddle },
        uGroundU: { value: new Vector3(...track.groundUv.u) },
        uGroundV: { value: new Vector3(...track.groundUv.v) },
        uFogDensity: { value: fogDensity },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.mesh = new InstancedMesh(geometry, this.material, this.lights.length);
    this.mesh.name = 'light_streaks';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < this.lights.length; i++) this.mesh.setColorAt(i, this.color.setRGB(0, 0, 0));
    this.mesh.instanceColor?.setUsage(DynamicDrawUsage);
  }

  /** Re-lays every streak for the current camera position. */
  update(cameraPosition: Vector3): void {
    const { mesh, lights, matrix, position, scale, quaternion, color, yAxis } = this;
    const camY = Math.max(0.05, cameraPosition.y);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      if (!light) continue;
      // where the light mirrors toward the camera on the ground plane
      const t = camY / (camY + light.y);
      const px = cameraPosition.x + (light.x - cameraPosition.x) * t;
      const pz = cameraPosition.z + (light.z - cameraPosition.z) * t;
      const dx = px - cameraPosition.x;
      const dz = pz - cameraPosition.z;
      const ground = Math.hypot(dx, dz);
      const range = Math.hypot(ground, camY);

      // the lower the camera looks along the road, the longer the streak
      const length = Math.min(60, range * (1.2 + (2.2 * ground) / (camY + 0.5)));
      const width = Math.max(0.4, range * 0.17);
      position.set(px, 0.012, pz);
      quaternion.setFromAxisAngle(yAxis, Math.atan2(dx, dz));
      scale.set(width, 1, length);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);

      // fades out when the camera looks almost straight down at the mirror point
      const grazing = ground / (ground + camY * 3);
      const strength = light.power * 0.42 * grazing;
      mesh.setColorAt(i, color.copy(light.color).multiplyScalar(strength));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
