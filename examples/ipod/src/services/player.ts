// Plays the queue (services/queue.ts) from the open iPod, on this computer or on a Sonos group (services/sonos.ts). Here: zinc:audio's
// Music, each file read from the iPod as it plays, never copied (a remote iPod's file is first fetched into a cache, services/remote.ts).
// On Sonos: the group's queue is the app's queue from the track it started on (up to SONOS_QUEUE_MAX entries); every change of the
// app's queue (play next, add, remove, move, shuffle) is replayed on it with the same numbers, the speakers fetch the files over HTTP and
// go through the queue by themselves, repeat is the group's play mode. The bar follows the group through the speakers' events (the
// position counted here between them, the group read every 15 s), or reads it once a second when no event comes; a queue changed by
// another app (the Sonos app) is read back, and one replaced by other music leaves the app's queue paused, the speaker untouched.
// Read only: playing changes nothing on the iPod (no play count is written).
import { createSignal, batch } from 'zinc:ui/solid';
import { openMusic, Music } from 'zinc:audio';
import * as ipod from 'zinc:ipod';
import * as sonos from 'zinc:sonos';
import { PodLibrary, playableFile } from './ipod';
import { chosenGroup, system, songsOf, output, setOutput, follow, unfollow, eventsHeard, trackIdOf } from './sonos';
import * as queue from './queue';

export const [current, setCurrent] = createSignal<ipod.Track | null>(null);
export const [isPlaying, setIsPlaying] = createSignal<boolean>(false);
export const [position, setPosition] = createSignal<number>(0);
export const [length, setLength] = createSignal<number>(0);
export const [playError, setPlayError] = createSignal<string>('');
/** The Sonos group's volume, 0..100 (-1 on this computer). */
export const [volume, setVolumeShown] = createSignal<i32>(-1);

const TICK_MS = 250;          // how often the position is read while a track plays (nothing ticks when paused)
const SONOS_POLL_MS = 1000;   // how often the Sonos group is read while it is the output and no event comes
const SONOS_RESYNC_S = 15;    // with events: the group is still read this often, for the position (an event carries none)
const SONOS_QUEUE_MAX = 1000; // entries of the app's queue put on the group, from the one it started on
const RESTART_AFTER = 3;      // seconds: previous() past this restarts the track, as iTunes does

let music: Music | null = null;
let pod: PodLibrary | null = null;
let loads: i32 = 0;   // counts the tracks asked for: a fetch that ends after another was asked is dropped
let timer: i32 = -1;

// ---- a listen: what services/scrobble.ts reads (the track, when it started, the ms heard). listenEvent is the one place a play
// starts, pauses, resumes, seeks and ends.

export class Listen {
  track: ipod.Track;
  /** Date.now() when it started. */
  startedAt: number;
  /** Milliseconds heard so far (a seek does not count what it skipped). */
  heardMs: number = 0;
  /** Date.now() of the last start or resume, -1 while paused. */
  since: number = -1;
  constructor(track: ipod.Track, startedAt: number) { this.track = track; this.startedAt = startedAt; }
}
let listen: Listen | null = null;

/** 'start' | 'pause' | 'resume' | 'seek' | 'end'. */
function listenEvent(kind: string): void {
  const now = Date.now();
  const l = listen;
  if (l !== null && (l as Listen).since >= 0 && kind !== 'start' && kind !== 'resume') { (l as Listen).heardMs += now - (l as Listen).since; (l as Listen).since = kind === 'seek' ? now : -1; }
  if (kind === 'start') {
    const t = current();
    listen = t !== null ? new Listen(t as ipod.Track, now) : null;
    if (listen !== null) (listen as Listen).since = now;
  } else if (kind === 'resume' && l !== null && (l as Listen).since < 0) (l as Listen).since = now;
  else if (kind === 'end') listen = null;
}
/** What plays now and whether it plays: the listen follows (a new track ends the one before and starts one). */
function showNow(t: ipod.Track | null, playing: boolean): void {
  const before = current(), was = isPlaying();
  if (t !== before) { if (before !== null) listenEvent('end'); setCurrent(t); setIsPlaying(playing); if (t !== null) { listenEvent('start'); if (!playing) listenEvent('pause'); } return; }
  if (playing !== was) { setIsPlaying(playing); listenEvent(playing ? 'resume' : 'pause'); }
}

// ---- on this computer

