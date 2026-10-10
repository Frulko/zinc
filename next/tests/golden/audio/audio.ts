// zinc:audio on the null backend (ZN-390): the mixer runs without a device and mix() hands its samples back, so
// what plays, at which level and for how long is checked exactly. The WAV files are written here, sample by sample;
// the Vorbis, FLAC and MP3 ones are assets/blip.* (0.1 s of a 440 Hz sine).
import { decode, load, tone, mix, backend, SAMPLE_RATE, setVolume, volume, stopAll, Sound } from 'zinc:audio';

/** A 16-bit PCM WAV file: `frames` frames of the same value per channel (32768 is full scale). */
function wav(rate: i32, frames: i32, values: i32[]): u8[] {
  const b: u8[] = [];
  const text = (s: string): void => { for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) as u8); };
  const u16 = (v: i32): void => { b.push((v & 255) as u8); b.push(((v >> 8) & 255) as u8); };
  const u32 = (v: i32): void => { u16(v & 65535); u16((v >> 16) & 65535); };
  const channels = values.length, bytes = frames * channels * 2;
  text('RIFF'); u32(36 + bytes); text('WAVEfmt '); u32(16); u16(1); u16(channels); u32(rate); u32(rate * channels * 2); u16(channels * 2); u16(16);
  text('data'); u32(bytes);
  for (let f = 0; f < frames; f++) for (const v of values) u16(v & 65535);
  return b;
}
const show = (m: number[]): string => m.map((v: number) => `${Math.round(v * 10000) / 10000}`).join(' ');
/** The last frame of the next `frames` frames of the mix. */
const after = (frames: i32): string => show(mix(frames).slice(-2));
function peak(m: number[]): number { let p = 0; for (const v of m) p = Math.max(p, Math.abs(v)); return Math.round(p * 100) / 100; }
function crossings(m: number[]): i32 { let n = 0; for (let i = 2; i < m.length; i += 2) if ((m[i] < 0) !== (m[i - 2] < 0)) n++; return n; }

console.log(`backend ${backend()} rate ${SAMPLE_RATE}`);
const a = decode(wav(48000, 480, [8192]), 'a.wav');             // mono, 0.25 for 10 ms
const b = decode(wav(48000, 960, [16384, -16384]), 'b.wav');    // stereo, 0.5 left and -0.5 right for 20 ms
console.log(`a ok ${a.ok} ${a.duration} s, b ok ${b.ok} ${b.duration} s`);
console.log(`nothing plays: ${show(mix(2))} playing ${a.playing}`);
a.play();
console.log(`a: ${show(mix(2))} playing ${a.playing}`);
b.play();
console.log(`a + b: ${show(mix(2))}`);
a.volume = 0.5;
console.log(`a at 0.5 + b: ${show(mix(2))}`);
setVolume(0.5);
console.log(`master 0.5: ${show(mix(2))} volume ${volume()}`);
setVolume(1);
console.log(`a ended, b goes on: ${after(480)} a ${a.playing} b ${b.playing}`);
b.stop();
console.log(`b stopped: ${after(2)} b ${b.playing}`);

a.volume = 1;
a.loop = true;
a.play();
const lm = mix(1000);   // twice its length and more: no frame of silence where it starts again
let low = 1;
for (const v of lm) low = Math.min(low, v);
console.log(`a looping over two lengths: lowest ${low} last ${show(lm.slice(-2))} playing ${a.playing}`);
a.loop = false;
console.log(`loop off: ${after(480)} playing ${a.playing}`);

a.play(); a.play();
console.log(`a twice at once: ${after(1)}`);
stopAll();
console.log(`stopAll: ${after(1)} playing ${a.playing}`);

b.loop = true;
b.play();
for (let i = 0; i < 40; i++) a.play();   // 41 plays for 32 voices: the oldest one-shots give way, the loop stays
console.log(`32 voices: ${after(1)} b ${b.playing}`);
stopAll();
b.loop = false;

const half = decode(wav(24000, 240, [8192]), 'half.wav');       // half the mixer's rate: resampled while it plays
half.play();
const hm = mix(480);
console.log(`24 kHz: ${half.duration} s, middle ${show(hm.slice(480, 482))}, then ${after(480)} playing ${half.playing}`);

const sq = tone(1000, 0.1, 'square');
sq.play();
const sm = mix(4801);
console.log(`square 1 kHz: ${sq.duration} s peak ${peak(sm)} crossings ${crossings(sm)} first ${show(sm.slice(0, 2))} middle ${show(sm.slice(4800, 4802))} playing ${sq.playing}`);
const si = tone(440, 0.05);
si.play();
const sim = mix(2400);
console.log(`sine 440 Hz: peak ${peak(sim)} crossings ${crossings(sim)}`);
const no = tone(1, 0.05, 'noise');
no.play();
const nm = mix(2400);
console.log(`noise: peak ${peak(nm)} crossings ${crossings(nm) > 1000 && crossings(nm) < 1400}`);
console.log(`bad tones: ${tone(440, 0).ok} ${tone(-1, 1).ok} ${tone(440, 61).ok}`);

// rate and pan (ZN-656): an octave up crosses zero twice as often; panned to one side, the other channel is silent
stopAll();
const r1 = tone(440, 0.2), r2 = tone(440, 0.2);
r1.play();
const c1 = crossings(mix(2400));
stopAll();
r2.rate = 2;
r2.play();
const c2 = crossings(mix(2400));
console.log(`rate: ${c1} crossings at 1, ${c2} at 2 (${r2.rate}), playing ${r2.playing}`);
stopAll();
const side = (pan: number): string => {
  const t = tone(440, 0.05);
  t.pan = pan;
  t.play();
  const m = mix(2400);
  let l = 0, r = 0;
  for (let i = 0; i < m.length; i += 2) { l = Math.max(l, Math.abs(m[i])); r = Math.max(r, Math.abs(m[i + 1])); }
  t.unload();
  return `left ${Math.round(l * 1000) / 1000} right ${Math.round(r * 1000) / 1000}`;
};
console.log(`pan -1: ${side(-1)}; pan 1: ${side(1)}; pan 0: ${side(0)}`);

for (const name of ['blip.ogg', 'blip.flac', 'blip.mp3']) {
  const s: Sound = load(name);
  s.play();
  const m = mix(9600), n = crossings(m);   // 88 crossings for 0.1 s at 440 Hz; MP3 adds a few around its padding
  console.log(`${name}: ok ${s.ok} ${Math.round(s.duration * 100) / 100} s heard ${peak(m) > 0.05 && peak(m) < 0.2} 440 Hz ${n >= 80 && n <= 200} playing ${s.playing}`);
  s.unload();
}

const missing = load('missing.wav');
const broken = decode([82, 73, 70, 70, 1, 2, 3, 4], 'broken.wav');
missing.play(); broken.play();
console.log(`missing: ok ${missing.ok} playing ${missing.playing} (${missing.error})`);
console.log(`broken: ok ${broken.ok} ${broken.duration} s (${broken.error})`);
a.unload();
a.play();
console.log(`unloaded: ok ${a.ok} playing ${a.playing} ${after(1)}`);
