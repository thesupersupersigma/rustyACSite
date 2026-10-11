// The audio nodes. mix.ts says how loud and at what pitch; this file builds the graph that does it.
// It only needs a BaseAudioContext, so the same code plays live (live.ts) and renders the listening
// file through an OfflineAudioContext (offline.ts). Every method takes the context time it applies
// at, which is "now" when live and a point on the timeline when rendering.
//
//   engine loops (on set, off set) -> loops ─┐
//   limiter loop ----------------------------┼-> engine ─┐
//   wheelspin loop ---------------------------------------┼-> car pan ─┐
//   backfires ---------------------------------------------┘            ├-> distance -> master
//   tyre burst, wheel guns, landing thump (each with its own pan) ------┘
//   master -> compressor -> make-up taken out -> hard ceiling -> fade -> speakers
import { scheduleBurst, scheduleThump, makeNoise } from './burst';
import type { AudioManifest, LoadedClip } from './clips';
import { AUDIO } from './constants';
import {
  Mixer,
  clamp,
  compressorMakeupDb,
  dbToGain,
  planBackfires,
  timeConstant,
  type MixFrame,
  type Shot,
  type SoundInput,
} from './mix';

/** Where things sit between the speakers right now (-1 left to 1 right). */
export interface SoundSpace {
  /** The car's engine and tyres. */
  car: number;
  /** The four wheels, in FL, FR, RL, RR order. */
  wheels: readonly number[];
  /** The loss from the camera's distance, in dB (0 or below). */
  distanceDb: number;
}

interface Loop {
  source: AudioBufferSourceNode | undefined;
  gain: GainNode;
  clip: LoadedClip | undefined;
}

const PARAM = timeConstant(AUDIO.PARAM_SECONDS);
const SPACE = timeConstant(AUDIO.SPACE_SECONDS);
const WHEELSPIN = timeConstant(AUDIO.WHEELSPIN_SECONDS);

export class SoundGraph {
  /** The revs the engine loops were recorded at, lowest first. */
  readonly rpms: number[];
  readonly mixer: Mixer;
  /** Clips handed over so far. */
  clipCount = 0;

  private readonly ctx: BaseAudioContext;
  private readonly random: () => number;
  private readonly on: Loop[] = [];
  private readonly off: Loop[] = [];
  private readonly limiter: Loop;
  private readonly wheelspin: Loop;
  private readonly oneShots = new Map<string, AudioBuffer>();
  private readonly noise: AudioBuffer;

  private readonly onBus: GainNode;
  private readonly offBus: GainNode;
  private readonly loopsBus: GainNode;
  private readonly carBus: GainNode;
  private readonly carPan: StereoPannerNode | undefined;
  private readonly fxBus: GainNode;
  private readonly distance: GainNode;
  private readonly fade: GainNode;
  private readonly nodes: AudioNode[] = [];
  /** The last value each parameter was sent toward, so a frame that changes nothing schedules nothing. */
  private readonly targets = new Map<AudioParam, number>();