function tick(): void {
  const m = music;
  if (m === null) return;
  const mu = m as Music;
  if (mu.error !== '') { setPlayError(mu.error); stopTicking(); showNow(current(), false); return; }
  if (mu.ended) {
    if (queue.repeat() === 'one') { listenEvent('end'); mu.seek(0); mu.play(); listenEvent('start'); return; }
    next();
    return;
  }
  batch(() => { setPosition(mu.position); setLength(mu.duration > 0 ? mu.duration : (current() as ipod.Track).durationMs / 1000); });
}
function startTicking(): void { if (timer < 0) timer = setInterval(tick, TICK_MS); }
function stopTicking(): void { if (timer >= 0) clearInterval(timer); timer = -1; }

function closeLocal(): void {
  stopTicking();
  if (music !== null) (music as Music).close();
  music = null;
}

/** Plays the queue's current entry from `from` seconds, here or on the group. */
async function load(from: number = 0): Promise<void> {
  closeLocal();
  const e = queue.current();
  if (e === null || pod === null) { stop(); return; }
  if (chosenGroup() !== null) { await loadOnSonos(from); return; }
  const t = (e as queue.Entry).track;
  const asked = ++loads;
  let file = '';
  batch(() => { showNow(t, false); setPosition(from); setLength(t.durationMs / 1000); setPlayError(''); });
  try { file = await playableFile(pod as PodLibrary, t); }   // a remote iPod's track is fetched first
  catch (err) { if (asked === loads) setPlayError((err as Error).message); return; }
  if (asked !== loads) return;   // another track was asked for meanwhile
  const m = openMusic(file);
  music = m;
  m.play();   // starts once the file is open
  if (from > 0) m.seek(from);
  batch(() => { showNow(t, true); setPlayError(''); });
  startTicking();
}

// ---- on a Sonos group: its queue mirrors the app's from the entry `sonosFrom`

let sonosFrom: i32 = 0;      // the app's queue index of the group's first queued song
let sonosLen: i32 = 0;       // how many entries the group holds
let attached = false;        // the group's queue is ours (false: another app replaced it, or nothing was put there yet)
let mine: i32 = -1;          // the group's queueUpdateId after our last change: another one comes from another app
let ops: (() => Promise<void>)[] = [];   // the changes to send, one at a time, in order
let sending = false;
let polling = false;
let pollTimer: i32 = -1;
let sinceRead = 0;           // seconds since the group was read

function group(): sonos.Group { return chosenGroup() as sonos.Group; }
function urls(list: queue.Entry[]): string[] {
  const out: string[] = [];
  for (const s of songsOf(pod as PodLibrary, group(), list.map((e: queue.Entry) => e.track))) out.push(s.url);
  return out;
}
function metas(list: queue.Entry[]): string[] {
  const out: string[] = [];
  for (const s of songsOf(pod as PodLibrary, group(), list.map((e: queue.Entry) => e.track))) out.push(sonos.musicTrackMeta(s));
  return out;
}

function send(op: () => Promise<void>): void { ops.push(op); runOps(); }
async function runOps(): Promise<void> {
  if (sending) return;
  sending = true;
  while (ops.length > 0) {
    const op = ops.shift() as () => Promise<void>;
    try { await op(); } catch (e) { const g = chosenGroup(); setPlayError(`${g !== null ? (g as sonos.Group).name() + ': ' : ''}${(e as Error).message}`); }
  }
  const g = chosenGroup();
  if (g !== null) mine = (g as sonos.Group).queueUpdateId;
  sending = false;
}

/** Puts the app's queue on the group from the current entry and plays it from `from` seconds. */
async function loadOnSonos(from: number): Promise<void> {
  const g = group(), house = system();
  const asked = ++loads;
  const e = queue.current() as queue.Entry;
  batch(() => { showNow(e.track, false); setPosition(from); setLength(e.track.durationMs / 1000); setPlayError(''); });
  ops = [];
  sonosFrom = queue.position();
  const list = queue.entries().slice(sonosFrom, sonosFrom + SONOS_QUEUE_MAX);
  const us = urls(list), ms = metas(list);
  sonosLen = list.length;
  attached = true;
  send(async (): Promise<void> => {
    await house.clearQueue(g);
    await house.addMultipleUrisToQueue(g, us.slice(0, 16), ms.slice(0, 16));
    await house.setPlayMode(g, sonos.playModeOf(false, repeatName(queue.repeat())));
    await house.playFromQueue(g, 0);
    if (from > 1) await house.seek(g, from);
    if (asked === loads) showNow(e.track, true);
    startPolling();
    if (us.length > 16) await house.addMultipleUrisToQueue(g, us.slice(16), ms.slice(16));   // the others while the first plays
  });
}
function repeatName(r: string): string { return r === 'off' ? 'none' : r; }

