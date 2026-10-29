// The listening session, kept as Spotify keeps it: the queue (the hand-added entries and the list it was started from), the current track
// and the moment in it, shuffle and repeat, the output and its volume, in <backups>/session.json (beside config.json). Written on each
// change and every few seconds while playing. At start, once the same iPod is open, it is shown paused at that moment; Play resumes there
// on the same output. On a Sonos group that still plays it (the same song URLs: the app serves them again on the same port and token),
// the app follows the group as it is; a group whose queue was replaced is left alone and the session stays paused. The iPod not there:
// the file waits for it, and DevicesPage names what will resume.
import { createSignal, createEffect } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { backupPlace } from './log';
import { PodLibrary } from './ipod';
import * as queue from './queue';
import { current, isPlaying, position, volume, showRestored, attachTo, sonosStart, playingLibrary } from './player';
import { output, setOutput, outputs, setOutputs, findSpeakers, chosenGroup, reuseServer, serverPort, serverToken, OutputChoice } from './sonos';

const SAVE_EVERY_MS = 5000;   // while playing: the moment in the track

/** A session saved for an iPod that is not open: "Song — Artist", for DevicesPage ('' when none). */
export const [waiting, setWaiting] = createSignal<string>('');

function file(): string { return `${backupPlace()}/session.json`; }
/** What names an iPod across runs: its serial, else the remote daemon's address, else where it is mounted. */
function podKey(lib: PodLibrary): string { return lib.device.serial !== '' ? lib.device.serial : lib.remote !== '' ? lib.remote : lib.device.mountpoint; }

let restoring = false;   // nothing is saved while a session is read back
let lastSaved = '';

/** Writes the session (nothing when the queue is empty: an iPod gone keeps its session on disk). */
export function save(): void {
  const lib = playingLibrary();
  if (restoring || lib === null || queue.isEmpty()) return;
  const list = queue.entries();
  const ids: string[] = [], manual: i32[] = [], from: i32[] = [];
  for (const e of list) { ids.push(e.track.id); manual.push(e.manual ? 1 : 0); from.push(e.from); }
  let outputName = '';
  for (const o of outputs()) if (o.id === output()) outputName = o.name;
  const c = current();
  const text = JSON.stringify({
    title: c !== null ? `${(c as ipod.Track).title}${(c as ipod.Track).artist !== '' ? ' — ' + (c as ipod.Track).artist : ''}` : '',
    pod: podKey(lib as PodLibrary), ids, manual, from, at: queue.position(), context: queue.contextTracks().map((t: ipod.Track) => t.id),
    name: queue.contextName(), shuffle: queue.shuffle(), repeat: queue.repeat(), position: Math.floor(position()), playing: isPlaying(),
    output: output(), outputName, volume: volume(), sonosFrom: sonosStart(), port: serverPort(), token: serverToken(),
  }) + '\n';
  if (text === lastSaved) return;
  try { fs.mkdir(backupPlace(), true); fs.writeText(file(), text); lastSaved = text; }
  catch (e) { console.error(`ipod: ${file()}: ${(e as Error).message}`); }
}

function text(): string { try { return fs.exists(file()) ? fs.readText(file()) : ''; } catch (e) { return ''; } }

/** At start: the server's port and token of the last run, and the name of what waits for its iPod. */
export function prepare(): void {
  const t = text();
  if (t === '') return;
  try {
    const s = JSON.parse(t);
    if (typeof s.token === 'string' && s.token !== '') reuseServer(s.port as i32, s.token as string);
    if (typeof s.title === 'string') setWaiting(s.title as string);
  } catch (e) { /* unreadable: no session */ }
}

/** The iPod `lib` was opened: its saved session, if any, is shown paused (and followed on its Sonos group when the group still plays it). */
export async function resume(lib: PodLibrary): Promise<void> {
  const t = text();
  if (t === '' || current() !== null) return;
  let s = JSON.parse('{}');
  try { s = JSON.parse(t); } catch (e) { return; }
  if (s.pod !== podKey(lib) || !Array.isArray(s.ids)) return;
  const byId = new Map<string, ipod.Track>();
  for (const t of lib.tracks) byId.set(t.id, t);
  const ids = s.ids as string[], manual = s.manual as number[], from = s.from as number[];
  const list: queue.Entry[] = [];
  let at: i32 = -1;
  for (let i = 0; i < ids.length; i++) {
    const tr = byId.get(ids[i]);
    if (tr === undefined) continue;   // deleted since
    if (i === (s.at as number)) at = list.length as i32;
    list.push(queue.newEntry(tr as ipod.Track, manual[i] === 1, from[i] as i32));
  }
  if (at < 0 || list.length === 0) return;
  const ctx: ipod.Track[] = [];
  for (const id of s.context as string[]) { const c = byId.get(id); if (c !== undefined) ctx.push(c as ipod.Track); }
  restoring = true;
  queue.restore(list, at, ctx, s.name as string, s.shuffle === true, s.repeat as string);
  showRestored(lib, s.position as number, s.volume as number as i32);
  setWaiting('');
  const group = s.output as string;
  if (group !== '') {
    setOutput(group);   // shown at once, by its name, while the group is looked for
    if (outputs().length === 0 && s.outputName !== '') setOutputs([new OutputChoice(group, s.outputName as string)]);
    await findSpeakers();
    if (chosenGroup() === null) setOutput('');   // gone: Play resumes on this computer
    else await attachTo(s.sonosFrom as number as i32);
  }
  restoring = false;
}

/** Saves on each change of the queue, the output, shuffle, repeat, play or pause, and every few seconds while playing. */
export function startSaving(): void {
  createEffect(() => { queue.queueVersion(); queue.shuffle(); queue.repeat(); output(); isPlaying(); volume(); save(); });
  setInterval(() => { if (isPlaying()) save(); }, SAVE_EVERY_MS);
}
