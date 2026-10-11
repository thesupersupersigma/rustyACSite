// The F2004 night scene. Loaded only through `import()` from F2004Scene.astro, so three.js never
// reaches visitors who don't get the scene.
//
// The burnout (hold to rev, smoke, pop, pit stop) lives in burnout.ts and is driven from the frame
// loop here. Task 03 hooks in through the object `createF2004Scene` resolves to (see F2004Scene in
// types.ts): `engine`, `events`, `getCar()`, `getStartLights()`, `onFrame(cb)` and `p`. Nothing
// here makes a sound.
import {
  ACESFilmicToneMapping,
  BackSide,
  CanvasTexture,
  Color,
  CubeCamera,
  FogExp2,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLCubeRenderTarget,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets, type FloodlightInfo } from './assets';
import { Burnout } from './burnout';
import { DebugOverlay } from './debug';
import { QualityGovernor, TIERS } from './quality';
import { PlanarReflection } from './reflection';
import { CameraRig } from './rig';
import { Streaks } from './streaks';
import { setupTrack } from './track';
import {
  WHEEL_IDS,
  type CarNodes,
  type F2004Scene,
  type FrameCallback,
  type FrameInfo,
  type SceneOptions,
  type Tier,
  type WheelId,
} from './types';

export type { CarNodes, F2004Scene, FrameCallback, FrameInfo, SceneOptions, Tier, WheelId } from './types';

const NIGHT = 0x05070d;
const FOG_DENSITY = 0.012;
const CAR_ENV_INTENSITY = 1.6;
const EXPOSURE = 1.3;
const DEG = Math.PI / 180;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// A faint glow low on the horizon, fading to the night colour overhead. No texture.
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float low = pow( 1.0 - abs( normalize( vDir ).y ), 7.0 );
  gl_FragColor = vec4( mix( uZenith, uHorizon, low ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function findCarNodes(car: Object3D): CarNodes {
  const root = car.getObjectByName('F2004') ?? car;
  const missing: string[] = [];
  const pick = (prefix: string): Record<WheelId, Object3D> => {
    const out = {} as Record<WheelId, Object3D>;
    for (const id of WHEEL_IDS) {
      const node = root.getObjectByName(`${prefix}_${id}`);
      if (!node) missing.push(`${prefix}_${id}`);
      // a stand-in keeps later code from crashing on a broken model; the error below says why
      out[id] = node ?? new Object3D();
    }
    return out;
  };
  const nodes: CarNodes = { root, hubs: pick('hub'), wheels: pick('wheel'), nuts: pick('nut') };
  if (missing.length > 0) {
    console.error(
      `[f2004] f2004.glb is missing ${missing.length} wheel node(s): ${missing.join(', ')}. ` +
        'The burnout and pit stop need hub_XX, wheel_XX and nut_XX for FL, FR, RL and RR. ' +
        'Re-export the model with --flatten false --join false (see brainstorm.md 1.19).',
    );
  }
  return nodes;
}

/** A soft dark blob for under the car: two stacked radial gradients, no hard edge. */
function makeContactShadow(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const blob = (radius: number, alpha: number) => {
      const g = ctx.createRadialGradient(64, 128, 0, 64, 128, radius);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 256);
    };
    // stretch the circle into the car's footprint
    ctx.translate(0, 128);
    ctx.scale(1, 2);
    ctx.translate(0, -128);
    blob(62, 0.5);
    blob(40, 0.5);
  }
  const texture = new CanvasTexture(canvas);
  const material = new MeshBasicMaterial({
    map: texture,
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(new PlaneGeometry(3.3, 6.6), material);
  mesh.name = 'contact_shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.008, -0.15);
  mesh.renderOrder = 1;
  return mesh;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach(disposeMaterial);
  });
}

function parseTier(value: string | null): Tier | undefined {
  return value === 'high' || value === 'mid' || value === 'low' ? value : undefined;
}

