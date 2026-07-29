/**
 * A tiny procedural sound engine. The project has no audio assets, so every
 * effect here is synthesised at play-time with oscillators/noise through the
 * Web Audio API — the same approach chiptune-style games use for a satisfying
 * "hit" without shipping samples. Kept as a flat set of named cues rather
 * than a generic synth API so call sites read as intent ("hitHeavy") instead
 * of raw parameters.
 */

export type SoundName =
  | "hitLight"
  | "hitHeavy"
  | "block"
  | "skillCast"
  | "dash"
  | "knockdown"
  | "levelUp"
  | "loot"
  | "victory"
  | "defeat"
  | "uiClick"
  | "uiError"
  | "travel"
  | "enhanceSuccess"
  | "enhanceFail";

const STORAGE_KEY = "paragon:audio";

interface AudioSettings {
  volume: number;
  muted: boolean;
}

function loadSettings(): AudioSettings {
  if (typeof window === "undefined") return { volume: 0.6, muted: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { volume: 0.6, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : 0.6,
      muted: !!parsed.muted,
    };
  } catch {
    return { volume: 0.6, muted: false };
  }
}

let settings = loadSettings();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
// Sounds are fired from the game loop, which runs far faster than they
// should audibly repeat (e.g. every combo hit) — a short per-name cooldown
// keeps rapid-fire events from turning into a buzzing mess.
const lastPlayed = new Map<SoundName, number>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); losing the preference is fine.
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.length !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

export function getVolume() {
  return settings.volume;
}

export function isMuted() {
  return settings.muted;
}

export function setVolume(v: number) {
  settings = { ...settings, volume: Math.max(0, Math.min(1, v)) };
  if (master) master.gain.value = settings.muted ? 0 : settings.volume;
  persist();
}

export function setMuted(m: boolean) {
  settings = { ...settings, muted: m };
  if (master) master.gain.value = settings.muted ? 0 : settings.volume;
  persist();
}

// ---------------------------------------------------------------- synthesis

function tone(
  c: AudioContext,
  out: AudioNode,
  {
    freq,
    endFreq,
    duration,
    type = "square",
    gain = 0.25,
    delay = 0,
  }: {
    freq: number;
    endFreq?: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    delay?: number;
  }
) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.012, duration * 0.2));
  env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(
  c: AudioContext,
  out: AudioNode,
  {
    duration,
    gain = 0.25,
    filterFreq = 1200,
    filterType = "lowpass",
    delay = 0,
  }: {
    duration: number;
    gain?: number;
    filterFreq?: number;
    filterType?: BiquadFilterType;
    delay?: number;
  }
) {
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const env = c.createGain();
  const t0 = c.currentTime + delay;
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(filter);
  filter.connect(env);
  env.connect(out);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

// ------------------------------------------------------------------- cues

const PATCHES: Record<SoundName, (c: AudioContext, out: AudioNode) => void> = {
  hitLight: (c, out) => {
    tone(c, out, { freq: 320, endFreq: 140, duration: 0.09, type: "square", gain: 0.22 });
    noise(c, out, { duration: 0.05, gain: 0.12, filterFreq: 2200 });
  },
  hitHeavy: (c, out) => {
    tone(c, out, { freq: 160, endFreq: 55, duration: 0.22, type: "sawtooth", gain: 0.3 });
    noise(c, out, { duration: 0.14, gain: 0.22, filterFreq: 900 });
  },
  block: (c, out) => {
    tone(c, out, { freq: 900, endFreq: 700, duration: 0.08, type: "triangle", gain: 0.2 });
    tone(c, out, { freq: 1400, duration: 0.05, type: "triangle", gain: 0.12, delay: 0.02 });
  },
  skillCast: (c, out) => {
    tone(c, out, { freq: 420, endFreq: 900, duration: 0.18, type: "sine", gain: 0.22 });
    tone(c, out, { freq: 630, endFreq: 1200, duration: 0.16, type: "sine", gain: 0.14, delay: 0.03 });
  },
  dash: (c, out) => {
    noise(c, out, { duration: 0.16, gain: 0.18, filterFreq: 2600, filterType: "highpass" });
  },
  knockdown: (c, out) => {
    tone(c, out, { freq: 130, endFreq: 40, duration: 0.32, type: "sawtooth", gain: 0.32 });
    noise(c, out, { duration: 0.22, gain: 0.26, filterFreq: 600 });
  },
  levelUp: (c, out) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(c, out, { freq: f, duration: 0.16, type: "square", gain: 0.2, delay: i * 0.07 })
    );
  },
  loot: (c, out) => {
    tone(c, out, { freq: 880, endFreq: 1320, duration: 0.09, type: "square", gain: 0.16 });
  },
  victory: (c, out) => {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      tone(c, out, { freq: f, duration: 0.28, type: "triangle", gain: 0.2, delay: i * 0.09 })
    );
  },
  defeat: (c, out) => {
    [392, 349.23, 293.66].forEach((f, i) =>
      tone(c, out, { freq: f, duration: 0.32, type: "sawtooth", gain: 0.18, delay: i * 0.1 })
    );
  },
  uiClick: (c, out) => {
    tone(c, out, { freq: 700, endFreq: 500, duration: 0.05, type: "square", gain: 0.14 });
  },
  uiError: (c, out) => {
    tone(c, out, { freq: 220, endFreq: 140, duration: 0.12, type: "square", gain: 0.18 });
  },
  travel: (c, out) => {
    tone(c, out, { freq: 300, endFreq: 600, duration: 0.22, type: "sine", gain: 0.18 });
  },
  enhanceSuccess: (c, out) => {
    tone(c, out, { freq: 660, endFreq: 990, duration: 0.14, type: "square", gain: 0.2 });
    tone(c, out, { freq: 990, duration: 0.1, type: "square", gain: 0.14, delay: 0.05 });
  },
  enhanceFail: (c, out) => {
    tone(c, out, { freq: 260, endFreq: 160, duration: 0.18, type: "sawtooth", gain: 0.2 });
  },
};

/** Sounds fired closer together than this (ms) collapse into one play. */
const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  hitLight: 60,
  hitHeavy: 90,
  block: 80,
  loot: 40,
  uiClick: 30,
};

export function playSound(name: SoundName) {
  const c = getCtx();
  if (!c || !master) return;
  const now = performance.now();
  const gap = MIN_GAP_MS[name] ?? 0;
  const last = lastPlayed.get(name) ?? -Infinity;
  if (now - last < gap) return;
  lastPlayed.set(name, now);
  PATCHES[name](c, master);
}
