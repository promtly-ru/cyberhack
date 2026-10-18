/**
 * Синтезированные звуки на WebAudio — без файлов.
 * AudioContext создаётся лениво (браузеры разрешают звук только после жеста пользователя).
 */
import { useSettings } from '../ui/settings';

export type SfxName = 'click' | 'hover' | 'card' | 'hit' | 'block' | 'buff' | 'debuff' | 'heal' | 'buy' | 'error' | 'turn' | 'death' | 'victory' | 'defeat' | 'select';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Вызывать на первом жесте пользователя, чтобы разблокировать звук. */
export function unlockAudio(): void {
  ensure();
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  dur: number;
  gain?: number;
  delay?: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

function tone(c: AudioContext, out: AudioNode, o: ToneOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.value = o.filter.freq;
    f.Q.value = o.filter.q ?? 1;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  delay?: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
}

function noise(c: AudioContext, out: AudioNode, o: NoiseOpts): void {
  if (!noiseBuf) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.filter;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

const lastPlayed = new Map<SfxName, number>();

export function sfx(name: SfxName, intensity = 1): void {
  const s = useSettings.getState();
  if (s.muted || s.volume <= 0) return;
  const c = ensure();
  if (!c || !master) return;
  // Защита от «пулемёта» одинаковых звуков в один кадр
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 35) return;
  lastPlayed.set(name, now);
  master.gain.value = s.volume * 0.8;
  const out = master;
  const k = Math.min(1.6, Math.max(0.5, intensity));

  switch (name) {
    case 'click':
      tone(c, out, { type: 'square', freq: 1800, to: 900, dur: 0.05, gain: 0.08, filter: { type: 'lowpass', freq: 4000 } });
      break;
    case 'hover':
      tone(c, out, { type: 'sine', freq: 2400, dur: 0.03, gain: 0.025 });
      break;
    case 'select':
      tone(c, out, { type: 'triangle', freq: 660, to: 990, dur: 0.08, gain: 0.12 });
      break;
    case 'card':
      noise(c, out, { dur: 0.22, gain: 0.22, filter: 'bandpass', freq: 800, to: 5000, q: 2 });
      tone(c, out, { type: 'sawtooth', freq: 220, to: 880, dur: 0.14, gain: 0.06, filter: { type: 'lowpass', freq: 2500 } });
      break;
    case 'hit':
      noise(c, out, { dur: 0.18 * k, gain: 0.45 * k, filter: 'lowpass', freq: 3000, to: 300 });
      tone(c, out, { type: 'sine', freq: 160, to: 45, dur: 0.22 * k, gain: 0.6 * k });
      tone(c, out, { type: 'square', freq: 90, to: 40, dur: 0.08, gain: 0.12, filter: { type: 'lowpass', freq: 800 } });
      break;
    case 'block':
      tone(c, out, { type: 'triangle', freq: 1250, to: 1150, dur: 0.25, gain: 0.16 });
      tone(c, out, { type: 'square', freq: 625, dur: 0.12, gain: 0.05, filter: { type: 'bandpass', freq: 1800, q: 6 } });
      noise(c, out, { dur: 0.08, gain: 0.12, filter: 'highpass', freq: 4000 });
      break;
    case 'buff':
      [0, 0.06, 0.12].forEach((d, i) => tone(c, out, { type: 'triangle', freq: 440 * (1 + i * 0.26), dur: 0.16, gain: 0.1, delay: d }));
      break;
    case 'debuff':
      tone(c, out, { type: 'sawtooth', freq: 300, to: 120, dur: 0.3, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } });
      break;
    case 'heal':
      [0, 0.07, 0.14, 0.21].forEach((d, i) => tone(c, out, { type: 'sine', freq: 520 * Math.pow(1.19, i), dur: 0.3, gain: 0.08, delay: d }));
      break;
    case 'buy':
      tone(c, out, { type: 'square', freq: 1320, dur: 0.06, gain: 0.07, filter: { type: 'lowpass', freq: 5000 } });
      tone(c, out, { type: 'square', freq: 1980, dur: 0.12, gain: 0.07, delay: 0.06, filter: { type: 'lowpass', freq: 5000 } });
      break;
    case 'error':
      tone(c, out, { type: 'square', freq: 110, dur: 0.16, gain: 0.1, filter: { type: 'lowpass', freq: 900 } });
      break;
    case 'turn':
      noise(c, out, { dur: 0.3, gain: 0.1, filter: 'bandpass', freq: 400, to: 2400, q: 3 });
      tone(c, out, { type: 'sine', freq: 330, to: 660, dur: 0.2, gain: 0.08 });
      break;
    case 'death':
      for (let i = 0; i < 6; i++) tone(c, out, { type: 'square', freq: 880 / (i + 1), dur: 0.07, gain: 0.07, delay: i * 0.045, filter: { type: 'lowpass', freq: 3000 } });
      noise(c, out, { dur: 0.5, gain: 0.2, filter: 'lowpass', freq: 5000, to: 200 });
      break;
    case 'victory':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(c, out, { type: 'triangle', freq: f, dur: 0.45, gain: 0.12, delay: i * 0.1 });
        tone(c, out, { type: 'sawtooth', freq: f / 2, dur: 0.3, gain: 0.03, delay: i * 0.1, filter: { type: 'lowpass', freq: 1500 } });
      });
      break;
    case 'defeat':
      [392, 311.13, 261.63, 196].forEach((f, i) => tone(c, out, { type: 'sawtooth', freq: f, to: f * 0.97, dur: 0.5, gain: 0.07, delay: i * 0.18, filter: { type: 'lowpass', freq: 1000 } }));
      break;
  }
}
