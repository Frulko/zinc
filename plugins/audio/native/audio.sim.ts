// zinc:audio without native code: a deterministic run (goldens, a packed app's frame), a machine that cannot build
// the plugin, the old simulator. Only the 'null' backend, and less of it than audio.host.cpp: nothing is decoded or
// mixed, so a loaded sound has no length, play() and stop() keep the playing state, and mix() is silence.
const lengths: f64[] = [];      // per handle: seconds (0 for a file, which is not decoded); -1 once unloaded
const active: boolean[] = [];
let err: string = '';
const ends: f64[] = [];        // per voice started by start(), at index voice - 1: the time it ends at (mix() moves the time)
let clock: f64 = 0;
const buffered: i32[] = [], rates: i32[] = [], chans: i32[] = [];   // per stream: frames buffered, frames per second, channels
const known = (s: i32): boolean => s >= 0 && s < lengths.length && lengths[s] >= 0;
function add(seconds: f64): i32 { lengths.push(seconds); active.push(false); return lengths.length - 1; }

export default {
  backend(): string { return 'null'; },
  load(bytes: u8[]): i32 {
    if (bytes.length > 0) return add(0);
    err = 'the file is empty';
    return -1;
  },
  tone(wave: i32, hz: f64, seconds: f64): i32 {
    if (wave >= 0 && wave <= 4 && seconds > 0 && seconds <= 60 && hz > 0 && hz <= 20000) return add(seconds);
    err = 'a tone lasts up to 60 seconds, between 0 and 20000 Hz';
    return -1;
  },
  error(): string { return err; },
  duration(sound: i32): f64 { return known(sound) ? lengths[sound] : 0; },
  unload(sound: i32): void { if (known(sound)) { lengths[sound] = -1; active[sound] = false; } },
  play(sound: i32, volume: f64, loop: boolean, rate: f64, pan: f64): boolean {
    if (!known(sound)) return false;
    active[sound] = true;
    return true;
  },
  stop(sound: i32): void {
    if (!known(sound)) return;
    active[sound] = false;
  },
  playing(sound: i32): boolean { return known(sound) && active[sound]; },
  setVolume(sound: i32, volume: f64): void {},
  setLoop(sound: i32, on: boolean): void {},
  setRate(sound: i32, rate: f64): void {},
  setPan(sound: i32, pan: f64): void {},
  stopAll(): void {
    for (let i = 0; i < active.length; i++) active[i] = false;
    for (let i = 0; i < ends.length; i++) ends[i] = 0;
  },
  start(sound: i32, volume: f64, loop: boolean, rate: f64, pan: f64, offset: f64, delay: f64): i32 {
    if (!known(sound)) return 0;
    const left: f64 = Math.max(0, lengths[sound] - offset) / (rate > 0 ? rate : 1);
    ends.push(loop && left > 0 ? Infinity : clock + Math.max(0, delay) + left);
    return ends.length;
  },
  voiceStop(voice: i32, delay: f64): void { if (voice > 0 && voice <= ends.length) ends[voice - 1] = Math.min(ends[voice - 1], clock + Math.max(0, delay)); },
  voiceSet(voice: i32, volume: f64, rate: f64, pan: f64): void {},
  voicePlaying(voice: i32): boolean { return voice > 0 && voice <= ends.length && clock < ends[voice - 1]; },
  time(): f64 { return clock; },
  pcm(samples: f64[], channels: i32, rate: i32): i32 {
    if ((channels == 1 || channels == 2) && rate >= 8000 && rate <= 192000 && samples.length >= channels) return add(Math.floor(samples.length / channels) / rate);
    err = 'samples of 1 or 2 channels, at 8000 to 192000 frames per second';
    return -1;
  },
  channels(sound: i32): i32 { return known(sound) ? 1 : 0; },
  rate(sound: i32): i32 { return known(sound) ? 48000 : 0; },
  samples(sound: i32, channel: i32): f64[] { return []; },
  setMasterVolume(volume: f64): void {},
  // streams keep only how much is buffered (one second at most); nothing plays them
  streamOpen(channels: i32, rate: i32, primeMs: i32, maxMs: i32): i32 {
    if ((channels == 1 || channels == 2) && rate >= 8000 && rate <= 192000 && primeMs >= 1 && maxMs >= primeMs && maxMs <= 1000) { buffered.push(0); rates.push(rate); chans.push(channels); return buffered.length - 1; }
    err = 'a stream of 1 or 2 channels at 8000 to 192000 frames per second with 1 <= primeMs <= maxMs <= 1000';
    return -1;
  },
  streamWrite(stream: i32, samples: f64[]): i32 {
    if (stream < 0 || stream >= buffered.length) return 0;
    buffered[stream] = Math.min(rates[stream], buffered[stream] + Math.floor(samples.length / chans[stream]));
    return buffered[stream];
  },
  streamInfo(stream: i32): f64[] { return stream >= 0 && stream < buffered.length ? [buffered[stream] / rates[stream], 0, 0] : [0, 0, 0]; },
  streamSetVolume(stream: i32, volume: f64): void {},
  streamClose(stream: i32): void { if (stream >= 0 && stream < buffered.length) buffered[stream] = 0; },
  mix(frames: i32): f64[] {
    const r: f64[] = [];
    if (frames > 0) clock += frames / 48000;
    for (let i = 0; i < frames * 2; i++) r.push(0);
    return r;
  },
};