  constructor(ctx: BaseAudioContext, manifest: AudioManifest, random: () => number) {
    this.ctx = ctx;
    this.random = random;
    this.rpms = [...new Set(manifest.clips.filter((c) => c.group === 'engine' && c.rpm).map((c) => c.rpm as number))].sort(
      (a, b) => a - b,
    );
    this.mixer = new Mixer(this.rpms, random);
    this.noise = makeNoise(ctx, random);

    const gain = (value: number) => {
      const node = ctx.createGain();
      node.gain.value = value;
      this.nodes.push(node);
      return node;
    };

    // ---- master: level, safety compressor, its make-up gain taken out again, a hard ceiling, the fade
    const master = gain(dbToGain(AUDIO.MASTER_DB));
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = AUDIO.COMP_THRESHOLD_DB;
    compressor.ratio.value = AUDIO.COMP_RATIO;
    compressor.knee.value = 0;
    compressor.attack.value = AUDIO.COMP_ATTACK;
    compressor.release.value = AUDIO.COMP_RELEASE;
    const trim = gain(dbToGain(-compressorMakeupDb(AUDIO.COMP_THRESHOLD_DB, AUDIO.COMP_RATIO)));
    const ceiling = ctx.createWaveShaper();
    const top = dbToGain(AUDIO.CEILING_DB);
    const curve = new Float32Array(8193);
    for (let i = 0; i < curve.length; i++) curve[i] = clamp((i / (curve.length - 1)) * 2 - 1, -top, top);
    ceiling.curve = curve;
    this.fade = gain(0);
    master.connect(compressor).connect(trim).connect(ceiling).connect(this.fade).connect(ctx.destination);
    this.nodes.push(compressor, ceiling);

    // ---- space ---------------------------------------------------------------------------------
    this.distance = gain(1);
    this.distance.connect(master);
    this.fxBus = gain(1);
    this.fxBus.connect(this.distance);
    this.carBus = gain(1);
    this.carPan = this.panner(0);
    if (this.carPan) this.carBus.connect(this.carPan).connect(this.distance);
    else this.carBus.connect(this.distance);

    // ---- engine --------------------------------------------------------------------------------
    const engine = gain(dbToGain(AUDIO.ENGINE_DB));
    engine.connect(this.carBus);
    this.loopsBus = gain(1);
    this.loopsBus.connect(engine);
    this.onBus = gain(0);
    this.offBus = gain(1);
    this.onBus.connect(this.loopsBus);
    this.offBus.connect(this.loopsBus);
    for (let i = 0; i < this.rpms.length; i++) {
      // at rest only the lowest loop plays: the idle
      const onGain = gain(i === 0 ? 1 : 0);
      const offGain = gain(i === 0 ? 1 : 0);
      onGain.connect(this.onBus);
      offGain.connect(this.offBus);
      this.on.push({ source: undefined, gain: onGain, clip: undefined });
      this.off.push({ source: undefined, gain: offGain, clip: undefined });
    }
    this.limiter = { source: undefined, gain: gain(0), clip: undefined };
    this.limiter.gain.connect(engine);

    this.wheelspin = { source: undefined, gain: gain(0), clip: undefined };
    this.wheelspin.gain.connect(this.carBus);
  }

  /** Hands a decoded clip over. Loops stay silent until `startLoops`. */
  addClip(clip: LoadedClip): void {
    const { info } = clip;
    this.clipCount++;
    if (info.kind !== 'loop') {
      this.oneShots.set(info.id, clip.buffer);
      return;
    }
    if (info.group === 'engine') {
      const i = this.rpms.indexOf(info.rpm ?? -1);
      const loop = (info.throttle ? this.on : this.off)[i];
      if (loop) loop.clip = clip;
    } else if (info.group === 'limiter') {
      this.limiter.clip = clip;
    } else if (info.group === 'wheelspin') {
      this.wheelspin.clip = clip;
    }
  }

  /** Starts every loop that has its clip and is not playing yet, all at the same instant `t`. */
  startLoops(t: number): void {
    const start = (loop: Loop | undefined) => {
      if (!loop || loop.source || !loop.clip) return;
      const source = this.ctx.createBufferSource();
      source.buffer = loop.clip.buffer;
      source.loop = true;
      source.loopStart = loop.clip.loopStart;
      source.loopEnd = loop.clip.loopEnd;
      source.connect(loop.gain);
      source.start(t, loop.clip.loopStart);
      loop.source = source;
    };
    for (let i = 0; i < this.rpms.length; i++) {
      start(this.on[i]);
      start(this.off[i]);
    }
    start(this.limiter);
    start(this.wheelspin);
  }

  /** One frame: works out the mix for `input` and sends every gain and pitch toward it from time `t`. */
  frame(t: number, dt: number, input: SoundInput, space: SoundSpace): MixFrame {
    const frame = this.mixer.step(dt, input);
    const engine = frame.engine;
    for (let i = 0; i < this.rpms.length; i++) {
      const weight = engine.weights[i] ?? 0;
      const rate = engine.rates[i] ?? 1;
      const on = this.on[i] as Loop;
      const off = this.off[i] as Loop;
      this.aim(on.gain.gain, weight, t, PARAM);
      this.aim(off.gain.gain, weight, t, PARAM);
      if (on.source) this.aim(on.source.playbackRate, rate, t, PARAM);
      if (off.source) this.aim(off.source.playbackRate, rate, t, PARAM);
    }
    this.aim(this.onBus.gain, engine.on, t, PARAM);
    this.aim(this.offBus.gain, engine.off, t, PARAM);
    this.aim(this.loopsBus.gain, engine.loops, t, PARAM);
    this.aim(this.limiter.gain.gain, engine.limiter, t, PARAM);

    this.aim(this.wheelspin.gain.gain, frame.wheelspin.gain * dbToGain(AUDIO.WHEELSPIN_DB), t, WHEELSPIN);
    if (this.wheelspin.source) this.aim(this.wheelspin.source.playbackRate, frame.wheelspin.rate, t, WHEELSPIN);

    if (this.carPan) this.aim(this.carPan.pan, space.car, t, SPACE);
    this.aim(this.distance.gain, dbToGain(space.distanceDb), t, SPACE);

    if (frame.pop) this.backfire(t, frame.pop);
    return frame;
  }

