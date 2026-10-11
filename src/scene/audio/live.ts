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
    if (this.disposed) return;
    const graph = new SoundGraph(this.ctx, manifest, makeRandom((Date.now() & 0xffff) + 1));
    this.graph = graph;
    this.total = manifest.clips.length;

    const isEngine = (group: string) => group === 'engine' || group === 'limiter';
    const engineIds = manifest.clips.filter((c) => isEngine(c.group)).map((c) => c.id);
    const fetchAll = async (ids: string[]) => {
      await Promise.all(
        ids.map(async (id) => {
          const clip = await this.loader.load(id);
          if (this.disposed) return;
          graph.addClip(clip);
          this.loaded = graph.clipCount;
          // the button's ring is about the engine: sound starts when that has arrived
          if (!this.ready) onProgress(Math.min(this.loaded, engineIds.length), engineIds.length);
          // a loop that arrives after the engine started (the tyres) joins in at once
          else graph.startLoops(this.ctx.currentTime + 0.02);
        }),
      );
    };
    await fetchAll(engineIds);
    if (this.disposed) return;
    graph.startLoops(this.ctx.currentTime + 0.02);
    this.ready = true;

    void fetchAll(manifest.clips.filter((c) => !isEngine(c.group)).map((c) => c.id)).catch((err: unknown) =>
      console.warn('[f2004] some sounds could not be loaded', err),
    );
  }

  frame(dt: number, input: SoundInput, space: SoundSpace): void {
    if (this.graph) this.last = this.graph.frame(this.ctx.currentTime, dt, input, space);
  }

  event(type: string, wheel: number, rpm: number, space: SoundSpace): void {
    this.graph?.event(this.ctx.currentTime, type, wheel, rpm, space);
  }

  level(): number {
    return this.graph?.level() ?? 0;
  }

  setAudible(on: boolean): void {
    this.graph?.setAudible(this.ctx.currentTime, on);
  }

  dispose(): void {
    this.disposed = true;
    this.graph?.dispose();
  }
}
