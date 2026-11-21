// Original ambient music synthesised in the browser, so no recordings are shipped or
// streamed. The chosen tone sets the character;
// the tags of the soundtrack pick made for this profile nudge the tempo.
export type Mood = {
  bpm: number;
  scale: number[];
  wave: OscillatorType;
  root: number;
  /** Chance of a melody note on each beat. */
  density: number;
  /** Melody note length in beats: short is punchy, long is flowing. */
  sustain: number;
  /** A driving bass note and drum hit on every beat. */
  pulse: boolean;
};

const lively = /energetic|playful|groove|sunshine|weekend|outdoors/;
const hushed = /quiet|reflective|soft|dreamy|space|books/;
const pentatonic = [0, 2, 4, 7, 9];
const tones: Record<string, Mood> = {
  warm: {
    bpm: 76,
    scale: pentatonic,
    wave: 'sine',
    root: 220,
    density: 0.7,
    sustain: 1.8,
    pulse: false,
  },
  playful: {
    bpm: 112,
    scale: pentatonic,
    wave: 'triangle',
    root: 329.63,
    density: 0.9,
    sustain: 0.5,
    pulse: false,
  },
  heartfelt: {
    bpm: 56,
    scale: [0, 2, 4, 7, 11],
    wave: 'sine',
    root: 196,
    density: 0.5,
    sustain: 3.5,
    pulse: false,
  },
  confident: {
    bpm: 104,
    scale: [0, 3, 5, 7, 10],
    wave: 'sawtooth',
    root: 146.83,
    density: 0.85,
    sustain: 0.9,
    pulse: true,
  },
  relaxed: {
    bpm: 64,
    scale: [0, 2, 5, 7, 9],
    wave: 'sine',
    root: 220,
    density: 0.4,
    sustain: 2.6,
    pulse: false,
  },
};
export function moodFor(tone: string, tags: string[]): Mood {
  const base = tones[tone] ?? tones.warm!;
  const text = tags.join(' ');
  const nudge = lively.test(text) ? 10 : hushed.test(text) ? -8 : 0;
  return { ...base, bpm: base.bpm + nudge };
}

/** Starts a quiet generative loop and returns a function that fades it out and stops it. */
export function startMusic(tone: string, tags: string[]): () => void {
  const mood = moodFor(tone, tags);
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  // Soften bright waveforms so a bold tone sounds strong, not harsh.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(ctx.destination);
  master.connect(filter);
  const drum = (at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.14);
    gain.gain.setValueAtTime(1.6, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 0.25);
  };
  const note = (semitone: number, at: number, length: number, level: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = mood.wave;
    osc.frequency.value = mood.root * 2 ** (semitone / 12);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };
  const beat = 60 / mood.bpm;
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const schedule = () => {
    // Look ahead further than a throttled background-tab timer (1s) can lag.
    while (next < ctx.currentTime + 1.5) {
      if (step % 8 === 0) {
        note(-12, next, beat * 8, 0.5);
        note(-5, next, beat * 8, 0.3);
      }
      if (mood.pulse) {
        drum(next);
        note(step % 8 < 4 ? -12 : -5, next, beat * 0.8, 0.6);
      }
      if (Math.random() < mood.density) {
        const degree = mood.scale[Math.floor(Math.random() * mood.scale.length)]!;
        note(degree + (Math.random() < 0.3 ? 12 : 0), next, beat * mood.sustain, 0.35);
      }
      next += beat;
      step++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 200);
  return () => {
    clearInterval(timer);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    setTimeout(() => void ctx.close(), 500);
  };
}
