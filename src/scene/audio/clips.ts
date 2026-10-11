// Downloads and decodes the clips in public/audio/ (made by scripts/encode-audio.mjs). Opus in WebM is
// the main format, AAC the fallback: which one this browser's decodeAudioData really takes is found
// out by decoding the smallest clip, because canPlayType has been wrong about it both ways in Safari.

export interface ClipFile {
  file: string;
  bytes: number;
  /** Length of the decoded file in seconds. */
  seconds: number;
  /** Loops only: where the loop starts and ends, in seconds of the decoded file. */
  loopStart?: number;
  loopEnd?: number;
}

export interface ClipInfo {
  id: string;
  kind: 'loop' | 'oneshot';
  /** `engine`, `limiter`, `wheelspin`, `backfire` or `pit`. */
  group: string;
  rpm?: number;
  throttle?: number;
  /** Length of the sound itself in seconds (a loop's period). */
  seconds: number;
  peakDb: number;
  /** One entry per format, keyed by file extension. */
  files: Record<string, ClipFile>;
}

export interface AudioManifest {
  sampleRate: number;
  formats: Array<{ ext: string; mime: string }>;
  clips: ClipInfo[];
}

export interface LoadedClip {
  info: ClipInfo;
  buffer: AudioBuffer;
  /** Seconds in `buffer`; both 0 for a one-shot. */
  loopStart: number;
  loopEnd: number;
}

function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  // the callback form also works in Safari versions whose decodeAudioData returns no promise
  return new Promise((resolve, reject) => {
    const promise = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    promise?.catch(reject);
  });
}

export class ClipLoader {
  /** The format in use (`webm` or `m4a`), once known. */
  format = '';
  manifest: AudioManifest | undefined;

  private readonly ctx: BaseAudioContext;
  private readonly query: string;
  private readonly cache = new Map<string, Promise<LoadedClip>>();

  constructor(ctx: BaseAudioContext, version: string) {
    this.ctx = ctx;
    this.query = `?v=${encodeURIComponent(version)}`;
  }

  /** Fetches the manifest and settles the format. */
  async init(): Promise<AudioManifest> {
    const res = await fetch(`/audio/manifest.json${this.query}`);
    if (!res.ok) throw new Error(`audio/manifest.json: HTTP ${res.status}`);
    const manifest = (await res.json()) as AudioManifest;
    this.manifest = manifest;

    const probe = manifest.clips.reduce((a, b) => (b.seconds < a.seconds ? b : a));
    let last: unknown;
    for (const { ext } of manifest.formats) {
      try {
        const clip = await this.fetchClip(probe, ext);
        this.format = ext;
        this.cache.set(probe.id, Promise.resolve(clip));
        return manifest;
      } catch (err) {
        last = err;
      }
    }
    throw new Error(`this browser decodes none of the audio formats (${String(last)})`);
  }

  load(id: string): Promise<LoadedClip> {
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.loadFresh(id);
      this.cache.set(id, pending);
    }
    return pending;
  }

  private async loadFresh(id: string): Promise<LoadedClip> {
    const info = this.manifest?.clips.find((c) => c.id === id);
    if (!info || !this.manifest) throw new Error(`no audio clip called ${id}`);
    try {
      return await this.fetchClip(info, this.format);
    } catch (err) {
      // one file the main format's decoder chokes on: try the others before giving up
      for (const { ext } of this.manifest.formats) {
        if (ext === this.format) continue;
        try {
          return await this.fetchClip(info, ext);
        } catch {
          // keep the first error
        }
      }
      throw err;
    }
  }

  private async fetchClip(info: ClipInfo, format: string): Promise<LoadedClip> {
    const file = info.files[format];
    if (!file) throw new Error(`${info.id} has no ${format} file`);
    const res = await fetch(`/audio/${file.file}${this.query}`);
    if (!res.ok) throw new Error(`${file.file}: HTTP ${res.status}`);
    const buffer = await decode(this.ctx, await res.arrayBuffer());
    let loopStart = 0;
    let loopEnd = 0;
    if (info.kind === 'loop') {
      // The loop is exactly `info.seconds` long wherever it starts (the file repeats the loop's end
      // before it and its start after it), so a decoder that came out short only moves the start.
      loopStart = Math.max(0, Math.min(file.loopStart ?? 0, buffer.duration - info.seconds));
      loopEnd = loopStart + info.seconds;
    }
    return { info, buffer, loopStart, loopEnd };
  }
}