/** An edit of the app's queue, replayed on the group's (numbers from 1, the group's entry 1 being the app's `sonosFrom`). */
function mirror(ed: queue.Edit): void {
  if (chosenGroup() === null || !attached) return;
  const g = group(), house = system();
  const n = ed.at - sonosFrom + 1;
  if (n < 1) { if (ed.kind === 'insert') sonosFrom += ed.count; else if (ed.kind === 'remove') sonosFrom -= ed.count; return; }   // before the group's first: not there
  if (ed.kind === 'insert') {
    if (n > sonosLen + 1) return;   // past what the group holds
    const us = urls(ed.entries), ms = metas(ed.entries);
    sonosLen += ed.count;
    send(async (): Promise<void> => { await house.addMultipleUrisToQueue(g, us, ms, n); });
  } else if (ed.kind === 'remove') {
    const count = Math.min(ed.count, sonosLen - n + 1) as i32;
    if (count <= 0) return;
    sonosLen -= count;
    send(async (): Promise<void> => { await house.removeRangeFromQueue(g, n, count, 0); });
  } else {
    const before = ed.before - sonosFrom + 1;
    if (n + ed.count - 1 > sonosLen || before > sonosLen + 1) return;
    send(async (): Promise<void> => { await house.reorderTracksInQueue(g, n, ed.count, before, 0); });
  }
}
queue.onEdit(mirror);

/** Reads what the group plays and shows it: our song (by its place in the queue and its URL), its position, the volume. */
async function poll(): Promise<void> {
  const g = chosenGroup();
  if (g === null || polling) return;
  polling = true;
  try {
    const grp = g as sonos.Group;
    await system().update(grp);
    sinceRead = 0;
    show(grp, true);
  } catch (e) { setPlayError((e as Error).message); }
  polling = false;
}
function isOurs(grp: sonos.Group): boolean {
  if (!attached || !grp.media.uri.startsWith('x-rincon-queue:')) return false;
  const n = grp.track.number - 1, list = queue.entries();
  return n >= 0 && sonosFrom + n < list.length && grp.track.uri === urls([list[sonosFrom + n]])[0];
}
/** Shows what the group plays; `withPosition` false (an event) keeps the position counted here unless the song changed. */
function show(grp: sonos.Group, withPosition: boolean): void {
  setVolumeShown(grp.volume);
  if (sending) return;   // our changes are on their way: the next event or poll tells
  if (grp.queueUpdateId > mine && attached && pod !== null) { readBack(grp); return; }   // another app changed the queue (the ids only grow)
  if (!isOurs(grp)) { if (attached && current() !== null && grp.media.uri !== '' && !grp.media.uri.startsWith('x-rincon-queue:')) attached = false; if (!grp.playing()) showNow(current(), false); return; }
  if (grp.shuffle()) { setShuffle(true); send(async (): Promise<void> => { await system().setPlayMode(grp, sonos.playModeOf(false, grp.repeat())); }); }   // shuffle from the Sonos app: laid out here
  const rep = grp.repeat() === 'none' ? 'off' : grp.repeat();
  if (rep !== queue.repeat()) queue.setRepeat(rep);
  const i = sonosFrom + grp.track.number - 1;
  const moved = i !== queue.position();
  batch(() => {
    queue.setPosition(i);
    const t = (queue.current() as queue.Entry).track;
    showNow(t, grp.playing());
    if (withPosition || moved) setPosition(grp.track.position);
    setLength(grp.track.duration > 0 ? grp.track.duration : t.durationMs / 1000);
  });
}

/** The group's queue was changed by another app: read it; ours again (its songs all ours, the app's queue rebuilt from it), or another
 *  music (the app's queue stays, paused, and the speaker is left alone). */
