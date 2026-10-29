// The guided radio in the app (services/radio.ts picks the songs): "Start radio" from a song or a Genius list plays the seed and ten
// songs, and the queue is topped up by ten whenever fewer than five are left after the one playing, here or on the Sonos group (the
// queue's edits are put on the group by services/player.ts). 👍 and 👎 in the bar act on the song playing: the songs the radio queued
// after it are picked again at once (👎 also skips it). The radio ends when another list is played. It is never saved to the iPod.
import { createSignal } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as queue from './services/queue';
import * as rd from './services/radio';
import { playList, next, current } from './services/player';
import { PodLibrary } from './services/ipod';
import { library } from './state';
import { currentModel } from './drafts';
import { prepareNear } from './deep';
import { Model } from './services/genius';

const LOW: i32 = 5;    // fewer songs than this left after the one playing: ten more
const MORE: i32 = 10;

export const [radioOn, setRadioOn] = createSignal<boolean>(false);
let radio: rd.Radio | null = null;
let first: queue.Entry | null = null;   // the queue's first entry when the radio started: another list replaces it
let pending = false;

function queuedIds(): string[] { return queue.entries().map((e: queue.Entry) => e.track.id); }

/** "Start radio": the seed now, then songs close to it, without end. */
export function startRadio(seed: ipod.Track): void {
  const lib = library();
  if (lib === null) return;
  prepareNear([seed.id]).then(() => {   // returns at once without AudioMuse
    const m = currentModel();
    if (m === null) return;
    const r = rd.startRadio(m as Model, seed.id);
    if (r === null) return;
    const picks = rd.extend(m as Model, r as rd.Radio, [seed.id], MORE);
    playList(lib as PodLibrary, [seed].concat(picks), 0, `Radio · ${seed.title !== '' ? seed.title : 'Untitled'}`);
    radio = r; first = queue.entries()[0];
    setRadioOn(true);
  });
}

function stopRadio(): void { radio = null; first = null; setRadioOn(false); }

/** After each change of the queue (off the change itself): the radio ends when its list was replaced, else it is topped up. */
function check(): void {
  pending = false;
  if (radio === null) return;
  const list = queue.entries();
  if (list.length === 0 || list[0] !== first) { stopRadio(); return; }
  if (list.length - 1 - queue.position() < LOW) top();
}
queue.onChange(() => { if (radio !== null && !pending) { pending = true; setTimeout(check, 0); } });

function top(): void {
  const m = currentModel();
  if (m === null || radio === null) return;
  const more = rd.extend(m as Model, radio as rd.Radio, queuedIds(), MORE);
  if (more.length > 0) queue.extend(more);
}

/** The radio's songs after the hand-added ones are picked again (after a 👍 or a 👎). */
function retune(): void {
  const dropped = queue.dropUpcoming();
  rd.unqueue(radio as rd.Radio, dropped.map((t: ipod.Track) => t.id));
  top();
}

/** 👍 on the song playing: the next picks come closer to it. */
export function likeNow(): void {
  const t = current();
  if (radio === null || t === null) return;
  rd.like(radio as rd.Radio, (t as ipod.Track).id);
  retune();
}

/** 👎 on the song playing: skipped, the next picks move away from it, its artist is out of the radio. */
export function dislikeNow(): void {
  const t = current(), m = currentModel();
  if (radio === null || t === null || m === null) return;
  rd.dislike(m as Model, radio as rd.Radio, (t as ipod.Track).id);
  retune();
  next();
}