  /** A burnout event at time `t`. `rpm` is the engine's revs at that moment. */
  event(t: number, type: string, wheel: number, rpm: number, space: SoundSpace): void {
    switch (type) {
      case 'throttle:off': {
        const shots = planBackfires(rpm, this.random);
        for (const shot of shots) this.backfire(t, shot);
        break;
      }
      case 'pop': {
        // one burst per rear tyre: the one further left on screen goes left
        const left = (space.wheels[2] ?? 0) <= (space.wheels[3] ?? 0) ? 0 : 1;
        const level = dbToGain(AUDIO.BURST_DB);
        for (let i = 0; i < 2; i++) {
          // spread either side of the car, squeezed toward the middle so neither ends up hard in one speaker
          const pan = (i === left ? -1 : 1) * AUDIO.BURST_SPREAD + space.car * (1 - AUDIO.BURST_SPREAD);
          scheduleBurst(this.ctx, this.noise, this.panned(pan), t + i * AUDIO.BURST_GAP, level, this.random);
        }
        break;
      }
      case 'nut:off':
      case 'nut:on': {
        const buffer = this.oneShots.get(type === 'nut:on' ? 'pit_wheelgun' : 'pit_wheelgun_off');
        if (!buffer) break;
        const rate = 1 + (this.random() * 2 - 1) * AUDIO.PIT_PITCH_SPREAD;
        const at = t + this.random() * AUDIO.PIT_OFFSET_MAX;
        this.play(buffer, at, rate, dbToGain(AUDIO.PIT_DB), this.panned(space.wheels[wheel] ?? 0));
        break;
      }
      case 'pitstop:end':
        if (AUDIO.DROP_THUMP_DB > -60) {
          scheduleThump(this.ctx, this.panned(space.car), t, dbToGain(AUDIO.DROP_THUMP_DB), 70, 38, 0.14);
        }
        break;
      default:
        break;
    }
  }

  /** Fades everything in or out from time `t`. */
  setAudible(t: number, on: boolean): void {
    const param = this.fade.gain;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(on ? 1 : 0, t, timeConstant(AUDIO.FADE_SECONDS));
  }

  /** Full level from the first sample (the offline render). */
  open(): void {
    this.fade.gain.setValueAtTime(1, 0);
  }

  dispose(): void {
    for (const loop of [...this.on, ...this.off, this.limiter, this.wheelspin]) {
      try {
        loop.source?.stop();
      } catch {
        // never started
      }
      loop.source?.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.targets.clear();
  }

  private backfire(t: number, shot: Shot): void {
    const buffer = this.oneShots.get('backfire_1');
    if (buffer) this.play(buffer, t + shot.delay, shot.rate, shot.gain * dbToGain(AUDIO.BACKFIRE_DB), this.carBus);
  }

  private play(buffer: AudioBuffer, t: number, rate: number, level: number, out: AudioNode): void {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(out);
    source.start(t);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  private panner(pan: number): StereoPannerNode | undefined {
    // (Safari before 14.1 has no StereoPannerNode; there everything stays in the middle)
    if (typeof this.ctx.createStereoPanner !== 'function') return undefined;
    const node = this.ctx.createStereoPanner();
    node.pan.value = clamp(pan, -1, 1);
    return node;
  }

  /** A place to connect a one-off sound that should sit at `pan`. */
  private panned(pan: number): AudioNode {
    const node = this.panner(pan);
    if (!node) return this.fxBus;
    node.connect(this.fxBus);
    // a one-off: let go of it once whatever it carries has rung out
    const ctx = this.ctx;
    if ('setTimeout' in globalThis && !('startRendering' in ctx)) setTimeout(() => node.disconnect(), 4000);
    return node;
  }

  private aim(param: AudioParam, value: number, t: number, constant: number): void {
    const before = this.targets.get(param);
    if (before !== undefined && Math.abs(before - value) < 1e-4) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, t, constant);
  }
}
