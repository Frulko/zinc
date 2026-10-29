// Plays the tracks of the open iPod, on this computer or on a Sonos group (services/sonos.ts). Here: zinc:audio's Music, each file
// read from the iPod as it plays, never copied (a remote iPod's file is first fetched into a cache, services/remote.ts). On Sonos: the
// group's queue becomes the list from the track asked for, the speakers fetch the files over HTTP and go through the queue by
// themselves; the bar follows the group, read once a second. A queue (the list a track was double-clicked in), play and pause,
// previous and next, a position the bar shows and seeks in, and the Sonos group's volume. Read only: playing changes nothing on the
// iPod (no play count is written).
import { createSignal, batch } from 'zinc:ui/solid';
import { openMusic, Music } from 'zinc:audio';
import * as ipod from 'zinc:ipod';
import * as sonos from 'zinc:sonos';
import { PodLibrary, playableFile } from './ipod';
import { chosenGroup, system, songsOf, output, setOutput } from './sonos';

export const [current, setCurrent] = createSignal<ipod.Track | null>(null);
export const [isPlaying, setIsPlaying] = createSignal<boolean>(false);
export const [position, setPosition] = createSignal<number>(0);
export const [length, setLength] = createSignal<number>(0);
export const [playError, setPlayError] = createSignal<string>('');
/** The Sonos group's volume, 0..100 (-1 on this computer). */
export const [volume, setVolumeShown] = createSignal<i32>(-1);

const TICK_MS = 250;          // how often the position is read while a track plays (nothing ticks when paused)
const SONOS_POLL_MS = 1000;   // how often the Sonos group is read while it is the output
const SONOS_QUEUE_MAX = 200;  // songs queued on the group from the one asked for
const RESTART_AFTER = 3;      // seconds: previous() past this restarts the track, as iTunes does

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

function closeLocal(): void {
  stopTicking();
  if (music !== null) (music as Music).close();
  music = null;
}

