// zinc:audio — sound effects and music for games and apps (docs/plugins/audio.md): load a sound from the assets,
// play it as often as needed over the others (a mixer of 32 voices), stop it, set its volume, loop it; tone() makes
// a beep without a file. Sound never stops a program: a missing or unreadable file gives a silent Sound and one
// warning, and a run without an audio output (headless, no device) plays nothing and behaves the same.
import A from './native/audio.spec';
import { exists, readBytes } from 'zinc:assets';

export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
const WAVES: string[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
const level = (v: number): number => (v > 0 ? v : 0);   // a negative or NaN volume is silence

export class Sound {
  private h: i32;
  private vol: number = 1;
  private looping: boolean = false;
  /** Why the sound is silent ('' when it loaded). */
  readonly error: string;
  constructor(h: i32, error: string) { this.h = h; this.error = error; }
  /** False for a sound that did not load, or was unloaded: its play() does nothing. */
  get ok(): boolean { return this.h >= 0; }
  /** Length in seconds. */
  get duration(): number { return this.h < 0 ? 0 : A.duration(this.h); }
  /** Starts the sound from its beginning. A sound that is already playing goes on: the two overlap. */
  play(): void { if (this.h >= 0) A.play(this.h, this.vol, this.looping); }
  /** Stops every playing instance of the sound. */
  stop(): void { if (this.h >= 0) A.stop(this.h); }
  get playing(): boolean { return this.h >= 0 && A.playing(this.h); }
  /** 1 is the level of the file, 0 silence; it also changes the instances that play now. */
  get volume(): number { return this.vol; }
  set volume(v: number) { this.vol = level(v); if (this.h >= 0) A.setVolume(this.h, this.vol); }
  /** A looping sound starts again at its end until stop() (music, an engine noise). */
  get loop(): boolean { return this.looping; }
  set loop(on: boolean) { this.looping = on; if (this.h >= 0) A.setLoop(this.h, on); }
  /** Stops the sound and frees its samples. */
  unload(): void { if (this.h >= 0) { A.unload(this.h); this.h = -1; } }
}

function made(h: i32, what: string): Sound {
  if (h >= 0) return new Sound(h, '');
  const why = `${what}: ${A.error()}`;
  console.warn(`zinc:audio: ${why}`);
  return new Sound(-1, why);
}

/** A sound from the bytes of a WAV, FLAC, MP3 or Ogg Vorbis file, decoded now and kept in memory. */
export function decode(bytes: u8[], name: string = 'sound'): Sound { return made(A.load(bytes), name); }

/** A sound of the project's assets: load('coin.wav') reads assets/coin.wav. */
export function load(name: string): Sound {
  if (exists(name)) return decode(readBytes(name), name);
  console.warn(`zinc:audio: ${name}: no such asset`);
  return new Sound(-1, `${name}: no such asset`);
}

/** A generated sound of `seconds` at `hz`: a beep, a blip, or a burst of noise (hz is not used for 'noise'). */
export function tone(hz: number, seconds: number, wave: Wave = 'sine'): Sound {
  return made(A.tone(WAVES.indexOf(wave), hz, seconds), `tone(${hz}, ${seconds})`);
}

let master: number = 1;
/** Volume of everything that plays: 1 by default, 0 mutes. */
export function setVolume(v: number): void { master = level(v); A.setMasterVolume(master); }
export function volume(): number { return master; }
/** Stops every sound. */
export function stopAll(): void { A.stopAll(); }

/** The audio output: 'Core Audio', 'ALSA', 'PulseAudio'..., or 'null' when nothing can be heard (a headless or
 *  deterministic run, ZINC_AUDIO=null, a machine without a playback device). The output opens in the background while
 *  the program starts; this call waits for it (up to half a second), play() never does. */
export function backend(): string { return A.backend(); }
/** Frames per second of the mix, whatever the device runs at. */
export const SAMPLE_RATE: i32 = 48000;
/** On the 'null' backend: the next `frames` frames of the mix, stereo and interleaved (left, right, left...), 1 being
 *  full scale; its time only moves when this is called. With a real output the device takes the mix: []. */
export function mix(frames: i32): number[] { return A.mix(frames); }