async function readBack(grp: sonos.Group): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const q = await system().getQueue(grp, 0, 0);
    mine = q.updateId;
    const lib = pod as PodLibrary, list = queue.entries();
    const byId = new Map<string, ipod.Track>();
    for (const t of lib.tracks) byId.set(t.id, t);
    // each song of the group is matched with an entry of ours, in order (a song twice in the queue, once by hand and once from the
    // album, keeps both marks right): the next unused entry of that track after the last one matched, else any unused one
    const used: boolean[] = list.map((e: queue.Entry) => false);
    const rebuilt: queue.Entry[] = list.slice(0, sonosFrom);
    let foreign = false, j = sonosFrom;
    for (const it of q.items) {
      const t = byId.get(trackIdOf(it.uri));
      if (t === undefined || urls([queue.newEntry(t as ipod.Track, false, -1)])[0] !== it.uri) { foreign = true; break; }
      let k = -1;
      for (let i = j; i < list.length && k < 0; i++) if (!used[i] && list[i].track === t) k = i;
      for (let i = sonosFrom; i < list.length && k < 0; i++) if (!used[i] && list[i].track === t) k = i;
      if (k >= 0) { used[k] = true; j = k + 1; }
      rebuilt.push(queue.newEntry(t as ipod.Track, k >= 0 && list[k].manual, k >= 0 ? list[k].from : -1));
    }
    if (foreign || q.items.length === 0) { attached = false; showNow(current(), false); }
    else {
      sonosLen = q.items.length;
      const n = grp.track.number > 0 ? grp.track.number : 1;
      queue.restore(rebuilt, sonosFrom + n - 1, queue.contextTracks(), queue.contextName(), queue.shuffle(), queue.repeat());
      showNow((queue.current() as queue.Entry).track, grp.playing());
    }
  } catch (e) { setPlayError((e as Error).message); }
  polling = false;
}

/** Once a second: with events, the position moves on here and the group is read every SONOS_RESYNC_S; without, it is read now. */
function sonosTick(): void {
  sinceRead++;
  if (!eventsHeard() || sinceRead >= SONOS_RESYNC_S) { poll(); return; }
  if (isPlaying() && current() !== null && position() + 1 <= length()) setPosition(position() + 1);
}
function startPolling(): void { if (pollTimer < 0) pollTimer = setInterval(sonosTick, SONOS_POLL_MS); }
function stopPolling(): void { if (pollTimer >= 0) clearInterval(pollTimer); pollTimer = -1; }
/** Subscribes the chosen group's events (sonosTick polls once a second until one comes). */
async function followGroup(): Promise<void> {
  const g = chosenGroup();
  if (g !== null) await follow(g as sonos.Group, (grp: sonos.Group) => show(grp, false));
}

function onGroup(what: (g: sonos.Group) => Promise<void>): void {
  const g = chosenGroup();
  if (g === null) return;
  send(async (): Promise<void> => { await what(g as sonos.Group); });
  send(async (): Promise<void> => { await poll(); });
}

/** Plays on `id` ('' = this computer, else a Sonos group's id): the track shown goes on there from the same moment, the old output stops. */
export async function chooseOutput(id: string): Promise<void> {
  if (id === output()) return;
  const before = chosenGroup();
  const resume = queue.current() !== null, wasPlaying = isPlaying(), at = position();
  loads++;
  closeLocal();
  if (before !== null && wasPlaying && attached) { try { await system().pause(before as sonos.Group); } catch (e) { /* gone: nothing to stop */ } }
  attached = false;
  setOutput(id);
  setVolumeShown(-1);
  if (id === '') { stopPolling(); unfollow(); } else { startPolling(); poll(); followGroup(); }
  if (resume && wasPlaying) await load(at);
}

/** Plays `list[i]`, then the tracks after it, from the iPod `lib`; `name` is what "Next from" says. */
export function playList(lib: PodLibrary, list: ipod.Track[], i: i32, name: string = ''): void {
  pod = lib;
  queue.start(list, i, name);
  load();
}
/** Play next and Add to queue (with nothing playing, the tracks play now). */
export function playNext(lib: PodLibrary, tracks: ipod.Track[], name: string): void {
  if (queue.current() === null || pod !== lib) { playList(lib, tracks, 0, name); return; }
  queue.playNext(tracks);
}
export function addToQueue(lib: PodLibrary, tracks: ipod.Track[], name: string): void {
  if (queue.current() === null || pod !== lib) { playList(lib, tracks, 0, name); return; }
  queue.addToQueue(tracks);
}
/** Double-click in the queue panel: plays that entry. */
export function jumpTo(i: i32): void {
  queue.jumpTo(i);
  if (chosenGroup() !== null && attached) { const n = queue.position() - sonosFrom + 1; showNow((queue.current() as queue.Entry).track, true); onGroup(async (g: sonos.Group): Promise<void> => { await system().seekTrack(g, n); await system().play(g); }); }
  else load();
}
export function setShuffle(on: boolean): void { if (on !== queue.shuffle()) queue.setShuffle(on); }
/** 'off' → 'all' → 'one' → 'off'. */
export function cycleRepeat(): void {
  const r = queue.repeat(), next = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
  queue.setRepeat(next);
  if (chosenGroup() !== null && attached) onGroup((g: sonos.Group) => system().setPlayMode(g, sonos.playModeOf(false, repeatName(next))));
}

