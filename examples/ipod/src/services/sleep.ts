// The sleep timer (the moon of the bar: components/SleepButton.tsx): in 15 to 90 minutes, at the end of the song playing, or at the end
// of the queue. In its last seconds (Settings: 60 by default) the volume fades down to nothing, here or on the Sonos group, then the
// music pauses and the volume comes back to what it was, so the next Play is not silent. The app does the fade and the pause itself on
// Sonos too (zinc:sonos has no SetSleepTimer). Also here, for services/alarm.ts: the clock both count with and the fades of the output's
// volume (0..100: this computer's, or the group's one call at a time, the last value asked sent once the call before ends).
// Test only: IPOD_DEMO_TIME_SCALE=120 makes the timer's and the alarm's minutes pass 120 times faster, and prints each volume step.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as ipod from 'zinc:ipod';
import * as sonos from 'zinc:sonos';
import { current, isPlaying, toggle, position, length, volume, setVolume, setVolumeShown, localVolume, setLocalVolume } from './player';
import { chosenGroup, system } from './sonos';
import * as queue from './queue';
import { loadConfig } from './config';
import { log } from './log';
import { now } from '../forYou';

// ---- the clock

const SCALE: number = sys.env('IPOD_DEMO_TIME_SCALE') !== '' ? Number(sys.env('IPOD_DEMO_TIME_SCALE')) : 1;
const started = Date.now(), base = now();
/** Now, in Unix seconds, as the sleep timer and the alarm count it (IPOD_DEMO_NOW sets where it starts). */
export function clock(): number { return base + (Date.now() - started) / 1000 * SCALE; }
/** A timer's period of `ms` milliseconds of that clock, in real milliseconds. */
export function every(ms: number): number { return Math.max(20, ms / SCALE); }
/** A line for the tests (only with IPOD_DEMO_TIME_SCALE). */
export function trace(line: string): void { if (SCALE !== 1) console.log(line); }

// ---- the output's volume, 0..100

/** The volume now: this computer's, or the group's (-1 while it was not read). */
export function outputVolume(): i32 {
  const g = chosenGroup();
  if (g === null) return Math.round(localVolume() * 100) as i32;
  return volume() >= 0 ? volume() : (g as sonos.Group).volume;
}

let wanted: i32 = -1, sent: i32 = -1;
let pumping: Promise<void> | null = null;
/** A fade starts: the group's volume is sent again even when it is the one sent last. */
export function beginFade(): void { sent = -1; }
/** One step of a fade, `v` in 0..100. */
export function fadeVolume(v: number): void {
  const n = Math.max(0, Math.min(100, Math.round(v))) as i32;
  const g = chosenGroup();
  if (g === null) {
    if (Math.round(localVolume() * 100) !== n) trace(`volume ${n}`);
    setLocalVolume(Math.max(0, Math.min(100, v)) / 100);
    return;
  }
  wanted = n;
  if (pumping === null && wanted !== sent) pumping = pump(g as sonos.Group);
}
async function pump(g: sonos.Group): Promise<void> {
  while (wanted !== sent) {
    const n = wanted;
    try { await system().setGroupVolume(g, n); } catch (e) { log('Volume', `${g.name()}: ${(e as Error).message}`, false); break; }
    sent = n;
    setVolumeShown(n);
  }
  pumping = null;
}
/** Resolves once the group has the last step asked. */
export async function fadeSent(): Promise<void> { const p = pumping; if (p !== null) await p; }

// ---- the sleep timer

/** '' (off), 'minutes', 'song' (the end of the song playing) or 'list' (the end of the queue). */
export const [sleepMode, setSleepMode] = createSignal<string>('');
/** Seconds left. */
export const [sleepLeft, setSleepLeft] = createSignal<number>(0);
export const [sleepOpen, setSleepOpen] = createSignal<boolean>(false);

const END_S = 1;   // 'song' and 'list': the pause comes this close to the end, before the player moves on

let endsAt = 0, timer: i32 = -1, fadeS = 60;
let before: i32 = -1;   // the volume when the fade started (-1: no fade under way)
let fadeLen = 0;        // seconds the fade lasts (shorter when the timer was set closer to the end)
let target: ipod.Track | null = null;   // 'song': the song it ends with
let ending = false;

/** Sets the timer ('minutes' with `minutes`, 'song', 'list'); another one set before is replaced. */
export function startSleep(mode: string, minutes: number = 0): void {
  stopSleep();
  endsAt = clock() + minutes * 60;
  target = current();
  fadeS = Math.max(1, loadConfig().sleepFadeS);
  setSleepMode(mode);
  timer = setInterval(sleepTick, every(250));
  sleepTick();
  log('Sleep timer', mode === 'minutes' ? `${minutes} min` : mode === 'song' ? 'at the end of this song' : 'at the end of the queue', true);
}

/** Turns the timer off (a fade under way goes back to the volume it started from). */
export function stopSleep(): void {
  if (timer >= 0) clearInterval(timer);
  timer = -1;
  if (before >= 0 && !ending) fadeVolume(before);
  before = -1;
  setSleepMode('');
}

function leftNow(): number {
  const m = sleepMode();
  if (m === 'minutes') return endsAt - clock();
  let s = Math.max(0, length() - position());
  if (m === 'list') { const list = queue.entries(); for (let i = queue.position() + 1; i < list.length; i++) s += list[i].track.durationMs / 1000; }
  return s;
}

function sleepTick(): void {
  if (ending || sleepMode() === '') return;
  const left = leftNow();
  setSleepLeft(Math.max(0, left));
  if (left <= fadeS && before < 0 && isPlaying()) {
    const v = outputVolume();
    if (v >= 0) { before = v; fadeLen = Math.max(1, left); beginFade(); trace(`sleep: fade from ${v}`); }
  }
  if (before >= 0) fadeVolume(before * Math.max(0, left) / fadeLen);
  const moved = sleepMode() === 'song' && current() !== target;   // the song ended between two ticks
  if (left <= (sleepMode() === 'minutes' ? 0 : END_S) || moved) finish();
}

/** The end: the last step (0), the pause, then the volume as it was. */
async function finish(): Promise<void> {
  ending = true;
  if (timer >= 0) clearInterval(timer);
  timer = -1;
  const restore = before;
  if (restore >= 0) { fadeVolume(0); await fadeSent(); }
  const was = isPlaying();
  if (was) toggle();
  trace('sleep: pause');
  if (restore >= 0) {
    if (chosenGroup() === null) fadeVolume(restore);
    else setVolume(restore);   // after the pause, in the player's order of calls to the group
    trace(`sleep: volume back to ${restore}`);
  }
  before = -1;
  ending = false;
  setSleepMode('');
  log('Sleep timer', was ? 'the music paused' : 'ended (nothing was playing)', true);
}