export async function createF2004Scene(options: SceneOptions): Promise<F2004Scene> {
  const { canvas } = options;

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(NIGHT, 1);
  // draw calls and triangles are summed over the reflection and main passes of one frame
  renderer.info.autoReset = false;

  const scene = new Scene();
  scene.background = new Color(NIGHT);
  scene.fog = new FogExp2(NIGHT, FOG_DENSITY);

  const camera = new PerspectiveCamera(38, 1.6, 0.2, 400);
  const rig = new CameraRig(camera, canvas, options.reducedMotion);

  // Everything that needs releasing registers here as it is created, so a failure halfway through
  // the setup cleans up exactly as much as dispose() does.
  const teardown: Array<() => void> = [() => renderer.dispose(), () => rig.dispose()];
  const runTeardown = () => {
    for (let i = teardown.length - 1; i >= 0; i--) {
      try {
        teardown[i]?.();
      } catch (err) {
        console.warn('[f2004] cleanup step failed', err);
      }
    }
    teardown.length = 0;
  };

  try {
    return await buildScene(options, renderer, scene, camera, rig, teardown, runTeardown);
  } catch (err) {
    runTeardown();
    throw err;
  }
}

async function buildScene(
  options: SceneOptions,
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  rig: CameraRig,
  teardown: Array<() => void>,
  runTeardown: () => void,
): Promise<F2004Scene> {
  const { canvas, container, section } = options;

  const assets = await loadAssets(options.assetVersion, options.onProgress);
  teardown.push(() => {
    for (const t of assets.lightmaps.values()) t.dispose();
    assets.albedo.dispose();
    assets.rough.dispose();
    assets.puddle.dispose();
    disposeTree(assets.track);
    disposeTree(assets.car);
  });

  // ---- track -------------------------------------------------------------------------------
  const track = setupTrack(assets);
  scene.add(track.root);

  const sky = new Mesh(
    new SphereGeometry(300, 24, 12),
    new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: { uZenith: { value: new Color(NIGHT) }, uHorizon: { value: new Color(0x0d1626) } },
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.name = 'sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  teardown.push(() => {
    sky.geometry.dispose();
    sky.material.dispose();
  });

  // ---- car ---------------------------------------------------------------------------------
  const carNodes = findCarNodes(assets.car);
  const carMaterials: MeshStandardMaterial[] = [];
  assets.car.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) {
      if (m instanceof MeshStandardMaterial && !carMaterials.includes(m)) carMaterials.push(m);
    }
  });
  scene.add(assets.car);

  // ---- environment map for the car: one cube capture of the track without the car ---------------
  // Done once at load (and again only if the browser hands back a lost WebGL context, because
  // the contents of a render target do not survive that).
  let envTarget: WebGLRenderTarget | undefined;
  const captureEnvironment = (hide: readonly Object3D[]): Texture => {
    const cubeTarget = new WebGLCubeRenderTarget(256, { type: HalfFloatType });
    const cubeCamera = new CubeCamera(0.1, 300, cubeTarget);
    cubeCamera.position.set(0, 0.6, 0);
    sky.position.copy(cubeCamera.position);
    const shown = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    scene.add(cubeCamera);
    cubeCamera.update(renderer, scene);
    scene.remove(cubeCamera);
    hide.forEach((o, i) => {
      o.visible = shown[i] ?? true;
    });
    const pmrem = new PMREMGenerator(renderer);
    envTarget?.dispose();
    const target = pmrem.fromCubemap(cubeTarget.texture);
    envTarget = target;
    cubeTarget.dispose();
    pmrem.dispose();
    for (const m of carMaterials) {
      m.envMap = target.texture;
      m.envMapIntensity = CAR_ENV_INTENSITY;
      m.needsUpdate = true;
    }
    return target.texture;
  };
  teardown.push(() => envTarget?.dispose());
  let environment = captureEnvironment([assets.car]);

  // The only real-time lights, and only the car needs them (the track is baked into lightmaps):
  // the floodlight aimed at the grid slot, the nearest floodlight on the grandstand side so the
  // car's other flank is not black, and a weak warm fill from the garages.
  const floodAt = (name: string) => assets.info.floodlights.find((f) => f.name === name);
  const spot = (
    flood: FloodlightInfo | undefined,
    fallback: [number, number, number],
    intensity: number,
    angleDeg: number,
  ) => {
    const light = new SpotLight(flood ? new Color(...flood.color) : 0xd9e6ff, intensity, 70, angleDeg * DEG, 0.6, 2);
    light.position.set(...(flood?.pos ?? fallback));
    light.target.position.set(0, 0, 0);
    scene.add(light, light.target);
    return light;
  };
  const key = spot(floodAt('flood_5') ?? assets.info.floodlights[0], [-20.8, 22.7, 0], 900, 30);
  const side = spot(floodAt('flood_1'), [16.8, 22.7, 20], 420, 24);
  const fill = new SpotLight(0xffb070, 110, 30, 0.8, 0.8, 2);
  fill.position.set(-9, 2.6, 1.5);
  fill.target.position.set(0, 0.4, 0);
  scene.add(fill, fill.target);
  teardown.push(() => {
    key.dispose();
    side.dispose();
    fill.dispose();
  });

  const shadow = makeContactShadow();
  scene.add(shadow);
  teardown.push(() => {
    shadow.geometry.dispose();
    if (!Array.isArray(shadow.material)) disposeMaterial(shadow.material);
  });

  // ---- wet tarmac ----------------------------------------------------------------------------
  const streaks = new Streaks(assets.info, track, assets.puddle, FOG_DENSITY);
  scene.add(streaks.mesh);
  teardown.push(() => streaks.dispose());

  const reflection = new PlanarReflection(track.wetUniforms.uReflMatrix.value);
  teardown.push(() => reflection.dispose());
  track.wetUniforms.uReflection.value = reflection.target.texture;
  /** Hidden while the mirror image is drawn: the ground itself and what is painted onto it. */
  const mirrorHidden: Object3D[] = [...track.groundObjects, shadow, streaks.mesh];

  // ---- post-processing and quality tiers ---------------------------------------------------------
  let composer: EffectComposer | undefined;
  let bloom: UnrealBloomPass | undefined;
  let output: OutputPass | undefined;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let planar = false;
  const bufferSize = new Vector2();

  const disposeComposer = () => {
    bloom?.dispose();
    output?.dispose();
    composer?.dispose();
    composer = undefined;
    bloom = undefined;
    output = undefined;
  };
  teardown.push(disposeComposer);

  const applySize = () => {
    const settings = TIERS[quality.tier];
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, settings.maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    rig.setAspect(width / height);
    renderer.getDrawingBufferSize(bufferSize);
    if (composer && bloom) {
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      bloom.setSize(bufferSize.x * settings.bloomScale, bufferSize.y * settings.bloomScale);
    }
    if (planar) reflection.setSize(bufferSize.x * settings.reflectionScale, bufferSize.y * settings.reflectionScale);
  };

  const applyTier = (tier: Tier) => {
    const settings = TIERS[tier];
    disposeComposer();
    if (settings.bloomScale > 0) {
      const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: settings.samples });
      composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new Vector2(4, 4), 0.35, 0.4, 0.9);
      output = new OutputPass();
      composer.addPass(bloom);
      composer.addPass(output);
    }
    planar = settings.reflectionScale > 0;
    track.setPlanar(planar, environment);
    if (!planar) reflection.setSize(4, 4);
    applySize();
  };

  const forced = options.debug ? parseTier(new URLSearchParams(location.search).get('tier')) : undefined;
  const quality = new QualityGovernor(applyTier, forced);
  applyTier(quality.tier);

  const debug = options.debug ? new DebugOverlay(container) : undefined;
  teardown.push(() => debug?.dispose());

  // ---- the burnout -------------------------------------------------------------------------------
  let reducedMotion = options.reducedMotion;
  const benchPixel = new Uint8Array(4);
  const burnout = new Burnout({
    scene,
    car: carNodes,
    carMaterials,
    startLights: track.startLights,
    rig,
    container,
    groundLayer: mirrorHidden,
    getTier: () => quality.tier,
    getReducedMotion: () => reducedMotion,
    camera,
    fogColor: new Color(NIGHT),
    fogDensity: FOG_DENSITY,
    keyLight: key.position,
    measureDraw: (frames) => {
      // reading one pixel back is what really waits for the GPU (finish() alone returns early on ANGLE)
      const gl = renderer.getContext();
      const start = performance.now();
      for (let i = 0; i < frames; i++) {
        draw();
        gl.finish();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, benchPixel);
      }
      return (performance.now() - start) / frames;
    },
  });
  teardown.push(() => burnout.dispose());

  // ---- frame loop --------------------------------------------------------------------------------
  const callbacks: FrameCallback[] = [];
  const frame: FrameInfo = { dt: 0, time: 0, p: 0 };
  let p = 0;
  let raf = 0;
  let last = 0;
  let running = false;
  let onScreen = false;
  let needsResize = false;
  let disposed = false;
  let wasSkipped = false;

  const draw = () => {
    renderer.info.reset();
    sky.position.copy(camera.position);
    streaks.update(camera.position);
    if (planar) reflection.render(renderer, scene, camera, mirrorHidden);
    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dtMs = last === 0 ? 16.7 : now - last;
    last = now;

    if (needsResize) {
      needsResize = false;
      applySize();
    }

    // nothing to see once the stage has faded into the page colour
    const invisible = p >= 0.999 || (reducedMotion && p <= 0.0005);
    if (invisible) {
      wasSkipped = true;
      return;
    }
    if (wasSkipped) {
      wasSkipped = false;
      quality.resume();
    }

    frame.dt = Math.min(dtMs, 100) / 1000;
    frame.time += frame.dt;
    frame.p = p;
    quality.sample(dtMs);
    burnout.update(frame.dt, p);
    for (let i = 0; i < callbacks.length; i++) callbacks[i]?.(frame);
    rig.update(frame.dt, p);
    draw();
    debug?.frame(dtMs, renderer, quality.tier, dpr, p, burnout);
  };

  const start = () => {
    if (running || disposed) return;
    running = true;
    last = 0;
    quality.resume();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const refresh = () => {
    if (onScreen && document.visibilityState === 'visible') start();
    else stop();
  };

  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) onScreen = entry.isIntersecting;
    refresh();
  });
  visibility.observe(section);
  document.addEventListener('visibilitychange', refresh);

  const resizer = new ResizeObserver(() => {
    needsResize = true;
  });
  resizer.observe(container);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    stop();
  };
  const onContextRestored = () => {
    // image textures come back by themselves; the captured environment has to be made again
    environment = captureEnvironment([assets.car, shadow, streaks.mesh]);
    track.setPlanar(planar, environment);
    refresh();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  teardown.push(() => {
    disposed = true;
    stop();
    visibility.disconnect();
    resizer.disconnect();
    document.removeEventListener('visibilitychange', refresh);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    callbacks.length = 0;
  });

  // Warm the shaders up, then draw one real frame while the loading bar still covers the canvas:
  // that frame compiles whatever the render targets of this tier need, so "ready" means "on screen".
  rig.update(0, p);
  // the blur discs and the smoke are hidden at rest; shown for this one frame so their shaders compile now
  burnout.setWarm(true);
  await renderer.compileAsync(scene, camera);
  if (disposed) throw new Error('the scene was torn down while loading');
  draw();
  burnout.setWarm(false);
  draw();
  options.onProgress?.(1);

  const api: F2004Scene = {
    get p() {
      return p;
    },
    get tier() {
      return quality.tier;
    },
    engine: burnout.engine,
    events: burnout.events,
    sim: burnout.hooks,
    getCar: () => carNodes,
    getStartLights: () => track.startLights,
    onFrame(cb) {
      callbacks.push(cb);
      return () => {
        const i = callbacks.indexOf(cb);
        if (i >= 0) callbacks.splice(i, 1);
      };
    },
    setProgress(value) {
      p = Math.min(1, Math.max(0, value));
    },
    setReducedMotion(on) {
      reducedMotion = on;
      rig.setReducedMotion(on);
    },
    dispose() {
      runTeardown();
    },
  };
  return api;
}
