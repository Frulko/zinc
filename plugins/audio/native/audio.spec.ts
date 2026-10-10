// Native side of zinc:audio: decoded sounds are handles, each play() starts a voice of the mixer (miniaudio's engine,
// 48 kHz stereo). plugins/audio/index.ts wraps the handles in the Sound class.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The output in use: miniaudio's name ('Core Audio', 'ALSA', 'PulseAudio'...), or 'null' when nothing is played
   *  (ZINC_HEADLESS, ZINC_DETERMINISTIC, ZINC_AUDIO=null, or no playback device). The output opens in the background
   *  from the first load() or tone(); this call waits until it is known. */
  backend(): string;
  /** Decodes a whole WAV, FLAC, MP3 or Ogg Vorbis file into memory (float samples). A sound handle, or -1 (see error()). */
  load(bytes: u8[]): i32;
  /** A generated sound: wave 0 sine, 1 square, 2 triangle, 3 sawtooth, 4 white noise; peak 0.5, with a 5 ms fade at
   *  both ends so it does not click. A sound handle, or -1 (see error()). */
  tone(wave: i32, hz: f64, seconds: f64): i32;
  /** Why the last load() or tone() returned -1. */
  error(): string;
  /** Length in seconds (0 for an unknown handle). */
  duration(sound: i32): f64;
  /** Frees the sound and stops its voices. */
  unload(sound: i32): void;
  /** Starts a new voice from the beginning of the sound; voices already playing go on (when all 32 are busy the
   *  oldest one is replaced). `rate`: 1 as recorded, 2 an octave up and twice as fast (a voice started at 1 stays at 1);
   *  `pan`: -1 left, 0 centre, 1 right. False for an unknown handle. */
  play(sound: i32, volume: f64, loop: boolean, rate: f64, pan: f64): boolean;
  /** Stops every voice of the sound. */
  stop(sound: i32): void;
  /** True while a voice of the sound plays. */
  playing(sound: i32): boolean;
  /** Volume (1 = as recorded) and looping of the voices of the sound that play now. */
  setVolume(sound: i32, volume: f64): void;
  setLoop(sound: i32, on: boolean): void;
  /** Playback rate and stereo position of the voices of the sound that play now (the rate only for voices started at
   *  another rate than 1). */
  setRate(sound: i32, rate: f64): void;
  setPan(sound: i32, pan: f64): void;
  stopAll(): void;
  /** Volume of the whole mix. */
  setMasterVolume(volume: f64): void;
  /** Null backend only: renders the next `frames` frames of the mix (stereo, interleaved, 1 = full scale) and moves
   *  its time forward by as much. [] when a device plays the mix (it waits to know, like backend()). */
  mix(frames: i32): f64[];
}
export default requireNative<Spec>('Audio');
