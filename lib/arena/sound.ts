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
  | "enhanceFail"
  | "rangedShot"
  | "hazardBurn"
  | "bossTelegraph";

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
  rangedShot: (c, out) => {
    tone(c, out, { freq: 1100, endFreq: 380, duration: 0.1, type: "sawtooth", gain: 0.16 });
    noise(c, out, { duration: 0.05, gain: 0.1, filterFreq: 3000, filterType: "highpass" });
  },
  hazardBurn: (c, out) => {
    noise(c, out, { duration: 0.16, gain: 0.16, filterFreq: 1800, filterType: "bandpass" });
    tone(c, out, { freq: 220, endFreq: 90, duration: 0.14, type: "triangle", gain: 0.12 });
  },
  bossTelegraph: (c, out) => {
    tone(c, out, { freq: 90, endFreq: 260, duration: 0.9, type: "sawtooth", gain: 0.16 });
    noise(c, out, { duration: 0.9, gain: 0.06, filterFreq: 400, filterType: "lowpass" });
  },
};

/** Sounds fired closer together than this (ms) collapse into one play. */
const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  hitLight: 60,
  hitHeavy: 90,
  block: 80,
  loot: 40,
  uiClick: 30,
  rangedShot: 80,
  hazardBurn: 150,
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

// -------------------------------------------------------- ambient music
/**
 * Every town/stage gets a slowly-evolving procedural drone instead of a
 * looped audio file — same "no assets, zero licensing risk" approach as the
 * one-shot cues above. Each track is a sustained chord (a handful of
 * detuned oscillators through a shared filter, breathing via a slow tremolo
 * LFO) plus an occasional soft arpeggio note picked from the same chord, so
 * it never feels like a hard 4-bar loop repeating.
 */
export type MusicTrack =
  | "town"
  | "outskirts"
  | "undercity"
  | "keep"
  | "abyss"
  | "frost"
  | "forge"
  | "storm"
  | "blight"
  | "divine";

interface MusicPatch {
  /** Drone root, Hz. */
  root: number;
  /** Chord tones as ratios above the root. */
  chord: number[];
  waveform: OscillatorType;
  filterFreq: number;
  /** How deep/fast the pad's amplitude breathes. */
  tremoloHz: number;
  tremoloDepth: number;
  /** Seconds between soft arpeggio notes, roughly. */
  tempo: number;
  /** A continuous filtered noise bed, for wind/fire/rot texture. */
  noiseWash: boolean;
  noiseFreq: number;
}

// Town is the one explicitly "chill" cue — warm sine pad, slow breathing,
// no noise texture. Everywhere else leans moodier/harsher the deeper the
// run goes, so the soundtrack tracks the difficulty curve.
const MUSIC_PATCHES: Record<MusicTrack, MusicPatch> = {
  town: { root: 196, chord: [1, 1.25, 1.5, 2], waveform: "sine", filterFreq: 2200, tremoloHz: 0.12, tremoloDepth: 0.12, tempo: 2.8, noiseWash: false, noiseFreq: 0 },
  outskirts: { root: 174.6, chord: [1, 1.2, 1.5, 1.8], waveform: "triangle", filterFreq: 1600, tremoloHz: 0.18, tremoloDepth: 0.15, tempo: 2.3, noiseWash: true, noiseFreq: 2600 },
  undercity: { root: 130.8, chord: [1, 1.19, 1.42, 1.68], waveform: "sawtooth", filterFreq: 800, tremoloHz: 0.1, tremoloDepth: 0.18, tempo: 3.1, noiseWash: true, noiseFreq: 500 },
  keep: { root: 146.8, chord: [1, 1.2, 1.5, 2], waveform: "triangle", filterFreq: 1100, tremoloHz: 0.16, tremoloDepth: 0.15, tempo: 2.4, noiseWash: false, noiseFreq: 0 },
  abyss: { root: 110, chord: [1, 1.19, 1.335, 1.587], waveform: "sawtooth", filterFreq: 650, tremoloHz: 0.08, tremoloDepth: 0.2, tempo: 3.6, noiseWash: true, noiseFreq: 400 },
  frost: { root: 220, chord: [1, 1.125, 1.5, 2], waveform: "sine", filterFreq: 2800, tremoloHz: 0.22, tremoloDepth: 0.12, tempo: 2.9, noiseWash: true, noiseFreq: 3400 },
  forge: { root: 98, chord: [1, 1.25, 1.5, 1.75], waveform: "sawtooth", filterFreq: 1200, tremoloHz: 0.35, tremoloDepth: 0.22, tempo: 1.9, noiseWash: true, noiseFreq: 900 },
  storm: { root: 164.8, chord: [1, 1.19, 1.42, 1.68], waveform: "square", filterFreq: 1900, tremoloHz: 0.5, tremoloDepth: 0.25, tempo: 1.7, noiseWash: true, noiseFreq: 2200 },
  blight: { root: 116.5, chord: [1, 1.06, 1.335, 1.5], waveform: "sawtooth", filterFreq: 800, tremoloHz: 0.07, tremoloDepth: 0.2, tempo: 3.3, noiseWash: true, noiseFreq: 700 },
  divine: { root: 261.6, chord: [1, 1.25, 1.5, 2], waveform: "sine", filterFreq: 3200, tremoloHz: 0.14, tremoloDepth: 0.1, tempo: 2.7, noiseWash: false, noiseFreq: 0 },
};