export function toggle(): void {
  if (chosenGroup() !== null) {
    if (isPlaying()) { showNow(current(), false); onGroup((g: sonos.Group) => system().pause(g)); }
    else if (attached && current() !== null) { showNow(current(), true); onGroup((g: sonos.Group) => system().play(g)); }
    else if (queue.current() !== null) load(position());
    return;
  }
  const m = music;
  if (m === null) { if (queue.current() !== null) load(position()); return; }
  if (isPlaying()) { (m as Music).pause(); showNow(current(), false); stopTicking(); tick(); }
  else { (m as Music).play(); showNow(current(), true); startTicking(); }
}

export function next(): void {
  if (chosenGroup() !== null && attached) {
    if (queue.position() + 1 >= queue.entries().length && queue.repeat() !== 'all') return;
    onGroup((g: sonos.Group) => system().next(g));
    return;
  }
  if (queue.advance()) load();
  else { closeLocal(); listenEvent('end'); batch(() => { setIsPlaying(false); setPosition(0); }); }   // the end: the last track stays shown
}

export function previous(): void {
  if (chosenGroup() !== null && attached) {
    if (position() > RESTART_AFTER || queue.position() <= sonosFrom) seek(0); else onGroup((g: sonos.Group) => system().previous(g));
    return;
  }
  const m = music;
  if (m !== null && (m as Music).position > RESTART_AFTER) { seek(0); return; }
  if (queue.back()) load(); else seek(0);
}

/** Moves to `seconds` into the track. */
export function seek(seconds: number): void {
  listenEvent('seek');
  if (chosenGroup() !== null) { setPosition(seconds); if (attached) onGroup((g: sonos.Group) => system().seek(g, seconds)); return; }
  const m = music;
  setPosition(seconds);
  if (m !== null) (m as Music).seek(seconds);
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
  if (g !== null && attached && isPlaying()) system().pause(g as sonos.Group).catch((e: Error) => { /* gone */ });
  attached = false;
  ops = [];
  listenEvent('end');
  queue.clear();
  batch(() => { setCurrent(null); setIsPlaying(false); setPosition(0); setLength(0); });
}

/** The app quits (services/quit.ts): local sound stops; a group playing songs this app serves is paused ('pause') or stopped with
 *  its queue cleared ('clear') before the server goes, so the speaker never ends on a song it can no longer fetch. A group playing
 *  from the iPod daemon ('leave') goes on. Resolves once the speaker answered. */
export async function release(mode: string): Promise<void> {
  loads++;
  closeLocal();
  stopPolling();
  ops = [];
  const g = chosenGroup();
  if (isPlaying()) listenEvent('end');
  const ours = attached;
  attached = false;   // stop() after this (the iPod closed) leaves the group alone
  if (g === null || !ours || mode === 'leave') return;
  if (mode === 'clear') { await system().stop(g as sonos.Group); await system().clearQueue(g as sonos.Group); }
  else if (isPlaying()) await system().pause(g as sonos.Group);
}

// ---- a saved session (services/session.ts)

/** Shows the restored queue's current track paused at `at` seconds, on the iPod `lib`; Play resumes it there. */
export function showRestored(lib: PodLibrary, at: number, vol: i32): void {
  pod = lib;
  const e = queue.current();
  if (e === null) return;
  const t = (e as queue.Entry).track;
  batch(() => { showNow(t, false); setPosition(at); setLength(t.durationMs / 1000); setVolumeShown(vol); });
}
/** The group of the saved session: when its queue still holds ours from `from` (the same URLs), the app follows it as it is (playing or
 *  not); otherwise the session stays paused and the speaker untouched. True when attached. */
export async function attachTo(from: i32): Promise<boolean> {
  const g = chosenGroup();
  if (g === null || pod === null) return false;
  const grp = g as sonos.Group, house = system();
  try {
    await house.update(grp);
    if (!grp.media.uri.startsWith('x-rincon-queue:')) return false;
    const q = await house.getQueue(grp, 0, 0);
    const list = queue.entries().slice(from, from + q.items.length);
    if (q.items.length === 0 || list.length !== q.items.length) return false;
    const ours = urls(list);
    for (let k = 0; k < ours.length; k++) if (ours[k] !== q.items[k].uri) return false;
    sonosFrom = from; sonosLen = q.items.length; attached = true; mine = q.updateId;
    startPolling(); followGroup();
    show(grp, true);
    return true;
  } catch (e) { return false; }
}
/** Where the group's queue starts in the app's queue (saved with the session). */
export function sonosStart(): i32 { return sonosFrom; }
export function playingLibrary(): PodLibrary | null { return pod; }
