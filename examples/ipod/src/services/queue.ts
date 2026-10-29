// The play queue, as Spotify shows it: the track that plays, "Next in queue" (the tracks added by hand: Play next puts them first,
// Add to queue after the others) and "Next from <album, playlist, songs>" (the list it was started from, shuffled or not). It is one flat
// list, as a Sonos queue is: the tracks played (history), the current one, the hand-added block right after it, then the rest of the
// list. Every change is one of three edits (insert, remove, move a range), reported to `onEdit`, so services/player.ts replays it on a
// Sonos group's queue with the same numbers. Shuffle reorders only what follows the hand-added block; turned off, the list comes back in
// its order from the current track. Repeat: 'off', 'all' (back to the first entry, as a Sonos queue does), 'one'. No side effect here:
// the player plays, services/session.ts saves.
import { createSignal } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';

export class Entry {
  track: ipod.Track;
  /** Added by hand (Play next, Add to queue): shown under "Next in queue". */
  manual: boolean;
  /** Its place in the list it was started from, -1 for a track added by hand. */
  from: i32;
  /** Unique in the queue: what the panel's rows and the drag hold. */
  key: i32;
  constructor(track: ipod.Track, manual: boolean, from: i32, key: i32) { this.track = track; this.manual = manual; this.from = from; this.key = key; }
}

/** One change of the flat list: 'insert' (`count` entries at `at`), 'remove' (`count` from `at`), 'move' (`count` from `at` to before
 *  `before`, numbers before the move). */
export class Edit {
  kind: string; at: i32; count: i32; before: i32; entries: Entry[];
  constructor(kind: string, at: i32, count: i32, before: i32, entries: Entry[]) { this.kind = kind; this.at = at; this.count = count; this.before = before; this.entries = entries; }
}

/** Bumped by every change: what the queue panel and the session follow. */
export const [queueVersion, setQueueVersion] = createSignal<i32>(0);
export const [shuffle, setShuffleShown] = createSignal<boolean>(false);
/** 'off' | 'all' | 'one'. */
export const [repeat, setRepeatShown] = createSignal<string>('off');
/** "Album · First", "Playlist · Road", "Songs": what "Next from" names. */
export const [contextName, setContextName] = createSignal<string>('');

let items: Entry[] = [];
let at: i32 = -1;
let context: ipod.Track[] = [];
let keys: i32 = 0;
let listeners: ((e: Edit) => void)[] = [];
let watchers: (() => void)[] = [];

/** Called with every edit, after it is applied (services/player.ts keeps a Sonos queue in step). */
export function onEdit(f: (e: Edit) => void): void { listeners.push(f); }
/** Called after every change, the current entry moving included (src/radio.ts tops the queue up). */
export function onChange(f: () => void): void { watchers.push(f); }
function changed(): void { setQueueVersion(queueVersion() + 1); for (const f of watchers) f(); }

export function entries(): Entry[] { return items; }
export function position(): i32 { return at; }
export function contextTracks(): ipod.Track[] { return context; }
export function current(): Entry | null { return at >= 0 && at < items.length ? items[at] : null; }
/** How many entries after the current one were added by hand (they always follow it). */
export function manualCount(): i32 { let n: i32 = 0; while (at + 1 + n < items.length && items[at + 1 + n].manual) n++; return n; }
/** "Next in queue" and "Next from": index ranges of `entries()`. */
export function nextInQueue(): Entry[] { return items.slice(at + 1, at + 1 + manualCount()); }
export function nextFrom(): Entry[] { return items.slice(at + 1 + manualCount()); }
export function isEmpty(): boolean { return items.length === 0; }

function make(tracks: ipod.Track[], manual: boolean, from: i32): Entry[] {
  const out: Entry[] = [];
  for (let i: i32 = 0; i < tracks.length; i++) out.push(new Entry(tracks[i], manual, manual ? -1 : from + i, ++keys));
  return out;
}

// ---- the three edits: the current entry stays current (its index follows it)

function insert(i: i32, list: Entry[]): void {
  if (list.length === 0) return;
  items.splice(i, 0, ...list);
  if (at >= i && at >= 0) at += list.length;
  report(new Edit('insert', i, list.length, 0, list));
}
function remove(i: i32, n: i32): void {
  if (n <= 0) return;
  items.splice(i, n);
  if (at >= i + n) at -= n; else if (at >= i) at = Math.min(i, items.length - 1) as i32;
  report(new Edit('remove', i, n, 0, []));
}
/** Moves `n` entries from `i` to before `before` (an index before the move). */
function move(i: i32, n: i32, before: i32): void {
  if (n <= 0 || (before >= i && before <= i + n)) return;
  const playing = current();
  const moved = items.splice(i, n);
  const to = before > i ? before - n : before;
  items.splice(to, 0, ...moved);
  if (playing !== null) at = items.indexOf(playing as Entry) as i32;
  report(new Edit('move', i, n, before, moved));
}
function report(e: Edit): void { for (const f of listeners) f(e); changed(); }

