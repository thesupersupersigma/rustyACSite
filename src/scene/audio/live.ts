// The sound while the page is open. Fetched only when the visitor turns sound on (sound.ts imports
// this file on that click), together with the clips.
import { ClipLoader } from './clips';
import { SoundGraph, type SoundSpace } from './graph';
import { makeRandom, type MixFrame, type SoundInput } from './mix';

export class LiveSound {
  /** True once the engine loops are playing. */
  ready = false;
  loaded = 0;
  total = 0;
  /** The last frame's mix, for the debug overlay. */
  last: MixFrame | undefined;

  private readonly ctx: AudioContext;
  private readonly loader: ClipLoader;
  private graph: SoundGraph | undefined;
  private disposed = false;

  constructor(ctx: AudioContext, version: string) {
    this.ctx = ctx;
    this.loader = new ClipLoader(ctx, version);
  }

  get format(): string {
    return this.loader.format;
  }

  get rpms(): readonly number[] {
    return this.graph?.rpms ?? [];
  }

  /**
   * Downloads the engine first and starts it idling, then fetches the rest (tyres, backfire, wheel
   * guns) in the background. Resolves when the engine plays.
   */
  async start(onProgress: (loaded: number, total: number) => void): Promise<void> {
    const manifest = await this.loader.init();
    const graph = new SoundGraph(this.ctx, manifest, makeRandom((Date.now() & 0xffff) + 1));
    this.graph = graph;
    this.total = manifest.clips.length;

    const fetchAll = async (ids: string[]) => {
      await Promise.all(
        ids.map(async (id) => {
          const clip = await this.loader.load(id);
          if (this.disposed) return;
          graph.addClip(clip);
          this.loaded = graph.clipCount;
          onProgress(this.loaded, this.total);
        }),
      );
    };
    const isEngine = (group: string) => group === 'engine' || group === 'limiter';
    await fetchAll(manifest.clips.filter((c) => isEngine(c.group)).map((c) => c.id));
    if (this.disposed) return;
    graph.startLoops(this.ctx.currentTime + 0.02);
    this.ready = true;

    void fetchAll(manifest.clips.filter((c) => !isEngine(c.group)).map((c) => c.id))
      .then(() => {
        if (!this.disposed) graph.startLoops(this.ctx.currentTime + 0.02);
      })
      .catch((err: unknown) => console.warn('[f2004] some sounds could not be loaded', err));
  }

  frame(dt: number, input: SoundInput, space: SoundSpace): void {
    if (this.graph) this.last = this.graph.frame(this.ctx.currentTime, dt, input, space);
  }

  event(type: string, wheel: number, rpm: number, space: SoundSpace): void {
    this.graph?.event(this.ctx.currentTime, type, wheel, rpm, space);
  }

  setAudible(on: boolean): void {
    this.graph?.setAudible(this.ctx.currentTime, on);
  }

  dispose(): void {
    this.disposed = true;
    this.graph?.dispose();
  }
}