let musicTrack: MusicTrack | null = null;
let musicGain: GainNode | null = null;
let musicNodes: Array<OscillatorNode | AudioBufferSourceNode> = [];
let musicTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped every stop, so an in-flight arpeggio timer from a stopped track
 *  can tell it's stale and quietly not reschedule itself. */
let musicGen = 0;

/** Fades out and tears down whatever's currently playing. */
export function stopMusic() {
  musicGen++;
  musicTrack = null;
  if (musicGain && ctx) {
    const g = musicGain;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
  }
  const dying = musicNodes;
  const dyingGain = musicGain;
  musicNodes = [];
  musicGain = null;
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
  setTimeout(() => {
    for (const n of dying) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    dyingGain?.disconnect();
  }, 1300);
}

function scheduleArpeggio(c: AudioContext, out: AudioNode, patch: MusicPatch, gen: number) {
  if (gen !== musicGen) return;
  const ratio = patch.chord[Math.floor(Math.random() * patch.chord.length)];
  tone(c, out, {
    freq: patch.root * ratio * 2,
    duration: patch.tempo * 0.8,
    type: patch.waveform === "square" ? "triangle" : "sine",
    gain: 0.05,
  });
  const jitter = patch.tempo * (0.7 + Math.random() * 0.6);
  musicTimer = setTimeout(() => scheduleArpeggio(c, out, patch, gen), jitter * 1000);
}

/** Starts (or switches to) a biome's ambient loop; a no-op if it's already playing. */
export function startMusic(track: MusicTrack) {
  const c = getCtx();
  if (!c || !master) return;
  if (musicTrack === track) return;
  stopMusic();
  musicGen++;
  const gen = musicGen;
  musicTrack = track;
  const patch = MUSIC_PATCHES[track];

  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(master);
  gain.gain.linearRampToValueAtTime(0.16, c.currentTime + 2.5);
  musicGain = gain;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = patch.filterFreq;
  filter.connect(gain);

  const tremolo = c.createGain();
  tremolo.gain.value = 1 - patch.tremoloDepth;
  tremolo.connect(filter);

  const lfo = c.createOscillator();
  lfo.frequency.value = patch.tremoloHz;
  const lfoGain = c.createGain();
  lfoGain.gain.value = patch.tremoloDepth;
  lfo.connect(lfoGain);
  lfoGain.connect(tremolo.gain);
  lfo.start();
  musicNodes.push(lfo);

  for (const ratio of patch.chord) {
    const osc = c.createOscillator();
    osc.type = patch.waveform;
    osc.frequency.value = patch.root * ratio;
    // Slight per-voice detune so the pad has body instead of sounding like
    // one flat sine — the same trick a synth's "unison" mode uses.
    osc.detune.value = (Math.random() - 0.5) * 6;
    const voiceGain = c.createGain();
    voiceGain.gain.value = 0.5 / patch.chord.length;
    osc.connect(voiceGain);
    voiceGain.connect(tremolo);
    osc.start();
    musicNodes.push(osc);
  }

  if (patch.noiseWash) {
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer(c);
    src.loop = true;
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = patch.noiseFreq;
    noiseFilter.Q.value = 0.6;
    const noiseGain = c.createGain();
    noiseGain.gain.value = 0.05;
    src.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(gain);
    src.start();
    musicNodes.push(src);
  }

  musicTimer = setTimeout(() => scheduleArpeggio(c, filter, patch, gen), patch.tempo * 1000);
}

export function currentMusicTrack(): MusicTrack | null {
  return musicTrack;
}
