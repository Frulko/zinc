// Plays the tracks of the open iPod (zinc:audio's Music: each file is read from the iPod as it plays, never copied): a queue (the
// list a track was double-clicked in), play and pause, previous and next, a position the bar shows and seeks in. Read only: playing
// changes nothing on the iPod (no play count is written).
import { createSignal, batch } from 'zinc:ui/solid';
import { openMusic, Music } from 'zinc:audio';
import * as ipod from 'zinc:ipod';

export const [current, setCurrent] = createSignal<ipod.Track | null>(null);
export const [isPlaying, setIsPlaying] = createSignal<boolean>(false);
export const [position, setPosition] = createSignal<number>(0);
export const [length, setLength] = createSignal<number>(0);
export const [playError, setPlayError] = createSignal<string>('');

const TICK_MS = 250;      // how often the position is read while a track plays (nothing ticks when paused)
const RESTART_AFTER = 3;  // seconds: previous() past this restarts the track, as iTunes does

let queue: ipod.Track[] = [];
let at: i32 = -1;
let music: Music | null = null;
let mount = '';
let timer: i32 = -1;

function tick(): void {
  const m = music;
  if (m === null) return;
  const mu = m as Music;
  if (mu.error !== '') { setPlayError(mu.error); stopTicking(); setIsPlaying(false); return; }
  if (mu.ended) { next(); return; }
  batch(() => { setPosition(mu.position); setLength(mu.duration > 0 ? mu.duration : (current() as ipod.Track).durationMs / 1000); });
}
function startTicking(): void { if (timer < 0) timer = setInterval(tick, TICK_MS); }
function stopTicking(): void { if (timer >= 0) clearInterval(timer); timer = -1; }

function load(i: i32): void {
  if (music !== null) (music as Music).close();
  music = null;
  if (i < 0 || i >= queue.length) { stop(); return; }
  at = i;
  const t = queue[i];
  const m = openMusic(`${mount}/${t.path}`);
  music = m;
  m.play();   // starts once the file is open
  batch(() => { setCurrent(t); setPosition(0); setLength(t.durationMs / 1000); setIsPlaying(true); setPlayError(''); });
  startTicking();
}

/** Plays `list[i]`, then the tracks after it; `mountpoint` is the iPod's (the tracks' paths are relative to it). */
export function playList(mountpoint: string, list: ipod.Track[], i: i32): void {
  mount = mountpoint;
  queue = list.slice();
  load(i);
}

export function toggle(): void {
  const m = music;
  if (m === null) { if (queue.length > 0) load(at >= 0 ? at : 0); return; }
  if (isPlaying()) { (m as Music).pause(); setIsPlaying(false); stopTicking(); tick(); }
  else { (m as Music).play(); setIsPlaying(true); startTicking(); }
}

export function next(): void { if (at + 1 < queue.length) load(at + 1); else stop(); }

export function previous(): void {
  const m = music;
  if (m !== null && (m as Music).position > RESTART_AFTER) { seek(0); return; }
  load(at > 0 ? at - 1 : 0);
}

/** Moves to `seconds` into the track. */
export function seek(seconds: number): void {
  const m = music;
  if (m === null) return;
  (m as Music).seek(seconds);
  setPosition(seconds);
}

/** Stops and forgets the queue (the iPod was closed or another one opened). */
export function stop(): void {
  stopTicking();
  if (music !== null) (music as Music).close();
  music = null;
  queue = [];
  at = -1;
  batch(() => { setCurrent(null); setIsPlaying(false); setPosition(0); setLength(0); });
}
