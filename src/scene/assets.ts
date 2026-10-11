// Downloads for the scene: the two GLBs (with byte progress), the track JSON and the textures.
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Group, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface LightmapInfo {
  file: string;
  /** UV channel the lightmap uses. */
  uv: number;
  /** `lightMapIntensity = scale * PI`. */
  scale: number;
}

export interface FloodlightInfo {
  name: string;
  pos: [number, number, number];
  dir: [number, number, number];
  color: [number, number, number];
  angle_deg: number;
}

export interface GarageLightInfo {
  pos: [number, number, number];
  color: [number, number, number];
}

/** `public/models/night_track.json` (three.js coordinates). */
export interface TrackInfo {
  lightmaps: Record<string, LightmapInfo>;
  floodlights: FloodlightInfo[];
  garage_lights: GarageLightInfo[];
}

export interface SceneAssets {
  info: TrackInfo;
  track: Group;
  car: Group;
  albedo: Texture;
  rough: Texture;
  puddle: Texture;
  /** Lightmap textures by file name. */
  lightmaps: Map<string, Texture>;
}

// Used for the progress bar when the server sends no Content-Length.
const SIZE_GUESS = { car: 3_447_684, track: 60_020 };

async function fetchBytes(url: string, guess: number, onBytes: (loaded: number, total: number) => void) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const header = Number(res.headers.get('content-length'));
  // A compressed response reports the compressed length, which the decoded stream outgrows.
  const total = header > 0 && !res.headers.get('content-encoding') ? header : guess;
  if (!res.body) {
    const whole = await res.arrayBuffer();
    onBytes(whole.byteLength, whole.byteLength);
    return whole;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, Math.max(total, loaded));
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onBytes(loaded, loaded);
  return out.buffer;
}

export async function loadAssets(version: string, onProgress?: (fraction: number) => void): Promise<SceneAssets> {
  const v = `?v=${encodeURIComponent(version)}`;
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const textures = new TextureLoader();

  const progress = { car: [0, SIZE_GUESS.car], track: [0, SIZE_GUESS.track] } as Record<
    'car' | 'track',
    [number, number]
  >;
  const report = (key: 'car' | 'track') => (loaded: number, total: number) => {
    progress[key] = [loaded, total];
    const done = progress.car[0] + progress.track[0];
    const all = progress.car[1] + progress.track[1];
    onProgress?.(Math.min(1, done / all));
  };

  const texture = async (file: string, srgb: boolean, repeat: boolean) => {
    const t = await textures.loadAsync(`/textures/${file}${v}`);
    if (srgb) t.colorSpace = SRGBColorSpace;
    // glTF UVs have their origin at the top left
    t.flipY = false;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  };

  const infoPromise = fetch(`/models/night_track.json${v}`).then((res) => {
    if (!res.ok) throw new Error(`night_track.json: HTTP ${res.status}`);
    return res.json() as Promise<TrackInfo>;
  });

  const [info, trackBytes, carBytes, albedo, rough, puddle] = await Promise.all([
    infoPromise,
    fetchBytes(`/models/night_track.glb${v}`, SIZE_GUESS.track, report('track')),
    fetchBytes(`/models/f2004.glb${v}`, SIZE_GUESS.car, report('car')),
    texture('asphalt_albedo.webp', true, true),
    texture('asphalt_rough.webp', false, true),
    texture('puddle_mask.webp', false, true),
  ]);

  const files = [...new Set(Object.values(info.lightmaps).map((l) => l.file))];
  const [lightmapTextures, trackGltf, carGltf] = await Promise.all([
    Promise.all(files.map((file) => texture(file, true, false))),
    gltf.parseAsync(trackBytes, '/models/'),
    gltf.parseAsync(carBytes, '/models/'),
  ]);

  const lightmaps = new Map<string, Texture>();
  files.forEach((file, i) => {
    const t = lightmapTextures[i];
    if (t) lightmaps.set(file, t);
  });

  return { info, track: trackGltf.scene, car: carGltf.scene, albedo, rough, puddle, lightmaps };
}
