// The night track: lightmapped materials as in assets-src/preview/scene-test.html, plus the wet
// asphalt shader that mixes in the planar reflection.
import {
  Color,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Group,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { SceneAssets } from './assets';

/** Uniforms shared by every wet ground material. */
export interface WetUniforms {
  uReflection: { value: Texture | null };
  /** World position to reflection-texture UV (projective). */
  uReflMatrix: { value: Matrix4 };
  uPuddle: { value: Texture };
  /** Overall strength of the planar reflection. */
  uReflStrength: { value: number };
}

export interface Track {
  root: Group;
  /** Everything lying on y = 0, hidden while the mirror image is rendered. */
  groundObjects: Object3D[];
  startLights: Mesh[];
  wetMaterials: MeshStandardMaterial[];
  wetUniforms: WetUniforms;
  /** Maps world x/z to the ground's UV0, so other effects can sample the puddle mask in place. */
  groundUv: { u: [number, number, number]; v: [number, number, number] };
  /** Switches the ground between the planar reflection and the cheap env-map tint. */
  setPlanar(on: boolean, env: Texture | null): void;
}

const ASPHALT_TILING = 3;
/** The puddle mask repeats 0.35 times per UV0 unit (UV0 tiles every 4 m, so about every 11 m). */
export const PUDDLE_TILING = 0.35;
/** How strongly merely damp tarmac reflects compared with a puddle. */
const DAMP = 0.3;

const WET_VERTEX_HEAD = /* glsl */ `
uniform mat4 uReflMatrix;
varying vec4 vReflUv;
varying vec3 vWetWorld;
`;

const WET_VERTEX_BODY = /* glsl */ `
vec4 wetWorld = modelMatrix * vec4( transformed, 1.0 );
vWetWorld = wetWorld.xyz;
vReflUv = uReflMatrix * wetWorld;
`;

const WET_FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uPuddle;
uniform sampler2D uReflection;
uniform float uReflStrength;
varying vec4 vReflUv;
varying vec3 vWetWorld;
float wetPuddle = 0.0;
`;

// Runs right after three's own roughness lookup: puddles are mirror-smooth and a little darker.
const WET_FRAGMENT_SURFACE = /* glsl */ `
wetPuddle = texture2D( uPuddle, vMapUv * ${(PUDDLE_TILING / ASPHALT_TILING).toFixed(6)} ).r;
roughnessFactor = mix( roughnessFactor * 0.9, 0.03, wetPuddle );
diffuseColor.rgb *= mix( 1.0, 0.6, wetPuddle );
`;

// Runs after lighting: add the mirror image, by fresnel x wetness. Puddles get one sharp sample;
// damp tarmac gets a wobbly, blurred one (5 taps) at a fraction of the strength.
const WET_FRAGMENT_REFLECT = /* glsl */ `
#ifdef WET_PLANAR
{
  vec3 wetView = normalize( cameraPosition - vWetWorld );
  float wetFresnel = 0.04 + 0.96 * pow( 1.0 - clamp( wetView.y, 0.0, 1.0 ), 5.0 );
  float wetDry = 1.0 - wetPuddle;
  vec2 wetGrain = vec2(
    texture2D( roughnessMap, vRoughnessMapUv ).g,
    texture2D( roughnessMap, vRoughnessMapUv.yx * 1.37 + 0.31 ).g
  ) - 0.5;
  vec2 wetUv = vReflUv.xy / vReflUv.w + wetGrain * ( 0.006 + 0.034 * wetDry );
  vec2 wetBlur = vec2( 0.011, 0.02 ) * wetDry;
  vec3 wetImage = texture2D( uReflection, wetUv ).rgb * 0.4
    + texture2D( uReflection, wetUv + wetBlur ).rgb * 0.15
    + texture2D( uReflection, wetUv - wetBlur ).rgb * 0.15
    + texture2D( uReflection, wetUv + wetBlur * vec2( 1.0, -1.0 ) ).rgb * 0.15
    + texture2D( uReflection, wetUv - wetBlur * vec2( 1.0, -1.0 ) ).rgb * 0.15;
  outgoingLight += wetImage * wetFresnel * mix( ${DAMP.toFixed(2)}, 1.0, wetPuddle ) * uReflStrength;
}
#endif
`;

// The lightmaps already hold every floodlight, so the real-time lights (which exist for the car)
// must not light the track a second time.
const BAKED_ONLY = /* glsl */ `
#include <lights_fragment_end>
reflectedLight.directDiffuse = vec3( 0.0 );
reflectedLight.directSpecular = vec3( 0.0 );
`;

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Solves u = a*x + b*z + c (and the same for v) from three vertices of the ground mesh. */
function solveGroundUv(mesh: Mesh): Track['groundUv'] {
  const fallback: Track['groundUv'] = { u: [0.25, 0, 0], v: [0, 0.25, 0] };
  const pos = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  if (!pos || !uv || pos.count < 3) return fallback;
  mesh.updateWorldMatrix(true, false);
  const e = mesh.matrixWorld.elements;
  const worldXZ = (i: number): [number, number] => {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    return [
      (e[0] ?? 1) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0),
      (e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 1) * z + (e[14] ?? 0),
    ];
  };
  const [x0, z0] = worldXZ(0);
  // find two more vertices that span the plane well
  for (let i = 1; i < pos.count; i++) {
    for (let j = i + 1; j < pos.count; j++) {
      const [x1, z1] = worldXZ(i);
      const [x2, z2] = worldXZ(j);
      const det = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
      if (Math.abs(det) < 1) continue;
      const solve = (get: (k: number) => number): [number, number, number] => {
        const d1 = get(i) - get(0);
        const d2 = get(j) - get(0);
        const a = (d1 * (z2 - z0) - d2 * (z1 - z0)) / det;
        const b = (d2 * (x1 - x0) - d1 * (x2 - x0)) / det;
        return [a, b, get(0) - a * x0 - b * z0];
      };
      return { u: solve((k) => uv.getX(k)), v: solve((k) => uv.getY(k)) };
    }
  }
  return fallback;
}

export function setupTrack(assets: SceneAssets): Track {
  const { info, track: root, albedo, rough, puddle } = assets;

  albedo.repeat.set(ASPHALT_TILING, ASPHALT_TILING);
  rough.repeat.set(ASPHALT_TILING, ASPHALT_TILING);

  const wetUniforms: WetUniforms = {
    uReflection: { value: null },
    uReflMatrix: { value: new Matrix4() },
    uPuddle: { value: puddle },
    uReflStrength: { value: 1 },
  };

  const groundObjects: Object3D[] = [];
  const startLights: Mesh[] = [];
  const wetMaterials: MeshStandardMaterial[] = [];
  const done = new Set<Material>();
  let groundUv: Track['groundUv'] = { u: [0.25, 0, 0], v: [0, 0.25, 0] };
  let groundUvSolved = false;

  const glow = new MeshBasicMaterial({ color: new Color(1.0, 0.66, 0.38).multiplyScalar(0.9) });
  // far above 1.0 on purpose: the panels are what the bloom picks up
  const panels = new MeshBasicMaterial({ color: new Color(0.85, 0.9, 1).multiplyScalar(6) });

  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const name = o.name;

    if (name.startsWith('trk_garage_glow')) {
      materialsOf(o).forEach((m) => m.dispose());
      o.material = glow;
      return;
    }
    if (name.startsWith('trk_flood_panels')) {
      materialsOf(o).forEach((m) => m.dispose());
      o.material = panels;
      return;
    }
    if (name.startsWith('startlight')) {
      materialsOf(o).forEach((m) => m.dispose());
      // each pod gets its own material so task 02 can light them one by one
      o.material = new MeshBasicMaterial({ color: 0x220000 });
      startLights.push(o);
      return;
    }

    const key = Object.keys(info.lightmaps).find((k) => name.startsWith(k));
    const lm = key ? info.lightmaps[key] : undefined;
    if (!key || !lm) return;
    const lightMap = assets.lightmaps.get(lm.file);
    if (lightMap) lightMap.channel = lm.uv;

    if (key === 'trk_ground' && !groundUvSolved) {
      groundUv = solveGroundUv(o);
      groundUvSolved = true;
    }

    for (const m of materialsOf(o)) {
      if (!(m instanceof MeshStandardMaterial) || done.has(m)) continue;
      done.add(m);
      m.lightMap = lightMap ?? null;
      m.lightMapIntensity = lm.scale * Math.PI;
      m.envMapIntensity = 0;

      if (key === 'trk_ground' && /asphalt|pitlane/.test(m.name)) {
        m.map = albedo;
        m.color.setRGB(0.1, 0.1, 0.105);
        m.roughness = 0.18;
        m.roughnessMap = rough;
        m.metalness = 0;
        m.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, wetUniforms);
          shader.vertexShader = shader.vertexShader
            .replace('void main() {', `${WET_VERTEX_HEAD}\nvoid main() {`)
            .replace('#include <project_vertex>', `#include <project_vertex>\n${WET_VERTEX_BODY}`);
          shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', `${WET_FRAGMENT_HEAD}\nvoid main() {`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${WET_FRAGMENT_SURFACE}`)
            .replace('#include <lights_fragment_end>', BAKED_ONLY)
            .replace('#include <opaque_fragment>', `${WET_FRAGMENT_REFLECT}\n#include <opaque_fragment>`);
        };
        m.customProgramCacheKey = () => 'wet-ground';
        wetMaterials.push(m);
      } else {
        m.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', BAKED_ONLY);
        };
        m.customProgramCacheKey = () => 'baked-only';
      }
    }
  });

  for (const child of root.children) {
    if (child.name.startsWith('trk_ground') || child.name.startsWith('trk_lines')) groundObjects.push(child);
  }
  // keep the pods in file order: startlight_0 ... startlight_4
  startLights.sort((a, b) => a.name.localeCompare(b.name));

  const setPlanar = (on: boolean, env: Texture | null) => {
    for (const m of wetMaterials) {
      m.defines ??= {};
      if (on) m.defines['WET_PLANAR'] = '';
      else delete m.defines['WET_PLANAR'];
      // without the mirror image, a little of the baked environment stands in for it
      m.envMap = on ? null : env;
      m.envMapIntensity = on ? 0 : 0.22;
      m.needsUpdate = true;
    }
  };

  return { root, groundObjects, startLights, wetMaterials, wetUniforms, groundUv, setPlanar };
}
