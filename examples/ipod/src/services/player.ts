// Plays the tracks of the open iPod (zinc:audio's Music: each file is read from the iPod as it plays, never copied; a remote iPod's
// file is first fetched into a cache, services/remote.ts): a queue (the
// list a track was double-clicked in), play and pause, previous and next, a position the bar shows and seeks in. Read only: playing
// changes nothing on the iPod (no play count is written).
import { createSignal, batch } from 'zinc:ui/solid';
import { openMusic, Music } from 'zinc:audio';
import * as ipod from 'zinc:ipod';
import { PodLibrary, playableFile } from './ipod';

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
let pod: PodLibrary | null = null;
let loads: i32 = 0;   // counts the tracks asked for: a fetch that ends after another was asked is dropped
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

async function load(i: i32): Promise<void> {
  if (music !== null) (music as Music).close();
  music = null;
  if (i < 0 || i >= queue.length || pod === null) { stop(); return; }
  at = i;
  const t = queue[i];
  const asked = ++loads;
  let file = '';
  batch(() => { setCurrent(t); setPosition(0); setLength(t.durationMs / 1000); setIsPlaying(false); setPlayError(''); });
  try { file = await playableFile(pod as PodLibrary, t); }   // a remote iPod's track is fetched first
  catch (e) { if (asked === loads) setPlayError((e as Error).message); return; }
  if (asked !== loads) return;   // another track was asked for meanwhile
  const m = openMusic(file);
  music = m;
  m.play();   // starts once the file is open
  batch(() => { setCurrent(t); setPosition(0); setLength(t.durationMs / 1000); setIsPlaying(true); setPlayError(''); });
  startTicking();
}

/** Plays `list[i]`, then the tracks after it, from the iPod `lib`. */
export function playList(lib: PodLibrary, list: ipod.Track[], i: i32): void {
  pod = lib;
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
  loads++;   // a fetch under way plays nothing
  stopTicking();
  if (music !== null) (music as Music).close();
  music = null;
  queue = [];
  at = -1;
  batch(() => { setCurrent(null); setIsPlaying(false); setPosition(0); setLength(0); });
}
