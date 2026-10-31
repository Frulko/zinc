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
  /** play() that answers the voice it started, to stop or change that one and leave the others: a number above 0, or 0
   *  for an unknown handle. `offset`: seconds into the sound where it starts; `delay`: seconds of mix from now before it is
   *  heard, to the sample (0: now). A voice ends with its sound, when it is stopped, or when a 33rd voice takes its place. */
  start(sound: i32, volume: f64, loop: boolean, rate: f64, pan: f64, offset: f64, delay: f64): i32;
  /** Stops one voice after `delay` seconds of mix (0: now). */
  voiceStop(voice: i32, delay: f64): void;
  /** Volume, rate (only for a voice started at another rate than 1) and stereo position of one voice. */
  voiceSet(voice: i32, volume: f64, rate: f64, pan: f64): void;
  voicePlaying(voice: i32): boolean;
  /** A sound from samples (1 = full scale; two channels interleaved: left, right, left...) at `rate` frames per second,
   *  8000 to 192000. A sound handle, or -1 (see error()). */
  pcm(samples: f64[], channels: i32, rate: i32): i32;
  /** Channels (1 or more) and frames per second of a sound as it is kept, 0 for an unknown handle. */
  channels(sound: i32): i32;
  rate(sound: i32): i32;
  /** The samples of one channel of a sound ([] for a channel it does not have). */
  samples(sound: i32, channel: i32): f64[];
  /** What the output device played since the last call, mono at 48 kHz (a second at most; the first call starts keeping it, and gives []).
   *  [] when nothing plays (headless, the null backend). A microphone's echo canceller takes it as its reference. */
  played(): f64[];
  /** Seconds of mix rendered so far: by the device, or by mix() on the null backend. Never waits. */
  time(): f64;
  /** A stream: samples written as they come (a call's audio), 1 or 2 channels at `rate`, played from when 60 ms are buffered; an
   *  underrun plays silence until 60 ms are there again, and more than 180 ms buffered is cut back to 60 (the writer's clock drifts from
   *  the device's). A stream handle, or -1 (see error()). */
  streamOpen(channels: i32, rate: i32): i32;
  /** Appends samples (channels interleaved, 1 = full scale; a second at most is kept); the frames buffered. */
  streamWrite(stream: i32, samples: f64[]): i32;
  /** [seconds buffered, underruns, frames dropped] of a stream. */
  streamInfo(stream: i32): f64[];
  streamSetVolume(stream: i32, volume: f64): void;
  streamClose(stream: i32): void;
  /** A music: the file at `path` played as it is read (a song, an audiobook), never decoded whole. AAC, ALAC, MP3, WAV and AIFF on
   *  Apple systems (AudioToolbox), WAV, FLAC, MP3 and Ogg Vorbis elsewhere. The file opens in the background: musicInfo() says when.
   *  A music handle, or -1 (see error()). */
  musicOpen(path: string): i32;
  /** Plays (true) or pauses (false); asked while the file opens, it starts once it is open; at the end, it plays again from the start. */
  musicPlay(music: i32, on: boolean): void;
  /** Moves to `seconds` into the file. */
  musicSeek(music: i32, seconds: f64): void;
  /** [position in seconds, duration in seconds, 1 while it plays, status: 0 opening, 1 open, 2 ended, -1 failed (musicError())]. */
  musicInfo(music: i32): f64[];
  musicError(music: i32): string;
  musicSetVolume(music: i32, volume: f64): void;
  /** Stops it and closes the file. */
  musicClose(music: i32): void;
  /** Volume of the whole mix. */
  setMasterVolume(volume: f64): void;
  /** Null backend only: renders the next `frames` frames of the mix (stereo, interleaved, 1 = full scale) and moves
   *  its time forward by as much. [] when a device plays the mix (it waits to know, like backend()). */
  mix(frames: i32): f64[];
}
export default requireNative<Spec>('Audio');
