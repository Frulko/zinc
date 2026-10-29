// The wake-up alarm (Settings: pages/settings/AlarmFields.tsx, kept in config.json): at a time, on the days chosen, it plays a daily mix of
// For you, a playlist, a Genius list or a radio from a song, on this computer or a Sonos group, the volume rising from a low level to
// the one chosen over a few minutes. It sounds only while the app runs (in the menu bar is enough). The clock is read every 15 seconds:
// a time passed since the last reading sounds then if it is at most 10 minutes old (the Mac was asleep: it sounds on wake), else it is
// skipped with a line in the log.
import { createSignal } from 'zinc:ui/solid';
import { AppConfig, loadConfig, saveConfig } from './config';
import { log } from './log';
import { clock, every, trace, beginFade, fadeVolume } from './sleep';
import { outputs, output, findSpeakers } from './sonos';
import { chooseOutput, playList } from './player';
import { PodLibrary } from './ipod';
import { library, playlistTracks } from '../state';
import { forYou, refreshForYou, playCard } from '../forYou';
import { draftOf, play } from '../drafts';
import { startRadio } from '../radio';

const CHECK_MS = 15000;
const LATE_S = 600;   // a time missed by more than this (the Mac was asleep) is skipped

/** The alarm as Settings shows it (a copy of config.json's). */
export const [alarm, setAlarmShown] = createSignal<AppConfig>(loadConfig());
export function saveAlarm(c: AppConfig): void {
  const k = loadConfig();
  k.alarmOn = c.alarmOn; k.alarmTime = c.alarmTime; k.alarmDays = c.alarmDays; k.alarmPlay = c.alarmPlay; k.alarmItem = c.alarmItem;
  k.alarmItemName = c.alarmItemName; k.alarmOutput = c.alarmOutput; k.alarmOutputName = c.alarmOutputName; k.alarmFadeMin = c.alarmFadeMin;
  k.alarmFrom = c.alarmFrom; k.alarmTo = c.alarmTo; k.sleepFadeS = c.sleepFadeS;
  saveConfig(k);
  setAlarmShown(k);
}

/** 'HH:MM' as [hours, minutes], null when it is not a time. */
export function parseTime(s: string): i32[] | null {
  const p = s.trim().split(':');
  if (p.length !== 2) return null;
  const h = parseInt(p[0]), m = parseInt(p[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return [h as i32, m as i32];
}

/** The last time the alarm was due at or before `t` (Unix seconds), -1 when none in the week before. */
export function lastDue(c: AppConfig, t: number): number {
  const hm = parseTime(c.alarmTime);
  if (hm === null) return -1;
  const d = new Date(t * 1000);
  for (let back = 0; back <= 7; back++) {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, hm[0], hm[1], 0);
    if (at.getTime() / 1000 <= t && c.alarmDays.indexOf(`${at.getDay()}`) >= 0) return at.getTime() / 1000;
  }
  return -1;
}

let checked = 0, timer: i32 = -1;

/** Starts reading the clock (main.tsx, once). */
export function watchAlarm(): void {
  checked = clock();
  if (timer < 0) timer = setInterval(check, every(CHECK_MS));
}

function check(): void {
  const t = clock(), since = checked;
  checked = t;
  const c = alarm();
  if (!c.alarmOn) return;
  const due = lastDue(c, t);
  if (due <= since) return;
  if (t - due > LATE_S) { log('Wake-up alarm', `skipped: ${c.alarmTime} passed ${Math.round((t - due) / 60)} min ago while the Mac slept`, false); return; }
  ring(c);
}

/** Plays what the alarm says, on its output, from its low volume, and raises it. */
export async function ring(c: AppConfig): Promise<void> {
  const lib = library();
  if (lib === null) { log('Wake-up alarm', 'skipped: no iPod is open', false); return; }
  trace('alarm: ring');
  let where = c.alarmOutput;
  if (where !== '') {
    if (outputs().length === 0) await findSpeakers();
    let found = false;
    for (const o of outputs()) if (o.id === where) found = true;
    if (!found) { log('Wake-up alarm', `${c.alarmOutputName !== '' ? c.alarmOutputName : 'the Sonos group'} was not found: playing on this computer`, false); where = ''; }
  }
  if (where !== output()) await chooseOutput(where);
  beginFade();
  fadeVolume(c.alarmFrom);
  if (!(await start(lib as PodLibrary, c))) { log('Wake-up alarm', `skipped: ${c.alarmItemName !== '' ? c.alarmItemName : 'what it plays'} is not on this iPod`, false); return; }
  log('Wake-up alarm', `${c.alarmItemName !== '' ? c.alarmItemName : 'the music'} on ${where === '' ? 'this computer' : c.alarmOutputName}`, true);
  const from = clock(), len = Math.max(1, c.alarmFadeMin * 60);
  const rise = setInterval(() => {
    const k = Math.min(1, (clock() - from) / len);
    fadeVolume(c.alarmFrom + (c.alarmTo - c.alarmFrom) * k);
    if (k >= 1) { clearInterval(rise); trace('alarm: fade done'); }
  }, every(1000));
}

/** Starts the music the alarm names; false when it is gone. */
async function start(lib: PodLibrary, c: AppConfig): Promise<boolean> {
  if (c.alarmPlay === 'playlist') {
    const ts = playlistTracks(c.alarmItem);
    if (ts.length === 0) return false;
    playList(lib, ts, 0, c.alarmItemName);
    return true;
  }
  if (c.alarmPlay === 'genius') {
    const d = draftOf(c.alarmItem);
    if (d === null) return false;
    play(d);
    return true;
  }
  if (c.alarmPlay === 'radio') {
    for (const t of lib.tracks) if (t.id === c.alarmItem) { startRadio(t); return true; }
    return false;
  }
  // today's daily mix: the one chosen (Daily Mix 1 by default), worked out first when For you has not been shown today
  await refreshForYou();
  const data = forYou();
  if (data === null) return false;
  for (const sh of data.shelves) if (sh.id === 'daily') {
    for (let i = 0; i < sh.cards.length; i++) if (sh.cards[i].title === c.alarmItem || (c.alarmItem === '' && i === 0)) { playCard(sh.cards[i]); return true; }
  }
  return false;
}
