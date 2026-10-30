// The guided radio in the app (services/radio.ts picks the songs, in the recommendation worker): "Start radio" from a song or a Genius
// list plays the seed and ten songs, and the queue is topped up by ten whenever fewer than five are left after the one playing, here or
// on the Sonos group (the queue's edits are put on the group by services/player.ts). 👍 and 👎 in the bar act on the song playing: the
// songs the radio queued after it are picked again at once (👎 also skips it). The radio ends when another list is played. It is never
// saved to the iPod. The radio's changes to the queue run one after the other (`chain`): each asks the worker with the queue as it is.
import { createSignal } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as queue from './services/queue';
import * as rd from './services/radio';
import { playList, next, current } from './services/player';
import { PodLibrary } from './services/ipod';
import { library } from './state';
import { modelNow, job, ask, tracksOf } from './drafts';
import { prepareNear } from './deep';
import { log } from './services/log';

const LOW: i32 = 5;    // fewer songs than this left after the one playing: ten more
const MORE: i32 = 10;

export const [radioOn, setRadioOn] = createSignal<boolean>(false);
let radio: rd.Radio | null = null;
let first: queue.Entry | null = null;   // the queue's first entry when the radio started: another list replaces it
let pending = false;
let chain: Promise<void> = Promise.resolve();

function queuedIds(): string[] { return queue.entries().map((e: queue.Entry) => e.track.id); }

/** The radio's next `n` songs after `queued` (rd.extend in the worker); the songs it marked as used are kept in `r`. */
async function pick(r: rd.Radio, queued: string[], n: i32): Promise<ipod.Track[]> {
  if (!(await modelNow())) return [];
  const j = job('radio');
  j.radio = r; j.queued = queued; j.size = n;
  const o = await ask(j);
  if (o === null) return [];
  r.used = (o.radio as rd.Radio).used;
  return tracksOf(o.ids as string[]);
}

/** "Start radio": the seed now, then songs close to it, without end. */
export async function startRadio(seed: ipod.Track): Promise<void> {
  const lib = library();
  if (lib === null) return;
  await prepareNear([seed.id]);   // returns at once without AudioMuse
  const r = rd.newRadio(seed.id);
  const picks = await pick(r, [seed.id], MORE);
  if (picks.length === 0 || library() !== lib) return;   // not a music track
  playList(lib as PodLibrary, [seed].concat(picks), 0, `Radio · ${seed.title !== '' ? seed.title : 'Untitled'}`);
  radio = r; first = queue.entries()[0];
  setRadioOn(true);
}

function stopRadio(): void { radio = null; first = null; setRadioOn(false); }

/** Runs `f` after the radio's earlier changes to the queue, when the radio still plays. */
function then(f: (r: rd.Radio) => Promise<void>): Promise<void> {
  chain = chain.then(async (): Promise<void> => { const r = radio; if (r !== null) await f(r as rd.Radio); })
    .catch((e: Error) => { log('Radio', e.message, false); });
  return chain;
}

/** After each change of the queue (off the change itself): the radio ends when its list was replaced, else it is topped up. */
function check(): void {
  pending = false;
  if (radio === null) return;
  const list = queue.entries();
  if (list.length === 0 || list[0] !== first) { stopRadio(); return; }
  if (list.length - 1 - queue.position() < LOW) then(async (r: rd.Radio): Promise<void> => {
    if (queue.entries().length - 1 - queue.position() >= LOW) return;   // topped up meanwhile
    const more = await pick(r, queuedIds(), MORE);
    if (more.length > 0 && radio === r) queue.extend(more);
  });
}
queue.onChange(() => { if (radio !== null && !pending) { pending = true; setTimeout(check, 0); } });

/** The radio's songs after the hand-added ones are picked again (after a 👍 or a 👎). */
function retune(): Promise<void> {
  return then(async (r: rd.Radio): Promise<void> => {
    const dropped = queue.dropUpcoming();
    rd.unqueue(r, dropped.map((t: ipod.Track) => t.id));
    const more = await pick(r, queuedIds(), MORE);
    if (more.length > 0 && radio === r) queue.extend(more);
  });
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
  const t = current();
  if (radio === null || t === null) return;
  rd.dislike(radio as rd.Radio, (t as ipod.Track).id);
  retune().then(() => { if (radio !== null) next(); });
}