// ---- what the app asks

/** A new queue: `list` started at `i` (shuffled after it when shuffle is on). Nothing is reported: the player loads it whole. */
export function start(list: ipod.Track[], i: i32, name: string): void {
  context = list.slice();
  items = make(context, false, 0);
  at = i;
  setContextName(name);
  if (shuffle()) items = items.slice(0, at + 1).concat(shuffled(items.slice(at + 1)));
  changed();
}
/** The queue as a saved session had it (services/session.ts). */
export function restore(list: Entry[], i: i32, ctx: ipod.Track[], name: string, shuffleOn: boolean, rep: string): void {
  items = list; at = i; context = ctx;
  for (const e of list) if (e.key > keys) keys = e.key;
  setContextName(name); setShuffleShown(shuffleOn); setRepeatShown(rep);
  changed();
}
export function newEntry(track: ipod.Track, manual: boolean, from: i32): Entry { return new Entry(track, manual, from, ++keys); }
/** Forgets the queue. */
export function clear(): void { items = []; at = -1; context = []; setContextName(''); changed(); }

/** Right after the current track, before the other hand-added ones. */
export function playNext(tracks: ipod.Track[]): void { insert(at + 1, make(tracks, true, 0)); }
/** After the hand-added ones, before the rest of the list. */
export function addToQueue(tracks: ipod.Track[]): void { insert(at + 1 + manualCount(), make(tracks, true, 0)); }
/** At the end of the list it was started from (a radio growing). */
export function extend(tracks: ipod.Track[]): void {
  const list = make(tracks, false, context.length as i32);
  context = context.concat(tracks);
  insert(items.length as i32, list);
}
/** Takes out what follows the hand-added block (a radio picking again); the tracks taken out. */
export function dropUpcoming(): ipod.Track[] {
  const tail = at + 1 + manualCount();
  const out = items.slice(tail).map((e: Entry) => e.track);
  remove(tail, (items.length - tail) as i32);
  // ponytail: the list loses them too; right for a radio (they end it), shuffled entries before them keep their old places
  context = context.filter((t: ipod.Track) => out.indexOf(t) < 0);
  return out;
}
/** Empties "Next in queue". */
export function clearHandAdded(): void { remove(at + 1, manualCount()); }
/** Takes the entry `i` (of `entries()`, after the current one) out. */
export function removeAt(i: i32): void { if (i > at && i < items.length) remove(i, 1); }
/** Moves the entry `from` so it becomes the entry `to` (both after the current one); `manual` is the section it is dropped in. */
export function moveTo(from: i32, to: i32, manual: boolean): void {
  if (from <= at || to <= at || from >= items.length) return;
  const e = items[from];
  const t = Math.min(to, items.length - 1) as i32;
  e.manual = manual;
  if (t !== from) move(from, 1, t > from ? t + 1 : t); else changed();
}
/** Jumps to the entry `i`: in "Next in queue" the ones above it are passed; in "Next from" the hand-added block moves along to follow it. */
export function jumpTo(i: i32): void {
  if (i <= at || i >= items.length) return;
  const n = manualCount();
  if (i > at + n && n > 0) { move(at + 1, n, i + 1); at = i - n; }
  else at = i;
  changed();
}
/** The next entry: false at the end (repeat all goes back to the first). */
export function advance(): boolean {
  if (at + 1 < items.length) { at++; changed(); return true; }
  if (repeat() === 'all' && items.length > 0) { at = 0; changed(); return true; }
  return false;
}
/** The entry before (false at the first). */
export function back(): boolean { if (at > 0) { at--; changed(); return true; } return false; }
/** The group moved by itself (Sonos): the current entry is `i`. */
export function setPosition(i: i32): void { if (i !== at && i >= 0 && i < items.length) { at = i; changed(); } }

/** Turns shuffle on (what follows the hand-added block is shuffled) or off (the list again, in its order, from the current track). */
export function setShuffle(on: boolean): void {
  setShuffleShown(on);
  if (at < 0) { changed(); return; }
  const tail = at + 1 + manualCount();
  let next: Entry[] = [];
  if (on) next = shuffled(items.slice(tail));
  else {
    let from: i32 = -1;   // the list's place of the current track, or of the last one of the list played
    for (let k = at; k >= 0 && from < 0; k--) from = items[k].from;
    next = make(context.slice(from + 1), false, from + 1);
  }
  remove(tail, items.length - tail);
  insert(tail, next);
}
export function setRepeat(mode: string): void { setRepeatShown(mode); }

function shuffled(list: Entry[]): Entry[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)) as i32; const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}
