// Sounds made in code. Assetto Corsa has no tyre-burst sound, so the burst is built here from noise
// and a sine: a sharp crack, a low thump and a tail of escaping air. (This file is covered by the
// GPL like the rest of the source; the recorded clips in public/audio/ are not, see LICENSING.md.)
import { AUDIO } from './constants';

/** One and a half seconds of white noise, the same every time for the same `random`. */
export function makeNoise(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

function release(nodes: AudioNode[], last: AudioScheduledSourceNode): void {
  last.onended = () => {
    for (const node of nodes) node.disconnect();
  };
}

/** A sine falling from `from` to `to` Hz over `seconds`: the tyre's thump, and the car landing. */
export function scheduleThump(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  level: number,
  from: number,
  to: number,
  seconds: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.004);
  env.gain.exponentialRampToValueAtTime(level * 0.002, t + seconds);
  env.gain.linearRampToValueAtTime(0, t + seconds + 0.01);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + seconds + 0.03);
  release([osc, env], osc);
}

/** One tyre letting go at time `t`: crack, thump and hiss into `out`. `level` scales all three. */
export function scheduleBurst(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  out: AudioNode,
  t: number,
  level: number,
  random: () => number,
): void {
  // ---- the crack: a few milliseconds of noise, bright at first, closing fast -------------------------
  const crack = ctx.createBufferSource();
  crack.buffer = noise;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = AUDIO.CRACK_HIGHPASS;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(AUDIO.CRACK_LOWPASS_FROM, t);
  lowpass.frequency.exponentialRampToValueAtTime(AUDIO.CRACK_LOWPASS_TO, t + AUDIO.CRACK_SECONDS);
  const crackEnv = ctx.createGain();
  const crackLevel = level * AUDIO.CRACK_LEVEL;
  crackEnv.gain.setValueAtTime(0, t);
  crackEnv.gain.linearRampToValueAtTime(crackLevel, t + 0.001);
  crackEnv.gain.exponentialRampToValueAtTime(crackLevel * 0.01, t + AUDIO.CRACK_SECONDS);
  crackEnv.gain.linearRampToValueAtTime(0, t + AUDIO.CRACK_SECONDS + 0.006);
  crack.connect(highpass).connect(lowpass).connect(crackEnv).connect(out);
  crack.start(t, random() * 1.2);
  crack.stop(t + AUDIO.CRACK_SECONDS + 0.02);
  release([crack, highpass, lowpass, crackEnv], crack);

  // ---- the thump -----------------------------------------------------------------------------------
  scheduleThump(ctx, out, t, level * AUDIO.THUMP_LEVEL, AUDIO.THUMP_FROM, AUDIO.THUMP_TO, AUDIO.THUMP_SECONDS);

  // ---- the air: band-passed noise fading out ---------------------------------------------------------
  const hiss = ctx.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = AUDIO.HISS_HZ;
  band.Q.value = AUDIO.HISS_Q;
  const hissEnv = ctx.createGain();
  const hissLevel = level * AUDIO.HISS_LEVEL;
  hissEnv.gain.setValueAtTime(0, t);
  hissEnv.gain.linearRampToValueAtTime(hissLevel, t + 0.008);
  hissEnv.gain.exponentialRampToValueAtTime(hissLevel * 0.003, t + AUDIO.HISS_SECONDS);
  hissEnv.gain.linearRampToValueAtTime(0, t + AUDIO.HISS_SECONDS + 0.03);
  hiss.connect(band).connect(hissEnv).connect(out);
  hiss.start(t, random() * 1.2);
  hiss.stop(t + AUDIO.HISS_SECONDS + 0.05);
  release([hiss, band, hissEnv], hiss);
}
