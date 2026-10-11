// The listening file: one scripted burnout rendered to a WAV without playing it. Used by
// scripts/render-sound.mjs through `window.__f2004.sound.renderRun()`, and fetched only then.
//
// The run is driven through the scene's own test hooks (`sim.hold()` and friends) in fixed 1/60 s
// steps, so it is the same simulation the pictures show, and it goes through the same graph and the
// same clips as the live sound. Only the clock differs: an OfflineAudioContext instead of the speakers.
import type { BurnoutEvents } from '../events';
import { WHEEL_IDS, type EngineReadout, type SimHooks, type SoundRun } from '../types';
import { TUNING } from '../sim';
import { ClipLoader } from './clips';
import { SoundGraph, type SoundSpace } from './graph';
import { makeRandom, type SoundInput } from './mix';

const STEP = 1 / 60;
const RATE = 48000;
/** Seconds rendered after the last step, so nothing is cut off. */
const TAIL = 0.4;

export interface RunDeps {
  sim: SimHooks;
  engine: EngineReadout;
  events: BurnoutEvents;
  /** Where things sit between the speakers right now. */
  space(): SoundSpace;
  assetVersion: string;
}

interface Frame extends SoundInput {
  space: SoundSpace;
}

interface Happening {
  step: number;
  type: string;
  wheel: number;
  rpm: number;
  space: SoundSpace;
}

const copySpace = (s: SoundSpace): SoundSpace => ({ car: s.car, wheels: [...s.wheels], distanceDb: s.distanceDb });

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    // a hidden tab draws no frames: do not wait for them forever
    const timer = window.setTimeout(resolve, 500);
    const step = (left: number) => {
      if (left <= 0) {
        window.clearTimeout(timer);
        resolve();
      } else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

/** Idle 1 s, two short blips, a full hold until the pop, 1 s, the pit stop, idle 2 s. */
function record(deps: RunDeps) {
  const { sim, engine } = deps;
  const frames: Frame[] = [];
  const happenings: Happening[] = [];
  const marks: SoundRun['marks'] = [];

  const stop = deps.events.on('*', (e) => {
    happenings.push({
      step: frames.length,
      type: e.type,
      wheel: e.wheel ? WHEEL_IDS.indexOf(e.wheel) : -1,
      rpm: engine.rpm,
      space: copySpace(deps.space()),
    });
  });
  const mark = (label: string) => marks.push({ label, time: frames.length * STEP });
  const tick = (held: boolean) => {
    if (held) sim.hold(STEP);
    else sim.advance(STEP);
    frames.push({
      rpm: engine.rpm,
      throttle: engine.throttle,
      limiter: engine.limiter,
      wheelNorm: engine.wheelSpeed / TUNING.WHEEL_MAX,
      space: copySpace(deps.space()),
    });
  };
  const run = (seconds: number, held: boolean) => {
    for (let i = Math.round(seconds / STEP); i > 0; i--) tick(held);
  };

  try {
    sim.release();
    mark('idle');
    run(1, false);
    mark('blip 1');
    run(0.2, true);
    sim.release();
    run(0.7, false);
    mark('blip 2');
    run(0.35, true);
    sim.release();
    run(1, false);
    mark('full hold');
    for (let guard = 0; guard < 60 * 15 && engine.state !== 'popped'; guard++) tick(true);
    mark('pop');
    sim.release();
    run(1, false);
    mark('pit stop');
    sim.pitStop();
    for (let guard = 0; guard < 60 * 10 && engine.state !== 'idle'; guard++) tick(false);
    mark('back on the ground, idle');
    run(2, false);
    mark('end');
  } finally {
    stop();
    sim.resume();
  }
  return { frames, happenings, marks };
}

function toWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    let at = 44 + ch * 2;
    for (let i = 0; i < frames; i++, at += channels * 2) {
      const s = Math.max(-1, Math.min(1, data[i] ?? 0));
      view.setInt16(at, Math.round(s * 32767), true);
    }
  }
  return bytes;
}

export async function renderRun(deps: RunDeps): Promise<SoundRun> {
  // the same camera every time: the hero angle, held still
  deps.sim.view(38, 1.3);
  await nextFrames(3);
  const { frames, happenings, marks } = record(deps);

  const seconds = frames.length * STEP + TAIL;
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Offline(2, Math.ceil(seconds * RATE), RATE);
  const loader = new ClipLoader(ctx, deps.assetVersion);
  const manifest = await loader.init();
  const graph = new SoundGraph(ctx, manifest, makeRandom(2004));
  for (const clip of await Promise.all(manifest.clips.map((c) => loader.load(c.id)))) graph.addClip(clip);
  graph.open();
  graph.startLoops(0);

  let next = 0;
  for (let k = 0; k < frames.length; k++) {
    const t = k * STEP;
    const frame = frames[k] as Frame;
    for (; next < happenings.length && (happenings[next] as Happening).step <= k; next++) {
      const h = happenings[next] as Happening;
      graph.event(t, h.type, h.wheel, h.rpm, h.space);
    }
    graph.frame(t, STEP, frame, frame.space);
  }

  const rendered = await ctx.startRendering();
  return { wav: toWav(rendered), seconds, sampleRate: RATE, format: loader.format, marks };
}
