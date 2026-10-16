// zinc:audio — sound effects and music for games and apps (docs/plugins/audio.md): load a sound from the assets,
// play it as often as needed over the others (a mixer of 32 voices), stop it, set its volume, loop it; tone() makes
// a beep without a file. Sound never stops a program: a missing or unreadable file gives a silent Sound and one
// warning, and a run without an audio output (headless, no device) plays nothing and behaves the same.
import A from './native/audio.spec';
import { exists, readBytes } from 'zinc:assets';

export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
const WAVES: string[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
const level = (v: number): number => (v > 0 ? v : 0);   // a negative or NaN volume is silence

/** One playing instance of a sound, from Sound.voice(): stopped or changed alone, the other instances go on. */
export class Voice {
  private v: i32;
  constructor(v: i32) { this.v = v; }
  /** True until the instance ends, is stopped, or gives way as the oldest of 32. */
  get playing(): boolean { return this.v > 0 && A.voicePlaying(this.v); }
  /** Stops the instance, now or after `delay` seconds of mix. */
  stop(delay: number = 0): void { if (this.v > 0) A.voiceStop(this.v, delay); }
  /** Volume, rate (only for an instance started at another rate than 1) and stereo position of this instance. */
  set(volume: number, rate: number, pan: number): void { if (this.v > 0) A.voiceSet(this.v, level(volume), rate, pan); }
}

export class Sound {
  private h: i32;
  private vol: number = 1;
  private looping: boolean = false;
  private rt: number = 1;
  private pn: number = 0;
  /** Why the sound is silent ('' when it loaded). */
  readonly error: string;
  constructor(h: i32, error: string) { this.h = h; this.error = error; }
  /** False for a sound that did not load, or was unloaded: its play() does nothing. */
  get ok(): boolean { return this.h >= 0; }
  /** Length in seconds. */
  get duration(): number { return this.h < 0 ? 0 : A.duration(this.h); }
  /** Starts the sound from its beginning. A sound that is already playing goes on: the two overlap. */
  play(): void { if (this.h >= 0) A.play(this.h, this.vol, this.looping, this.rt, this.pn); }
  /** play() with its own volume, rate, pan and loop instead of the sound's, from `offset` seconds in, heard after `delay`
   *  seconds of mix (to the sample); the instance comes back, to stop or change it alone (the Web Audio of the web
   *  environment plays through this). */
  voice(volume: number, rate: number, pan: number, loop: boolean, offset: number = 0, delay: number = 0): Voice {
    return new Voice(this.h >= 0 ? A.start(this.h, level(volume), loop, rate, pan, offset > 0 ? offset : 0, delay > 0 ? delay : 0) : 0);
  }
  /** Channels, frames per second and the samples of one channel (1 = full scale), as the sound is kept. */
  get channels(): i32 { return this.h < 0 ? 0 : A.channels(this.h); }
  get sampleRate(): i32 { return this.h < 0 ? 0 : A.rate(this.h); }
  samples(channel: i32): number[] { return this.h < 0 ? [] : A.samples(this.h, channel); }
  /** Stops every playing instance of the sound. */
  stop(): void { if (this.h >= 0) A.stop(this.h); }
  get playing(): boolean { return this.h >= 0 && A.playing(this.h); }
  /** 1 is the level of the file, 0 silence; it also changes the instances that play now. */
  get volume(): number { return this.vol; }
  set volume(v: number) { this.vol = level(v); if (this.h >= 0) A.setVolume(this.h, this.vol); }
  /** A looping sound starts again at its end until stop() (music, an engine noise). */
  get loop(): boolean { return this.looping; }
  set loop(on: boolean) { this.looping = on; if (this.h >= 0) A.setLoop(this.h, on); }
  /** Playback rate: 1 as recorded, 2 an octave higher and twice as fast, 0.5 an octave lower and twice as slow (1/64 to 64).
   *  Set it before play(): a voice started at 1 keeps 1, one started at another rate follows later changes. */
  get rate(): number { return this.rt; }
  set rate(r: number) { this.rt = r > 0 ? Math.min(64, Math.max(1 / 64, r)) : 1; if (this.h >= 0) A.setRate(this.h, this.rt); }
  /** Stereo position: -1 left, 0 centre (the default), 1 right; it also moves the instances that play now. */
  get pan(): number { return this.pn; }
  set pan(p: number) { this.pn = p === p ? Math.min(1, Math.max(-1, p)) : 0; if (this.h >= 0) A.setPan(this.h, this.pn); }
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

/** A sound from samples (1 = full scale; two channels interleaved: left, right, left...) at `rate` frames per second. */
export function fromSamples(samples: number[], channels: i32 = 1, rate: i32 = 48000): Sound { return made(A.pcm(samples, channels, rate), 'fromSamples'); }

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

/** Samples played as they are written: the peer's audio of a call (zinc:webrtc's RemoteAudio), a synthesizer, an emulator. It starts
 *  once 60 ms are buffered; when the writer falls behind it plays silence and waits for 60 ms again; when it runs ahead (two clocks
 *  drift apart) what is beyond 180 ms is dropped, so the delay stays short. */
export class AudioStream {
  private h: i32;
  private vol: number = 1;
  readonly channels: i32;
  readonly sampleRate: i32;
  constructor(h: i32, channels: i32, rate: i32) { this.h = h; this.channels = channels; this.sampleRate = rate; }
  /** False when the stream could not open (see console): write() does nothing. */
  get ok(): boolean { return this.h >= 0; }
  /** Appends samples (channels interleaved, 1 = full scale). */
  write(samples: number[]): void { if (this.h >= 0 && samples.length > 0) A.streamWrite(this.h, samples); }
  /** Seconds buffered and not played yet. */
  get buffered(): number { return this.h < 0 ? 0 : A.streamInfo(this.h)[0]; }
  /** Times it ran dry, and frames dropped to stay short. */
  get underruns(): number { return this.h < 0 ? 0 : A.streamInfo(this.h)[1]; }
  get dropped(): number { return this.h < 0 ? 0 : A.streamInfo(this.h)[2]; }
  get volume(): number { return this.vol; }
  set volume(v: number) { this.vol = level(v); if (this.h >= 0) A.streamSetVolume(this.h, this.vol); }
  close(): void { if (this.h >= 0) { A.streamClose(this.h); this.h = -1; } }
}
/** A stream of `channels` (1 or 2) at `rate` frames per second, playing at once (silent until samples come). */
export function stream(channels: i32 = 1, rate: i32 = 48000): AudioStream {
  const h = A.streamOpen(channels, rate);
  if (h < 0) console.warn(`zinc:audio: stream(${channels}, ${rate}): ${A.error()}`);
  return new AudioStream(h, channels, rate);
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
/** Seconds of mix rendered so far: the clock `delay` counts on. A device moves it; on the 'null' backend, mix() does. */
export function time(): number { return A.time(); }
/** Frames per second of the mix, whatever the device runs at. */
export const SAMPLE_RATE: i32 = 48000;
/** On the 'null' backend: the next `frames` frames of the mix, stereo and interleaved (left, right, left...), 1 being
 *  full scale; its time only moves when this is called. With a real output the device takes the mix: []. */
export function mix(frames: i32): number[] { return A.mix(frames); }