async function load(i: i32): Promise<void> {
  closeLocal();
  if (i < 0 || i >= queue.length || pod === null) { stop(); return; }
  if (chosenGroup() !== null) { await loadOnSonos(i); return; }
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

// ---- on a Sonos group

let sonosFrom: i32 = 0;            // the index in `queue` of the group's first queued song
let sonosUrls: string[] = [];      // the URLs queued, to know the group still plays our queue
let polling = false;
let pollTimer: i32 = -1;

async function loadOnSonos(i: i32): Promise<void> {
  const g = chosenGroup() as sonos.Group, house = system();
  const asked = ++loads;
  at = i;
  const t = queue[i];
  batch(() => { setCurrent(t); setPosition(0); setLength(t.durationMs / 1000); setIsPlaying(false); setPlayError(''); });
  const songs = songsOf(pod as PodLibrary, g, queue.slice(i, i + SONOS_QUEUE_MAX));
  sonosFrom = i;
  sonosUrls = [];
  for (const s of songs) sonosUrls.push(s.url);
  try {
    await house.clearQueue(g);
    await house.addUriToQueue(g, songs[0].url, sonos.musicTrackMeta(songs[0]));
    await house.playFromQueue(g, 0);
    if (asked === loads) setIsPlaying(true);
    startPolling();
    // the others after it, while no other track is asked for: the first plays meanwhile
    for (let k: i32 = 1; k < songs.length && asked === loads; k++) await house.addUriToQueue(g, songs[k].url, sonos.musicTrackMeta(songs[k]));
  } catch (e) {
    if (asked === loads) batch(() => { setPlayError(`${g.name()}: ${(e as Error).message}`); setIsPlaying(false); });
  }
}

/** Reads what the group plays and shows it: our song (by its place in the queue and its URL), its position, the volume. */
async function poll(): Promise<void> {
  const g = chosenGroup();
  if (g === null || polling) return;
  polling = true;
  try {
    const group = g as sonos.Group;
    await system().update(group);
    const n = group.track.number - 1;
    const ours = n >= 0 && n < sonosUrls.length && group.track.uri === sonosUrls[n];
    batch(() => {
      setVolumeShown(group.volume);
      if (!ours) { if (current() !== null && !group.playing()) setIsPlaying(false); return; }
      at = sonosFrom + n;
      if (current() !== queue[at]) setCurrent(queue[at]);
      setIsPlaying(group.playing());
      setPosition(group.track.position);
      setLength(group.track.duration > 0 ? group.track.duration : queue[at].durationMs / 1000);
    });
  } catch (e) { setPlayError((e as Error).message); }
  polling = false;
}
function startPolling(): void { if (pollTimer < 0) pollTimer = setInterval(() => { poll(); }, SONOS_POLL_MS); }
function stopPolling(): void { if (pollTimer >= 0) clearInterval(pollTimer); pollTimer = -1; }

async function onGroup(what: (g: sonos.Group) => Promise<void>): Promise<void> {
  const g = chosenGroup();
  if (g === null) return;
  try { await what(g as sonos.Group); } catch (e) { setPlayError((e as Error).message); }
  poll();
}

/** Plays on `id` ('' = this computer, else a Sonos group's id): the track shown starts again there, the old output stops. */
export async function chooseOutput(id: string): Promise<void> {
  if (id === output()) return;
  const before = chosenGroup();
  const resume = current() !== null && at >= 0 ? at : -1;
  loads++;
  closeLocal();
  if (before !== null && isPlaying()) { try { await system().pause(before as sonos.Group); } catch (e) { /* gone: nothing to stop */ } }
  setOutput(id);
  setVolumeShown(-1);
  if (id === '') stopPolling(); else { startPolling(); poll(); }
  if (resume >= 0) await load(resume);
}

/** Plays `list[i]`, then the tracks after it, from the iPod `lib`. */
export function playList(lib: PodLibrary, list: ipod.Track[], i: i32): void {
  pod = lib;
  queue = list.slice();
  load(i);
}

export function toggle(): void {
  if (chosenGroup() !== null) {
    if (isPlaying()) { setIsPlaying(false); onGroup((g: sonos.Group) => system().pause(g)); }
    else if (current() !== null && sonosUrls.length > 0) { setIsPlaying(true); onGroup((g: sonos.Group) => system().play(g)); }
    else if (queue.length > 0) load(at >= 0 ? at : 0);
    return;
  }
  const m = music;
  if (m === null) { if (queue.length > 0) load(at >= 0 ? at : 0); return; }
  if (isPlaying()) { (m as Music).pause(); setIsPlaying(false); stopTicking(); tick(); }
  else { (m as Music).play(); setIsPlaying(true); startTicking(); }
}

export function next(): void {
  if (chosenGroup() !== null && sonosUrls.length > 0) { onGroup((g: sonos.Group) => system().next(g)); return; }
  if (at + 1 < queue.length) load(at + 1); else stop();
}

export function previous(): void {
  if (chosenGroup() !== null && sonosUrls.length > 0) {
    if (position() > RESTART_AFTER || at <= sonosFrom) seek(0); else onGroup((g: sonos.Group) => system().previous(g));
    return;
  }
  const m = music;
  if (m !== null && (m as Music).position > RESTART_AFTER) { seek(0); return; }
  load(at > 0 ? at - 1 : 0);
}

/** Moves to `seconds` into the track. */
export function seek(seconds: number): void {
  if (chosenGroup() !== null) { setPosition(seconds); onGroup((g: sonos.Group) => system().seek(g, seconds)); return; }
  const m = music;
  if (m === null) return;
  (m as Music).seek(seconds);
  setPosition(seconds);
}

/** The Sonos group's volume, 0..100. */
export function setVolume(v: i32): void {
  setVolumeShown(v);
  onGroup((g: sonos.Group) => system().setGroupVolume(g, v));
}

/** Stops and forgets the queue (the iPod was closed or another one opened). */
export function stop(): void {
  loads++;   // a fetch under way plays nothing
  closeLocal();
  const g = chosenGroup();
  if (g !== null && sonosUrls.length > 0 && isPlaying()) system().pause(g as sonos.Group).catch((e: Error) => { /* gone */ });
  sonosUrls = [];
  queue = [];
  at = -1;
  batch(() => { setCurrent(null); setIsPlaying(false); setPosition(0); setLength(0); });
}
