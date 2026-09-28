// zinc:sys, zinc:storage, zinc:fs: uptime and live objects, a launch counter that survives restarts, and a
// notes file the user appends to.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';

const START_MS = sys.clock();
const NOTES_DIR = 'showcase-data';
const NOTES_FILE = `${NOTES_DIR}/notes.txt`;

export const [uptime, setUptime] = createSignal<string>('0.0 s');
export const [liveObjects, setLiveObjects] = createSignal<i32>(0);
export const [notes, setNotes] = createSignal<string>('');

/** Seconds since launch. */
export function secondsUp(): number {
  return (sys.clock() - START_MS) / 1000;
}

/** Increments and returns the persistent launch counter. */
function countLaunch(): i32 {
  const saved = storage.get('launches');
  const launches = (saved === '' ? 0 : parseInt(saved)) + 1;
  storage.set('launches', `${launches}`);
  return launches;
}
export const launches: i32 = countLaunch();

/** Appends a timestamped line to the notes file and refreshes the summary. */
export function appendNote(): void {
  fs.appendText(NOTES_FILE, `note at ${secondsUp().toFixed(1)} s\n`);
  const lines = fs.readText(NOTES_FILE).split('\n').length - 1;
  setNotes(`${fs.list(NOTES_DIR).join(', ')} · ${lines} line(s)`);
}

export function startSystem(): void {
  fs.mkdir(NOTES_DIR);
  appendNote();
}

/** Once a second. */
export function refreshSystem(): void {
  setUptime(`${secondsUp().toFixed(1)} s`);
  setLiveObjects(sys.liveObjects());
}
