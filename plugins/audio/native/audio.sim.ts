// zinc:audio without native code: a deterministic run (goldens, a packed app's frame), a machine that cannot build
// the plugin, the old simulator. Only the 'null' backend, and less of it than audio.host.cpp: nothing is decoded or
// mixed, so a loaded sound has no length, play() and stop() keep the playing state, and mix() is silence.
const lengths: f64[] = [];      // per handle: seconds (0 for a file, which is not decoded); -1 once unloaded
const active: boolean[] = [];
let err: string = '';
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
  play(sound: i32, volume: f64, loop: boolean): boolean {
    if (!known(sound)) return false;
    active[sound] = true;
    return true;
  },
  stop(sound: i32): void { if (known(sound)) active[sound] = false; },
  playing(sound: i32): boolean { return known(sound) && active[sound]; },
  setVolume(sound: i32, volume: f64): void {},
  setLoop(sound: i32, on: boolean): void {},
  stopAll(): void { for (let i = 0; i < active.length; i++) active[i] = false; },
  setMasterVolume(volume: f64): void {},
  mix(frames: i32): f64[] {
    const r: f64[] = [];
    for (let i = 0; i < frames * 2; i++) r.push(0);
    return r;
  },
};
