// Music player state: a four-track playlist, play / pause with a morphing button, the playhead, and a fake
// spectrum that dances while playing and settles when paused.
import { createSignal } from 'zinc:ui/solid';
import { Tween, easeOut } from './motion';
import { Cover } from '../draw/widgets';
import { rand } from './sensors';

export class Track {
  title: string; artist: string; seconds: i32; cover: Cover;
  constructor(title: string, artist: string, seconds: i32, cover: Cover) { this.title = title; this.artist = artist; this.seconds = seconds; this.cover = cover; }
}
export const TRACKS: Track[] = [
  new Track('Neon Drift', 'Zinc Ensemble', 214, new Cover(0x312e81, 0xdb2777, 0xfde68a)),
  new Track('Low Tide', 'Band Rendering', 187, new Cover(0x0c4a6e, 0x14b8a6, 0xf0fdfa)),
  new Track('Solar Wind', 'The Rasterizers', 242, new Cover(0x7c2d12, 0xf59e0b, 0xfef3c7)),
  new Track('Night Shift', 'DMA & the Bands', 199, new Cover(0x111827, 0x6d28d9, 0xc4b5fd)),
];

export const [track, setTrack] = createSignal<i32>(0);
export const [playing, setPlaying] = createSignal<boolean>(false);
/** Playhead in whole seconds (a signal that changes once a second, not every frame). */
export const [position, setPosition] = createSignal<i32>(72);
/** 0 = play glyph, 1 = pause glyph. */
export const morph = new Tween(0);
let coverTime: number = 0;
/** Cover animation clock in seconds. */
export function coverClock(): number { return coverTime; }
/** How lively the cover and the spectrum are (eases to 0 when paused). */
export const energy = new Tween(0);

export const BARS: i32 = 28;
export const spectrum: number[] = [];
for (let i = 0; i < BARS; i++) spectrum.push(0.1);

let exact: number = 72;

export function toggle(): void {
  setPlaying(!playing());
  morph.to(playing() ? 1 : 0, 0.25, easeOut);
  energy.to(playing() ? 1 : 0, 0.6, easeOut);
}
export function skip(dir: i32): void {
  setTrack((track() + dir + TRACKS.length) % TRACKS.length);
  seek(0);
}
export function seek(s: number): void { exact = s; setPosition(Math.floor(s)); }

export function stepMusic(dt: number): void {
  coverTime += dt;
  if (playing()) {
    exact += dt;
    if (exact >= TRACKS[track()].seconds) skip(1);
    if (Math.floor(exact) !== position()) setPosition(Math.floor(exact));
  }
  // bars chase a travelling wave plus noise, louder on the bass side (left)
  const e = energy.get(), t = coverTime;
  for (let i = 0; i < BARS; i++) {
    const wave = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.45) * Math.sin(t * 1.3 - i * 0.2);
    const target = e * Math.min(1, (0.12 + 0.6 * wave) * (1 - i / BARS * 0.55) + 0.3 * rand());
    spectrum[i] += (target - spectrum[i]) * Math.min(1, dt * 10);
  }
}
